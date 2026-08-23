# opencode-sandbox

Spin up an isolated `opencode` instance from prebuilt public GHCR images and hand
it to Claude Code as an MCP server. No build step, no checkout of the opencode
fork — each instance is its own Docker Compose project with its own named
volumes, and its workspace is a named volume rather than a host bind, so it
cannot see your filesystem. Images are public and pull anonymously; the
backend reports opencode 1.18.4 and the MCP bridge exposes 80 tools.

## Install

Build from source and drop the binary on your `PATH`:

```
bun run build
cp dist/opencode-sandbox ~/.local/bin/
```

(`bun run install-local` does both in one step.) Or grab a prebuilt binary
from this repo's GitHub Releases.

## Quickstart

Create an instance. No API key is required — opencode ships with free default
models (`opencode models` lists them), so a fresh instance works immediately.
Any provider API key already in your shell (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY`) is
forwarded into it at create time for the paid providers — there's no UI login
step and no `auth.json` to manage.

```
opencode-sandbox create scratch --seed ./my-project --config ./opencode.jsonc
```

`--seed` copies a directory into the fresh workspace before the instance first
starts (`.git` history included; `.DS_Store` files excluded); `--config` places
an `opencode.jsonc` for that instance alone. Both are optional. The workspace
is a copy, not a bind mount — edits inside the instance never touch the seed
directory.

`--api-port <n>` additionally publishes the raw opencode backend on
`127.0.0.1:<n>`, so a local opencode client can attach to the same instance
an agent is driving over MCP.

Register it with Claude Code. `create` prints this line, and `url` reprints it
later:

```
opencode-sandbox url scratch
claude mcp add --transport http scratch http://127.0.0.1:4784/mcp
```

Now use it — the instance's 80 tools (read, write, run shell commands, all
scoped to its own `/workspace`) are available in that Claude Code session.
When you're done:

```
opencode-sandbox destroy scratch --yes
```

`destroy` removes the containers and their volumes, including the workspace —
get anything worth keeping out first (see below).

## Getting work out

No credentials ever enter the instance; the host reaches in instead. For work
on a git branch, run the line `fetch-url` prints from your project's repo —
git speaks its wire protocol over `docker exec`, so the branch, its history,
and its files land locally for review before you push with your own
credentials:

```
opencode-sandbox fetch-url scratch
git -c protocol.ext.allow=user fetch 'ext::docker exec -i ocsbx-scratch-opencode-1 git -C /workspace upload-pack .' <branch>:sandbox/<branch>
```

For loose artifacts, or a full salvage before `destroy`, copy the whole
workspace to a host directory (works even while the instance is stopped):

```
opencode-sandbox export scratch ./scratch-out
```

A web UI is available too, behind `--web` on create; without it, the MCP
bridge is the only interface.

## Security note

Neither the MCP bridge nor the backend published by `--api-port` has inbound
authentication of its own. Anyone who can reach either port gets the full
opencode tool surface — reading and writing
files and running shell commands inside that instance's `/workspace`. The
published port is bound to `127.0.0.1` by default; keep it that way. Do not
widen it to `0.0.0.0` or put it behind a public reverse proxy without a real
auth layer in front of it.
