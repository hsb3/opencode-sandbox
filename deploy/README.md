# deploy/

One directory per deployment target, each with its own runbook. New deployment
target = new directory here.

| Target | What it is |
| --- | --- |
| [local/](local/README.md) | the opencode stack on your own Docker daemon, without the CLI: compose file, `.env.example`, up/verify/down |
| [railway/](railway/README.md) | why there is no hosted target (the stack's only interface is unauthenticated by design) |

Nothing here builds an image. All three images (`backend`, `mcp`, `web`) are
built and published by the [hsb3/opencode](https://github.com/hsb3/opencode)
fork to `ghcr.io/hsb3/opencode/*`; this repo only runs them.
