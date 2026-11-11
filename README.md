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

> **Client compatibility:** MCP **2026-07-28 only**; legacy clients cannot connect.
> The workspace has been exercised with OpenCode v2.2.6 using explicit July
> configuration. Cursor's July support is deferred; Claude Code July runtime
> acceptance is not yet verified. Shipping a plugin manifest is not proof of
> client compatibility.

## Try It

After setup, ask your agent:

> Find nearby pharmacies and compare driving times from home.

## Features

- Search and resolve places, inspect details, geocode addresses, and fetch photos.
- Calculate routes and travel-time matrices for common travel modes.
- Pro-tier field masks keep Place requests below Enterprise billing.
- Small footprint: a standalone MCP binary with no Node/V8 runtime.

## Installation

- **Prebuilt release:** the checked-in [Homebrew formula](Formula/google-places-mcp.rb)
  currently has a placeholder checksum. It is not a ready-to-install release.
  Check [releases](https://github.com/bdombro/google-places-mcp/releases) for published
  binaries and a finalized formula before using a release installation command.
- **Build from source:** the current path is [Development](#development).
  Local slimr overlays are for development, not a runtime requirement.
- **Already installed:** follow the setup and service steps below. Installing a
  Cursor/Claude manifest only configures an endpoint; it does not install or
  start the native service.


## Configure Google Maps

Create a Google Cloud API key authorized for Places API (New), Routes API and
Geocoding API. No Google Workspace CLI or user OAuth profile is needed.
For a Homebrew service, store private settings in
`~/.config/google-places/config.json` (or use `GOOGLE_PLACES_CONFIG`):

```json
{
  "apiKey": "YOUR_GOOGLE_PLACES_API_KEY",
  "home": "53.3813,-6.5918",
  "region": "ie",
  "language": "en",
  "timeZone": "Europe/Dublin"
}
```

Restrict the file to your user (`chmod 600`) and never commit it.
Environment variables override file values. The `home` value is optional
configuration for location-biased searches; use your own location.


## Start and Manage the Service

For an already-installed Homebrew formula:

```bash
brew services start bdombro/google-places-mcp/google-places-mcp
brew services info google-places-mcp
brew services restart bdombro/google-places-mcp/google-places-mcp
brew services stop bdombro/google-places-mcp/google-places-mcp
```

The endpoint is `http://127.0.0.1:8084/mcp`; logs are under
`/opt/homebrew/var/log/`. To run in the foreground instead, use
`google-places-mcp http` (or `./build/bin/google-places-mcp http` from a source checkout).
Do not run the foreground server and service on the same port.
Keep the default loopback bind; this is not a shared remote-host deployment.


## Connect Your Agent

After starting the service, add this server to OpenCode v2.2.6's
`opencode.jsonc` (merge it with any existing servers):

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

Use either an explicit server entry or a plugin manifest, not both.
Alternative client schemas and stdio configuration are in the
[developer reference](docs/development.md). The compatibility notice above
applies to every transport.


## Tools & CLI Commands

Every tool is available over MCP (`google-places-mcp http` on `http://127.0.0.1:8084/mcp`, `google-places-mcp mcp` over stdio) and on the CLI (`google-places-mcp <tool> ['{"arg":"val"}']`).

| Tool | Google API | Description |
| --- | --- | --- |
| `search` | Places (Pro) | Text search (`"paediatric dentist Maynooth"`), biased toward a location (`near`, defaulting to `home`); optional `type`, `rankBy` (`relevance` or `distance`), `limit`. |
| `nearby` | Places (Pro) | Places matching `types` (and optional `excludeTypes`) within `radiusMeters` of `near` (default `home`), ranked by `popularity` or `distance`. |
| `resolve` | Places (Pro) | Resolve a name or address string into candidate places with `id`, canonical address, coordinates, and distance from reference point. |
| `details` | Places (Pro) | Full Pro-tier details for a place ID or name: canonical address, types, business status, Google Maps URI, IANA time zone, accessibility options, and photo references. |
| `photo` | Places (free) | Resolves a photo reference (`places/<id>/photos/<ref>`) from `details`. Returns a short-lived `photoUri`, or when `"image": true` is passed, downloads the image bytes and returns a **native MCP image content block**. |
| `route` | Routes v2 | Travel time and distance from `origin` to `destination` by `drive`, `walk`, `bicycle`, `transit`, or `two_wheeler`; optional `departAt`/`arriveBy`, `traffic`, `avoid` (`tolls`, `highways`, `ferries`), `alternatives`, and turn-by-turn `steps`. |
| `matrix` | Routes v2 | Travel times and distances for every pair of up to 25 `origins` and 25 `destinations`. |
| `geocode` | Geocoding | Forward geocode an address to `lat,lng`, or reverse geocode `"53.3813,-6.5918"` to canonical addresses. |
| `status` | All | Shows active configuration (`home`, `region`, `language`, `timeZone`, API key presence). Pass `"probe": true` to live-check all three APIs (using an IDs-only Places request that Google does not bill). |

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

## Troubleshooting

- **Client cannot connect:** confirm it supports July MCP, the service is
  running, and the client URL matches the configured port. OpenCode needs
  `"protocol": "2026-07-28"`; old `initialize` clients will fail.
- **Port occupied:** inspect the listener and stop only the service/process
  you own, or deliberately choose another port and update the client URL.
- **Works in a terminal, not as a service:** launchd does not inherit
  `~/.zshrc`. Configure the service environment separately or use the
  plugin's supported private configuration file; inspect
  `/opt/homebrew/var/log/` for errors.
- **Google rejects a request:** check API enablement, billing and key restrictions. Never paste your API key into logs or support reports.
- **Source build cannot find vcpkg or slimr ports:** load the development
  environment, bootstrap vcpkg, and register both slimr links and the pinned
  libhv overlay. Never repair this by editing installed headers.
- **Compiler/hardening check fails:** upgrade the Xcode toolchain; set
  `CXX` before first configure. CMake caches the compiler, so an intentional
  compiler change needs a fresh configuration tree.


## Development

This section is for building or changing the server, not configuring an
installed binary. [Architecture, transport reference and test details](docs/development.md)
are separate from the user setup flow.

<details>
<summary>macOS source-build setup (vcpkg and local slimr overlays)</summary>

## macOS Build Prerequisites (vcpkg setup)

Install [Homebrew](https://brew.sh) and current Xcode Command Line Tools
(`xcode-select --install`; finish installation before continuing), or full Xcode.
Apple Clang 21 is the verified C++26/libc++ toolchain; older installations need
upgrading. These instructions assume Apple Silicon Homebrew at `/opt/homebrew`.

Add this environment snippet to `~/.zshrc`, then open a new terminal (or run
`source ~/.zshrc`). Use `~/.zshrc`, not `~/.zshenv`, to avoid changing
non-interactive zsh scripts:

`local-ports` is the dedicated vcpkg overlay directory for local development
linking: `just publish --local --all` registers symlinks to your slimr-cpp checkout,
overriding published packages without making a registry release. See the
[publishing guide on slimr-cpp](https://github.com/bdombro/slimr-cpp/blob/main/docs/publishing.md#local-environment).

```bash
export VCPKG_ROOT="$HOME/.local/share/vcpkg"
export VCPKG_OVERLAY_PORTS="$VCPKG_ROOT/local-ports"
# Use your existing workspace checkout instead when available.
export SLIMR_CPP="${SLIMR_CPP:-$HOME/dev/bdombro/slimr-cpp}"
export CXX="/usr/bin/clang++"
export CLANG_TIDY="/opt/homebrew/opt/llvm/bin/clang-tidy"
export PATH="$VCPKG_ROOT:/opt/homebrew/opt/ruby/bin:/opt/homebrew/bin:$PATH"
```

Then install and build from the repository root:

```bash
brew install cmake ninja just llvm node ruby autoconf automake libtool pkgconf
mkdir -p "$(dirname "$VCPKG_ROOT")"
if [ ! -d "$VCPKG_ROOT/.git" ]; then
  git clone https://github.com/microsoft/vcpkg.git "$VCPKG_ROOT"
fi
"$VCPKG_ROOT/bootstrap-vcpkg.sh" -disableMetrics
mkdir -p "$(dirname "$SLIMR_CPP")"
if [ ! -d "$SLIMR_CPP/.git" ]; then
  git clone https://github.com/bdombro/slimr-cpp.git "$SLIMR_CPP"
fi
(cd "$SLIMR_CPP" && just publish --local --all)
ln -s "$SLIMR_CPP/ports/libhv" "$VCPKG_OVERLAY_PORTS/libhv"

"$CXX" --version
vcpkg version
BUGSINK_DSN="" just test
just build
```

The libhv link is a one-time step: if it exists, verify that it points to the
chosen checkout's `ports/libhv` before skipping the command. Never overwrite
a conflicting port directory or modify installed headers/caches. Current HTTP
builds need both local slimr overlays and the separately pinned libhv port;
the older published registry baseline alone is not an HTTP build substitute.
`just deps` installs dependencies into `build/deps/`; vcpkg supplies curl and
OpenSSL, so separate Homebrew library installs are unnecessary.

Bootstrapping puts the executable at `$VCPKG_ROOT/vcpkg`, with no `bin/`
subdirectory. Keg-only Homebrew Ruby supplies `/opt/homebrew/opt/ruby/bin/ruby`.
Homebrew LLVM supplies lint tooling; select a different compatible `CXX`
before first configure if needed, since CMake caches it. For reproducible
vcpkg tooling, check out the tested full `VCPKG_REF` commit before bootstrapping;
package registry baselines pin resolution separately.
Live requests require the API key described above, not the `gws` CLI.
Build/test commands do not call Google APIs or start services.

</details>

After the source build succeeds, stage and install the local Homebrew formula:

```bash
just install-local
```

Installing a formula and starting its service are separate actions.
For a source-only foreground run, use
`./build/bin/google-places-mcp http`.
