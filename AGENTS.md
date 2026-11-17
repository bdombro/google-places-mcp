# AGENTS.md (`google-places-mcp`)

Written for: AI coding agents working in the `google-places-mcp` C++26 plugin repository.

`google-places-mcp` is a C++26 MCP server built on `slimr-*` wrapping the Google Places API (New), Routes API v2, and Geocoding API over `cpp-httplib`, strictly locked to **Pro tier and below**.

<!-- cpp-templates:begin -->
<!-- cpp-templates:commit c746b02c9f5b17b63c4921e6adff7fa8c5f6dc37 -->
## Contributing

Read the sections of [docs/contributing.md](docs/contributing.md) relevant to your change before editing.

## Tooling alignment

Align this repository via the `cpp-templates` skill, which diffs `base/` and `templates/<template>/` since the `<!-- cpp-templates:commit <sha> -->` marker above and adapts changes while preserving repository customizations. Keep repository-specific rules outside `<!-- cpp-templates:begin -->` and `<!-- cpp-templates:end -->`.

## Edit-don't-rewrite

- Make targeted edits and move files with `git mv`; never regenerate files from scratch or retype them from memory.
- Never delete, skip, or loosen tests to pass; if a test must change, explain why in the commit message.

## C++ Memory Safety

- Immediately wrap owned C handles, allocations, descriptors, and temporary resources in RAII. Make owning wrappers noncopyable unless copying deliberately creates independent ownership; moves must leave the source safely destructible.
- Borrow views, pointers, and references only for the current call by default. Store owning values unless lifetime/invalidation guarantees are explicit. Deferred callbacks require explicit ownership-safe captures; no escaping reference captures without a demonstrated lifetime guarantee.
- Initialize scalar/pointer members at declaration and local values before use. Compiler zero-initialization is defense in depth, not permission for uninitialized reads.
- Check range/overflow before narrowing lengths/counts at C API boundaries; casts alone are not validation. Report failures through existing error mechanisms.
- Never let C++ exceptions escape C callbacks. Translate them into the C API's error/abort mechanism and propagate failures at the C++ boundary; do not silently swallow them.
- Preserve libc++ hardening, zero auto-initialization, ASan/UBSan with fatal reports, and required lint/tests. These checks do not prove memory safety.

## C++ style

- Favor modern C++26 and the standard library over legacy patterns; write for readability; comment what is not obvious and why.
- Prefer values over pointers, `const` by default, and no raw `new`/`delete`.
- Use `std::expected` for expected failures; use exceptions only at process and callback boundaries.
- Structure code with one folder per feature under `src/`, mirrored under `tests/`. Keep one test TU per executable (`tests/test_main.cpp`).
- Name what you use (`using slimr::Json;` or `slimr::Json`, never `using namespace`). Use PascalCase for types and camelCase for functions and variables (review guidance, not lint).
- Put file-local helpers in an unnamed namespace in `.cpp` files, or in `detail::` in headers.
- Follow KISS: inline single-use helpers, avoid speculative abstractions, keep diffs lean.
- Apply style rules to new and touched code; ports do not rewrite working code just for style.
- `.clang-tidy` enforces bug-finding checks (`clang-analyzer-core.*`, `clang-analyzer-cplusplus.*`, and bug-risk `bugprone-*` checks; pending legacy findings are temporarily disabled with per-check counts in `.clang-tidy`); fix findings or suppress inline with a reason.
- `INTERFACE_SOURCES` caveat: linking a header-only library that ships an implementation TU (such as `slimr-yaml`) into both a library and an executable that links that library compiles the TU twice and causes duplicate symbols.

## Testing

Iterate with `just test "<case>"` (Debug build with ASan + UBSan, `BUGSINK_DSN=""`), then finish with a full `just test`. `just build` compiles Release only and runs no tests.

## Recipes

