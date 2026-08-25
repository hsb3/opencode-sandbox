# Working with this repo + opencode-sandbox

Notes from a session that stood up a real sandboxed opencode instance seeded from this
repo. Read `AGENTS.md` / `docs/REPO-STRUCTURE.md` in the repo itself for the pack/registry
rules; this file is about the sandbox workflow specifically, plus gotchas that cost real
time to find.

## This repo, in one paragraph

Each pack (`agents/*`, `commands/`, `cowork/`) ships its own `registry.json` + a nested
`.opencode/{agent,skill,command}/` payload. `scripts/generate-registry.js` merges every
pack's `registry.json` into a root `registry.json`. `scripts/install.js` reads that root
file and copies items into an install target — `~/.config/opencode` (`--global`) or a
project's `.opencode/` (default, relative to cwd or `--dest`). This installer is
independent of the Igor Warzocha `opencode-workflows-manager` TUI (archived upstream, and
its published binary is Linux-only / broken on macOS — see `hsb3/dotfiles-agents` issues
if resurrecting it). `install.js --list` shows every standalone item and pack.

## opencode-sandbox: creating an instance seeded from this repo

Binary: `opencode-sandbox` (installed via `gh release download --repo hsb3/opencode-sandbox`,
see the `opencode-sandbox` skill for the install one-liner).

```bash
# --seed copies everything except .DS_Store; no .gitignore respected. .git IS copied
# on purpose (history works in the container) — pre-filter with rsync only if you
# want a smaller/partial seed:
opencode-sandbox create <name> --seed /path/to/opencode-workflows-master
```

Since 2026-08-23 (unreleased; local build) `--seed` also chowns the workspace to
root, so git works out of the box — see the git/gh section below.

**Gotcha — Docker network pool exhaustion.** If you've got a lot of old dev-project compose
stacks lying around, `create` can fail with `all predefined address pools have been fully
subnetted` even right after a Docker Desktop image prune (images != networks). Fix:
```bash
docker ps --format '{{.Names}}\t{{.Networks}}'   # confirm nothing you need is using the stale ones
docker network prune -f                          # only removes networks with zero attached containers
```

**Registering as an MCP server:**
```bash
claude mcp add --transport http <name> http://127.0.0.1:<mcp-port>/mcp
```
MCP servers load at session start — the session that ran `create`/`mcp add` cannot use it.
Start a *new* Claude Code session (or `/reload-plugins` isn't enough by itself; a fresh
session in the project is what actually attaches it) to pick up the `mcp__<name>__*` tools.

## Fixing a fresh instance: git + gh

The image (`ghcr.io/hsb3/opencode/backend`) has no `gh`. Filed upstream:
`hsb3/dotfiles-agents#393`.

**git: FIXED in the CLI as of 2026-08-23** (local build, not yet in a GitHub release).
`--seed` now chowns `/workspace` to root, which was the root cause of the "dubious
ownership" error — and because ownership lives in the workspace *volume*, the fix
survives container recreates, unlike the workaround below. Instances created with an
older binary (or seeded another way) still need:

```bash
# old instances only — fails with "detected dubious ownership" until:
docker exec <container>-opencode-1 git config --system --add safe.directory /workspace

# gh: not present at all, install the arm64 binary directly (no apt repo needed)
docker exec <container>-opencode-1 sh -c '
  GH_VER=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | grep -m1 "\"tag_name\"" | sed -E "s/.*\"v([0-9.]+)\".*/\1/")
  curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VER}/gh_${GH_VER}_linux_arm64.tar.gz" -o /tmp/gh.tar.gz
  tar -xzf /tmp/gh.tar.gz -C /tmp
  install -m 755 /tmp/gh_${GH_VER}_linux_arm64/bin/gh /usr/local/bin/gh
'
# gh is unauthenticated by default — do NOT forward your own broad personal token into an
# isolated sandbox unless you actually need to write to GitHub from it. See
# hsb3/dotfiles-agents#393's comment thread re: a narrow-scope token-minting helper (not built yet).
```

