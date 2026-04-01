# vibesql-mcp

MCP server that connects your AI coding tool to a [VibeSQL](https://vibesql.online) PostgreSQL database. One command, 9 tools, zero config.

## Quick Start

```bash
npx vibesql-micro       # start database on :5173
npx vibesql-mcp         # start MCP server (stdio)
```

## Claude Code Setup

Add `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "vibesql": {
      "command": "npx",
      "args": ["--yes", "vibesql-mcp"]
    }
  }
}
```

**Windows** — wrap with `cmd /c`:

```json
{
  "mcpServers": {
    "vibesql": {
      "command": "cmd",
      "args": ["/c", "npx", "--yes", "vibesql-mcp"]
    }
  }
}
```

Custom URL:

```json
{
  "mcpServers": {
    "vibesql": {
      "command": "npx",
      "args": ["--yes", "vibesql-mcp", "--url", "http://10.0.0.5:5173"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `query` | Execute any SQL query (DDL + DML) |
| `list_tables` | List all tables in the database |
| `describe_table` | Get column schema for a table |
| `table_data` | Browse rows with pagination |
| `create_table` | Create a table (validated, no semicolons) |
| `insert_row` | Insert a row from JSON column-value pairs |
| `help` | Help on a VibeSQL topic |
| `help_products` | Product family overview |
| `help_architecture` | Architecture patterns |

The `query` tool is intentionally unrestricted -- it can execute any valid SQL including DROP, DELETE, and TRUNCATE. This is a local development tool.

## Environment

Set `VIBESQL_URL` to override the default `http://localhost:5173`. The `--url` CLI flag takes precedence over the env var.

## Changelog

### 1.0.3 (2026-02-23)
- Fixed response format transformation — API returns rows as objects, MCP now correctly converts to columnar format
- Added null-safe handling for empty databases and DDL statements
- Added stderr logging for observability (`[vibesql-mcp] v1.0.3 starting — target: ...`)
- Non-blocking health probe on startup (informational only, never exits)

### 1.0.2 (2026-02-23)
- Added stderr startup logging for MCP host observability

### 1.0.1 (2026-02-23)
- Removed blocking health check that killed the process when vibesql-micro wasn't running yet

### 1.0.0 (2026-02-23)
- Initial release: 9 tools (query, list_tables, describe_table, table_data, create_table, insert_row, help, help_products, help_architecture)

## License

Apache-2.0
