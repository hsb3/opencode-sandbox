# Root entry point for the local Docker stack in deploy/local/. No compose file lives
# at the root; every target wraps deploy/local/compose.yaml.
COMPOSE := docker compose -f deploy/local/compose.yaml
MCP_PORT ?= $(shell sed -n 's/^MCP_PORT=//p' deploy/local/.env 2>/dev/null)
MCP_PORT := $(or $(MCP_PORT),4784)

.PHONY: local-up local-down local-down-v local-verify

deploy/local/.env:
	cp deploy/local/.env.example $@

local-up: deploy/local/.env
	$(COMPOSE) up --build -d --wait

local-down:
	$(COMPOSE) down

# Also deletes the four named volumes (workspace, data, cache, state); see deploy/local/README.md.
local-down-v:
	$(COMPOSE) down -v

local-verify:
	curl -sf -X POST http://127.0.0.1:$(MCP_PORT)/mcp \
	  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
	  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
	  | grep -q '"name":"opencode-mcp"'
