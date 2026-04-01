# VibeSQL Skills

Tools for connecting your AI coding assistant to a [VibeSQL](https://vibesql.online) database.

Two options: **MCP Server** (recommended) or **Slash Commands**.

---

## Option 1: MCP Server — `vibesql-mcp`

An MCP server that gives your AI coding tool direct database access. 9 tools: query, list tables, describe, browse data, create tables, insert rows, and help.

### Quick Start

```bash
npx vibesql-micro                  # start database on :5173
npx vibesql-mcp                    # start MCP server
```

### Claude Code Setup

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

With a custom URL:

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

### MCP Tools

| Tool | Description |
|------|-------------|
| `query` | Execute any SQL (DDL + DML) |
| `list_tables` | List all tables in the database |
| `describe_table` | Column schema for a table |
| `table_data` | Browse rows with pagination |
| `create_table` | Create a table (DDL validated, no semicolons) |
| `insert_row` | Insert a row from JSON column-value pairs |
| `help` | Help on a VibeSQL topic |
| `help_products` | Product family overview |
| `help_architecture` | Architecture patterns |

The `query` tool is intentionally unrestricted — it can execute any valid SQL including DROP, DELETE, and TRUNCATE. This is a local development tool.

### Environment Variable

Set `VIBESQL_URL` to override the default `http://localhost:5173`. The `--url` flag takes precedence.

---

## Option 2: Slash Commands — `/vibe-sql`

A slash command that translates natural language to PostgreSQL queries.

Works with Claude Code, OpenCode, and Codex CLI.

### Install

Start vibesql-micro first:

```bash
npx vibesql-micro    # starts on http://localhost:5173
```

Then copy the skill for your platform:

**Claude Code:**
```bash
cp -r claude/vibe-sql ~/.claude/skills/vibe-sql
```

**OpenCode:**
```bash
cp -r opencode/vibe-sql ~/.opencode/skills/vibe-sql
```

**Codex CLI:**
```bash
cp -r codex/vibe-sql ~/.agents/skills/vibe-sql
```

### Usage

```
/vibe-sql show me all tables
/vibe-sql create a products table with name, price, and description
/vibe-sql add a row: name=Widget, price=9.99
/vibe-sql what's the average price
/vibe-sql add a category column to products
```

### What It Does

- Translates natural language to PostgreSQL 16.1 SQL
- Executes against `POST /v1/query` on your local vibesql-micro
- Presents results as readable tables
- Knows JSONB operators, DDL, CRUD, aggregation, pagination
- Confirms before destructive operations (DROP, TRUNCATE)
- Requires WHERE on UPDATE/DELETE

---

## Repo Structure

```
claude-mcp/                       # vibesql-mcp — MCP server (npm package)
claude/vibe-sql/SKILL.md          # Claude Code slash command
claude/vibe-mail/SKILL.md         # Claude Code agent mail skill
opencode/vibe-sql/SKILL.md        # OpenCode slash command
opencode/vibe-mail/SKILL.md       # OpenCode agent mail skill
codex/vibe-sql/SKILL.md           # Codex CLI slash command
codex/vibe-mail/SKILL.md          # Codex CLI agent mail skill
```

## License

Apache-2.0
