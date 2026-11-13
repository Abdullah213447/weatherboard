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
