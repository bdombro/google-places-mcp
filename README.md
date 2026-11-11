# google-places-mcp

```
       .-""""-.
      /  .--.  \
      | (    ) |
       \  '--' /
        '----'
          ||
```

Use this MCP to find places, compare nearby options, check routes and travel times, and work with addresses through Google Maps.

Every Places request is restricted to Google's **Pro tier and below**, so agent searches cannot trigger Enterprise-tier per-request billing. Place photos can be returned as native MCP images, ready for the agent to inspect.

## Features

- Search and resolve places, inspect details, geocode addresses, and fetch photos.
- Calculate routes and travel-time matrices for common travel modes.
- Pro-tier field masks keep Place requests below Enterprise billing.
- Small footprint: a standalone MCP binary with no Node/V8 runtime.

## `.mcp.json` Configuration

In the `assistant2` workspace, `google-places-mcp` is mounted into the unified `build/bin/assistant-mcp` gateway under the `places_` prefix (`places_search`, `places_nearby`, `places_details`, `places_resolve`, `places_geocode`, `places_route`, `places_matrix`, `places_photo`, `places_status`).

To run `google-places-mcp` as a standalone MCP server in `.mcp.json`:

```json
{
  "mcpServers": {
    "google-places-mcp": {
      "command": "/absolute/path/to/build/bin/google-places-mcp",
      "args": ["mcp"],
      "env": {
        "GOOGLE_PLACES_API_KEY": "${GOOGLE_PLACES_API_KEY}",
        "PLACES_HOME": "53.3813,-6.5918",
        "PLACES_REGION": "ie",
        "PLACES_LANGUAGE": "en",
        "PLACES_TIMEZONE": "Europe/Dublin"
      }
    }
  }
}
```

## App Architecture

The standalone MCP and JSON CLI are implemented in C++26 on `slimr-cpp`.

```text
plugins/google-places-mcp/
├── vcpkg.json                # Independently resolved dependencies
├── CMakeLists.txt            # App/test targets and transitive dependency linking
├── justfile                  # Thin CMake/Ninja orchestration
├── README.md                 # User & operator documentation
├── AGENTS.md                 # Maintainer & AI agent conventions
├── src/
│   ├── types.hpp             # Core types (`LatLng`, `DEFAULT_HOME`, `PlacesConfig`)
│   ├── util.hpp              # Haversine distance, duration formatting, `resolveTime`, `cleanText`, Base64
│   ├── google_client.hpp     # Injectable `HttpTransport` over `curl.hpp`, key scrubber, failure classifier
│   ├── places.hpp            # Places API v1 (`search`, `nearby`, `details`, `photo`) with Pro-tier field masks
│   ├── geocode.hpp           # Geocoding API (forward and reverse geocoding)
│   ├── routes.hpp            # Routes API v2 (`computeRoutes` and `computeRouteMatrix`)
│   ├── app.hpp               # `make_google_places_app()` registering all 9 tools, annotations & Bugsink DSN
│   └── main.cpp              # Standalone CLI & stdio MCP entrypoint
├── tests/
│   └── test_main.cpp         # 44 unit & mock-transport test cases (307 assertions, zero network calls)
└── build/bin/
    └── google-places-mcp     # Standalone release binary
```

### Libraries Used

- **`<mcp.hpp>` & `<reflect.hpp>`:** Typed MCP tool definitions, compile-time JSON Schema generation, native MCP `McpResult::image(...)` blocks, and narrow JSON CLI.
- **`<curl.hpp>` (`-lcurl`):** HTTPS requests to `places.googleapis.com`, `routes.googleapis.com`, and `maps.googleapis.com`.
- **`<json.hpp>` (`glaze`):** RFC-8259 JSON serialization and parsing.
- **`<bugsink.hpp>` (`-lcurl`):** opt-in error reporting through `BUGSINK_DSN`.
- **`<test.hpp>` (`doctest`):** Mock-HTTP unit test suite compiled with `-fsanitize=address,undefined`.

