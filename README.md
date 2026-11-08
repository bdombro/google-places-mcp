# google-places

Google Maps for AI agents over MCP (and a CLI): find places, look up details, get travel times and distances, convert addresses. Built on the Google Places API (New), Routes API and Geocoding API.

It is deliberately limited to Google's cheaper tiers. See [What's not included](#whats-not-included).

## Tools

| Tool | Does | Google API |
| --- | --- | --- |
| `search` | Text search ("paediatric dentist Maynooth"), biased to a point; optional category, ranking by distance | Places (Pro) |
| `nearby` | Places of given categories within a radius of a point, ranked by popularity or distance | Places (Pro) |
| `resolve` | A name or address to candidate places with IDs, canonical addresses and coordinates | Places (Pro) |
| `details` | One place by ID or name: address, types, status, Maps link, time zone, accessibility, photo references | Places (Pro) |
| `photo` | The short-lived image URL for a photo reference from `details` | Places (free) |
| `route` | Travel time and distance A to B by car, walking, bike, transit or two-wheeler; optional departure time, avoid tolls, alternatives, steps | Routes |
| `matrix` | Times and distances for every pair of up to 25 origins and 25 destinations | Routes |
| `geocode` | Address to coordinates, or `lat,lng` to address | Geocoding |
| `status` | Settings in effect; `--probe` checks which APIs the key can reach | all |

Points in `route` and `matrix` can be addresses, place names, place IDs, `lat,lng` or `home`. Searches default to the home area.

```bash
google-places search "pharmacy" --near "Maynooth Educate Together" --rank distance
google-places nearby --types playground,park --radius 2000
google-places details "Supervalu Maynooth" --photos 2
google-places route home "Dublin Airport" --departAt 07:30 --avoid tolls
google-places matrix --origins "home|Maynooth Library" --destinations "Heuston Station|Connolly Station" --mode transit
google-places geocode "53.3813,-6.5918"
google-places status --probe
```

Add `--json` for JSON on the CLI; MCP always returns JSON.

## What's not included

Google bills Places requests by the **fields** asked for, in tiers. Text search and nearby search start at the **Pro** tier (anything beyond IDs), and the fields people usually want next are **Enterprise**. To keep costs low and predictable, this plugin only requests Pro-tier fields and below, and does not offer:

| Not available | Google tier |
| --- | --- |
| Ratings and rating counts, price level | Enterprise |
| Opening hours and "open now" (and filters for them) | Enterprise |
| Phone numbers and websites | Enterprise |
| Reviews, editorial summaries, "good for kids" / dine-in / takeout style attributes | Enterprise + Atmosphere |
| Minimum-rating, open-now and price-level search filters | tied to the above |

What you do get is name, address, coordinates, category, business status, Maps link, time zone, accessibility features and photo references.

Field lists are in [src/google/places.ts](src/google/places.ts) (`LIST_FIELDS`, `DETAIL_FIELDS`), and tests assert that no Enterprise field creeps into a request. To add a feature back, add its field to the list, return it in the output schema and update this section. Prices and tier boundaries change: check Google's [pricing](https://developers.google.com/maps/billing-and-pricing/pricing) and [data fields](https://developers.google.com/maps/documentation/places/web-service/data-fields) pages.

Routes: the default driving estimate is static. `departAt` or `traffic` switches on traffic-aware routing, which Google prices in a higher Routes tier.

Other limits:
- **`photo` returns a URL, not an image.** The argsbarg version this plugin uses cannot return native MCP image blocks. The URL expires after a while.
- **Names are untrusted text.** Businesses and the public write names and photo credits, so every result carries a notice and the MCP instructions say to treat it as data, never instructions. Text is stripped of control and zero-width characters.

## Setup

1. **Enable the APIs.** The key must belong to a Google Cloud project with billing enabled and these APIs on:
   - [Places API (New)](https://console.cloud.google.com/apis/library/places.googleapis.com) (needed by `search`, `nearby`, `resolve`, `details`, `photo`)
   - [Routes API](https://console.cloud.google.com/apis/library/routes.googleapis.com) (needed by `route`, `matrix`)
   - [Geocoding API](https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com) (needed by `geocode`)

   Open each page with the right project selected and click **Enable**, or run `gcloud services enable places.googleapis.com routes.googleapis.com geocoding-backend.googleapis.com --project=<project-id>`. A disabled API fails with "not enabled for this API key's Google Cloud project" and the exact activation link. It can take a few minutes to take effect.
2. **Set the key** in your login shell: `GOOGLE_PLACES_API_KEY` (`GOOGLE_PLACE_API_KEY` also works).
3. **Restrict the key** (Credentials, API restrictions) to those three APIs, and cap daily usage under each API's Quotas page, so a looping agent can't run up a bill.
4. **Check it:** `google-places status --probe` calls each API once (the Places probe is an IDs-only request, which Google doesn't bill).

### Settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | none (`GOOGLE_PLACE_API_KEY` also read) | API key |
| `PLACES_HOME` | `53.3813,-6.5918` (Maynooth centre) | `lat,lng` that biases searches and means `home` in routes. Set it to the house in your shell, not in the repo |
| `PLACES_REGION` | `ie` | Region bias for results |
| `PLACES_LANGUAGE` | `en` | Language of names and addresses |
| `PLACES_TIMEZONE` | `Europe/Dublin` | Zone for local `departAt` / `arriveBy` times |

## Install

Requires Node 20 or later on PATH; the bundle `dist/google-places.mjs` is committed, so there is no install step.

- **Claude Code plugin:** `just plugin-claude-install`, then restart Claude Code.
- **Cursor:** `just plugin-cursor-upsert`.
- **Any MCP client:** run `node dist/google-places.mjs mcp` (see the workspace `.mcp.json`).

Errors go to this plugin's Bugsink project (bugsink.btek.cc); set `BUGSINK_DSN=""` to disable.

## Development

```bash
just setup    # npm install
just test     # Biome + tsc + node --test (no network)
just build    # rebuild the committed bundle
just run status --probe
```

Tests mock the HTTP transport (`ctx.locals.http`), so they never call Google. Manual checks with a real key should stay read-only (`geocode`, `status --probe`). Commit `dist/google-places.mjs` whenever the source changes. Releases: `just release <major|minor|patch>`.
