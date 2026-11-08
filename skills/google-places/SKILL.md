---
id: google-places
name: google-places
description: Operates the google-places CLI (echo, render-json, status, workspaces :id delete, workspaces :id get, and 4 more). Use when the user mentions google-places, echo, render-json, status, or related tasks.
enabled: true
---

# google-places

Google Places, Routes and Geocoding for agents: search, nearby, details, routes, photos. (Zod schemas, typed commands, REST CRUD)

## Execution

Invoke via shell:

```bash
google-places <subcommand> [options] [args]
```

## Options & Help Discovery

- Run `google-places <subcommand> --help` to inspect flags, choices, and positional arguments before running unfamiliar subcommands.
- Run `google-places --help` at the root for top-level options and command routing.

## Commands

- **`google-places echo`** — Echo a message (MCP-friendly command).
- **`google-places render-json`** — Echo a JSON message (schema-first JSON command demo).
- **`google-places status`** — Show app version.
- **`google-places workspaces :id delete`** — Delete a workspace.
- **`google-places workspaces :id get`** — Get one workspace.
- **`google-places workspaces :id patch`** — Patch a workspace name.
- **`google-places workspaces :id put`** — Replace a workspace.
- **`google-places workspaces get`** — List workspaces.
- **`google-places workspaces post`** — Create a workspace.

## Workflow & Pitfalls

- Always run `google-places <subcommand> --help` instead of guessing options or reading large doc files.
- Pass `--` before arguments that look like flags.
- Pass `--json` when machine-readable structured output is supported.

## Install location

- **Agent plugin:** plugins built with `google-places mcp bundle` ship this skill.
- **Manual:** copy or symlink `skills/google-places/` into your agent's skill directory (for example `~/.agents/skills/google-places/` or `~/.claude/skills/google-places/`).