## Tools & CLI Commands

Every tool is available over MCP (`google-places-mcp mcp` or via `assistant-mcp` under the `places_` prefix) and on the CLI (`google-places-mcp <tool> ['{"arg":"val"}']`).

| Tool | Gateway Name | Google API | Description |
| --- | --- | --- | --- |
| `search` | `places_search` | Places (Pro) | Text search (`"paediatric dentist Maynooth"`), biased toward a location (`near`, defaulting to `home`); optional `type`, `rankBy` (`relevance` or `distance`), `limit`. |
| `nearby` | `places_nearby` | Places (Pro) | Places matching `types` (and optional `excludeTypes`) within `radiusMeters` of `near` (default `home`), ranked by `popularity` or `distance`. |
| `resolve` | `places_resolve` | Places (Pro) | Resolve a name or address string into candidate places with `id`, canonical address, coordinates, and distance from reference point. |
| `details` | `places_details` | Places (Pro) | Full Pro-tier details for a place ID or name: canonical address, types, business status, Google Maps URI, IANA time zone, accessibility options, and photo references. |
| `photo` | `places_photo` | Places (free) | Resolves a photo reference (`places/<id>/photos/<ref>`) from `details`. Returns a short-lived `photoUri`, or when `"image": true` is passed, downloads the image bytes and returns a **native MCP image content block**. |
| `route` | `places_route` | Routes v2 | Travel time and distance from `origin` to `destination` by `drive`, `walk`, `bicycle`, `transit`, or `two_wheeler`; optional `departAt`/`arriveBy`, `traffic`, `avoid` (`tolls`, `highways`, `ferries`), `alternatives`, and turn-by-turn `steps`. |
| `matrix` | `places_matrix` | Routes v2 | Travel times and distances for every pair of up to 25 `origins` and 25 `destinations`. |
| `geocode` | `places_geocode` | Geocoding | Forward geocode an address to `lat,lng`, or reverse geocode `"53.3813,-6.5918"` to canonical addresses. |
| `status` | `places_status` | All | Shows active configuration (`home`, `region`, `language`, `timeZone`, API key presence). Pass `"probe": true` to live-check all three APIs (using an IDs-only Places request that Google does not bill). |

Locations in `search`, `nearby`, `route`, and `matrix` accept place names, street addresses, place IDs (`ChIJ...` or `places/ChIJ...`), `"lat,lng"` coordinates, or `"home"`.

### CLI Examples

```bash
# Search biased toward a named place, ranked by distance
./build/bin/google-places-mcp search '{"query":"pharmacy","near":"Maynooth Educate Together","rankBy":"distance"}'

# Nearby playgrounds and parks within 2 km of home
./build/bin/google-places-mcp nearby '{"types":["playground","park"],"radiusMeters":2000}'

# Place details with up to 2 photo references
./build/bin/google-places-mcp details '{"place":"Supervalu Maynooth","photos":2}'

# Route from home to Dublin Airport departing at 07:30 local time, avoiding tolls
./build/bin/google-places-mcp route '{"origin":"home","destination":"Dublin Airport","departAt":"07:30","avoid":["tolls"]}'

# Route matrix by public transit
./build/bin/google-places-mcp matrix '{"origins":["home","Maynooth Library"],"destinations":["Heuston Station","Connolly Station"],"mode":"transit"}'

# Reverse geocode coordinates
./build/bin/google-places-mcp geocode '{"query":"53.3813,-6.5918"}'

# Probe API key permissions across Places, Routes, and Geocoding
./build/bin/google-places-mcp status '{"probe":true}'
```

## Pro-Tier Cost Guardrails (What's Not Included)

Google bills Places API (New) requests according to the highest-tier field present in `X-Goog-FieldMask`. `src/places.hpp` (`LIST_FIELDS` and `DETAIL_FIELDS`) strictly restricts requests to **Pro tier and below**, and unit tests in `tests/test_main.cpp` assert that no Enterprise or Atmosphere field is ever sent:

