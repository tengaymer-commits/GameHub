# Meander roadmap: from prototype to a paid app

The engineering plan (architecture, data model, sprints) is in [DEVELOPMENT.md](DEVELOPMENT.md).

## Where Meander is today

What works now:
- One installable web page that works offline.
- All the planner features: inner weather, anchors, tides, drift jar, week view, reflection, breathing pause.
- Colour settings: main colour, second colour, colour mood, light or dark.
- A Plus upgrade screen with plans and prices (a mock only).

What's missing before anyone can pay for it:
- **No accounts.** Data lives in one browser on one device. Clearing site data erases it.
- **No payments.** The Plus screen only shows a message.
- **No backup or sync**, no reminders, and no app store listing.
- **No tests**, and no privacy policy or terms.

The timeline below assumes one developer working full time, which comes to about 16–18 weeks. Part time roughly doubles it.

---

## Phase 0: Decide and set up (week 1)

Only you can do these:
- [ ] **Check the name.** Several apps and companies already use "Meander". Search the App Store, Google Play and the EUIPO/USPTO trademark databases. Pick a backup name now, before buying a domain or designing an icon.
- [ ] **Register as a business** (sole trader is enough to start) and open a business bank account.
- [ ] **Buy the domain** and set up a support email address.
- [ ] **Pricing decision.** Recommended: free core app, plus €3.99/month, €29.99/year or €59 lifetime, with a 14-day trial.
- [ ] **Positioning.** Meander is a planner with wellbeing habits. It is not therapy or a medical product. Say so on the site and in the app.

## Phase 1: Solid foundation (weeks 2–5)

Turn the single-file prototype into a maintainable codebase without changing how it feels.
- [ ] Move to **Vite + TypeScript** with a light UI framework (Preact or Svelte). Keep the current design tokens.
- [ ] Move storage from localStorage to **IndexedDB** (via Dexie). Version the data and add migrations so updates never lose entries.
- [ ] Host the fonts with the app instead of loading them from Google, for privacy and offline use.
- [ ] Add **export and import** (JSON file) so people can back up their data before sync exists.
- [ ] Add a **first-run flow**: name, pick 3 anchors, pick colours. Skip the example data for real users.
- [ ] Add **gentle reminders**: an optional morning weather check-in and evening reflection, using web push.
- [ ] **Safety net.** After several stormy days in a row, quietly show support resources and helpline numbers for the user's country. This is expected of any wellbeing app.
- [ ] **Tests**: unit tests (Vitest) for dates, carry-over and streak maths, plus end-to-end tests (Playwright) for the main flows.
- [ ] **Accessibility**: screen reader labels, contrast checks for all 36 colour combinations, reduced-motion support.

**Done when:** a stranger can install it, use it for two weeks, export their data, and nothing breaks.

## Phase 2: Accounts, sync and privacy (weeks 6–9)

- [ ] **Backend: Supabase**, hosted in the EU. It provides login, a Postgres database and row-level security, and the free tier covers launch.
- [ ] **Sign in**: email magic link, plus Sign in with Apple and Google. Accounts stay optional: the app works fully without one, and an account adds sync.
- [ ] **Sync** in local-first style. The app writes to IndexedDB first, then pushes changes; each day is one record, and the newest edit wins. Test with two phones offline.
- [ ] **Encrypt journal entries** on the device before upload. This is a strong selling point for a reflection app.
- [ ] **GDPR basics**: privacy policy, terms, cookie-free analytics, "delete my account and data" in settings, a data export on request, and a data processing agreement with Supabase.

**Done when:** you can log in on a second phone and see the same days, and deleting the account removes everything.

## Phase 3: Payments (weeks 9–11)

- [ ] **Web payments through a merchant of record** (Paddle or Lemon Squeezy). They charge a bit more than Stripe but handle EU VAT, invoices and refunds, which saves a solo seller a lot of admin. Stripe Billing plus Stripe Tax is the alternative if you prefer more control.
- [ ] **Entitlements table** in the database: free, trial, plus_monthly, plus_yearly, lifetime. Payment webhooks update it, and the app reads it after login.
- [ ] **14-day trial**, a reminder 2 days before it ends, and a self-service way to cancel or manage the plan.
- [ ] **Paywall rules:** Plus adds features but never locks people out of their own entries. If a subscription ends, everything stays readable.

**Done when:** a test card can buy each plan, cancel, and refund, and access updates within a minute.

## Phase 4: App Store and Google Play (weeks 11–14)

- [ ] Wrap the app with **Capacitor** so the same code ships to iOS and Android.
- [ ] Developer accounts: Apple (US$99 a year), Google Play (US$25 once).
- [ ] **In-app purchases through RevenueCat.** The stores generally require their own payment system for digital subscriptions bought inside the app. RevenueCat links store purchases and web purchases to the same account.
- [ ] Native **local notifications** for reminders, which are more reliable than web push on iPhone.
- [ ] Store listing: screenshots, a short video, a privacy "nutrition label", and an age rating.
- [ ] Beta through **TestFlight** and a Google Play closed test with 30–50 people.

**Done when:** both stores approve the app and a beta tester can subscribe inside it.

## Phase 5: Plus features worth paying for (weeks 12–16, overlapping)

- [ ] **Monthly letter**: a kind written summary of patterns, such as "Your Bright days usually followed days you stepped outside." Start with rules-based insights. An AI-written version can come later, opt-in only, with the journal kept out of it unless the user says yes.
- [ ] **Seasonal palettes and app icons**, plus custom anchor icons.
- [ ] **Full history**, search across journal entries, and **PDF export** of a month or year.
- [ ] **Home screen widget** (iOS and Android) showing today's anchors.

## Phase 6: Launch (weeks 15–18)

- [ ] Landing page with a live demo, pricing and a waitlist (start collecting emails in Phase 1).
- [ ] Privacy-friendly analytics (Plausible) and crash reporting (Sentry).
- [ ] Track: day-1, day-7 and day-30 return rates, check-ins per week, trial-to-paid rate, and monthly cancellations.
- [ ] Launch channels: Product Hunt, Reddit wellbeing and planner communities, TikTok and Instagram "plan with me" videos, and a few wellbeing creators.
- [ ] Launch discount on the lifetime plan for the first 500 buyers.

---

## Running costs (rough, per month at launch)

| Item | Cost |
|---|---|
| Domain and email | €5–10 |
| Supabase (free tier, then Pro) | €0 → €25 |
| Hosting the web app (Netlify, Vercel or Cloudflare Pages) | €0 |
| Paddle or Lemon Squeezy | about 5% + €0.50 per sale |
| RevenueCat | free until US$2,500 a month in revenue |
| Apple developer account | about €8 (US$99 a year) |
| Analytics and error tracking | €0–15 |

Before marketing spend, Meander can run for under €50 a month.

## After launch: ideas to test

- Calendar import (read-only) so fixed appointments sit in the right tide.
- A shared anchor with a partner or friend, for gentle accountability.
- Apple Health and Google Fit: steps and sleep next to inner weather.
- Apple Watch complication for the weather check-in.
- Translations: German, Spanish and French first.
