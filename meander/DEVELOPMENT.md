# Meander development roadmap

This is the engineering plan behind [ROADMAP.md](ROADMAP.md). It covers what to build, in what order, how the pieces fit, and when each step counts as finished.

It assumes **one full-stack developer in two-week sprints**, about 9 sprints (18 weeks) to launch. Each sprint ends with something that installs and runs.

---

## 1. Target architecture

```
┌──────────────────────────── Device ────────────────────────────┐
│  UI (Preact + TypeScript)                                      │
│     │ reads/writes                                             │
│  Local store (IndexedDB via Dexie)  ◄── the app's source of truth│
│     │                                                          │
│  Sync engine: outbox queue → push · pull since cursor          │
│  Crypto: journal encrypted on device before upload              │
│  Shell: browser PWA  |  Capacitor (iOS / Android)              │
└─────┬──────────────────────────────────────────────────────────┘
      │ HTTPS (signed-in users only)
┌─────▼──────────────────── Supabase (EU) ───────────────────────┐
│  Auth (magic link, Apple, Google)                              │
│  Postgres + row-level security (each user sees only their rows)│
│  Edge Functions: payment webhooks, reminders, account deletion │
└─────▲───────────────────────────────▲──────────────────────────┘
      │ webhooks                      │ webhooks
   Paddle (web payments)        RevenueCat (App Store / Play)
```

Key decisions:
- **Local-first.** The app works fully offline and without an account. Sync is an add-on, so a server outage never blocks someone's morning check-in.
- **One codebase** for web, iOS and Android. Capacitor wraps the same build; native plugins cover notifications, the keychain and in-app purchases.
- **Domain logic in plain TypeScript with no UI imports**: dates, tides, carry-over, insights, entitlements. That keeps it easy to test and reuse in a widget later.

## 2. Stack

| Area | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Catches data-shape bugs early, which matters once sync exists |
| UI | Preact + Preact Signals | Small (≈4 KB), React-like, fast on cheap phones |
| Build | Vite + vite-plugin-pwa | Fast dev server; generates the service worker and manifest |
| Styling | Plain CSS with the existing tokens (`oklch` hues) | The prototype's colour system carries over as is |
| Local data | Dexie (IndexedDB) | Larger and more durable than localStorage; supports versioned migrations |
| Backend | Supabase | Auth + Postgres + functions in one service, EU hosting, generous free tier |
| Web payments | Paddle (merchant of record) | Handles EU VAT, invoices and refunds |
| Store payments | RevenueCat + Capacitor plugin | One API for Apple and Google, and it links to the same user |
| Mobile shell | Capacitor 7 | Wraps the web build; native plugins where needed |
| Tests | Vitest, Testing Library, Playwright | Unit, component and end-to-end |
| CI/CD | GitHub Actions, Cloudflare Pages, Fastlane | Checks on every PR, preview links, store uploads |
| Monitoring | Sentry, Plausible | Crash reports; cookie-free usage stats |

## 3. Repository layout

```
meander/
├─ apps/
│  ├─ web/                 Vite app (also what Capacitor wraps)
│  │  ├─ src/views/        Today, Week, Jar, Reflect, Settings, Plus, Onboarding
│  │  ├─ src/components/   WeatherPicker, AnchorChip, TaskRow, Sheet, Swatch…
│  │  ├─ src/styles/       tokens.css (from the prototype), base.css
│  │  └─ public/           icons, fonts (self-hosted)
│  └─ mobile/              capacitor.config.ts, ios/, android/, fastlane/
├─ packages/
│  ├─ core/                pure TS: dates, tides, carryover, insights, entitlements
│  ├─ db/                  Dexie schema, migrations, repositories
│  └─ sync/                outbox, push/pull, conflict rules, crypto
├─ supabase/
│  ├─ migrations/          SQL tables + RLS policies
│  └─ functions/           paddle-webhook, revenuecat-webhook, send-reminders, delete-account
├─ e2e/                    Playwright tests
├─ prototype/              today's src/app.html, kept for reference
└─ .github/workflows/      ci.yml, deploy-web.yml, release-mobile.yml
```

Tooling: pnpm workspaces, ESLint + Prettier, `tsc --noEmit` in CI, Husky pre-commit for lint and format.

## 4. Data model

The device and the server hold the same shapes. Every synced row has `id` (UUID made on the device), `user_id`, `updated_at`, `deleted` (tombstone) and `device_id`.

