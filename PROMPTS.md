# Prompt history

**Tool:** Claude Code (Anthropic's agentic coding CLI) running inside the Cursor IDE.
**Model:** Claude Fable 5.2.

Every prompt I gave the agent is listed below in order, verbatim, with a short note on what came out of it. The only alterations are redactions of secrets pasted into a prompt, marked `[redacted]`.

---

## Prompt 1 — Planning before any code

```text
'/Users/abdullahsiddiqui/Downloads/Edspire-Frontend-Technical-Challenge.pdf''/Users/abdullahsiddiqui/Downloads/BRIEF.md'

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
