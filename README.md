# google-places-mcp

Find places, compare nearby options, check routes and travel times, and geocode addresses through Google Maps. Every Places request is restricted to Google's **Pro tier and below**, so agent searches cannot trigger Enterprise-tier per-request billing. Place photos can be returned as native MCP images.

> **Client compatibility:** MCP **2026-07-28 only**; legacy clients cannot connect.

## Install

```bash
brew tap bdombro/google-places-mcp https://github.com/bdombro/google-places-mcp
brew install bdombro/google-places-mcp/google-places-mcp
```

## Configure

Create a Google Cloud API key authorized for Places API (New), Routes API, and Geocoding API.

For the Homebrew service (`launchd` / `systemd`), store secrets in `$(brew --prefix)/etc/google-places-mcp/env` (`chmod 600`):

```bash
GOOGLE_PLACES_API_KEY=YOUR_GOOGLE_PLACES_API_KEY
```

Optional non-secret defaults (`home`, `region`, `language`, `timeZone`) can live in `$(brew --prefix)/etc/google-places-mcp/config.json` (or `GOOGLE_PLACES_CONFIG`):

```json
{
  "home": "53.3813,-6.5918",
  "region": "ie",
  "language": "en",
  "timeZone": "Europe/Dublin"
}
```

Environment variables override `config.json`.

## Usage

Start the Homebrew service:

```bash
brew services start google-places-mcp
brew services info google-places-mcp
```

The HTTP server binds `0.0.0.0:10004` (`http://127.0.0.1:10004/mcp` locally), uses `$(brew --prefix)/var/google-places-mcp`, and logs to `$(brew --prefix)/var/log/google-places-mcp.log` (rotated at 10 MiB, keeping one `.1`).

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "google-places-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:10004/mcp"
    }
  }
}
```

Or run over stdio (`google-places-mcp mcp`) or direct CLI (`google-places-mcp search '{"query":"pharmacy"}'`). Pass `--skip-checks` to bypass startup env validation when inspecting discovery or running offline commands.

## Tools

| Tool | Google API | Description |
| --- | --- | --- |
| `search` | Places (Pro) | Text search biased toward `near` (default `home`); optional `type`, `rankBy`, `limit`. |
| `nearby` | Places (Pro) | Places matching `types` within `radiusMeters` of `near` (default `home`). |
| `resolve` | Places (Pro) | Resolve a name or address into candidate places with IDs and coordinates. |
| `details` | Places (Pro) | Pro-tier details for a place ID or name, including time zone, accessibility, and photo references. |
| `photo` | Places (free) | Resolve a photo reference to a short-lived `photoUri` or a native MCP image block (`"image": true`). |
| `route` | Routes v2 | Travel time and distance by `drive`, `walk`, `bicycle`, `transit`, or `two_wheeler`. |
| `matrix` | Routes v2 | Travel times and distances for up to 25 origins and 25 destinations. |
| `geocode` | Geocoding | Forward geocode an address or reverse geocode `"lat,lng"`. |
| `status` | All | Show active settings and, with `"probe": true`, live-check all three APIs. |

## Pro-Tier Cost Guardrails

`src/places.hpp` (`LIST_FIELDS` and `DETAIL_FIELDS`) restricts Places API (New) field masks to **Pro tier and below**, omitting Enterprise and Atmosphere fields (`rating`, `userRatingCount`, `priceLevel`, `regularOpeningHours`, `currentOpeningHours`, `nationalPhoneNumber`, `internationalPhoneNumber`, `websiteUri`, `reviews`, `editorialSummary`). Place names and photo attributions pass through `cleanText()` to strip control, zero-width, and bidi override characters, and API keys are scrubbed from error messages.

## Environment Variables

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | Yes | none | Google Cloud API key for Places (New), Routes, and Geocoding |
| `PLACES_HOME` | Optional | `53.3813,-6.5918` | Default `"lat,lng"` for search bias and `"home"` in routes |
| `PLACES_REGION` | Optional | `ie` | CLDR region code for search bias |
| `PLACES_LANGUAGE` | Optional | `en` | BCP-47 language code for returned names and addresses |
| `PLACES_TIMEZONE` | Optional | `Europe/Dublin` | IANA timezone for local `departAt` / `arriveBy` timestamps |
| `GOOGLE_PLACES_CONFIG` | Optional | `$(brew --prefix)/etc/google-places-mcp/config.json` | Override path to optional JSON defaults file |
| `BUGSINK_DSN` | Optional | unset (disabled) | Error reporting DSN; unset or `""` disables reporting |

## Development

See [docs/development.md](docs/development.md) for local builds, testing, and releases.
