# Independent review before submission

On 14 Nov 2026 I had the submission reviewed by a fresh agent that had not seen how it was built. It was given three things only: the challenge brief, the live URL and a clean clone of the public repo. It was asked to act as the reviewer. This file records what it found and what was done about each finding, in my own words.

The review ran against commit `50b0607`. It was read-only.

## What the reviewer did

- Followed the README's setup from the clean clone.
- Checked each requirement and bonus on the live site with real data at 375, 768 and 1280 px in Chromium.
- Looked for the things a reviewer notices quickly: vague error copy, missing loading or error states, console errors, small touch targets, horizontal scroll, keyboard traps, unfinished visual details.
- Ran the core flows in Playwright's WebKit.
- Ran Lighthouse on mobile and desktop, and an axe scan on the main states.

## Setup

Every written step worked: install, dev server, `npm run check` (837 tests at the time) and the Playwright suite (77 passed).

- **`vercel dev` needs a linked project.** The README did not say that the functions step needs a Vercel account and `vercel link`. The reviewer did not run that step for this reason. **Done:** the README now says so.

## Requirements

- 01 City search – partly met. Everything works, but a first search for a new city took 594 to 813 ms, over the 300 ms target. See finding 1.
- 02 Weather display – met.
- 03 Form validation – met.
- 04 Favourite cities – met.
- 05 PWA – met. The reviewer did not check installability independently; the repo's own test for it passed.
- 06 Push notifications – nothing found broken. The explanation before the prompt, the denied and unsupported states, the service worker's handlers and the endpoints' refusals were all confirmed. A real push arriving could not be verified in a headless browser.
- 07 Responsive – met. No horizontal scroll at any width in any state, and nothing under 44 px at 375 or at 768 with touch.
- Bonuses (theme, units, animated icons) – all met.

## Findings and what was done

Changes were limited to two kinds of finding: a brief requirement not fully met, or something visibly broken or unfinished on the live site. Everything else is listed with a recommendation and left alone.

### Changed

- **The "Ready to use offline" notice covered the header.** For about eight seconds on a first visit it hid the app name and half the refresh button at 375, and the end of the search field at wider sizes. It also floated above a dialog's backdrop. **Done:** it now appears at the bottom of the screen, below dialogs (`f44aab7`).
- **The reminder card's fields were cut off at 768 and 1280.** In Chromium with a 12-hour clock the time read "07:30 A", and the empty city choice read "No city ye". **Done:** the two fields stack in the narrow side column and stay side by side on a phone (`8182c46`).
- **The header contradicted the offline banner.** After the connection dropped, the banner said "Offline mode" while the header still showed a green dot and "Updated just now". **Done:** the header now reads "Offline · saved …" with a neutral dot, with a test (`a1edd9a`).

### Not changed, with my recommendation

1. **First search for a new city misses 300 ms.** This is the one brief requirement that is measurably not met. The cause is GeoDB's own response time, and the README says so with numbers. Fixing it means a different data source or a proxy with a shared cache – a new piece of the system, not a last-day change. Recommendation: leave it, and be ready to discuss it.
2. **Tooling and scope differ from the brief's wording.** The brief names three agentic IDEs; I used Claude Code running inside Cursor, and say so. The brief says client-side only; the reminder needed a small server, and the README explains why. Recommendation: no change. Both are disclosed, and both are for the reviewer to judge.
3. **Search ranking lets some districts through.** "Par" lists two Parganas districts above Paris, and "Paris" is followed by Louisiana parishes. The cleaning rules handle the cases I tested (Lahore, London) but not these. Recommendation: leave it for now; a ranking change needs new recorded fixtures and could regress the cases that work.
4. **The search placeholder is cut short at 768 once a city is loaded** ("Search for a cit"). Recommendation: leave it; the fix is a header layout change at one width, and the field itself works.
5. **A browser-side failure to subscribe is described as a bad server reply.** Seen only in an automation profile where the Push API is unavailable. Recommendation: worth a separate error message later; not seen in a normal browser.
6. **Smaller notes.** At 1280 the tab order reaches the favourites before the city card. The theme options are icons without visible text (they have accessible names). At 375 "Sunset" sits alone on a third row. The empty state is tall at 1280. A link with invalid coordinates shows the empty state without saying why. There is no Content-Security-Policy header. Recommendation: none of these is broken; I would take the tab order and the invalid-link message first.

## Other engines

- **WebKit:** every core flow worked at 375 and 1280, with no horizontal scroll and nothing under 44 px. The reminder card showed its unsupported message at 375, because Playwright's WebKit build has no Push API there. This build is not iOS Safari.
- **Firefox:** could not be run. The browser exited at launch in the reviewer's environment.

## Lighthouse and axe

Lighthouse 13.6, one run each:

- Mobile, empty state: performance 81, accessibility 100, best practices 100, SEO 100.
- Desktop, empty state: 100, 100, 100, 100.
- Mobile, a city loaded: 94, 100, 100, 100.
- Desktop, a city loaded: 99, 100, 100, 100.

The 81 came from a blocking time of 790 ms in that one run; the loaded-city run on the same settings measured 60 ms, so it may be noise. Layout shift was 0 in all four.

axe-core found no violations in 22 scans at 375 and 1280: the empty state, a city in both themes, the theme menu, the search list, the remove dialog, offline in both themes, a weather error in both themes, and the reminder explainer.

## What the reviewer could not verify

- A real push notification arriving, and what a tap on it does.
- Installation on real devices.
- Firefox, real Safari, iOS and Android.
- `vercel dev` and the schedule script.
- The update prompt between two deployed versions, and a replaced push subscription.
