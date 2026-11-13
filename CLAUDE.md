# WeatherBoard — standing rules

These rules apply to every session and every task in this repo.

## Before starting

- Read `docs/PLAN.md` before any task. When a decision changes, update its Decisions section in the same piece of work.
- If a request conflicts with the challenge brief or the plan, stop and say so. Do not guess.

## Code

- TypeScript strict. No `any`. No non-null assertion (`!`) unless a comment on the same line or the line above explains why it is safe.
- `src/domain` stays pure: no React, no `fetch`, no browser globals.
- Components are presentational where possible. Data fetching lives in feature hooks, not in components.
- Fixtures are real recorded API responses. Never invent a response field.

## UI

- Every async UI has four states: loading, empty, error and success.
- Error copy follows the `AppError` taxonomy: say what failed and what the user can do about it. Never generic.
- Accessibility is required, not optional:
  - semantic HTML and labelled controls
  - visible focus and full keyboard support
  - `prefers-reduced-motion` respected
  - touch targets at least 44×44 px

## Finishing a task

1. Run `npm run check` and resolve every failure before committing.
2. Commit in Conventional Commits format: small, atomic, imperative mood, with a scope (for example `feat(search): debounce suggestions`).
3. Never commit secrets. Keys live in `.env.local`; `.env.example` documents the names only.
4. Append the user's prompt verbatim to `PROMPTS.md` under the next number, with secrets redacted and local paths made project-relative. Add a 1–3 line Outcome note. Commit that too.

## Commands

| Command            | Purpose                                      |
| ------------------ | -------------------------------------------- |
| `npm run dev`      | Start the dev server                         |
| `npm run check`    | Typecheck, lint, format check and unit tests |
| `npm run build`    | Production build                             |
| `npm run test:e2e` | Playwright end-to-end tests                  |

Node 22 is required (`nvm use`).
