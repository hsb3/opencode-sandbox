# Railway: does not apply

There is no `.railway/railway.ts` and no hosted target, on purpose.

opencode-sandbox is a CLI that runs three public images on the operator's own
Docker daemon. Its only network interfaces — the MCP bridge, the optional raw
backend port, the optional web UI — have **no inbound authentication** and are
bound to `127.0.0.1` by design (root README, "Security note"). Anyone who can
reach the bridge gets a shell inside the instance. A Railway service would put
exactly that on a public domain, which the project forbids.

The images are not built here either; they come from the
[hsb3/opencode](https://github.com/hsb3/opencode) fork.

What local CI proves instead: `docker compose -f deploy/local/compose.yaml
config --quiet` validates the stack, and `bun test` proves
`deploy/local/compose.yaml` is what the CLI renders.

If a hosted instance is ever wanted, the precondition is an auth layer in front
of the bridge (cf. nginx-auth-railway). At that point add `.railway/railway.ts`
per the railway-iac-directory pattern with one service per image, and turn this
file into the runbook.
