# WeatherBoard — Implementation Plan

Status: approved, decisions recorded in §6. No code written yet. Deadline: Sat 14 Nov 2026, 11:00 PKT.
Limits and endpoints in §4 were checked against the providers' current pricing and docs pages on 14 Nov 2026, and the two OpenWeatherMap calls and both Open-Meteo calls were exercised live. Anything still unconfirmed is marked.

## 1. Requirement traceability

| Req                | What satisfies it                                                                                                                                  | Modules                                                                      | Tests                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 Autocomplete    | ARIA combobox, 150 ms debounce, stale-request abort, prefix cache, visible loading / no-results / error rows                                       | `features/search/CitySearch`, `useCitySuggestions`, `api/geodb`              | Unit: debounce, cache, abort, error mapping. Component: keyboard nav, each state row                                                              |
| 02 Weather display | Current card (temp, feels-like, humidity, wind, icon) and 5-day strip from a normalized snapshot; skeletons; typed errors with retry               | `features/weather/*`, `api/weather/*`, `domain/weather`                      | Unit: both mappers against recorded real responses, daily aggregation across timezones. Component: loading, error, success                        |
| 03 Validation      | Pure validators run on blur and submit; inline messages tied with `aria-describedby`; every failure maps to "what failed + what to do"             | `domain/validation`, `domain/errors`, `ui/FieldError`                        | Unit: validator table, error-message table (no generic copy). Component: blur vs submit                                                           |
| 04 Favourites      | Max 5, star toggle, quick-access panel, confirm dialog on remove, in-memory fallback with notice when storage is blocked                           | `features/favourites/*`, `lib/safeStorage`, `ui/ConfirmDialog`               | Unit: cap, dedupe, corrupt JSON, storage throwing. Component: confirm / cancel, sixth-city message                                                |
| 05 PWA             | Manifest (name, 192/512 + maskable icons, theme_color, standalone); service worker precaches shell; last snapshot in Cache Storage; offline banner | `sw.ts`, `lib/offlineStore`, `features/offline/OfflineBanner`, `vite.config` | Unit: offlineStore round trip. E2E: load, go offline, reload, last city + banner shown. Lighthouse installability                                 |
| 06 Push            | Pre-permission explainer, time picker, subscribe, SW `push` + `notificationclick` handlers, unsupported / denied / iOS-not-installed states        | `features/reminders/*`, `sw.ts`, `api/push/*` (see §4, §5 R1)                | Unit: capability detection, permission state machine, due-slot and once-per-day logic, body validation. E2E: denied permission leaves app working |
| 07 Responsive      | Mobile-first grid, fluid type, 44 px minimum hit areas, no fixed widths                                                                            | `styles/tokens.css`, layout components                                       | E2E at 375 / 768 / 1280: `scrollWidth <= clientWidth`, bounding boxes of interactive elements ≥ 44 px on mobile                                   |
| B1 Theme           | `prefers-color-scheme` default, manual override persisted, no flash on load                                                                        | `features/prefs/theme`, inline head script                                   | Unit: resolution order                                                                                                                            |
| B2 Units           | Always fetch metric, convert at render, so the toggle never refetches                                                                              | `domain/units`, `features/prefs/units`                                       | Unit: conversions and rounding                                                                                                                    |
| B3 Animated icons  | Own SVG icon set with CSS animation, off under `prefers-reduced-motion`                                                                            | `ui/WeatherIcon`                                                             | Visual check; one icon per `ConditionKind` asserted                                                                                               |
| Submission         | `README.md`, `PROMPTS.md`, public repo, live URL                                                                                                   | repo root                                                                    | CI: typecheck, lint, test, build                                                                                                                  |

## 2. Stack

| Choice                                                              | Why                                                                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Vite + React 19 + TypeScript (strict)                               | Client-only SPA; no SSR needs, so Next.js would be weight without benefit                                  |
| Tailwind CSS v4 with CSS-variable tokens                            | Fast to build, and theming is a token swap rather than duplicated classes                                  |
| TanStack Query v5                                                   | Dedupe, stale times, retries and cancellation for free; these are the bugs hand-rolled fetching gets wrong |
| Zod at the API boundary                                             | Third-party JSON is parsed once, so a provider change fails loudly in one place                            |
| vite-plugin-pwa, `injectManifest` mode                              | Workbox precaching plus a hand-written SW, which push handlers require                                     |
| Radix Dialog; hand-written combobox                                 | Focus trap and escape handling are solved; the combobox is the product's main control and worth owning     |
| Small `useSyncExternalStore` stores                                 | Favourites and prefs are tiny and need cross-tab sync; a state library is not justified                    |
| Vitest + Testing Library + MSW                                      | MSW exists only in tests, so the shipped bundle contains no mock data                                      |
| Playwright                                                          | The only reliable way to assert viewport, offline and permission behaviour                                 |
| Vercel + GitHub Actions                                             | Free HTTPS (required for SW and push) and preview URLs; CI gates merges                                    |
| Vercel Functions + `web-push` + Upstash Redis + one QStash schedule | Smallest server that can deliver a push at a chosen time; one vendor, signed trigger requests              |
| Inter (variable, self-hosted)                                       | Works offline, no third-party font request; tabular numerals for every figure                              |

