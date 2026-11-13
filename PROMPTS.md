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
