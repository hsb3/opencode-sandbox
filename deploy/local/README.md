# Local Docker stack

The same three-service stack `opencode-sandbox create` renders, as a checked-in
compose file for running one instance by hand. `compose.yaml` is generated from
`src/compose.ts` by `bun deploy/local/render.ts`; `compose.test.ts` fails when
it drifts, so edit the renderer, not this file.

The `make local-*` targets in the root Makefile wrap
`docker compose -f deploy/local/compose.yaml`; run them from the repo root. The
`docker compose` commands below assume `cd deploy/local`.

## Up

```sh
cp deploy/local/.env.example deploy/local/.env   # project name, image tag, host ports; optional
                                                 # provider keys. make local-up does this when missing.
make local-up
```

For the web UI on `WEB_PORT`: `docker compose --profile web up -d --wait` from
`deploy/local/`.

Images pull anonymously from GHCR (`backend` is ~2.3 GB). Drop an
`opencode.jsonc` in `config/` before the first `up` to configure the instance;
the backend writes a default one there otherwise.

## Verify

```sh
make local-verify   # MCP initialize against 127.0.0.1:MCP_PORT; exits 0 when
                    # the response carries "serverInfo":{"name":"opencode-mcp", ...}
docker compose ps
```

`make local-verify` sends:

```sh
curl -s -X POST http://127.0.0.1:4784/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
```

Register the bridge with
`claude mcp add --transport http local http://127.0.0.1:4784/mcp`
(substitute your `MCP_PORT`).

## Logs

```sh
docker compose logs -f opencode mcp
```

## Down

```sh
make local-down      # containers and network; volumes survive
make local-down-v    # also deletes the four named volumes: workspace (everything
                     # the agent wrote), data, cache, state. Export first:
                     # docker run --rm -v ocsbx-local_workspace:/w alpine tar -C /w -cf - . | tar -xf -
```

The host bind is `127.0.0.1` only and the bridge has no inbound auth; see the
security note in the root README before changing either.

## Without Docker Compose by hand

`opencode-sandbox create <name>` does all of the above with port allocation,
seeding, and per-instance state under `~/.local/state/opencode-sandbox/`.
