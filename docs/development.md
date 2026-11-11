# google-places-mcp: Developer Reference

User installation, configuration and compatibility status are in the
[README](../README.md). This reference preserves implementation details,
alternative transport schemas and validation commands. A client configuration
example is not a claim of verified July/OAuth interoperability.

Current HTTP source builds use local slimr and libhv overlays. The pinned
published registry baseline predates these HTTP changes; do not claim that
baseline builds the current HTTP app without overrides. CI configuration is
not evidence that a runner/platform/client has passed.

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
│   └── main.cpp              # Standalone CLI, stdio MCP, and Streamable HTTP (`127.0.0.1:8084`) entrypoint
├── Formula/
│   └── google-places-mcp.rb  # Homebrew formula + LaunchAgent service
├── scripts/
│   ├── homebrew.mjs          # Local formula staging & brew services lifecycle
│   └── test-mcp.mjs          # Stdio + ephemeral HTTP (`2026-07-28`) smoke check
├── .cursor-plugin/
│   └── plugin.json           # Cursor plugin manifest -> http://127.0.0.1:8084/mcp
├── .claude-plugin/
│   ├── plugin.json           # Claude plugin manifest -> http://127.0.0.1:8084/mcp
│   └── marketplace.json      # Claude plugin marketplace descriptor
├── tests/
│   └── test_main.cpp         # Unit, mock-transport, CLI, and HTTP loopback tests (zero network calls)
└── build/bin/
    └── google-places-mcp     # Standalone release binary
```

### Libraries Used

- **`<mcp.hpp>`, `<mcp_http.hpp>` & `<reflect.hpp>`:** Typed MCP tool definitions, compile-time JSON Schema generation, native MCP `McpResult::image(...)` blocks, HTTP (`2026-07-28`), and narrow JSON CLI.
- **`<curl.hpp>` (`-lcurl`):** HTTPS requests to `places.googleapis.com`, `routes.googleapis.com`, and `maps.googleapis.com`.
- **`<json.hpp>` (`glaze`):** RFC-8259 JSON serialization and parsing.
- **`<bugsink.hpp>` (`-lcurl`):** opt-in error reporting through `BUGSINK_DSN`.
- **`<test.hpp>` (`doctest`):** Mock-HTTP unit test suite compiled with `-fsanitize=address,undefined`.

## HTTP & Client Configuration (MCP `2026-07-28`)

`google-places-mcp` defaults to HTTP-first Streamable HTTP on `http://127.0.0.1:8084/mcp` (`google-places-mcp http`) while preserving stdio (`google-places-mcp mcp`) and direct JSON CLI invocation (`google-places-mcp <tool> ['{...}']`).

> **Breaking change (MCP `2026-07-28`):** Legacy `initialize` / `notifications/initialized` session handshakes are replaced by stateless `server/discover` with `MCP-Protocol-Version: 2026-07-28` and `Mcp-Method` headers (legacy `initialize` returns `-32601`). Non-loopback bindings require `--allow-non-loopback`, and `--port 0` requires `--allow-ephemeral-port`.

### Homebrew Service (`http://127.0.0.1:8084/mcp`)

```bash
just install-local   # Local source-build installation; the release formula is not finalized
just start           # starts LaunchAgent service on 127.0.0.1:8084 and verifies server/discover
just status          # checks brew services info + HTTP server/discover
just stop            # stops LaunchAgent service
```

Because macOS `brew services` LaunchAgents do not inherit interactive shell environment variables, store your API key and defaults in `~/.config/google-places/config.json` (or `GOOGLE_PLACES_CONFIG`):

```json
{
  "apiKey": "YOUR_GOOGLE_PLACES_API_KEY",
  "home": "53.3813,-6.5918",
  "region": "ie",
  "language": "en",
  "timeZone": "Europe/Dublin"
}
```

Environment variables (`GOOGLE_PLACES_API_KEY`, `PLACES_*`) still take precedence over `config.json`. You can also populate `config.json` from macOS Keychain during setup rather than embedding keys in Homebrew formulas or manifests.

### Client Config Spellings

**Claude Code / `.mcp.json` (HTTP — requires `"type": "http"`):**

```json
{
  "mcpServers": {
    "google-places-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:8084/mcp"
    }
  }
}
```

**Cursor (`.cursor/mcp.json` or `.cursor-plugin/plugin.json`):**

```json
{
  "mcpServers": {
    "google-places-mcp": {
      "url": "http://127.0.0.1:8084/mcp"
    }
  }
}
```

**OpenCode (`opencode.jsonc` — uses `"type": "remote"`):**

```json
{
  "mcp": {
    "servers": {
      "google-places-mcp": {
      "type": "remote",
      "url": "http://127.0.0.1:8084/mcp",
        "protocol": "2026-07-28"
      }
    }
  }
}
```

**Standalone stdio (`.mcp.json` fallback):**

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

## Building & Testing

Use Clang with C++26 and libc++ FAST hardening, CMake 3.31+, Ninja, [just](https://just.systems), a bootstrapped [vcpkg](https://vcpkg.io), Node for the isolated MCP startup checks, and a compatible clang-tidy (LLVM 23 locally). Set `VCPKG_ROOT` and put vcpkg and the tools on `PATH`. Linux additionally needs libc++ and libc++abi; select libc++ with `CXXFLAGS=-stdlib=libc++`.

Dependencies are declared in `vcpkg.json`. During local development, `(cd /absolute/path/to/slimr-cpp && just publish --local --all)` publishes ports into vcpkg's local overlay; export `VCPKG_OVERLAY_PORTS="$VCPKG_ROOT/local-ports"` in your shell. `just deps` installs into `build/deps/` for the detected native triplet. `configure` always runs it, with CMake manifest installation disabled. CMake links installed `slimr::mcp_http` and `slimr::test` targets, never source-header overrides.

```bash
just test      # Debug ASan/UBSan mock-transport, CLI, and HTTP loopback tests (no network/quota)
just build     # Optimized IPO Release app and tests; build/bin/google-places-mcp
just lint      # App and test translation units using the Debug compilation database (supports CLANG_TIDY)
just test-mcp  # Verify stdio (mcp) and ephemeral HTTP (http --port 0 --allow-ephemeral-port) against MCP 2026-07-28
just run status
just clean     # Remove build/ and Formula/.staging/ only; leaves user data untouched
```

Debug and Release graphs live in `build/cmake/Debug/` and `build/cmake/Release/`; only Release apps are emitted to `build/bin/`. Set `CXX` before the first configure to choose a compiler; CMake retains its absolute path even when lint uses a different `PATH`. Both configurations enable libc++ hardening and zero automatic-variable initialization; Debug uses fatal UBSan reports. `just test` and `just test-mcp` isolate HOME/XDG directories, clear credentials, disable error reporting (`BUGSINK_DSN=""`), and never call Google APIs.

CI is configured for the same commands on native Linux/macOS. Configure `VCPKG_REF` to the tested full vcpkg commit SHA. Current July HTTP builds require matching local slimr/libhv overlays until a corresponding registry release is published; the existing consumer registry pin is older. Local macOS validation is not Linux execution evidence.