- Core: `build`, `clean`, `configure`, `deps`, `doctor`, `fmt`, `lint`, `test [filter]`, `upgrade-deps`
- `homebrew-*`: `install`, `uninstall`
- `homebrew-service` and `homebrew-mcp`: `daemon-logs`, `daemon-restart`, `daemon-start`, `daemon-status`, `daemon-stop`
- `homebrew-mcp`: `test-mcp`
- Dropped tooling (do not re-add): foreground runner, local tap/overlay symlinking, GitHub-branch/local-publish/dry-run helpers, standalone formula check, `release` recipe, and JS formula helpers

## Changelog

PRs touch no release files (`CHANGELOG.md`, `VERSION`, `versions/`). Write the PR title (and optional body) as the changelog entry; `release.yml` generates `CHANGELOG.md` from squash-merge commits after merge.

## Paths, env vars, and README

- `<name>` in Homebrew paths is always the formula name, never a short XDG name: app data lives in `$(brew --prefix)/var/<name>`, config in `$(brew --prefix)/etc/<name>/`, and service secrets in `$(brew --prefix)/etc/<name>/env` (`chmod 600`, never in the public formula).
- Secrets are env vars only.
- Every `README.md` is end-user first: what it does, install, usage, env var table (name, required or optional, purpose), then links into `docs/` (`docs/contributing.md`, `docs/architecture.md`) for contributor workflow and architecture.
<!-- cpp-templates:end -->

## Documentation Upkeep

When a change conflicts with `README.md`, update the affected README and its
linked user/developer documentation in the same change. Keep examples,
configuration, install/build commands and compatibility claims consistent
with implemented behavior; do not claim unverified release or client support.

## Commands

| Task | Command |
| --- | --- |
| Check required tools and C++26 toolchain | `just doctor` |
| Run unit & mock-HTTP tests (ASan + UBSan, no network) | `just test` |
| Build release binary (`build/bin/google-places-mcp`) | `just build` |
| Check formatting and run clang-tidy | `just lint` |
| Verify isolated July MCP discovery over ephemeral HTTP | `just test-mcp` |
| Clean build artifacts | `just clean` |

## Module Boundaries

| Path | Owns | Must Not |
| --- | --- | --- |
| `src/main.cpp` | Entrypoint, `--log-file` setup, calling `google_places::make_google_places_app().run(argc, argv)` | Business logic |
| `src/app.hpp` | `make_google_places_app()` registering all 9 tools, annotations, and instructions | Raw HTTP logic |
| `src/places.hpp` | Places API v1 (`LIST_FIELDS`, `DETAIL_FIELDS`, `search`, `nearby`, `details`, `resolve`, `photo`) | Request any Enterprise or Atmosphere field |
| `src/routes.hpp` | Routes API v2 (`computeRoutes`, `computeRouteMatrix`) | Mutate global state |
| `src/geocode.hpp` | Geocoding API (`geocode`) | — |
| `src/google_client.hpp` | Injectable `HttpTransport`, API key scrubbing (`scrub`), and actionable Google Cloud error formatting (`describeFailure`) | Leak API keys in error strings |
| `src/util.hpp` | Haversine distance, `resolveTime`, `cleanText` (strip control/bidi/zero-width chars), Base64 | — |
| `tests/test_main.cpp` | Offline tests using mock `HttpTransport` | Make live network calls to Google |

## Safety & App Conventions

1. **Strict Pro-Tier Enforcement:** Never add Enterprise or Atmosphere fields (`rating`, `userRatingCount`, `priceLevel`, `regularOpeningHours`, `currentOpeningHours`, `nationalPhoneNumber`, `internationalPhoneNumber`, `websiteUri`, `reviews`, `editorialSummary`) to `LIST_FIELDS` or `DETAIL_FIELDS` in `src/places.hpp`. Tests in `tests/test_main.cpp` explicitly assert their absence.
2. **Untrusted Text Sanitization:** Every display name, address, step instruction, and photo attribution returned from Google must pass through `cleanText()` to strip control, zero-width, and bidi override characters.
3. **API Key Scrubbing:** All errors and URLs surfaced to callers or Bugsink must pass through `scrub(text, apiKey)` so `GOOGLE_PLACES_API_KEY` never leaks.
4. **Offline Tests:** `just test` must always mock `HttpTransport` and never hit the network or consume quota.
