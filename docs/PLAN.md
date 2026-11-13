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
    | 'timeout'
    | 'rate-limited'
    | 'auth'
    | 'not-found'
    | 'provider-down'
    | 'bad-response';
  source: 'geodb' | ProviderId | 'push';
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

- `GET wft-geo-db.p.rapidapi.com/v1/geo/cities?namePrefix&limit=6&sort=-population&types=CITY` with `X-RapidAPI-Key` and `X-RapidAPI-Host`.
- Free plan: 1,000 requests/day as a hard limit and at most 10 results per call (confirmed on the RapidAPI listing). The 1 request/second rate is reported by third parties only; it gets confirmed from the rate-limit response headers once the key exists. This is the tightest limit in the app.
- Request policy: minimum 2 characters; 150 ms debounce; abort the in-flight request on new input; cache results per normalized prefix for the session; when a cached prefix returned fewer than `limit` rows, filter locally for longer prefixes instead of calling again; hold a 1 s spacing between network calls with the latest query winning.
- Failures: 429 (very likely during fast typing), 401/403 (key or subscription), timeout, empty `data`.
- On 429, 5xx or timeout, fall back to Open-Meteo Geocoding (`geocoding-api.open-meteo.com/v1/search?name&count=6`) mapped to the same `City` type. An empty result is a no-results state, not a fallback trigger.

### Fallback decision (`api/weather/fallback.ts`)

| OWM outcome                                     | Action                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 200 and schema valid                            | Use it                                                                                      |
| 429                                             | Open-Meteo now; open a 10 min circuit (session-scoped) so OWM is skipped, then retried once |
| 401                                             | Open-Meteo; log a console warning for the developer; no user-facing error                   |
| 5xx, timeout, schema mismatch                   | Open-Meteo for this request; circuit opens after 2 consecutive failures                     |
| Network error while `navigator.onLine` is false | No fallback. Serve the cached snapshot if it is for this city, else an offline error        |
| Network error while online                      | Try Open-Meteo once (OWM may be blocked on this network)                                    |
| Both providers fail                             | Typed error with retry; cached snapshot shown underneath if available, with its age         |

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

**R5. Key activation.** New OpenWeatherMap keys can take a while to activate. The project key is already live (checked 14 Nov). The RapidAPI key still needs its GeoDB Cities subscription; until then the Open-Meteo geocoding fallback keeps search working.

**R6. Where the offline weather lives.** The brief places the last city's weather in the service worker's cache. Plan: the SW precaches the shell; the app writes the normalized snapshot to Cache Storage after each successful fetch. Caching raw provider responses in the SW instead would key entries by URLs containing the API key and could serve an older OWM response over a newer Open-Meteo one. Same storage, same DevTools evidence, one source of truth.

**R7. `navigator.onLine` lies.** It reports true on captive portals and dead Wi-Fi. The banner is driven by online/offline events and by real fetch failures. Search is disabled offline with a reason.

**R8. Blur validation on an untouched field.** Read literally, tabbing past the empty search shows an error. Plan: the empty-field error appears on blur only after the user has typed or submitted. Blur is also suppressed while a suggestion is being clicked.

**R9. Tooling disclosure.** The work is done with Claude Code running inside the Cursor IDE. `PROMPTS.md` says exactly that and logs every prompt verbatim with a short outcome note. Secrets pasted into a prompt are redacted there and nowhere else is altered.

**R10. Time.** 4–6 hours stated. Cut order if short: animated icons, geocoding fallback, live temperatures in the favourites panel, theme toggle. Never cut: error states, offline, responsive checks, README.

**R11. Confidentiality.** The brief files are gitignored. This plan is committed and uses our own wording throughout, with no passages copied from the brief.

## 6. Decisions

| #   | Decision                                                                                                                                                                           | Reason                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Push uses a minimal server: two Vercel functions, Upstash Redis, one 5-minute QStash trigger                                                                                       | The only way a reminder arrives with the app closed; per-user QStash schedules hit a 10-schedule cap |
| 2   | Server hardening: validated bodies, signed trigger, dead subscriptions deleted, nothing beyond the two endpoints                                                                   | A public endpoint that sends notifications must not be drivable by strangers                         |
| 3   | Keys come from `.env.local`; `.env.example` documents the names; real values never committed                                                                                       | The repo becomes public                                                                              |
| 4   | Weather and search stay client-side with keys in the bundle; a proxy is a README next step                                                                                         | Matches the client-only scope; free-tier keys limit the damage                                       |
| 5   | `PROMPTS.md` names Claude Code inside Cursor and logs prompts verbatim with outcome notes                                                                                          | Accurate disclosure; the prompt history is itself assessed                                           |
| 6   | The 300 ms budget is measured with a dev-only performance mark and the numbers published                                                                                           | A measured limitation is more credible than a claimed one                                            |
| 7   | `PLAN.md` is committed                                                                                                                                                             | It shows the reasoning behind the build                                                              |
| 8   | Repo stays private until just before submission                                                                                                                                    | Avoids exposing unfinished work                                                                      |
| 9   | Visual direction: neutral surfaces, 1px borders over shadows, one accent, Inter with tabular numerals, light default that follows the system theme                                 | Calm and dense; hierarchy comes from type and spacing, not decoration                                |
| 10  | Colour carries weather in one place only: a subtle sky tint on the current-conditions card, varying by condition and day or night; the current temperature is the dominant element | One expressive moment reads as intent; colour everywhere reads as a template                         |
| 11  | All three bonuses are in scope; icon animation is subtle and off under reduced motion                                                                                              | Units and theme are nearly free with this design, and the icon set is ours anyway                    |
| 12  | Cut order in R10 stands                                                                                                                                                            | Protects error states, offline and responsive behaviour if time runs short                           |
| 13  | ESLint pinned to v9                                                                                                                                                                | The accessibility lint plugin does not support v10 yet                                               |

Still open: the RapidAPI key exists but is not yet subscribed to GeoDB Cities (repeated live calls with the correct host returned 403 on 14 Nov, which points to a key from a different RapidAPI app than the subscribed one), so the per-second rate is still unconfirmed; and the Upstash account plus VAPID keys are needed before the reminder sender can be deployed.