Not using: a UI kit (generic output is what the brief warns about), a router (one view; selected city lives in `?city=`), Redux.

## 3. Structure and domain types

```
src/
  domain/          pure, no React, no fetch
    weather.ts     types below
    conditions.ts  OWM id and WMO code -> ConditionKind
    forecast.ts    3-hourly slots -> local-day DailyForecast
    units.ts  validation.ts  errors.ts
  api/
    http.ts        fetch wrapper: timeout, abort, AppError mapping
    geodb.ts  openMeteoGeocoding.ts
    weather/       openWeatherMap.ts  openMeteo.ts  fallback.ts  schemas.ts
  features/
    search/  weather/  favourites/  reminders/  offline/  prefs/
  ui/              Button, Card, Skeleton, FieldError, ConfirmDialog, WeatherIcon
  lib/             safeStorage.ts  offlineStore.ts  capabilities.ts
  styles/tokens.css
  sw.ts  App.tsx  main.tsx
api/push/          subscribe.ts  send.ts  _lib/ (schemas, redis, due-slot logic)
tests/fixtures/    recorded provider responses
e2e/
.env.example       documented variable names, no values
```

```ts
type Coordinates = { lat: number; lon: number };

type City = {
  id: string; // "geodb:1234", stable key for favourites and cache
  name: string;
  region?: string;
  country: string;
  countryCode: string;
  coords: Coordinates; // weather is always fetched by coords, never by name
};

type ConditionKind =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'freezing-rain'
  | 'snow'
  | 'thunderstorm'
  | 'unknown';
type Condition = { kind: ConditionKind; isDay: boolean }; // label and icon derive from this

type CurrentWeather = {
  observedAt: number; // epoch ms
  temperatureC: number;
  feelsLikeC: number;
  humidityPct: number;
  windSpeedMs: number;
  windDirectionDeg?: number;
  condition: Condition;
};

type DailyForecast = {
  date: string; // YYYY-MM-DD in the city's local time
  minC: number;
  maxC: number;
  condition: Condition;
  precipitationChancePct?: number;
  partial: boolean; // true when built from an incomplete day of slots
};

type ProviderId = 'openweathermap' | 'open-meteo';

type WeatherSnapshot = {
  city: City;
  current: CurrentWeather;
  daily: DailyForecast[]; // exactly 5, today first
  utcOffsetSeconds: number;
  provider: ProviderId;
  fetchedAt: number;
};

interface WeatherProvider {
  id: ProviderId;
  fetch(coords: Coordinates, signal: AbortSignal): Promise<Omit<WeatherSnapshot, 'city'>>;
}

type AppError = {
  kind:
    | 'offline'
    | 'network' // online, but the request never arrived
    | 'timeout'
    | 'rate-limited'
    | 'auth'
    | 'not-found'
    | 'provider-down'
    | 'bad-response';
  source: 'weather' | ProviderId | 'geodb' | 'push'; // 'weather': every provider failed
  retryAfterMs?: number;
};
```

SI units everywhere in the model; display units are a view concern. Components never see a provider's field names.

## 4. API integration

### OpenWeatherMap (primary weather)

- `GET api.openweathermap.org/data/2.5/weather?lat&lon&units=metric&appid` for current.
- `GET api.openweathermap.org/data/2.5/forecast?lat&lon&units=metric&appid` for 40 slots at 3 h steps.
- Free plan (confirmed): 60 calls/min, 1,000,000/month, covering current weather, the 5-day / 3-hour forecast and geocoding. One Call is a separate pay-per-call product and is not used.
- Live check with the project key: both endpoints return 200; the forecast returns 40 slots and a `city.timezone` offset.
- No daily endpoint on the free plan. `forecast.ts` groups slots by the city's local date (`city.timezone` offset), takes min/max, and picks the condition from the midday slots. Today is built from the remaining slots plus the current reading and flagged `partial`.
- Failures: 401 (bad key, or a new key that has not activated yet), 429, 5xx, timeout at 8 s, malformed body.
- Budget: `staleTime` 10 min (the provider refreshes no faster), query dedupe, no refetch on focus inside that window.

### Open-Meteo (fallback weather)

