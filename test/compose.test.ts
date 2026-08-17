import { expect, test } from "bun:test"
import { NAME_RE, basePort, projectName, registerLine, renderCompose, renderEnv } from "../src/compose.ts"

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
  for (const line of renderCompose().split("\n").filter((l) => l.includes("ports:"))) expect(line).toContain("127.0.0.1:")
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

test("compose project name is namespaced so instances never collide with the fork's stacks", () => {
  expect(projectName("demo")).toBe("ocsbx-demo")
})
