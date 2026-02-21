# /vibe-sql — Claude Code Skill

A Claude Code slash command that turns natural language into VibeSQL database queries.

## Install

Copy the skill directory to your global Claude Code skills:

```bash
cp -r claude-skill ~/.claude/skills/vibe-sql
```

Or for project-level only:

```bash
cp -r claude-skill .claude/skills/vibe-sql
```

## Usage

```
/vibe-sql show me all tables
/vibe-sql create a products table with name, price, and description
/vibe-sql add a row: name=Widget, price=9.99
/vibe-sql what's the average price
/vibe-sql add a category column to products
```

## Prerequisites

- vibesql-micro running locally: `npx vibesql-micro` (starts on `http://localhost:5173`)
- Claude Code installed

## Custom URL

If your VibeSQL instance runs elsewhere, set the `VIBESQL_URL` environment variable before starting Claude Code.

## What It Does

- Translates natural language to PostgreSQL SQL
- Executes via `POST /v1/query` against vibesql-micro
- Presents results as readable tables
- Knows JSONB operators, information_schema patterns, DDL, CRUD
- Confirms before destructive operations (DROP, TRUNCATE)

## License

Apache-2.0
