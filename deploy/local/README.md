# Local Docker stack

The same three-service stack `opencode-sandbox create` renders, as a checked-in
compose file for running one instance by hand. `compose.yaml` is generated from
`src/compose.ts` by `bun deploy/local/render.ts`; `compose.test.ts` fails when
it drifts, so edit the renderer, not this file.

All commands run from this directory.

## Up

```sh
cp .env.example .env          # project name, image tag, host ports; optional provider keys
docker compose up -d --wait   # add --profile web for the web UI on WEB_PORT
```

Images pull anonymously from GHCR (`backend` is ~2.3 GB). Drop an
`opencode.jsonc` in `config/` before the first `up` to configure the instance;
the backend writes a default one there otherwise.

## Verify

```sh
docker compose ps
curl -s -X POST http://127.0.0.1:4784/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
```

The response carries `"serverInfo":{"name":"opencode-mcp", ...}`. Register it
with `claude mcp add --transport http local http://127.0.0.1:4784/mcp`
(substitute your `MCP_PORT`).

## Logs

```sh
docker compose logs -f opencode mcp
```

## Down

```sh
docker compose down       # containers and network; volumes survive
docker compose down -v    # also deletes the four named volumes: workspace (everything
                          # the agent wrote), data, cache, state. Export first:
                          # docker run --rm -v ocsbx-local_workspace:/w alpine tar -C /w -cf - . | tar -xf -
```

The host bind is `127.0.0.1` only and the bridge has no inbound auth; see the
security note in the root README before changing either.

## Without Docker Compose by hand

`opencode-sandbox create <name>` does all of the above with port allocation,
seeding, and per-instance state under `~/.local/state/opencode-sandbox/`.
