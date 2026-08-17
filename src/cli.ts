#!/usr/bin/env bun
import { mkdirSync, existsSync, readdirSync, rmSync, writeFileSync, readFileSync, copyFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { createServer } from "node:net"
import {
  NAME_RE,
  basePort,
  projectName,
  registerLine,
  renderCompose,
  renderEnv,
  type Instance,
} from "./compose.ts"

const VERSION = "0.1.0"
const ROOT = join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "opencode-sandbox")

function die(msg: string): never {
  console.error(`opencode-sandbox: ${msg}`)
  process.exit(1)
}

function run(cmd: string[], opts: { cwd?: string; env?: Record<string, string>; quiet?: boolean } = {}) {
  const p = Bun.spawnSync(cmd, {
    cwd: opts.cwd,
    // COMPOSE_PROJECT_NAME rather than `docker compose -p`: Compose v5 rejects the flag.
    env: { ...process.env, ...opts.env },
    stdout: opts.quiet ? "pipe" : "inherit",
    stderr: opts.quiet ? "pipe" : "inherit",
  })
  return { code: p.exitCode, out: p.stdout?.toString() ?? "", err: p.stderr?.toString() ?? "" }
}

function requireDocker() {
  if (run(["docker", "version", "--format", "{{.Server.Os}}"], { quiet: true }).code !== 0)
    die("docker is not available or its daemon is not running")
}

const dir = (name: string) => join(ROOT, name)

function load(name: string): Instance {
  const d = dir(name)
  if (!existsSync(join(d, ".env"))) die(`no instance named '${name}' (try: opencode-sandbox list)`)
  const env: Record<string, string> = {}
  for (const line of readFileSync(join(d, ".env"), "utf8").split("\n")) {
    const i = line.indexOf("=")
    if (i > 0) env[line.slice(0, i)] = line.slice(i + 1)
  }
  return {
    name,
    mcpPort: Number(env.MCP_PORT),
    webPort: Number(env.WEB_PORT),
    tag: env.OC_TAG || "latest",
    web: existsSync(join(d, ".web")),
  }
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer()
    s.once("error", () => resolve(false))
    s.once("listening", () => s.close(() => resolve(true)))
    s.listen(port, "127.0.0.1")
  })
}

async function allocatePorts(name: string, wanted?: number) {
  const taken = new Set<number>()
  for (const other of listNames()) {
    if (other === name) continue
    const i = load(other)
    taken.add(i.mcpPort)
    taken.add(i.webPort)
  }
  let p = wanted ?? basePort(name)
  for (let tries = 0; tries < 300; tries++, p += 2) {
    if (taken.has(p) || taken.has(p + 1)) continue
    if ((await portFree(p)) && (await portFree(p + 1))) return { mcpPort: p, webPort: p + 1 }
    if (wanted) die(`port ${wanted} (or ${wanted + 1}) is already in use`)
  }
  die("found no free port pair in 4300-4899")
}

const listNames = () =>
  existsSync(ROOT) ? readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []

const compose = (inst: Instance, args: string[], quiet = false) =>
  run(["docker", "compose", ...(inst.web ? ["--profile", "web"] : []), ...args], {
    cwd: dir(inst.name),
    env: { COMPOSE_PROJECT_NAME: projectName(inst.name) },
    quiet,
  })