- `GET api.open-meteo.com/v1/forecast?latitude&longitude&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5&wind_speed_unit=ms`
- No key. Free tier (confirmed): 600 calls/min, 5,000/hour, 10,000/day, 300,000/month, non-commercial use only. Real daily aggregates, so no slot maths.
- Data is CC BY 4.0, so attribution is required: a credit line in the footer and the README.
- Failures: 400 with a `reason` string, 429, 5xx, timeout.

### GeoDB Cities via RapidAPI (autocomplete)

- `GET wft-geo-db.p.rapidapi.com/v1/geo/cities?namePrefix&limit=10&sort=-population&languageCode=en` with `X-RapidAPI-Key` and `X-RapidAPI-Host`. No type filter; results are cleaned client-side and at most 6 are shown (see Decisions 29 and 30).
- Free plan, confirmed live on 14 Nov: 1,000 requests/day (`x-ratelimit-requests-limit`, rolling 24 h reset) and 1 request/second. The per-second rate is not published in any header; it was observed directly, with two of three simultaneous requests answered 429 naming the per-second limit. Rejected requests do not count against the daily quota. At most 10 results per call. This is the tightest limit in the app.
- Measured response time from Pakistan: about 600 ms per call, so a network result cannot land inside 300 ms on its own.
- Data quirk found while recording fixtures: with `types=CITY`, Lahore is missing entirely, because GeoDB holds it as an `ADM2` record (Karachi and London are `CITY`). Results also contain near-duplicates. The filter in the endpoint above therefore cannot stay as written; the handling is settled in the search task.
- Request policy: minimum 2 characters; 150 ms debounce; abort the in-flight request on new input; cache results per normalized prefix for the session; when a cached prefix returned fewer than `limit` rows, filter locally for longer prefixes instead of calling again; hold a 1 s spacing between network calls with the latest query winning.
- Failures: 429 (very likely during fast typing), 401/403 (key or subscription), timeout, empty `data`.
- On 429, 5xx or timeout, fall back to Open-Meteo Geocoding (`geocoding-api.open-meteo.com/v1/search?name&count=6`) mapped to the same `City` type. An empty result is a no-results state, not a fallback trigger.

### Fallback decision (`api/weather/fallback.ts`)

| OWM outcome                                     | Action                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 200 and schema valid                            | Use it                                                                                                               |
| 429                                             | Open-Meteo now; open a 10 min circuit (session-scoped) so OWM is skipped, then retried once                          |
| 401                                             | Open-Meteo; log a console warning for the developer; no user-facing error; circuit opens for the rest of the session |
| 5xx, timeout, schema mismatch                   | Open-Meteo for this request; circuit opens after 2 consecutive failures                                              |
| Network error while `navigator.onLine` is false | No fallback. Serve the cached snapshot if it is for this city, else an offline error                                 |
| Network error while online                      | Try Open-Meteo once (OWM may be blocked on this network)                                                             |
| Both providers fail                             | Typed error with retry; cached snapshot shown underneath if available, with its age                                  |

The policy is a pure function of (outcome, circuit state), so it is tested as a table. The card shows the data source and fetch time, which makes a fallback visible rather than silent.

### Reminder sender (the only server code)

- `POST /api/push/subscribe`: Zod-validated body (push subscription, `HH:MM` in 5-minute steps, IANA timezone, city name and coords). Stored in Upstash Redis under a hash of the endpoint and indexed by timezone and slot. The same call updates; `DELETE` removes. Body size and total subscription count are capped.
- `POST /api/push/send`: triggered every 5 minutes by a single QStash schedule. Rejects any request whose QStash signature does not verify. For each timezone in use it works out the current local slot, loads the due subscriptions, skips any already sent on that local date, fetches Open-Meteo for the city, and sends with `web-push`. A 404 or 410 from the push service deletes the subscription.
- Local time is computed at each run from the IANA zone, so daylight-saving changes need no handling.
- Budget (confirmed limits): 288 QStash messages/day of 1,000 with retries off; Redis usage is a few commands per run against 500,000/month.
- Weather and search calls never go through this server.

## 5. Risks and non-obvious constraints

**R1. A reminder that arrives with the app closed cannot come from a client-only app.** A closed tab is woken only by a push message, and a push message needs a server holding VAPID keys and something that fires at the chosen time. Client-only alternatives do not work: service worker timers die within about 30 s of idle; Notification Triggers was abandoned by Chrome; Periodic Background Sync is Chromium-only, needs an installed PWA, and the browser picks the time. Decision: build the small sender in §4 and say openly in the README that it departs from the client-only scope for this one feature.

