// Writes deploy/local/compose.yaml from the CLI's own renderer, so the documented
// local stack is byte-for-byte what `opencode-sandbox create` runs (minus the
// per-instance --api-port/--publish extras). deploy/local/compose.test.ts fails
// when the file drifts from src/compose.ts.
import { renderCompose } from "../../src/compose.ts"

export const HEADER = "# Rendered from src/compose.ts by `bun deploy/local/render.ts` — edit there, not here.\n"

export const rendered = () => HEADER + renderCompose().split("\n").slice(1).join("\n")

if (import.meta.main) await Bun.write(new URL("compose.yaml", import.meta.url), rendered())
