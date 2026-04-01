# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.3] - 2026-02-23

### Added
- `/vibe-mail` skill for agent mail communication in AI teams
- `/vibe-sql` skill for Claude Code, OpenCode, and Codex CLI
- MCP server implementation for VibeSQL database connectivity
- `DOCUMENT_TOO_LARGE` error code per QAPert review
- Multi-tool support: Claude Code (`claude/`), OpenCode (`opencode/`), Codex (`codex/`), and MCP server (`claude-mcp/`)

### Removed
- Health-related error codes removed (`/v1/health` not available on vibesql-micro)
