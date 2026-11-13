# Prompt history

**Tool:** Claude Code (Anthropic's agentic coding CLI) running inside the Cursor IDE.
**Model:** Claude Fable 5.2.

Every prompt I gave the agent is listed below in order, verbatim, with a short note on what came out of it. The only alterations are redactions of secrets pasted into a prompt, marked `[redacted]`, and local file paths shortened to project-relative ones.

---

## Prompt 1 — Planning before any code

```text
'docs/Edspire-Frontend-Technical-Challenge.pdf' 'docs/BRIEF.md'

I've attached the challenge brief: the original PDF and a text transcription of it (BRIEF.md). Treat the PDF as the source of truth and tell me if you find any gap between the two. First, copy both into the repo as docs/Edspire-Frontend-Technical-Challenge.pdf and docs/BRIEF.md, and add both paths to .gitignore (the brief is confidential).

This is a hiring challenge, graded on product polish and engineering judgment, not feature count.

Do not write any code yet. Produce docs/PLAN.md containing:
1. Requirement traceability: each brief requirement (01–07 + bonuses) mapped to the components, modules and tests that will satisfy it.
2. Proposed stack with a one-line justification per choice.
3. Folder structure and the core domain types (a normalized weather model independent of any provider).
4. API integration design for OpenWeatherMap, Open-Meteo and GeoDB: endpoints, rate limits, failure modes, and how the fallback decision is made.
5. Risks and non-obvious constraints in the brief, especially anything that cannot be met literally with a client-only app.
6. Open questions for me.

Keep it under ~250 lines. Stop after writing the file and wait for my review.
```

**Outcome:** Repo created, brief copied in and gitignored. The agent compared PDF and transcription (no substantive gap, only lost emphasis and layout) and wrote `docs/PLAN.md`. It flagged that a reminder delivered with the app closed needs a server, that the 300 ms autocomplete budget cannot be guaranteed against GeoDB's latency and rate limit, and that API keys are exposed in a client-only bundle. It ended with nine open questions.

*Between prompts 1 and 2 I sent two housekeeping messages, "paste plan.md here" and "tell me its location pls". Neither changed any file.*

## Prompt 2 — Decisions, verification, first commit

```text
Good plan. Answers and decisions, in order of your open questions:

1. Push: option A. I'll create a free Upstash account. Before committing to QStash, verify against the current Upstash docs that the free tier allows enough schedules and messages for this, that schedules can run in the user's IANA timezone, and how deleting/updating a schedule works. If any of that fails, use Upstash Redis for subscriptions plus an external cron (cron-job.org, every 5 minutes) calling a secret-protected send endpoint, with a once-per-local-day guard. Report what you verified and which path you chose. Either way: validate every request body, protect the send path with a secret, delete subscriptions that return 404/410, and keep the server to the minimum needed.

2. Keys: I'm creating both now. Read them from .env.local; add a documented .env.example. Never commit real values.

3. Tool: I'm using Claude Code inside the Cursor IDE. State exactly that in PROMPTS.md. Yes, log every prompt verbatim from the planning prompt onwards, with a 1–3 line outcome note under each.

4. Keys in the bundle: accept and document. Weather and search calls stay client-side as the brief asks; a proxy goes under "next steps" in the README.

5. 300 ms: accepted, but don't only describe it, measure it. Add a dev-only performance mark from last keystroke to rendered suggestions and record real timings (cached and network) for the README.

6. Commit PLAN.md. It shows process. Keep it to our own wording, with no copied passages from the brief.

7. Private repo until submission, made public just before I send it.

8. Visual direction: calm and confident like Mercury, tight hierarchy like Linear. Light by default but following the system theme. Inter, self-hosted so it works offline, with tabular numerals for every figure. Neutral surfaces, 1px borders over heavy shadows, one accent. The only place colour carries weather is a subtle sky tint on the current-conditions card that shifts with condition and day/night. The current temperature is the sine dominant element. Details come in the design prompt.

9. Bonuses: all three. Since we're drawing our own SVG icon set anyway, CSS animation is cheap; keep it subtle and off under prefers-reduced-motion. Cut order in R10 stands.

Two more changes:
- Before writing any API code, re-check the free-tier limits and endpoints you quoted from memory (OWM, Open-Meteo, GeoDB) and correct the plan where they differ.
- Add a short "Decisions" section to PLAN.md recording the answers above with a one-line reason each, so the README can draw on it later.

Then create PROMPTS.md with prompts 1 and 2 verbatim, and make the first commit: docs only (PLAN.md, PROMPTS.md, .gitignore). Conventional Commits format. Stop after that.

openweather api key: [redacted]
```

**Outcome:** The agent checked the live pricing and docs pages. QStash supports IANA timezones and schedule update/delete, but its free tier caps active schedules at 10, so one schedule per user was rejected in favour of Redis plus a single 5-minute trigger. OpenWeatherMap and Open-Meteo limits were confirmed and exercised live; GeoDB's daily cap was confirmed and its per-second rate left marked as unconfirmed. `PLAN.md` gained a Decisions section, the key went into the gitignored `.env.local`, and the docs were committed.

## Prompt 3 — Standing rules, scaffold, CI, deploy config

```text
Accepted: Redis for subscriptions plus a single signed QStash trigger every 5 minutes, and 5-minute reminder steps. Yes, trim local paths in PROMPTS.md to project-relative ones. GeoDB key is now in .env.local as VITE_RAPIDAPI_KEY (don't log it in PROMPTS.md either).

Now the standing rules and the scaffold.

1. Create CLAUDE.md at the repo root as the standing rules for every session:
- Read docs/PLAN.md before any task and keep its Decisions section current when something changes.
- TypeScript strict, no `any`, no non-null assertions without a comment explaining why.
- Domain stays pure (no React, no fetch). Components are presentational where possible; data fetching lives in feature hooks.
- Every async UI has loading, empty, error and success states. Error copy follows the AppError taxonomy: what failed and what the user can do. Never generic.
- Accessibility is required: semantic HTML, labelled controls, visible focus, full keyboard support, prefers-reduced-motion respected, 44x44 touch targets.
- Use real recorded API responses for fixtures; never invent response fields.
- Before finishing any task run `npm run check` and resolve failures before committing.
- Conventional Commits, small and atomic, imperative mood, with a scope (e.g. feat(search): ...). Never commit secrets.
- After each task: append my prompt verbatim to PROMPTS.md under the next number (secrets redacted), add a 1–3 line Outcome note, then commit.
- If a request conflicts with the brief or the plan, stop and say so instead of guessing.

2. Scaffold per PLAN.md: Vite + React 19 + TS strict, Tailwind v4 with the token file in place (values come in the next prompt), ESLint + Prettier, Vitest + Testing Library + MSW, Playwright installed but no tests yet, path aliases, and .env.example documenting every variable including the future push ones. npm scripts: dev, build, preview, typecheck, lint, test, test:e2e, check.

3. GitHub Actions CI on push and PR: install, typecheck, lint, test, build.

4. Deploy readiness: vercel.json with anPA fallback that will not swallow /api or the service worker files. Render a minimal placeholder page so the first deploy proves the pipeline. Then tell me exactly which commands to run to add the GitHub remote and push, and which env vars to set in Vercel.

Done when `npm run check` and `npm run build` pass locally. Commit as separate logical commits (rules file, scaffold, CI, deploy config). Stop after that.

geodb api key: [redacted]
```

**Outcome:** `CLAUDE.md`, the scaffold, CI and `vercel.json` landed as four commits; `npm run check` and `npm run build` pass. The agent pinned ESLint to v9 after a peer-dependency conflict with the accessibility plugin, fixed an option renamed in MSW 3, and added lint rules that enforce domain purity. A live test of the GeoDB key returned 403 "not subscribed", so the RapidAPI subscription still has to be activated.

## Prompt 4 — Accounts, identity, repo and first deploy

```text
Before any feature work, handle the setup end to end yourself:

1. GeoDB: RapidAPI shows I'm subscribed to the Basic plan, yet you got 403. Retry the call and diagnose: check the exact X-RapidAPI-Host value, whether the key in .env.local belongs to the same RapidAPI app that holds the subscription, and whether it's just propagation delay. Once it returns 200, read the rate-limit headers and update the plan's Decisions with the confirmed per-second and daily limits. If it still fails, tell me exactly what to check on the RapidAPI dashboard.

2. Commit identity: this is a personal project, so it must not use my work email. Set the repo-local git user.email to the personal primary email on my GitHub account (get it with gh api user/emails; if that's not accessible, use my GitHub noreply address from gh api user). Nothing is pushed yet, so rewrite the author and committer on all existing commits to that email, and show me git log with author emails to confirm.

3. GitHub: create a private repo named weatherboard under my account with gh, set it as origin and push main. Confirm the CI run passes; if it fails, resolve it and push again.

4. Vercel: using the Vercel CLI (npx vercel), link this folder to a new project, connect it to the GitHub repo so every push to main deploys to production, and add VITE_OPENWEATHER_API_KEY and VITE_RAPIDAPI_KEY from .env.local for Production and Preview without printing their values. Then deploy to production and confirm the placeholder loads at the live URL. If the CLI needs me to log in, stop and tell me the one command to run.

Report the repo URL, the live URL, the CI status and the GeoDB finding. Log this prompt in PROMPTS.md and commit.
```

**Outcome:** Partly done. Commit identity was rewritten to the GitHub noreply address, the private repo was created, the Vercel project was linked with both keys set, and the placeholder is live in production with the fallback and 404 behaviour verified. Three things stayed blocked on account permissions the agent could not grant itself: the push (the GitHub token lacks the `workflow` scope, so CI has not run), the Vercel to GitHub connection, and GeoDB, which still answers 403 "not subscribed" with the correct host, pointing to a key from a different RapidAPI app than the one holding the subscription.

## Prompt 5 — Finish the setup

```text
Done on my side: workflow scope granted via gh auth refresh, Vercel's GitHub app now has access to weatherboard, and I've subscribed to the GeoDB Cities Basic plan (it now shows as Active under Subscriptions & Usage, on the same app as the key in .env.local).

Finish the setup:
1. Push main and watch the CI run until it passes. If it fails, resolve it and push again.
2. Connect the Vercel project to the GitHub repo, confirm a push to main triggers a production deploy, and check the live URL.
3. Retry GeoDB. On 200, read the rate-limit headers and record the confirmed per-second and daily limits in the plan's Decisions. Record one real response as a trimmed fixture for later tests.

Report CI status, the deploy trigger confirmation and the GeoDB limits. Log this prompt in PROMPTS.md, commit and push.
```

**Outcome:** `main` was pushed and CI passed. GeoDB now returns 200: 1,000 requests/day from the headers, and 1 request/second observed by firing three at once, with about 600 ms per call. Recording fixtures exposed that the city-type filter drops Lahore, which GeoDB stores as an administrative area, so the planned request must change. Vercel still refused the GitHub connection, so the push-to-deploy trigger is not confirmed and production is deployed from the CLI.

## Prompt 6 — Design foundation and app shell

```text
Vercel is now linked to my GitHub account and the project is connected to Abdullah213447/weatherboard. First confirm a push to main creates a production deploy; if it's still blocked, stop and tell me why before doing anything else.

Good catch on Lahore and the duplicates. Leave that for the search task as you proposed.

Now the design foundation and app shell. Direction: calm and confident like Mercury, tight hierarchy like Linear. Not a gradient-heavy weather template and not a default Tailwind look.

Tokens (CSS variables, light and dark):
- Neutral off-white / ink surfaces with 2–3 elevation steps expressed through background and 1px borders, not heavy shadows. One accent colour used sparingly (focus rings, primary action, active states).
- Semantic tokens for success / warning / danger / info that pass WCAG AA in both themes. Verify the contrast ratios and record them in the plan.
- A sky-tint scale used only on the current-conditions card, keyed by ConditionKind and day/night. Subtle: it must never pull text contrast below AA.
- Inter, self-hosted so it works offline, with tabular numerals on every figure. A 5–6 step type scale; the current temperature is the single dominant element on screen.
- 4/8 spacing scale, radius tokens, and motion tokens (150–200 ms, standard easing) that collapse to 0 under prefers-reduced-motion.

Theme: follows the system by default; a manual light / dark / system control persisted through safeStorage; an inline head script so the wrong theme never flashes on load.

Layout:
- 375: single column. 768: two columns. 1280: dashboard grid with search, current conditions and forecast as primary; favourites and reminders as secondary.
- Header with the search slot, theme control and a status area. A banner slot for offline and storage notices. A footer with the Open-Meteo attribution.
- No horizontal scroll at any width; every interactive element at least 44x44 on touch.

Primitives, only the ones we'll actually use: Button, IconButton (requires an accessible label), Ckeleton, InlineAlert (title, message, optional action), ConfirmDialog on Radix Dialog, and a visually-hidden live-region helper.

First-run empty state, Linear style: one short sentence and 4–5 suggested-city chips including Karachi. The chips can be inert until search lands.

Add a dev-only ?preview=ui view, excluded from production builds, that renders every primitive and state in both themes so I can review the system in one place.

Done when it renders correctly at 375 / 768 / 1280 in both themes and `npm run check` passes. Tell me how to open the preview and point out anything you chose that I should look at critically. Log this prompt, commit and push, and confirm the deploy updated.
```

**Outcome:** A test push first confirmed that pushing to `main` deploys to production. The agent then built the tokens, theme control with a no-flash inline script, six primitives, the responsive shell, the first-run state and the dev-only preview. Contrast is enforced by a unit test over the token file (all pairings pass AA in both themes), and end-to-end tests cover the three widths, 44px touch targets, theme persistence and the preview's absence from production. It caught one bug of its own on the way: the hidden skip link kept its padding and failed the touch-target test.

## Prompt 7 — Design review changes, then the weather data layer

```text
Design review decisions:
- Accent: keep the indigo.
- Sky tints: too faint. Give each condition its own recognisable character while keeping AA: clear day a warm open blue, clear night a deep navy, partly cloudy between the two, cloudy a cool grey-blue, fog a warm hazy grey, rain/drizzle a slate teal, snow an icy pale blue, thunderstorm a muted violet-slate. Unknown stays neutral. Fog, cloudy and unknown must be distinguishable side by side in the preview. Update the contrast test and the ratios in the plan.
- Touch targets: 44px must not depend on pointer type alone. A reviewer resizing a desktop browser to 375 will measure with a mouse. Apply 44px minimum on every viewport below 768px and on any coarse pointer; 36px is allowed only at 768px and up with a fine pointer. Extend the e2e target test to cover a fine pointer at 375.
- CI: add the Playwright e2e run, with browser caching.
Commit these as their own commits before moving on.

Then build the weather data layer per PLAN.md. No UI yet.
- Record real fixtures first: OWM current and forecast and the Open-Meteo forecast for three cities chosen to stress local-day grouping (Karachi, Tokyo, and one at UTC-5 or further west), plus real error bodies (401, 404, 429 where obtainable). Trimmed, with the requests listed in the fixtures README, keys redacted.
- Zod schemas for both providers at the boundary; parse failures map to bad-response.
- OWM adapter with the local-day aggregation from the plan, today flagged partial, exactly 5 days.
- Open-Meteo adapter with the WMO mapping into ConditionKind.
- The fallback policy as a pure function of (outcome, circuit state), plus the session-scoped circuit, exactly as in the plan's table.
- The http wrapper: 8 s timeout, abort support, AppError mapping including offline vs network failure.
- A TanStack Query hook keyed by city coordinates with the stale time from the plan, no retries on non-retryable errors, and the last successful snapshot written for offline use as described in R6.
- The AppError -> user copy mapping (title, message, action) for every kind and source. No generic copy anywhere; add a test that fails if any message contains "something went wrong" or similar.

Tests: aggregation across timezone boundaries from the real fixtures, noon-slot condition selection, partial-today, WMO mapping, every row of the fallback table, circuit open and recovery, the offline-vs-online network branch, schema-mismatch fallback, and the copy mapping.

Done when `npm run check` and e2e pass. Logical commits (fixtures, schemas, adapters, fallback, hook, copy), log this prompt, push, and confirm CI and the deploy are green.
```

**Outcome:** The three review changes landed as separate commits. A deep navy night needs light text, so the agent made night cards render in the dark scope on either theme instead of adding a second set of text colours. The data layer followed with 365 passing unit tests, built on fixtures recorded for Karachi, Tokyo and Honolulu at one instant that falls on two different local dates. The copy test did its job on the first run: it rejected five "service is down" messages that named the failure but gave the user nothing to do.

## Prompt 8 — Review changes, then city search

```text
Review decisions:
- Night card as a dark island: accepted.
- Taxonomy additions, 404 fallback, retry policy, unixtime: accepted.
- Daily condition: change it. "Cloudy" with a 100% rain chance is wrong from a user's point of view. Pick the most significant condition among the day's daytime slots (06:00–18:00 local) by a severity ranking: thunderstorm > snow > freezing-rain > rain > drizzle > fog > cloudy > partly-cloudy > clear. Precipitation only wins if it's meaningful (the slot reports precipitation or its chance is 50% or more); otherwise use the noon-nearest slot as now. Tokyo 15 Nov from the fixture should come out as rain. Apply the same idea to today's partial day.
- 401: open the circuit for it too, for the session, and keep the developer console warning.
Commit these as their own commits.

Then build city search (requirements 01 and 03).

Data:
- Drop types=CITY. Keep sort=-population, limit 10, and add languageCode=en. Clean results client-side: drop entries whose name is the same place as a higher-ranked result (same name and region, or within ~25 km), and prefer a city over a "Greater X" administrative area when both are present. Verify against the recorded Laho/London fixtures: Lahore must appear, the duplicate Londrina and Greater London must not crowd out London. Show at most 6.
- Request policy from the plan: min 2 characters, 150 ms debounce, abort stale requests, prefix cache with local filtering for longer prefixes, 1 request per second spacing with the latest query winning, and the Open-Meteo geocoding fallback on 429 / 5xx / timeout only (not on empty results).

Combobox (WAI-ARIA combobox pattern): arrow keys, Enter, Escape, Home/End, aria-activedescendant, result counts announced through the live region. Each option shows city, region and country with the country flag as an emoji or code, so same-name cities are distinguishable. Highlight the matched prefix.

States, all visible in the field area: idle, typing, searching (indicator shown after 150 ms only, to avoid flicker), rests, no results ("No cities match 'xyz'. Check the spelling or try a nearby larger city."), rate-limited, offline (input disabled with the reason), and service error. Every message says what failed and what to do. When the fallback geocoder served the results, say so quietly.

Validation, on blur and on submit:
- empty -> "Enter a city name"; 1 character -> "Type at least 2 letters".
- No error on first focus or when tabbing past an untouched field (plan R8). Blur is ignored while a suggestion is being clicked.
- Submitting typed text without choosing selects the top match if there is one, otherwise shows the no-results message.
- Errors inline under the field, linked with aria-describedby, cleared as soon as the input becomes valid.

Selecting a city updates ?city= in the URL, becomes the last viewed city, and makes the empty-state chips work (they run a search). Rendering weather comes in the next task.

Measure the 300 ms budget with the dev-only performance mark: record cached and network timings in the plan for the README.

Tests: cleaning against the real fixtures, debounce and spacing timing with fake timers, stale-response cancellation, cache and local filtering, fallback triggers, every keyboard path, every validation message on blur and submit, no-results, offline and rate-limited states. Add an e2e flow at 375 and 1280: type, arrow down, Enter, URL updated.

Done when `npm run check` and e2e pass. Logical commits, log this prompt, push, confirm CI and deploy are green.
```

**Outcome:** Both review changes landed first. City search followed: cleaning rules verified on recorded responses (Lahore now appears, London leads), a request engine with cache, local filtering, one-per-second spacing and a backup geocoder, and an ARIA combobox with every state and validation rule. Measured against the live API, a first network answer takes 673 to 981 ms, so the 300 ms budget is met only for cached answers; the agent then removed the pause for those, taking them from about 175 ms to under 30 ms. It also pushed back on one rule: merging results by distance alone would merge neighbouring cities, so names must be related too.

## Prompt 9 — Review changes, then the weather display

```text
Review decisions:
- Precipitation: add a threshold. A slot's rain/snow/thunder counts as meaningful when its chance is 50% or more, or its amount is at least 0.5 mm in the 3-hour slot. Honolulu's trade-wind showers should go back to their noon-nearest condition; Tokyo 15 Nov stays rain. Update the pinned test.
- Departures 1–6 and the link format: accepted.
- 300 ms: improve what we can without adding a data source. Preconnect to the GeoDB host when the search field first gets focus, and show matching recent searches and favourites instantly (labelled as such) while the network request runs, merging GeoDB results in when they arrive without the list jumping. Re-measure and update the table in the plan.
Commit these as their own commits.

Then build the weather display (requirement 02), using the existing hook.

Current conditions card (the sky-tinted card):
- City, region and country; the city's local time and date, updating each minute.
- Condition label and animated icon; the temperature as the dominant element; feels-like; today's high/low.
- A compact metric row: humidity, wind speed with a direction arrow and compass label, chance of precipitation, sunrise and sunset in the city's local time (add sunrise/sunset to the Open-Meteo request if needed).
- A quiet status line in the header status slot: "Updated 4 min ago · OpenWeatherMap", or "Open-Meteo (backup)" when the fallback served the data, with a small status dot, Vercel-style. The relative time updates live.

5-day forecast:
- One row per day: day name ("Today" for the first, marked partial where relevant), icon, condition, chance of precipitation when meaningful, and a min–max range bar scaled across the whole five-day span so days compare visually, with the current temperature marked on today's bar.
- Readable as one column at 375; no overflow anywhere.

Icons: our own SVG set, one per ConditionKind with day/night variants, with subtle CSS animation that stops under prefers-reduced-motion. Not the OWM PNGs. Decorative icons are aria-hiddth the condition given as text.

States:
- Loading: skeletons that match the final layout exactly, no layout shift (verify CLS in the e2e or with a performance observer).
- Error with no cached data: InlineAlert with the mapped copy and a Retry action.
- Error with cached data for the same city: show the cached snapshot with a clear "Showing data from 14:05, couldn't refresh: <reason>" note and Retry.
- Live region announces the city and temperature when new data loads. Document title becomes "Lahore 31° · WeatherBoard".

Units (bonus): °C/°F toggle in a small settings area, persisted through safeStorage, converting at render with no refetch; wind follows (km/h with °C, mph with °F). Default from the browser locale (°F for US), overridden once the user chooses.

Tests: formatting and conversion with rounding edge cases, range-bar scaling, relative time, each state (loading, error, error-with-cache, success) with the real fixtures, unit toggle without refetch. e2e at 375 / 768 / 1280: select a city, card and forecast render, no horizontal scroll, toggle units.

Done when `npm run check` and e2e pass. Logical commits, log this prompt, push, confirm CI and deploy are green.
```

**Outcome:** The threshold, preconnect and instant recent cities landed first; measured, recent cities appear in about 20 ms while preconnect made no measurable difference, and the plan says so. The weather display followed: the sky-tinted card, a five-day list on one shared scale, the app's own animated icon set, every loading and error state, and units that convert without a request. Two things the tests caught along the way: the new locale default made every test run in Fahrenheit until the test locale was pinned, and the storage wrapper could let a stale in-memory value override storage that had been cleared.

## Prompt 10 — Review changes, then favourites

```text
Review decisions:
- Today as rain while it's raining at the reading: accepted.
- 17 Nov in Honolulu: change it. If a shower is too light to count under the threshold, it shouldn't label the day through the noon-nearest rule either. When the noon-nearest slot is sub-threshold precipitation, label the day from that slot's cloud cover, using the same bands as the OWM 800–804 mapping. Check whether the Open-Meteo adapter needs the equivalent so both providers label the same day the same way; verify against its docs rather than guessing, and if it isn't cheap, leave it and record the difference in the plan.
- Settings menu: change it. Nobody should have to open a menu to find the unit switch, and a bare "26°" needs its unit in view. Put a compact °C | °F control on the conditions card beside the temperature, at every width. The header button becomes the theme control only (light / dark / system).
- Single-colour icons, two-line forecast rows, the 20% rule and the locale clock format: accepted.
- Card arrival: let the tint and content fade in over the motion token when data replaces the skeleton, off under reduced motion, with layout shift still under 0.01.
- Search field: make both paths consistent. It's a command input, so it clears after a selection and stays empty when the app opens on a city; the card carries the state. Reset the field's validation state on selection so no error shows on blur, and dismiss the on-screen keyboard on touch devices so the weather is visible.
- Add the full icon set to ?preview=ui (every ConditionKind, day and night, both themes) and review each one. Add a fake-timer test for the clock tick.
Commit these as their own commits.

Then build favourites (requirement 04).

Store:
- Up to 5 cities, keyed by the existing city id, no duplicates, kept in the order added. Versioned shape, validated with Zod on read: corrupt data, an old version, duplicates or more than 5 entries are cleaned up safely and never crash the app.
- Persisted through safeStorage with cross-tab sync. Whenage is unavailable or a write fails (quota), favourites keep working in memory for the session and the existing storage notice explains they won't be kept.

Star control on the conditions card:
- Saves the current city and announces it through the live region ("Lahore saved. 3 of 5 favourites.").
- On a saved city it shows as pressed (aria-pressed), and activating it asks for confirmation like any other removal.
- At the limit it stays focusable (aria-disabled, not disabled) with the reason visible and linked via aria-describedby: "You've saved 5 of 5 cities. Remove one to add another." Never a silent no-op.

Quick-access panel:
- Header with the count ("3 of 5"). Each row: city, region and country, a small condition icon and the current temperature in the chosen unit, and a remove button labelled with the city name. The row for the city on screen is marked with aria-current.
- Temperatures come from the same weather query the card uses, so choosing a favourite renders instantly from cache. Per row: a skeleton while loading, a dash with accessible text if it can't load or the device is offline. A row never shows an error banner and never blocks the list.
- Long names truncate cleanly (test with something like "Thiruvananthapuram"), with the full name available to assistive tech.
- Empty state in the same voice as the first-run screen: one sentence that says how to add a city.
- Favourites also appear in the instant search suggestions, labelled "Favourite", ahead of recent cities.

Removal:
- Always confirmed in ConfirmDialog, naming the city ("Remove Lahore from favourites?"), with initial focus on the safe action and Escape cancelling.
- After removal, focus moves to the next row, or to the panel heading when the list is empty. Cancel returns focus to the control that opened the dialog. Announce the result.

Placement at 375: the panel can't sit below the forecast, because that isn't quick access. Constraints: reachable from the top of the page, the current temperature still visible without scrolling on a 375x667 viewport with 5 favourites saved, no inner horizontal scroller, and removal still possible with 44px targets. At 768 and 1280 it's the secondary-column panel. Propose the arrangement that meets these and tell me what you chose and why.

Tests: store (cap, duplicates, corrupt JSON, wrong version, more than 5 entries, storage throwing on read and on write, cross-tab update); components (save, limit message, confirm and cancel from both the star and the panel, focus after each, aria-current, row loading and failure); e2e at 375 and 1280 (save from the card, appears in the panel, survives reload, remove with confirmation, sixth city refused with the message, no horizontal scroll with 5 long-named favourites).

Done when `npm run check` and e2e pass. Logical commits, log this prompt, push, confirm CI and deploy are green.
```

**Outcome:** The review changes landed as separate commits: the unit switch moved onto the card, the card now arrives in place with a fade, the search field clears after use, and every icon was reviewed in the preview, which showed that cloudy and partly cloudy were the same drawing (a test had passed only because generated ids differed). Favourites followed with a versioned, self-cleaning store, a star that never fails silently, and a panel folded to one row on phones so the temperature stays on the first screen. The tests found three real defects on the way: the confirm dialog did not return focus to what opened it, re-saving a stored city reordered its fields, and one long city name widened the page by 47px.

## Prompt 11 — Review changes, then the installable, offline-capable PWA

```text
Review decisions:
- Cloud-cover labelling, Open-Meteo left as is with the difference recorded, and decisions 1–6: accepted.
- Favourites at 375: keep the fold, but change what the folded row shows. Switching city is the frequent action and removing is the rare one, so the frequent one shouldn't cost an extra tap. Folded, the panel shows the saved cities themselves as tap targets (name and temperature, the current one marked with aria-current), wrapping with names truncated so at least two fit per row and five never take more than three rows. The header keeps the count, and "Edit" opens the full list with the remove buttons as it does now. The 375x667 test must still pass with five long-named favourites; if it can't, tell me instead of adding a special case.
- Add a test for the "Favourite" label in search suggestions.
Commit these as their own commits.

Then make it an installable, offline-capable PWA (requirement 05).

Manifest and icons:
- name, short_name, description, id, start_url and scope "/", display standalone, theme_color and background_color from our tokens, lang, categories.
- Design a simple app mark in the brand style as an SVG and generate from it: 192 and 512 PNGs, a maskable 512 with the safe zone respected, a 180 apple-touch-icon without transparency, and the favicon.
- Two manifest screenshots (narrow and wide) taken from the real app, for the richer install dialog.
- theme-color meta tags that follow the active theme, including a manual override. viewport-fit=cover with safe-area insets so nothing sits under a notch or home indicator in standalone mode.

Service worker (vite-plugin-pwa, injectManifest, our own sw.ts):
- Precache the app shell: HTML, JS, CSS, the self-hosted fonts and icons. Clean up outdated caches. Keep the precache lean: manifest screenshots and other install-only assets stay out of it.
- Navigation fallback to the precached index.html so ?city= links open offline; /api/* is excluded.
- No runtime caching of weather or GeoDB responses in the worker. The app-ownednapshot in Cache Storage stays the single source of truth (plan R6).
- Updates: no silent takeover. When a new version is waiting, show "A new version of WeatherBoard is ready" with Reload and Later.
- When the shell has been cached for the first time, say so once, quietly ("Ready to use offline").
- Disabled in dev; active in build and preview. Keep sw.ts organised so push handlers can be added next.

Offline behaviour:
- One connectivity source for the whole app, driven by the online/offline events and by real request outcomes (plan R7).
- A banner containing the words "Offline mode", for example: "Offline mode. Showing Lahore as saved at 14:05. Search and other cities need a connection."
- Offline is a mode, not an error: the card shows the saved snapshot with its age in neutral styling, Retry is hidden, and the data refreshes by itself when the connection returns, with "Back online" announced politely.
- Cold start offline opens the last viewed city, taking the city from the snapshot itself so it works even without localStorage. With no snapshot, show an offline empty state that says what to do.
- Choosing a favourite or opening a link to a city that isn't saved: say that only the last viewed city is kept offline, name it, and offer to show it.
- An old snapshot never presents a past day as Today: forecast rows are labelled from their own dates against the city's current local date, and past days are dropped.

Installed-app polish:
- Standalone mode has no browser reload, so add a refresh action beside the status line. It's disabled while loading or offline.
- A quiet install entry point: on Chromium, an "Install app" action using beforeinstallprompt; on iOS Safari, short Add to Home Screen steps. Dismissible, remembered, hidden when already installed or unsupported, never a modal on load.

Verification:
- Lighthouse no longer has a PWA category, so check installability in the Chromium e2e project through the DevTools protocol (Page.getInstallabilityErrors and Page.getAppManifest; confirm the method names against the current protocol docs, and use a persistent context if a regular one reports an incognito-related error). Assert no installability errors and the required manifest fields.
- e2e against the production preview: load, choose a city, go offline with the context, reload. The shell loads, the last city renders, the "Offline mode" banner shows, search is disabled with its reason, and an unsaved favourite shows its message. Back online: banner gone, data refreshed. Also a cold start in a new page while offline.
- vercel.json: confirm sw.js and the manifest are served without long-lived caching and with the right content types, and that hashed assets stay immutable.
- After the deploy, run the installability and offline checks against the live URL and report the results.

Give me a short manual checklist for a real phone and desktop: install, launch from the home screen, flight-mode relaunch, update prompt.

Done when `npm run check` and e2e pass. Logical commits (icons and manifest, service worker, offline behaviour, install and refresh, tests), log this prompt, push, confirm CI and deploy are green.
```

**Outcome:** Folded favourites became one-tap city targets, still inside the 375x667 fold with five long names. The PWA followed: a generated icon set and manifest, a service worker that caches only the shell and waits for the user before updating, one connectivity source, and offline as a calm mode with the saved city, an honest message for cities that are not saved, and a refresh on reconnect. Installability is asserted through the DevTools protocol. The browser tests caught two layout shifts from notices that appeared after load (fixed by making them overlays), and the unit tests caught that a retry briefly replaced the saved weather with a skeleton.

*Supplied the Upstash credentials for the reminder sender; values not recorded.*