| Omitted Data | Google Billing Tier |
| --- | --- |
| `rating`, `userRatingCount`, `priceLevel`, `priceRange` | Enterprise |
| `regularOpeningHours`, `currentOpeningHours` (and `openNow` filters) | Enterprise |
| `nationalPhoneNumber`, `internationalPhoneNumber`, `websiteUri` | Enterprise |
| `reviews`, `editorialSummary`, `generativeSummary`, atmosphere booleans | Enterprise + Atmosphere |

**Included in Pro tier:** `id`, `displayName`, `formattedAddress`, `shortFormattedAddress`, `location`, `types`, `primaryType`, `primaryTypeDisplayName`, `businessStatus`, `googleMapsUri`, `utcOffsetMinutes`, `timeZone`, `accessibilityOptions`, and `photos`.

**Untrusted text defense:** Place names and photo author attributions come from third parties. `cleanText()` in `src/util.hpp` strips ASCII control characters, Unicode zero-width characters, and bidirectional overrides (`U+202A..U+202E`, `U+2066..U+2069`), and API keys are scrubbed from all error messages.

## Configuration (Environment Variables)

| Variable | Default | Purpose |
| --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | none (`GOOGLE_PLACE_API_KEY` also read) | Google Cloud API key restricted to Places API (New), Routes API, and Geocoding API |
| `PLACES_HOME` | `53.3813,-6.5918` (Maynooth centre) | Default `"lat,lng"` for search bias and `"home"` waypoint in routes |
| `PLACES_REGION` | `ie` | CLDR region code for search bias |
| `PLACES_LANGUAGE` | `en` | BCP-47 language code for returned names and addresses |
| `PLACES_TIMEZONE` | `Europe/Dublin` | IANA timezone for local `departAt` / `arriveBy` timestamps |
| `BUGSINK_DSN` | unset (disabled) | Error reporting DSN (`""` disables) |

## Building & Testing

Use Clang with C++26 and libc++ FAST hardening, CMake 3.31+, Ninja, [just](https://just.systems), a bootstrapped [vcpkg](https://vcpkg.io), Node for Inspector, and a compatible clang-tidy (LLVM 23 locally). Set `VCPKG_ROOT` and put vcpkg and the tools on `PATH`. Linux additionally needs libc++ and libc++abi; select libc++ with `CXXFLAGS=-stdlib=libc++`.

Dependencies are declared in `vcpkg.json`. During local development, `(cd /absolute/path/to/slimr-cpp && just publish --local --all)` publishes ports into vcpkg's local overlay; export `VCPKG_OVERLAY_PORTS="$VCPKG_ROOT/local-ports"` in your shell. `just deps` installs into `build/deps/` for the detected native triplet. `configure` always runs it, with CMake manifest installation disabled. CMake links installed `slimr::mcp` and `slimr::test` targets, never source-header overrides.

```bash
just test      # Debug ASan/UBSan mock-transport tests, no network/quota use
just build     # Optimized IPO Release app and tests; build/bin/google-places-mcp
just lint      # App and test translation units using the Debug compilation database
just test-mcp  # Pinned Inspector 2.14.0: initialize and tools/list only
just run status
just clean     # Remove build/ only; leaves legacy dist/ and user data untouched
```

Debug and Release graphs live in `build/cmake/Debug/` and `build/cmake/Release/`; only Release apps are emitted to `build/bin/`. Set `CXX` before the first configure to choose a compiler; CMake retains its absolute path even when lint uses a different `PATH`. Both configurations enable libc++ hardening and zero automatic-variable initialization; Debug uses fatal UBSan reports. Inspector isolates HOME/XDG directories under `build/`, clears credentials, disables error reporting and external CLI access, and cleans up afterward; it never invokes a tool.

CI runs the same commands on native Linux/macOS. Configure `VCPKG_REF` to the tested full vcpkg commit SHA; slimr packages resolve from the public registry pinned in `vcpkg-configuration.json`, without a dependency token. Local macOS validation is not Linux execution evidence.