- Why not one QStash schedule per user (the first idea): it would need no database, and QStash does support IANA zones (`CRON_TZ=` prefix), overwriting by schedule id, and `DELETE /v2/schedules/{id}`. But the free tier allows only 10 active schedules, so the eleventh subscriber would fail. Rejected.
- Chosen: Redis for subscriptions plus one 5-minute trigger. The trigger is a single QStash schedule rather than a second cron vendor, because it uses 1 of the 10 schedules, stays inside the daily message allowance, and signs its requests. Swapping in another cron with a shared secret is a one-file change.
- Consequence: reminder times are offered in 5-minute steps, and delivery lands within the 5 minutes after the chosen time.

**R2. iOS.** Web Push works only for a PWA added to the Home Screen (iOS 16.4+). The reminders panel detects this and shows install steps instead of a dead button.

**R3. The 300 ms suggestion budget is not guaranteed by any design.** GeoDB responses often take longer than that on their own, and its rate limit fights a short debounce. What is deliverable: visible feedback (loading row) at 150 ms, cached and locally filtered results inside the budget, network results as fast as GeoDB allows. This is measured, not asserted: a dev-only performance mark runs from the last keystroke to the painted suggestion list, and real cached and network timings go in the README.

**R4. API keys ship in the bundle.** Client-only means the OWM and RapidAPI keys are readable by anyone. Neither provider supports referrer restriction. Mitigation: free-tier keys only, read from `.env.local`, never committed, rotated after the review, limitation documented. A proxy is listed as a next step in the README.

**R5. Key activation.** New OpenWeatherMap keys can take a while to activate. The project key is already live (checked 14 Nov). The GeoDB subscription is active as well (200 on 14 Nov).

**R6. Where the offline weather lives.** The brief places the last city's weather in the service worker's cache. Plan: the SW precaches the shell; the app writes the normalized snapshot to Cache Storage after each successful fetch. Caching raw provider responses in the SW instead would key entries by URLs containing the API key and could serve an older OWM response over a newer Open-Meteo one. Same storage, same DevTools evidence, one source of truth.

**R7. `navigator.onLine` lies.** It reports true on captive portals and dead Wi-Fi. The banner is driven by online/offline events and by real fetch failures. Search is disabled offline with a reason.

**R8. Blur validation on an untouched field.** Read literally, tabbing past the empty search shows an error. Plan: the empty-field error appears on blur only after the user has typed or submitted. Blur is also suppressed while a suggestion is being clicked.

**R9. Tooling disclosure.** The work is done with Claude Code running inside the Cursor IDE. `PROMPTS.md` says exactly that and logs every prompt verbatim with a short outcome note. Secrets pasted into a prompt are redacted there and nowhere else is altered.

**R10. Time.** 4–6 hours stated. Cut order if short: animated icons, geocoding fallback, live temperatures in the favourites panel, theme toggle. Never cut: error states, offline, responsive checks, README.

**R11. Confidentiality.** The brief files are gitignored. This plan is committed and uses our own wording throughout, with no passages copied from the brief.