| Table | Fields (besides the common ones) | Notes |
|---|---|---|
| `profiles` | name, theme, colors `{main, second, mood}`, timezone, reminder times | One per user |
| `anchors` | label, icon, position, archived_at | Archive instead of delete so history keeps its labels |
| `days` | date (`YYYY-MM-DD`, local), weather, intention, carried | Unique on (user_id, date) |
| `anchor_checks` | day_date, anchor_id | One row per tick, so two devices ticking different anchors never conflict |
| `tasks` | day_date, text, tide, done, position | |
| `drifts` | text, added_on, pulled_at | |
| `journal_entries` | day_date, ciphertext, nonce | Holds the reflection text and three good things, encrypted |
| `week_notes` | week_start, text | |
| `entitlements` | plan, status, source (paddle/apple/google), expires_at | Server-written only; clients can read, never write |

Dexie versions: v1 imports the prototype's `meander.v1` localStorage blob once, then deletes it after a successful write.

## 5. Sync design

- **Outbox.** Every local write also adds an entry `{table, id, op}` to an outbox. The sync loop runs on app start, when the app comes back to the foreground, when the network returns and every 60 seconds while open.
- **Push.** Send changed rows in batches. The server upserts with "newest `updated_at` wins".
- **Pull.** `select … where updated_at > cursor` per table, then save the new cursor.
- **Conflicts.** Last write wins per row. The data is split finely (one row per anchor tick and per task), so real conflicts are rare and small.
- **Clock skew.** The server stamps `updated_at` with a Postgres trigger; the client's time is only used for local ordering.
- **Journal encryption.**
  - A random 256-bit key is created on the first device and stored in the iOS Keychain or Android Keystore (on the web, a non-extractable WebCrypto key in IndexedDB).
  - Each entry is encrypted with AES-GCM.
  - To add a second device, the user scans a QR code or types a 24-word recovery phrase. Without either, entries can't be read; the onboarding copy must make that clear.
- **Never lose data.** Sync never deletes local rows that haven't been pushed. A failed push stays in the outbox.

## 6. Sprints

Each sprint lists its tickets, then **Done when** (the acceptance check).

### Sprint 1: Foundation
- Set up the monorepo, TypeScript, Vite, ESLint and Prettier, and CI running lint + typecheck + test.
- Port `tokens.css` and the base styles from the prototype. Self-host Gloock and Onest.
- `packages/core`: port the date helpers, tides, weather vocabulary, reflection questions and colour palettes, with unit tests.
- Deploy previews of every PR to Cloudflare Pages.

**Done when:** an empty shell with the tab bar deploys from `main`, and the core tests pass in CI.

### Sprint 2: Local data and the Today view
- Dexie schema v1, repositories, and the one-time import of the prototype's data.
- Today view: weather, intention, anchors, tides, add/move/let-go, carry-over card, day navigation.
- Component tests for the task row and carry-over logic.

**Done when:** Today matches the prototype, data survives a reload, and the data import is tested.

### Sprint 3: The rest of the app
- Week, Drift jar, Reflect (history and anchor rhythm), breathing pause, settings with colours.
- First-run flow: name, 3 anchors, colours. No example data for real users; the example state moves to a demo mode.
- JSON export and import.
- Playwright: first run → plan a day → reflect → export.

**Done when:** feature parity with the prototype plus onboarding and export, and the end-to-end suite is green.

### Sprint 4: PWA polish, reminders and accessibility
- vite-plugin-pwa (offline, update prompt), install hints for iOS Safari.
- Reminder settings, and web push through a Supabase function on a schedule.
- Support resources after several stormy days, with country-specific helplines in a config file.
- Accessibility pass: axe in Playwright, screen reader labels, focus order, contrast of all 36 colour combinations checked in a test.

**Done when:** Lighthouse PWA and accessibility scores are 95+ and a reminder arrives on Android Chrome.

### Sprint 5: Accounts
- Supabase project (staging and production), SQL migrations, RLS policies, and tests proving one user can't read another's rows.
- Sign-in screen: magic link, Apple, Google. Signing in is optional and offered from settings and from Plus.
- Account deletion as an Edge Function that removes all rows and the auth user.

**Done when:** sign in and out on web works, the RLS tests pass, and deletion leaves zero rows.