**The gh install and the safe.directory workaround live in the container's writable
layer, not a named volume.** A plain
`docker restart <container>` keeps them. Anything that *recreates* the container (see
below) wipes them — reapply after.

## Exposing the raw opencode backend API (for a local `opencode attach`)

**FIXED in the CLI as of 2026-08-23** (local build; was `hsb3/opencode-sandbox#1`):

```bash
opencode-sandbox create <name> --seed ... --api-port 4097
opencode attach http://127.0.0.1:4097
```

Older binaries only publish the MCP gateway (`--port`) and, optionally, the web GUI
(`--web`); the backend listens on `4097` inside the docker network only. Workaround
there — hand-edit the generated compose file and reapply just that one service:

```bash
cd ~/.local/state/opencode-sandbox/<name>
# add under the `opencode:` service block:
#   ports: ["127.0.0.1:4097:4097"]

# CRITICAL: pass the project name explicitly, or compose falls back to the directory name
# and spins up a completely separate, empty duplicate stack instead of updating the real one.
# The real project name is `ocsbx-<name>` (check with `docker ps` if unsure).
docker compose -p ocsbx-<name> up -d opencode
```

This **recreates** the `opencode` container (new writable layer) but reuses the existing
named volumes, so `/workspace` contents survive — reapply the git/gh fixes above afterward.
A plain `docker restart` (no compose, no port change) does NOT lose them.

Then, from your host, attach a normal local opencode TUI directly to the sandboxed backend
instead of running the bundled web GUI:
```bash
opencode attach http://127.0.0.1:4097
```
No auth needed (no `OPENCODE_SERVER_PASSWORD` set). This lets you and an agent driving the
same instance over MCP co-test live, side by side.

## Installing packs from this repo into a running instance

Inside the instance (via `opencode_shell_execute` over MCP, or `docker exec`, or the
attached TUI's own shell):
```bash
cd /workspace   # wherever the repo was seeded
node scripts/install.js --list                 # see every standalone item + pack
node scripts/install.js fast                    # a standalone agent
node scripts/install.js security-reviewer        # a whole pack (agent + all its skills)
```

**Gotcha — no hot reload.** OpenCode loads its agent/command/skill config once at process
start. Files written into `.opencode/` after boot are invisible until the process restarts:
```bash
docker restart <container>-opencode-1
```
(a plain restart, not a recreate — keeps the git/gh fixes). Verify what actually loaded
against the raw API rather than trusting the MCP tools' own listings — see next section.

## Known bug: MCP read/list tools ignore `directory`

`opencode_context`, `opencode_project_current`, `opencode_agent_list`, `opencode_project_list`
all ignore the `directory` argument and keep reporting the default `global` project at `/`,
even right after `opencode_project_init(path="/workspace")` reports success. Task-execution
tools (`opencode_ask`, `opencode_shell_execute`, presumably `opencode_run`) DO correctly
scope to the passed directory and see real files. Filed: `hsb3/dotfiles-agents#394`.

**Practical workaround:** don't trust `opencode_agent_list` to check what's installed. Hit
the raw backend API directly instead (works even without the port-4097 exposure, from
*inside* the container, or from the host once exposed per above):
```bash
curl -s http://127.0.0.1:4097/agent   | python3 -c 'import json,sys; print([a["name"] for a in json.load(sys.stdin)])'
curl -s http://127.0.0.1:4097/command | python3 -c 'import json,sys; print([c["name"] for c in json.load(sys.stdin)])'
curl -s http://127.0.0.1:4097/skill   | python3 -c 'import json,sys; print([s["name"] for s in json.load(sys.stdin)])'
```

## Cleanup

```bash
claude mcp remove <name>
opencode-sandbox destroy <name>   # deletes the workspace volume — copy anything worth keeping out first
```