function seed(inst: Instance, from: string): boolean {
  const vol = `${projectName(inst.name)}_workspace`
  const q = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`
  // COPYFILE_DISABLE stops macOS tar from writing AppleDouble `._*` siblings into
  // the workspace, where the agent would see them as real files.
  const r = run(
    ["sh", "-c", `tar -C ${q(from)} -cf - . | docker run --rm -i -v ${vol}:/w alpine tar -C /w -xf -`],
    { env: { COPYFILE_DISABLE: "1" } },
  )
  return r.code === 0
}

async function create(argv: string[]) {
  const name = argv[0]
  if (!name || name.startsWith("-")) die("usage: opencode-sandbox create <name> [--seed <dir>] [--config <file>] [--port <n>] [--web]")
  if (!NAME_RE.test(name)) die(`invalid name '${name}' — use lowercase letters, digits and hyphens (max 31)`)
  if (existsSync(dir(name))) die(`instance '${name}' already exists (destroy it first)`)
  const flag = (f: string) => {
    const i = argv.indexOf(f)
    return i === -1 ? undefined : argv[i + 1]
  }
  requireDocker()

  const { mcpPort, webPort } = await allocatePorts(name, flag("--port") ? Number(flag("--port")) : undefined)
  const inst: Instance = { name, mcpPort, webPort, tag: flag("--tag") || "latest", web: argv.includes("--web") }

  const d = dir(name)
  mkdirSync(join(d, "config"), { recursive: true })
  writeFileSync(join(d, "compose.yml"), renderCompose())
  writeFileSync(join(d, ".env"), renderEnv(inst, process.env))
  if (inst.web) writeFileSync(join(d, ".web"), "")
  const cfg = flag("--config")
  if (cfg) {
    if (!existsSync(cfg)) die(`--config file does not exist: ${cfg}`)
    copyFileSync(cfg, join(d, "config", "opencode.jsonc"))
  }

  // A half-created instance would squat on its name, so unwind everything this
  // call made before bailing out.
  const rollback = (msg: string): never => {
    compose(inst, ["-f", "compose.yml", "down", "-v"], true)
    rmSync(d, { recursive: true, force: true })
    return die(msg)
  }

  // `create` (not `up`) first: it materializes the named volumes so --seed can
  // populate /workspace before the backend ever looks at it.
  if (compose(inst, ["-f", "compose.yml", "create"]).code !== 0) rollback("docker compose create failed")
  const seedDir = flag("--seed")
  if (seedDir) {
    if (!existsSync(seedDir)) rollback(`--seed path does not exist: ${seedDir}`)
    if (!seed(inst, seedDir)) rollback(`seeding /workspace from ${seedDir} failed`)
  }
  if (compose(inst, ["-f", "compose.yml", "up", "-d"]).code !== 0) rollback("docker compose up failed")

  console.log(`\ninstance '${name}' is up.`)
  console.log(`  register:  ${registerLine(inst)}`)
  if (inst.web) console.log(`  web UI:    http://127.0.0.1:${webPort}`)
  console.log(`  destroy:   opencode-sandbox destroy ${name}`)
}

function list() {
  const names = listNames()
  if (!names.length) return console.log("no instances")
  console.log(["NAME", "MCP", "WEB", "STATUS"].join("\t"))
  for (const name of names) {
    const inst = load(name)
    const ps = compose(inst, ["-f", "compose.yml", "ps", "--status", "running", "--quiet"], true)
    const running = ps.out.trim().split("\n").filter(Boolean).length
    console.log([name, inst.mcpPort, inst.web ? inst.webPort : "-", running ? `up (${running})` : "stopped"].join("\t"))
  }
}

async function destroy(argv: string[]) {
  const name = argv[0]
  if (!name) die("usage: opencode-sandbox destroy <name> [--yes]")
  const inst = load(name)
  if (!argv.includes("--yes") && !argv.includes("-y")) {
    if (!process.stdin.isTTY) die(`refusing to destroy '${name}' non-interactively — pass --yes`)
    const answer = (prompt(`destroy '${name}' and delete its volumes (workspace included)? [y/N]`) || "n").trim().toLowerCase()
    if (answer !== "y" && answer !== "yes") return console.log("aborted")
  }
  requireDocker()
  if (compose(inst, ["-f", "compose.yml", "down", "-v"]).code !== 0) die("docker compose down failed")
  rmSync(dir(name), { recursive: true, force: true })
  console.log(`destroyed '${name}'`)
}

const argv = process.argv.slice(2)
const cmd = argv[0]
switch (cmd) {
  case "create":
    await create(argv.slice(1))
    break
  case "list":
  case "ls":
    list()
    break
  case "url":
    if (!argv[1]) die("usage: opencode-sandbox url <name>")
    console.log(registerLine(load(argv[1])))
    break
  case "destroy":
  case "rm":
    await destroy(argv.slice(1))
    break
  case "--version":
  case "-v":
    console.log(VERSION)
    break
  default:
    console.log(`opencode-sandbox ${VERSION} — isolated opencode instances from prebuilt GHCR images

  create <name> [--seed <dir>] [--config <file>] [--port <n>] [--tag <t>] [--web]
  list
  url <name>            print the 'claude mcp add' line for an instance
  destroy <name> [--yes]

Instances live in ${ROOT}. The MCP bridge binds 127.0.0.1 only and has no
inbound auth — anyone who can reach the port gets full tool access to /workspace.`)
    if (cmd && cmd !== "help" && cmd !== "--help" && cmd !== "-h") process.exit(1)
}