### Sprint 6: Sync and encryption
- `packages/sync`: outbox, push, pull, cursors, retry with backoff. Status shown in settings as "Synced 2 min ago".
- Journal encryption, device linking by QR code, and the recovery phrase.
- Tests: two simulated devices editing offline then syncing; property tests for merge rules.

**Done when:** edits on two browsers converge, airplane mode loses nothing, and journal rows in the database are unreadable ciphertext.

### Sprint 7: Payments on the web
- Paddle checkout for monthly, yearly and lifetime, with a 14-day trial.
- `paddle-webhook` function writes `entitlements`; the app reads them after login and caches them for offline use.
- `core/entitlements.ts`: one `can(feature)` function, used everywhere Plus is checked.
- Customer portal link, plus a trial-ending email.

**Done when:** in Paddle's sandbox, buy, cancel, refund and expire each update access within a minute, and ending a plan never hides past entries.

### Sprint 8: iOS and Android
- Capacitor projects; native local notifications, keychain storage and the status bar.
- RevenueCat with the same products, and a `revenuecat-webhook` function writing the same `entitlements` table.
- Fastlane lanes for TestFlight and the Play internal track, run from GitHub Actions on a tag.
- Store listings, screenshots and privacy labels.

**Done when:** a TestFlight build installs, subscribes in the sandbox and unlocks Plus on the web for the same account.

### Sprint 9: Plus features, hardening and launch
- Monthly letter v1: rules-based insights in `core/insights.ts`, generated on the device.
- Seasonal palettes, PDF export of a month, journal search.
- Sentry and Plausible; a performance budget of first paint under 1.5 s on a mid-range Android phone.
- Fix the bugs from the beta, submit to the stores, and launch the landing page.

**Done when:** both stores approve, the crash-free rate in the beta is above 99.5%, and the launch checklist is complete.

## 7. Quality bar

**Every pull request must:**
- Pass lint, typecheck, unit tests and the Playwright smoke test.
- Come with a preview link.
- Include screenshots in light and dark mode for any UI change.

**Coverage:** `packages/core` and `packages/sync` at 90%+. Views are covered by end-to-end tests rather than a coverage number.

**Definition of done for a feature:**
- It works offline.
- It survives a reload.
- It syncs, if it's synced data.
- It is reachable by keyboard and screen reader.
- It has copy written in the app's voice.
- It's covered by a test.

**Releases:** web deploys on merge to `main`. Mobile ships from version tags, with staged store rollouts at 10%, then 50%, then 100%.

## 8. Environments and secrets

| Env | Web | Backend | Payments |
|---|---|---|---|
| Local | `pnpm dev` | Supabase CLI (Docker) | Paddle sandbox |
| Staging | `staging.` subdomain | Supabase staging project | Paddle sandbox, RevenueCat sandbox |
| Production | main domain | Supabase production project | Live |

Secrets (Supabase service key, Paddle and RevenueCat webhook secrets, Apple and Google signing keys) live in GitHub Actions secrets and Supabase function secrets, never in the repo.

## 9. Main risks

| Risk | Mitigation |
|---|---|
| iOS evicts web storage or limits web push | Ship the Capacitor app; nudge web users to back up or sign in |
| Sync bugs that lose data | Local-first design; outbox never dropped; two-device tests in CI |
| Lost encryption key means a lost journal | Recovery phrase shown at setup, a reminder to save it, QR device linking |
| Store rejection over payments | Use in-app purchase inside the store apps; web checkout only on the website |
| Time overruns | Sprints 5–8 are the risky ones; Plus features in sprint 9 can slip after launch |

## 10. First week, ticket by ticket

1. Create the `meander` repo and move the prototype into `prototype/`.
2. Set up the pnpm workspace with `apps/web` and `packages/core`.
3. Configure TypeScript strict, ESLint, Prettier and Husky.
4. Add the CI workflow: install, lint, typecheck, test.
5. Port `tokens.css` and self-hosted fonts; render the tab bar.
6. Port `ymd`, `addDays`, `weekStart` and the tide helpers into `core/dates.ts`, with tests for month and year boundaries and daylight-saving changes.
7. Port the weather vocabulary, reflection questions and colour palettes into `core/`.
8. Connect Cloudflare Pages previews.
9. Write the Dexie v1 schema and the localStorage importer (behind a test).
10. Start the Supabase staging project (no app code yet), so access is ready by sprint 5.
