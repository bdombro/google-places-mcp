# google-places

Argsbarg Claude Code / Cursor MCP plugin with a committed single-file Node bundle. Distributed as a plugin (`.claude-plugin/`, `.cursor-plugin/`); the manifests launch `node dist/google-places.mjs mcp`.

## Argsbarg authoring

When adding or changing commands, schemas, or MCP exposure:

1. **Read** `node_modules/argsbarg/docs/cli-program.md` first (authoritative).
2. MCP tools, varargs, `inputSchema` → `node_modules/argsbarg/docs/mcp.md`.
3. Zod schemas (`inputSchema`, `outputSchema`, JSON stdout) → `node_modules/argsbarg/docs/schemas.md`.
4. Other templates for reference: `node_modules/argsbarg/examples/` (`cli`, `api`, `agent-plugin`, `homebrew`).

**Rules** (details are in the docs above; don't contradict them):

- Reserved root commands: `completion`, `mcp`, `http`, `version`.
- `argsbarg({ … })` builds the app in `src/app.ts`; `command({ … })` declares every command (typed `ctx.inputs` / `ctx.pathParams`). Give the root, commands, options, and positionals action-oriented `description`s.
- Omit `mcpTool` unless a command is genuinely CLI-only (`enabled: false`) or hits an irreducible wire limit; fix the schema and headless path first.
- String options: `format` / `default` / `pattern` per `cli-program.md`; use `ctx.inputs` for multi-flag commands.
- Varargs (`argMax: 0`): space-separated on the CLI, a JSON array over MCP; never comma-split positionals.
- App settings are app code (env vars or your own file); argsbarg doesn't manage them.
- Multi-surface commands (Ink + headless + MCP): one `read*Flags(ctx)` per command and one `resolve*Input(flags)` for cross-field rules, so every path shares one struct.
- Schemas live at the top of the command's `command.ts` (a sibling `schemas.ts` only when shared or large): export the Zod schema and a same-named `z.infer` type. Prefer `z.strictObject`; document every field with `.describe("…")` (agents read it; JSDoc isn't emitted).

## Code conventions

- **JSDoc:** document exported surfaces that aren't obvious from the name (output schemas, public types, non-trivial algorithms). Skip short test callbacks and pure re-export files.
- **Names:** describe the domain role; avoid `data` / `handler`-style placeholders outside tiny scopes.
- **Structure:** after imports, exported symbols first (alphabetical within each kind), then module-private helpers. Relative imports with explicit `.ts` extensions.
- **Abstractions:** keep single-use helpers in the calling file. Split only when reused, when the caller is hard to follow, or when the extraction is a substantial unit.
- **Skill:** when commands are added, renamed, or removed, update `skills/google-places/SKILL.md`.

### Module boundaries

| Path | Owns | Must not |
| --- | --- | --- |
| `src/index.ts` | Entry: `await app.run()` | Command handlers, business logic |
| `src/app.ts` | App spec: `commands: […]` (alphabetical by key) | Command handlers, business logic |
| `src/create-identity.ts` | Key, release repo, description (rewritten by `argsbarg create`) | Anything else |
| `src/types/` | Module augmentations (`argsbarg.d.ts`: `Locals`, `ServerState`) | Runtime logic |
| `src/config.ts` | Settings from the environment (key, home area, region, language, time zone) | Network calls |
| `src/google/` | One module per Google API (`places.ts`, `routes.ts`, `geocode.ts`) plus the HTTP client (`client.ts`: key handling, error mapping, injectable transport) | Command handlers, output schemas |
| `src/schemas.ts`, `src/format.ts` | Output shapes shared by the place tools; CLI text rendering | Google calls |
| `src/util.ts` | Pure helpers: coordinates, distances, text cleaning, durations, departure times | Env or network access |
| `src/commands/<name>/` | One command: `command.ts` (with its Zod schemas), colocated `*.test.ts` | Shared helpers (lift them out) |
| `scripts/` | Dev tooling (release) | Production command paths |

## Tooling

- Node ≥ 22.18 and npm; no Bun required. [just](https://just.systems) runs the tasks.
- `just setup`, `just check` (Biome + `tsc --noEmit`), `just test` (check + `node --test`), `just run …` (from source, type-stripped).
- `just build` rebuilds the committed bundle `dist/google-places.mjs` (esbuild). Plugins run it with `node` via inline manifest MCP configs; commit it with its source and never hand-edit it. stdout is the MCP protocol.
- `just plugin-claude-install`, `just plugin-cursor-upsert` install this checkout locally.
- Release: `just release <major|minor|patch>` (no prompt: tests, bumps, builds, commits all changes, tags, pushes, GitHub release).

## Testing boundaries

- Use the cheapest test level that establishes the behavior. Reuse existing tests and helpers.
- Unit/offline: deterministic parsing, validation, state changes, and request planning, independent of live services and paid agents.
- Integration: contracts unit tests cannot establish (clean plugin installation, MCP startup/transport, external persistence). Don't duplicate unit coverage with live calls.
- Agent E2E: safe user-task completion and agent efficiency. Check outcomes and protected content, not exact tool-call sequences. Run explicitly, never in the default test command.
- When E2E exposes a tool bug, reproduce and fix it in unit tests first. Check verifier changes offline before another paid run.
- Attribute agent failures from observable evidence; a failed call alone doesn't establish task failure or a tool defect.

## Documentation

- `README.md` — install and commands for users
- `docs/architecture.md` — maintainer notes (create when needed)
- `skills/google-places/SKILL.md` — agent skill (customize as needed)

## App conventions

- **Every Google call goes through `request()`** in `src/google/client.ts`. The transport is `ctx.locals.http` (set by `attachGoogle`; tests swap in `mockHttp` via `appWithHttp`). Tests never hit the network; manual smoke tests with the real key must be read-only (`geocode`, `status --probe`).
- **Stay in Google's Pro tier or below.** Field masks live in `src/google/places.ts`, and tests assert none of them contains an Enterprise field (rating, userRatingCount, priceLevel, opening hours, phone, website, reviews, editorialSummary, atmosphere attributes). Don't add one without Brian's say-so, and update the README's "What's not included" section if you do.
- **The API key never leaves `client.ts`.** It goes in a header (query parameter for Geocoding) and is scrubbed from every error. Never put it in tool output, logs or test fixtures.
- **Place text is untrusted.** Names, addresses and photo credits come from businesses and the public: run them through `cleanText`, keep the `notice` on results, and keep the MCP instructions saying so.
- **Validate before interpolating into a URL path.** Place IDs and photo references are checked against strict regexes (`asPlaceId`, `PHOTO_NAME`) before they're used in a path.
- **Home area is configuration, not code.** `PLACES_HOME` comes from the environment; keep the real house location out of the repo and the docs.
- **Traffic-aware routing is opt-in** (`departAt` or `traffic`); the default is the cheaper static estimate.
- **No native MCP images.** The argsbarg version in use can't return image blocks, so `photo` returns a URL.
