# AGENTS.md (`google-places-mcp`)

Written for: AI coding agents working in the `google-places-mcp` C++26 plugin repository.

`google-places-mcp` is a C++26 MCP plugin and CLI built on `slimr-cpp` wrapping the Google Places API (New), Routes API v2, and Geocoding API over `libcurl`, strictly locked to **Pro tier and below**.

## Commands

| Task | Command |
| --- | --- |
| Run unit & mock-HTTP tests (ASan + UBSan, no network) | `just test` |
| Build and test release binary (`build/bin/google-places-mcp`) | `just build` |
| Analyze app and test translation units | `just lint` |
| Verify isolated MCP initialization and tool discovery | `just test-mcp` |
| Clean build artifacts | `just clean` |

## Module Boundaries

| Path | Owns | Must Not |
| --- | --- | --- |
| `src/main.cpp` | Entrypoint calling `google_places::make_google_places_app().run(argc, argv)` | Business logic |
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

## C++ Memory Safety

- Immediately wrap owned C handles, allocations, descriptors, and temporary resources in RAII. Make owning wrappers noncopyable unless copying creates independent ownership; moves must leave the source safely destructible.
- Borrow views, pointers, and references only for the current call by default. Store owning values unless lifetime/invalidation guarantees are explicit. Deferred callbacks require explicit ownership-safe captures; no escaping reference captures without a demonstrated lifetime guarantee.
- Initialize scalar/pointer members at declaration and local values before use. Compiler auto-initialization is defense in depth, not permission for uninitialized reads.
- Check range/overflow before narrowing lengths/counts at C API boundaries; casts alone are not validation. Report invalid inputs using existing error mechanisms.
- Never let C++ exceptions escape C callbacks. Translate them into the C API's error/abort mechanism and propagate failures at the C++ boundary; do not silently swallow them.
- Preserve hardening, zero auto-initialization, ASan/UBSan with fatal reports, and required lint/tests. These checks do not prove memory safety.
