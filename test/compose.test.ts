import { expect, test } from "bun:test"
import { NAME_RE, basePort, fetchLine, parsePublish, projectName, registerLine, renderCompose, renderEnv } from "../src/compose.ts"

const inst = { name: "demo", mcpPort: 4310, webPort: 4311, tag: "latest", web: false }

test("names are constrained to what compose and docker volumes accept", () => {
  for (const ok of ["a", "demo", "demo-2", "x9-y"]) expect(NAME_RE.test(ok)).toBe(true)
  for (const bad of ["", "Demo", "-lead", "has_underscore", "a".repeat(32), "a b"]) expect(NAME_RE.test(bad)).toBe(false)
})

test("base port is deterministic, even, and inside the range", () => {
  expect(basePort("demo")).toBe(basePort("demo"))
  expect(basePort("demo")).not.toBe(basePort("other"))
  for (const n of ["a", "demo", "z".repeat(31)]) {
    const p = basePort(n)
    expect(p % 2).toBe(0)
    expect(p).toBeGreaterThanOrEqual(4300)
    expect(p).toBeLessThan(4899)
  }
})

test("compose pulls images only and never declares a build", () => {
  const y = renderCompose()
  expect(y).not.toContain("build:")
  for (const i of ["backend", "web", "mcp"]) expect(y).toContain(`ghcr.io/hsb3/opencode/${i}:\${OC_TAG}`)
})

test("service is named opencode — the web image's baked nginx.conf proxies to that host", () => {
  expect(renderCompose()).toContain("\n  opencode:\n")
})

test("published ports stay bound to loopback (the bridge has no inbound auth)", () => {
  for (const y of [renderCompose(), renderCompose(4097), renderCompose(undefined, [{ host: 5173, container: 5173 }])])
    for (const line of y.split("\n").filter((l) => l.includes("ports:"))) expect(line).toContain("127.0.0.1:")
})

test("container home is /root so dotfiles never pollute the workspace", () => {
  expect(renderCompose()).toContain("HOME: /root")
})

test("api port is published only when asked for, and lands on the backend", () => {
  expect(renderCompose()).not.toContain("API_PORT")
  expect(renderCompose(4400)).toContain('ports: ["127.0.0.1:${API_PORT}:4097"]')
  expect(renderEnv({ ...inst, apiPort: 4400 }, {})).toContain("API_PORT=4400")
  expect(renderEnv(inst, {})).not.toContain("API_PORT")
})

test("--publish takes docker's -p order and defaults the host port to the container port", () => {
  expect(parsePublish("5173")).toEqual({ host: 5173, container: 5173 })
  expect(parsePublish("15173:5173")).toEqual({ host: 15173, container: 5173 })
  for (const bad of ["", "0", "abc", "5173:", "70000", "1:2:3", "-1"]) expect(() => parsePublish(bad)).toThrow()
})

test("published ports appear only when asked for, alongside the api port", () => {
  // Only the opencode service — mcp and web publish unconditionally.
  expect(renderCompose().split("\n  mcp:")[0]).not.toContain("ports:")
  expect(renderCompose(undefined, [{ host: 15173, container: 5173 }, { host: 8090, container: 8090 }])).toContain(
    'ports: ["127.0.0.1:15173:5173", "127.0.0.1:8090:8090"]',
  )
  expect(renderCompose(4400, [{ host: 8090, container: 8090 }])).toContain(
    'ports: ["127.0.0.1:${API_PORT}:4097", "127.0.0.1:8090:8090"]',
  )
})

test("published ports round-trip through .env so a reload sees them", () => {
  const env = renderEnv({ ...inst, publish: [{ host: 15173, container: 5173 }, { host: 8090, container: 8090 }] }, {})
  expect(env).toContain("PUBLISH=15173:5173,8090:8090")
  expect(env.match(/PUBLISH=(.*)/)![1]!.split(",").map(parsePublish)).toEqual([
    { host: 15173, container: 5173 },
    { host: 8090, container: 8090 },
  ])
  expect(renderEnv(inst, {})).not.toContain("PUBLISH")
})

test("web is behind a profile so the MCP bridge is the default surface", () => {
  expect(renderCompose()).toContain("profiles: [web]")
})

test("env forwards only provider keys that are actually set", () => {
  const env = renderEnv(inst, { ANTHROPIC_API_KEY: "sk-ant-x", PATH: "/usr/bin", OPENAI_API_KEY: "" })
  expect(env).toContain("ANTHROPIC_API_KEY=sk-ant-x")
  expect(env).not.toContain("OPENAI_API_KEY")
  expect(env).not.toContain("PATH")
  expect(env).toContain("MCP_PORT=4310")
})

test("register line is the exact command a consumer pastes", () => {
  expect(registerLine(inst)).toBe("claude mcp add --transport http demo http://127.0.0.1:4310/mcp")
})

test("fetch line pulls a branch out over docker exec — no credentials, ext transport opted in", () => {
  expect(fetchLine(inst)).toBe(
    "git -c protocol.ext.allow=user fetch 'ext::docker exec -i ocsbx-demo-opencode-1 git -C /workspace upload-pack .' <branch>:sandbox/<branch>",
  )
})

test("compose project name is namespaced so instances never collide with the fork's stacks", () => {
  expect(projectName("demo")).toBe("ocsbx-demo")
})