## 6. Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                        | Reason                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Push uses a minimal server: two Vercel functions, Upstash Redis, one 5-minute QStash trigger                                                                                                                                                                                                                                                                    | The only way a reminder arrives with the app closed; per-user QStash schedules hit a 10-schedule cap                                                                                      |
| 2   | Server hardening: validated bodies, signed trigger, dead subscriptions deleted, nothing beyond the two endpoints                                                                                                                                                                                                                                                | A public endpoint that sends notifications must not be drivable by strangers                                                                                                              |
| 3   | Keys come from `.env.local`; `.env.example` documents the names; real values never committed                                                                                                                                                                                                                                                                    | The repo becomes public                                                                                                                                                                   |
| 4   | Weather and search stay client-side with keys in the bundle; a proxy is a README next step                                                                                                                                                                                                                                                                      | Matches the client-only scope; free-tier keys limit the damage                                                                                                                            |
| 5   | `PROMPTS.md` names Claude Code inside Cursor and logs prompts verbatim with outcome notes                                                                                                                                                                                                                                                                       | Accurate disclosure; the prompt history is itself assessed                                                                                                                                |
| 6   | The 300 ms budget is measured with a dev-only performance mark and the numbers published                                                                                                                                                                                                                                                                        | A measured limitation is more credible than a claimed one                                                                                                                                 |
| 7   | `PLAN.md` is committed                                                                                                                                                                                                                                                                                                                                          | It shows the reasoning behind the build                                                                                                                                                   |
| 8   | Repo stays private until just before submission                                                                                                                                                                                                                                                                                                                 | Avoids exposing unfinished work                                                                                                                                                           |
| 9   | Visual direction: neutral surfaces, 1px borders over shadows, one accent, Inter with tabular numerals, light default that follows the system theme                                                                                                                                                                                                              | Calm and dense; hierarchy comes from type and spacing, not decoration                                                                                                                     |
| 10  | Colour carries weather in one place only: a subtle sky tint on the current-conditions card, varying by condition and day or night; the current temperature is the dominant element                                                                                                                                                                              | One expressive moment reads as intent; colour everywhere reads as a template                                                                                                              |
| 11  | All three bonuses are in scope; icon animation is subtle and off under reduced motion                                                                                                                                                                                                                                                                           | Units and theme are nearly free with this design, and the icon set is ours anyway                                                                                                         |
| 12  | Cut order in R10 stands                                                                                                                                                                                                                                                                                                                                         | Protects error states, offline and responsive behaviour if time runs short                                                                                                                |
| 13  | ESLint pinned to v9                                                                                                                                                                                                                                                                                                                                             | The accessibility lint plugin does not support v10 yet                                                                                                                                    |
| 14  | GeoDB limits treated as 1 request/second and 1,000/day                                                                                                                                                                                                                                                                                                          | Both confirmed against the live API, the first by observation and the second from response headers                                                                                        |
| 15  | Themes are scoped to a `data-theme` attribute set by an inline head script, not to a media query                                                                                                                                                                                                                                                                | No flash of the wrong theme on load, one place to override, and any subtree can show either theme (the preview page relies on it)                                                         |
| 16  | Colour tokens are plain hex, and Tailwind's default palette, type scale, radii and shadows are removed                                                                                                                                                                                                                                                          | Hex lets a unit test compute contrast; removing defaults means only our tokens can be used                                                                                                |
| 17  | Contrast is enforced by `tokens.test.ts`, not checked once by hand                                                                                                                                                                                                                                                                                              | A later palette tweak cannot silently break AA                                                                                                                                            |
| 18  | Controls are 44px by default and 36px only at 768px and wider with a precise pointer                                                                                                                                                                                                                                                                            | A narrow window measured with a mouse must still pass; end-to-end tests cover 375px with touch and with a mouse                                                                           |
| 19  | A dev-only `?preview=ui` page shows every token, primitive and state in both themes                                                                                                                                                                                                                                                                             | One place to review the system; an end-to-end test proves it is absent from production builds                                                                                             |
| 20  | Sky tints have distinct character per condition, and a night card always renders in the dark scope                                                                                                                                                                                                                                                              | A deep navy night needs light text, which a light theme cannot give; scoping the card to dark reuses the tested dark tokens instead of adding a second set of text colours                |
| 21  | End-to-end tests run in CI with the browser binary cached by Playwright version                                                                                                                                                                                                                                                                                 | Layout, touch-target and theme guarantees are checked on every push, not only locally                                                                                                     |
| 22  | The error taxonomy gained a `network` kind (online, but the request never arrived) and a `weather` source (every provider failed)                                                                                                                                                                                                                               | The fallback table already distinguished offline from blocked; the user is told about weather as a whole, not about one provider                                                          |
| 23  | A day is labelled by its most severe meaningful precipitation between 06:00 and 18:00 local (thunderstorm, snow, freezing rain, rain, drizzle; meaningful means the chance is 50% or more, or at least 0.5 mm falls in the 3-hour reading); otherwise by the reading nearest noon. Today applies the same rule to the readings left and counts rain falling now | The label should answer what to plan for: an overcast noon before an afternoon of rain is a rainy day                                                                                     |
| 24  | Open-Meteo is requested with `timeformat=unixtime`                                                                                                                                                                                                                                                                                                              | Times arrive as instants, so no local-time string parsing; the local date comes from the offset                                                                                           |
| 25  | A 404 from OpenWeatherMap counts as a provider failure and falls back                                                                                                                                                                                                                                                                                           | Weather is requested by coordinates, so a 404 says something about the provider, not about the user's input                                                                               |
| 26  | The weather query retries once, and only for network, timeout and server errors                                                                                                                                                                                                                                                                                 | The fallback has already tried a second provider; a rejected key, unreadable data, a quota refusal or no connection will not change on an immediate retry                                 |
| 27  | OpenWeatherMap and Open-Meteo 429 bodies were not recorded                                                                                                                                                                                                                                                                                                      | It would mean deliberately exhausting a free quota; the path is covered by status code and GeoDB's real 429 body                                                                          |
| 28  | A rejected OpenWeatherMap key opens the circuit for the whole session                                                                                                                                                                                                                                                                                           | A bad key does not fix itself mid-session, so retrying only wastes a request each time                                                                                                    |
| 29  | Search asks GeoDB for the 10 largest matches with no type filter and cleans them client-side: administrative areas are named plainly ("Lahore District" becomes Lahore), one entry is kept per place, and a city beats a district, which beats a division, which beats a "Greater X" area                                                                       | GeoDB files Lahore only as two administrative areas and ranks Greater London above London; verified against recorded responses                                                            |
| 30  | Two results count as the same place when they share a name and region, or are within 25 km and one name contains the other                                                                                                                                                                                                                                      | Distance alone would merge real neighbours such as San Jose and Santa Clara                                                                                                               |
| 31  | A city's id is its country code plus coordinates rounded to two decimals, not the provider's id                                                                                                                                                                                                                                                                 | The id can be rebuilt from a shared link and is the same whichever search provider found the city                                                                                         |
| 32  | The link format is `?city=Name~Region~CC~lat~lon`                                                                                                                                                                                                                                                                                                               | Readable, and enough to fetch weather without another lookup, so a shared link works offline and costs no search quota                                                                    |
| 33  | Answers that need no request (cache, or filtering a complete earlier result) skip the 150 ms pause                                                                                                                                                                                                                                                              | The pause exists to spare the API; measured, it turns about 175 ms into under 30 ms                                                                                                       |
| 34  | The backup geocoder is used only when GeoDB is rate limited, down or times out; its results are not cached and never used for local filtering                                                                                                                                                                                                                   | An empty result is an answer; fuzzy matches would give wrong local filtering, and GeoDB should be retried next time                                                                       |
| 35  | A suggested-city chip searches for the name and selects the top match                                                                                                                                                                                                                                                                                           | One tap should lead to weather, not to a list                                                                                                                                             |
| 36  | End-to-end tests answer API requests from recorded responses and build with placeholder keys                                                                                                                                                                                                                                                                    | Deterministic, uses no quota, and works in CI where no key exists                                                                                                                         |
| 37  | Recent cities that match are shown at once, labelled, and stay in place while network results are added below                                                                                                                                                                                                                                                   | The list never jumps under the pointer, and a returning user sees their city in about 20 ms                                                                                               |
| 38  | Preconnecting to the search API on first focus is kept, although it showed no measurable gain                                                                                                                                                                                                                                                                   | Measured: first requests took 895 ms without it and 1,012 ms with it, inside normal variation; GeoDB's own response time dominates. It costs nothing, so it stays                         |
| 39  | Rain falling at the time of the reading still labels today as rain, whatever the amount                                                                                                                                                                                                                                                                         | It is an observation, not a forecast; the 0.5 mm threshold applies to forecast readings                                                                                                   |
| 40  | °C and °F sit on the conditions card beside the temperature at every width; the header button is the theme only                                                                                                                                                                                                                                                 | Nobody should have to open a menu to change units, and the number's unit is always in view. Supersedes the earlier settings menu                                                          |
| 41  | Temperatures show a bare degree sign; the unit is named in the settings menu and read out in full to screen readers                                                                                                                                                                                                                                             | The number is the dominant element and should stay uncluttered                                                                                                                            |
| 42  | Weather icons are single-colour line drawings                                                                                                                                                                                                                                                                                                                   | Colour carries weather in one place only, the sky tint                                                                                                                                    |
| 43  | The skeleton and the loaded card are one component rendering into the same elements; the tint and values fade in over the motion token                                                                                                                                                                                                                          | Nothing moves when data arrives. An end-to-end test measures the layout shift and holds it under 0.01                                                                                     |
| 44  | Forecast rows are two lines at every width, and each row is labelled from its own date against the city's current local date; days already over are dropped                                                                                                                                                                                                     | Nothing is squeezed at 375px, and a snapshot saved yesterday never presents yesterday as Today                                                                                            |
| 45  | Tests and end-to-end runs pin the locale to a metric one and never read keys from `.env.local`                                                                                                                                                                                                                                                                  | The locale default would otherwise make results depend on the machine                                                                                                                     |
| 46  | The storage wrapper treats persisted storage as the truth and keeps a value in memory only when a write failed                                                                                                                                                                                                                                                  | Found by a test: a mirrored copy could override storage that another tab had cleared                                                                                                      |
| 47  | When the reading nearest noon is itself a too-light shower, the day is labelled from that reading's cloud cover (up to 10% clear, up to 50% partly cloudy, above that cloudy)                                                                                                                                                                                   | A shower below the threshold should not label a day by any route; the bands match OpenWeatherMap's own 800 to 804 ids                                                                     |
| 48  | Known difference between providers, left as is: Open-Meteo's daily code is documented as "the most severe weather condition on a given day", with no threshold, so when the backup serves the data a day with a trace shower is labelled drizzle or rain                                                                                                        | Matching our rule would mean requesting hourly data and aggregating it ourselves; not worth it for the backup path. The header already says when the backup served the data               |
| 49  | The search field clears after a selection, stays empty when the app opens on a city, and dismisses the keyboard on touch                                                                                                                                                                                                                                        | It is a command input; the card carries the state. Selection also resets its validation, so leaving it shows no error                                                                     |
| 50  | At 375px the favourites panel sits first, above the conditions card, and shows the saved cities as tap targets, two to a row with name and temperature; "Edit" swaps in the full list with remove buttons. From 768px the full list is always shown in the side column                                                                                          | Switching city is the frequent action and costs one tap; removing is the rare one. Five long-named cities take three rows, and the temperature stays on the first 375x667 screen (tested) |
| 51  | Which form the favourites panel takes is decided by a media query in code, not by CSS                                                                                                                                                                                                                                                                           | Both forms hold interactive controls with the same names; rendering both and hiding one would duplicate them for assistive technology                                                     |
| 52  | The star is a toggle button (`aria-pressed`). Saving is immediate; un-saving asks first. At the limit it is `aria-disabled`, still focusable, with the reason shown beside it and announced on activation                                                                                                                                                       | A removal is always confirmed; a refusal is never silent                                                                                                                                  |
| 53  | Favourite rows read the same weather query as the card, but do not write the offline copy                                                                                                                                                                                                                                                                       | Choosing a favourite renders from cache at once, and five background rows must not overwrite the last viewed city's saved snapshot                                                        |
| 54  | A favourite row that cannot load shows a dash with spoken text, never an alert                                                                                                                                                                                                                                                                                  | One city's failure is not the list's problem                                                                                                                                              |
| 55  | After a removal, focus goes to the next row, else the row above, else the panel heading; a cancel returns it to the button that asked                                                                                                                                                                                                                           | The confirm dialog now remembers what opened it, because it is opened from state rather than from a trigger element                                                                       |
| 56  | The storage notice also appears when a favourites write fails, not only when storage is blocked outright                                                                                                                                                                                                                                                        | A full quota loses favourites just as surely                                                                                                                                              |
| 57  | Favourites are stored as `{ version: 1, cities }`; anything unreadable, from another version, duplicated or beyond five is dropped on read and the clean list written back                                                                                                                                                                                      | Stored data is never trusted, and never crashes the app                                                                                                                                   |
| 58  | Every dashboard grid cell has `min-w-0`                                                                                                                                                                                                                                                                                                                         | Found by an end-to-end test: a grid cell will not shrink below its longest unbreakable content, so one long city name widened the page by 47px                                            |
| 59  | The service worker caches the app shell and nothing else: HTML, JS, CSS, the Latin font files and the icons (14 files, about 650 KB). No weather or search response is cached by it                                                                                                                                                                             | The last viewed city's weather is the app's own normalized snapshot in Cache Storage (R6), which keeps one source of truth and no cache entry keyed by a URL containing an API key        |
| 60  | A new version waits for the user: "A new version of WeatherBoard is ready" with Reload and Later                                                                                                                                                                                                                                                                | Taking over mid-session could mix old and new code                                                                                                                                        |
| 61  | "Ready to use offline" and the install entry are overlays, not part of the page flow                                                                                                                                                                                                                                                                            | Both appear a moment after load; in the flow they pushed content down, which an end-to-end test caught as a layout shift of 0.011 to 0.016                                                |
| 62  | One connectivity source: the browser's online and offline events, plus request outcomes. A request that cannot get out while the browser is offline, or both weather providers being unreachable, marks the app offline; any HTTP response marks it online                                                                                                      | `navigator.onLine` reports true on dead Wi-Fi and captive portals (R7)                                                                                                                    |
| 63  | When the app is offline only because requests failed, the refresh button stays enabled, and it rechecks by itself every 30 seconds                                                                                                                                                                                                                              | The app may be wrong about being offline, so the user must be able to try                                                                                                                 |
| 64  | Offline is a mode, not an error: an info banner, the saved snapshot shown plainly with its age, no retry, and an automatic refresh with a polite announcement on reconnect                                                                                                                                                                                      | Nothing has gone wrong that the user can fix by pressing a button                                                                                                                         |
| 65  | Queries run with `networkMode: 'always'`                                                                                                                                                                                                                                                                                                                        | By default a query pauses while the browser is offline and never fails, so the app would show a skeleton for ever instead of the saved snapshot                                           |
| 66  | While a failed request is retried, the saved snapshot stays on screen                                                                                                                                                                                                                                                                                           | The query briefly reports pending during a retry; without this the card flashed back to a skeleton on reconnect                                                                           |
| 67  | A cold start offline with no remembered city opens the city stored in the snapshot itself                                                                                                                                                                                                                                                                       | Works even when local storage has been cleared                                                                                                                                            |
| 68  | Offline, a city other than the saved one gets a plain explanation naming the saved city, with a button to show it                                                                                                                                                                                                                                               | Only one city is kept; saying so is more useful than an error                                                                                                                             |
| 69  | The refresh button sits in the header beside the theme button; from 768px that is next to the status line, on a phone it is the row above it                                                                                                                                                                                                                    | Putting it on the status row on a phone would make that row 44px tall and push the temperature down                                                                                       |
| 70  | The install entry is offered through `beforeinstallprompt` on Chromium and as Add to Home Screen steps on iOS Safari; hidden when installed, unsupported or dismissed, and remembered                                                                                                                                                                           | iOS has no install event; Chrome and Firefox on iOS cannot add to the Home Screen at all                                                                                                  |
| 71  | Icons and manifest screenshots are generated by `scripts/generate-pwa-assets.mjs` from `src/assets/app-mark.svg` and from the running app with recorded weather                                                                                                                                                                                                 | Reproducible, and the maskable icon keeps the drawing inside the central 80% safe zone                                                                                                    |
| 72  | Installability is checked through the DevTools protocol (`Page.getInstallabilityErrors`, `Page.getAppManifest`), confirmed against the protocol definitions shipped with Playwright                                                                                                                                                                             | Lighthouse no longer has a PWA category                                                                                                                                                   |

