# VibeSQL Skills

`/vibe-sql` — a slash command that lets your AI coding assistant talk to a [VibeSQL](https://vibesql.online) database. Natural language in, PostgreSQL queries out.

Works with Claude Code, OpenCode, and Codex CLI.

## Install

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

## Usage

```
/vibe-sql show me all tables
/vibe-sql create a products table with name, price, and description
/vibe-sql add a row: name=Widget, price=9.99
/vibe-sql what's the average price
/vibe-sql add a category column to products
```

## What It Does

- Translates natural language to PostgreSQL 16.1 SQL
- Executes against `POST /v1/query` on your local vibesql-micro
- Presents results as readable tables
- Knows JSONB operators, DDL, CRUD, aggregation, pagination
- Confirms before destructive operations (DROP, TRUNCATE)
- Requires WHERE on UPDATE/DELETE

## Custom URL

Set `VIBESQL_URL` if your instance is not on localhost:5173.

## Repo Structure

```
claude/vibe-sql/SKILL.md      # Claude Code
opencode/vibe-sql/SKILL.md    # OpenCode
codex/vibe-sql/SKILL.md       # Codex CLI
```

Same skill body, platform-specific frontmatter.

## License

Apache-2.0
