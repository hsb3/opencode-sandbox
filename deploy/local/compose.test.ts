import { expect, test } from "bun:test"
import { rendered } from "./render.ts"

test("deploy/local/compose.yaml is exactly what the CLI renders", async () => {
  expect(await Bun.file(new URL("compose.yaml", import.meta.url)).text()).toBe(rendered())
})