Still open: how search treats GeoDB's `ADM2` records and duplicates (see §4); the Vercel to GitHub connection, which Vercel still refuses, so production is deployed from the CLI for now; and the Upstash account plus VAPID keys needed before the reminder sender can be deployed.

## 7. Design tokens: verified contrast

Ratios are WCAG 2 contrast, computed from `src/styles/tokens.css` and asserted on every test run by `src/styles/tokens.test.ts` (text needs 4.5:1, control boundaries 3:1).

| Pairing                                                                           | Light           | Dark            |
| --------------------------------------------------------------------------------- | --------------- | --------------- |
| Body text on canvas / surface                                                     | 16.3 / 17.4     | 16.4 / 15.3     |
| Muted text on canvas / surface / hover                                            | 6.3 / 6.7 / 5.9 | 7.8 / 7.3 / 6.3 |
| Subtle text on canvas / surface                                                   | 5.0 / 5.4       | 6.1 / 5.7       |
| Accent as text on canvas / surface                                                | 5.7 / 6.1       | 8.0 / 7.5       |
| Text on the accent button                                                         | 6.1             | 8.0             |
| Text on the destructive button                                                    | 6.5             | 8.7             |
| Success on surface / on its soft background                                       | 6.5 / 6.0       | 9.8 / 8.7       |
| Warning on surface / on its soft background                                       | 6.8 / 6.3       | 10.2 / 9.0      |
| Danger on surface / on its soft background                                        | 6.5 / 5.9       | 8.1 / 7.7       |
| Info on surface / on its soft background                                          | 6.4 / 5.8       | 8.7 / 8.1       |
| Muted text on a soft semantic background (lowest)                                 | 6.0             | 6.4             |
| Input boundary on surface / canvas                                                | 3.5 / 3.2       | 3.8 / 4.0       |
| Sky tints (10 day tints in light; 10 day and 10 night in dark): body text, lowest | 13.0            | 10.3            |
| Sky tints: muted text, lowest                                                     | 5.0             | 4.9             |
| Sky tints: accent, lowest                                                         | 4.6             | 5.0             |

## 8. Autocomplete latency: measured

Time from the last keystroke to the suggestions being painted, measured in Chromium against the live GeoDB API from Karachi on 14 Nov 2026 with the dev-only `wb:suggestions` performance measure. Typing was simulated at 40 ms per key.

| How the answer was produced                                    | Samples | Result                                                   |
| -------------------------------------------------------------- | ------- | -------------------------------------------------------- |
| Network (GeoDB), including the 150 ms pause                    | 11      | 671 to 1,012 ms; median 821 ms                           |
| Network, first request after preconnecting on focus            | 1       | 1,012 ms (895 ms without preconnect; no measurable gain) |
| Cache, before Decision 33 (pause still applied)                | 4       | 170 to 177 ms                                            |
| Cache, after Decision 33 (no pause)                            | 4       | 4 to 26 ms                                               |
| A matching recent city (Decision 37), shown before any request | 3       | 18 to 32 ms                                              |

The 300 ms budget is met for anything already seen in the session and for longer prefixes of a complete earlier result. The budget is also met whenever a recent city matches what is typed, which covers the common case of returning to a city. It is not met for a first network request to a new city, and cannot be: GeoDB alone takes 500 to 800 ms from here, and preconnecting did not change that. What the user gets within the budget in that case is the previous suggestions kept on screen, and a spinner once the request has run for 150 ms.

To reproduce: `npm run dev`, type in the search field, then run `performance.getEntriesByName('wb:suggestions')` in the console. Each entry's `detail.origin` is `network`, `cache` or `local-filter`.
