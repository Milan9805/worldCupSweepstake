# FIFA World Cup 2026 Sweepstake

A serverless web application for managing sweepstake groups during the FIFA
2026 Men's World Cup. Features per-person dashboards, group stage tables, a
tournament bracket, a live activity feed, an honours board of side prizes,
multi-group switching, and an admin panel.

## Architecture

- **Frontend**: Next.js (static export) with Tailwind CSS
- **Backend**: TypeScript Lambda functions behind API Gateway
- **Database**: DynamoDB
- **Storage**: S3 (avatars)
- **Infrastructure**: Terraform
- **Android app**: installable PWA, wrapped as a Trusted Web Activity (TWA) and
  sideloaded as an APK — see [Android App](#android-app-sideloadable-no-play-store)

## Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Docker** (for DynamoDB Local)

## Local Development Setup

### Quick Start (one command)

```bash
npm run start:local
```

This starts DynamoDB Local, seeds the database, launches the API server, and
starts the frontend. Open <http://localhost:3000> and enter a group key
(e.g., `lads-on-tour`).

### Manual Setup (step by step)

### 1. Install dependencies

```bash
npm install
```

### 2. Start DynamoDB Local

```bash
docker-compose up -d
```

This starts a local DynamoDB instance on port 8000.

### 3. Seed the database

```bash
npx ts-node scripts/seed.ts
```

This creates the DynamoDB tables and seeds them with:

- 2 sweepstake groups with 6 members each
- 48 World Cup teams across 12 groups
- Sample match fixtures with some results

**Test credentials created by the seed script:**

| Item | Value |
| ------ | ------- |
| Group Key 1 | `lads-on-tour` |
| Group Key 2 | `office-sweepstake` |
| Admin Secret | `sweepstake-admin-2026` |

### 4. Start the API server

```bash
npm run api:local
```

The API runs on <http://localhost:3001>. It connects to DynamoDB Local
automatically.

### 5. Start the frontend

In a separate terminal:

```bash
npm run dev
```

The frontend runs on <http://localhost:3000> and proxies API calls to
localhost:3001.

### 6. Open the app

Navigate to <http://localhost:3000> and enter one of the group keys
(e.g., `lads-on-tour`).

### 7. Stop everything

```bash
npm run stop
```

This kills the API server, frontend dev server, and stops DynamoDB Local.

## Testing

### Unit & Component Tests

```bash
# Run all tests
npm test

# Run shared package tests (probability calculator)
npm test --workspace=packages/shared

# Run with coverage
npm test -- --coverage
```

### E2E Tests (Playwright)

```bash
# Install Playwright browsers (first time only)
npx playwright install --with-deps

# Run E2E tests (requires both API and frontend running)
npm run test:e2e
```

### PWA / Android assets

The PWA scaffolding (manifest, service worker, icons, asset-links) is covered by
unit tests in `packages/frontend/src/__tests__/pwa/`, which run as part of
`npm test`. The `assetlinks.json` SHA-256 fingerprint check is active now that
the real signing fingerprint is committed; it only auto-skips if the file is
reverted to the placeholder (see
[Android App](#android-app-sideloadable-no-play-store)).

## Project Structure

```text
sweepstake/
├── packages/
│   ├── frontend/          — Next.js app (static export)
│   │   ├── src/app/       — Pages (/, /dashboard, /groups, /bracket, /feed, /honours, /admin)
│   │   ├── src/components/— UI components
│   │   ├── src/hooks/     — Custom React hooks
│   │   └── src/lib/       — API client + group/identity registry
│   ├── api/               — Lambda handlers + Express local server
│   │   ├── src/handlers/  — API endpoint handlers
│   │   ├── src/clients/   — External API clients
│   │   ├── src/services/  — Business logic
│   │   └── src/db/        — DynamoDB access layer
│   └── shared/            — Shared types & utilities
│       └── src/
│           ├── types.ts   — TypeScript interfaces
│           ├── probability.ts — Win probability calculator
│           └── honours.ts — Honours-board prize calculator
├── infrastructure/        — Terraform IaC
│   ├── modules/           — Reusable Terraform modules
│   └── environments/      — Per-environment configs
├── scripts/
│   └── seed.ts            — Database seeding script
├── data/
│   └── seed.json          — Seed data (teams, groups, matches)
├── docker-compose.yml     — DynamoDB Local
└── package.json           — npm workspaces root
```

## API Endpoints

| Method | Path | Description |
| -------- | ------ | ------------- |
| GET | `/api/group/:key` | Get group data by key |
| GET | `/api/matches` | Get all matches |
| GET | `/api/teams` | Get all teams with stats |
| GET | `/api/bracket` | Get tournament bracket |
| GET | `/api/feed` | Recent activity-feed events (goals + scorers, yellow/red cards, kickoffs, half/full-time, eliminations) |
| POST | `/api/refresh` | Refresh scores + live minute + TV channels (BBC live overlay/fallback); also writes feed events |
| POST | `/api/admin/login` | Admin authentication |
| POST | `/api/admin/members` | Update group members |
| POST | `/api/admin/assign` | Assign teams to people |
| POST | `/api/admin/upload-avatar` | Get presigned upload URL |

The refresh response is `{ matches, teams, source, refreshedAt }`.

## Pages

- **/** — Entry page: group key + your name, plus a "Continue to your group" shortcut for a remembered session
- **/dashboard** — Per-person team dashboard with stats and leaderboard (you're pinned first; tap others to view their teams)
- **/groups** — Group stage tables and fixtures
- **/bracket** — Visual tournament bracket (R32 → Final)
- **/feed** — Live activity feed (goals + scorers, yellow/red cards, kickoffs, half/full-time, eliminations) with your events highlighted
- **/honours** — Honours board: side prizes derived from team stats
- **/admin** — Admin panel (member management, team assignment, avatar upload)

## Activity Feed, Honours Board & Identity

### Identity & multiple sweepstakes

- On the entry screen you enter the **group key and your name**. The name is
  matched **case-insensitively** to a member of that group and stored in its
  canonical form; a name that isn't a member is rejected (without revealing the
  group's members).
- Your identity and the groups you've joined live on the device in `localStorage`
  (the `sweepstake_groups` registry in
  [`packages/frontend/src/lib/groupRegistry.ts`](packages/frontend/src/lib/groupRegistry.ts))
  — there are still no server-side user accounts. A legacy single-group key is
  migrated into the registry automatically on first load.
- A device can belong to **several groups**. The nav bar shows a **group
  switcher**, the entry screen offers a one-tap **"Continue to your group"**
  shortcut when a session is remembered, and the logo routes to the dashboard
  while logged in.
- Identity is set **at login only** (re-login to change it). On the dashboard you
  can tap any member to view their teams — this is **view-only**, it never
  changes who you are, and you stay pinned first in the list.

### Live feed (`/feed`)

- A chronological timeline of tournament events — **goals (with scorer),
  yellow/red cards (with player), kick-offs, half-time, full-time results,
  eliminations, and bracket-drawn** — with team flags, scorelines, the
  owning member shown in brackets, and relative timestamps that tick while the
  page is open. Events involving **your** teams are highlighted.
- Events are detected during `/api/refresh` by diffing each match's previous vs
  new state
  ([`packages/api/src/services/detectEvents.ts`](packages/api/src/services/detectEvents.ts)),
  written to a dedicated DynamoDB **`Events`** table, and read back via
  `GET /api/feed`. Each event carries a deterministic `eventId`
  (e.g. `${matchId}#FULL_TIME`); because the `Events` sort key embeds the
  detection timestamp, a re-detected event can land in a new row, so
  `getRecentEvents` **dedupes by `eventId` at read time** (newest wins) to keep
  the feed clean. The monotonic merge guard (see [BBC scraper](#bbc-scraper-live-scores--fallback))
  stops a stale poll from re-triggering events, so this churn is rare in
  practice. The feed reuses the adaptive score-poll cadence (30s while a match
  is live, off when idle).

### Honours board (`/honours`)

- Side prizes derived purely from the team stats already tracked — **Most Goals,
  Best Defence, Cleanest, Dirtiest, Best Group-Stage Record, Deepest Run** —
  aggregated per member, so everyone has something to play for even after their
  teams are knocked out. Computed client-side
  ([`packages/shared/src/honours.ts`](packages/shared/src/honours.ts)); no extra
  fetching or endpoint.

## Deploying to AWS

### Requirements

- AWS account with appropriate IAM permissions
- Terraform >= 1.5
- football-data.org API key

### Steps

```bash
# 1. Build the frontend
npm run build --workspace=packages/frontend

# 2. Navigate to the environment
cd infrastructure/environments/dev

# 3. Initialize Terraform
terraform init

# 4. Plan and apply
terraform plan -var="football_data_api_key=YOUR_KEY" -var="jwt_secret=YOUR_SECRET"
terraform apply -var="football_data_api_key=YOUR_KEY" -var="jwt_secret=YOUR_SECRET"

# 5. Upload frontend to S3 (from output bucket name)
aws s3 sync ../../packages/frontend/out s3://BUCKET_NAME

# 6. Seed the production database
TABLE_PREFIX=sweepstake-dev- npx ts-node scripts/seed.ts
```

## Android App (sideloadable, no Play Store)

The site is an installable PWA, wrapped as a **Trusted Web Activity (TWA)** — a
thin (~1 MB) fullscreen Android shell that loads the live deployed site. Because
it points at the live URL, **redeploying the site updates the app for everyone
on next open; you only rebuild the APK when app metadata changes** (name, icon,
package id, signing key).

The PWA assets live in [`packages/frontend/public/`](packages/frontend/public/)
and are copied verbatim into the static export:

| File | Purpose |
| ------ | --------- |
| `manifest.webmanifest` | App name, colours, icons, `display: standalone` |
| `sw.js` | Network-first service worker (offline shell + installability) |
| `icons/*.png` | 192 / 512 / maskable launcher icons (generated from `src/app/icon.svg`) |
| `.well-known/assetlinks.json` | Digital Asset Links — proves site ↔ app ownership for fullscreen |

### 1. Test the PWA locally (no APK needed)

```bash
# Build the static export and serve it on localhost
npm run preview --workspace=packages/frontend
```

`localhost` is a secure context, so the service worker, manifest, and install
prompt all work over plain HTTP. Open <http://localhost:3000>, then check
Chrome DevTools → **Application** → Manifest + Service Workers; the Manifest
panel flags any installability errors. (Chrome's standalone Lighthouse PWA
category was removed, so use the Application tab rather than a Lighthouse audit.)

To try the install on a real phone before building anything:

```bash
adb reverse tcp:3000 tcp:3000   # phone's localhost -> this machine
# then open http://localhost:3000 in the phone's Chrome and "Add to Home Screen"
```

### 2. Build the APK, then sign it locally

PWABuilder's "signed APK" tab proved unreliable, so we let it emit an
**unsigned** APK and sign it ourselves with the Android SDK. This needs the SDK
**build-tools** (`apksigner`, `zipalign`) and a **JDK** (`keytool`) — both ship
with Android Studio. First deploy the site (see
[Deploying to AWS](#deploying-to-aws)) so PWABuilder can read the live manifest,
and confirm it's installable (Step 1).

**a. Get the unsigned APK.** At [pwabuilder.com](https://www.pwabuilder.com)
enter your live URL (the CloudFront URL) → **Package for
stores → Android**. Set a permanent reverse-DNS **Package ID**
(`com.makwana.sweepstake` — never change it; it's half of the asset-links
pairing) and **Download Package**. The bundled `…-unsigned.apk` is all you need.

**b. Sign it** (one-time keystore, then align + sign — adjust paths/build-tools
version):

```bash
SDK="$HOME/Library/Android/sdk"; BT="$SDK/build-tools/37.0.0"
KS="$HOME/sweepstake-android/sweepstake.keystore"
UNSIGNED="$HOME/Downloads/Sweepstake - Google Play package/World Cup Sweepstake-unsigned.apk"

# one-time: create the signing key (kept OUTSIDE the repo; prompts for a password)
keytool -genkeypair -v -keystore "$KS" -alias sweepstake \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Sweepstake, O=Sweepstake, C=GB"

# align, then sign — apksigner writes v1+v2+v3 (v2+ is required to install on modern Android)
"$BT/zipalign" -p -f 4 "$UNSIGNED" sweepstake-aligned.apk
"$BT/apksigner" sign --ks "$KS" --ks-key-alias sweepstake \
  --out sweepstake-signed.apk sweepstake-aligned.apk

# read the SHA-256 fingerprint (colon-hex form) for assetlinks.json
keytool -list -v -keystore "$KS" -alias sweepstake | grep SHA256
```

`sweepstake-signed.apk` is the installable, distributable app. Test it on an
emulator or device with `adb install -r sweepstake-signed.apk`.

> **Back up the keystore + its password** (the live one is at
> `~/sweepstake-android/sweepstake.keystore`). Every future update APK must be
> signed with the same key or Android rejects it as a different app.
> Keystores/APKs are gitignored (`*.keystore`, `*.jks`, `*.apk`, `*.aab`) —
> never commit them.

### 3. Wire up Digital Asset Links (removes the URL bar)

The SHA-256 fingerprint from step 2 goes into
[`packages/frontend/public/.well-known/assetlinks.json`](packages/frontend/public/.well-known/assetlinks.json),
then you redeploy. **This is already wired in and deployed** — the committed file
holds the current signing fingerprint. To re-verify (or after re-signing):

```text
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=<YOUR_SITE_URL>&relation=delegate_permission/common.handle_all_urls
```

It should return your statement with no errors. With the real fingerprint
committed, the `assetlinks.test.ts` fingerprint-format check is active and runs
on every `npm test`. If you ever re-sign with a new key, update the fingerprint
here and redeploy, or the app loses fullscreen (falls back to a URL bar).

### 4. Distribute & update

- **Your own phone** (fastest): with USB debugging on, `adb install -r sweepstake-signed.apk`.
- **Friends**: share the APK link-only via Google Drive / Dropbox ("anyone with
  the link") — it's **not** hosted on the public site, so only people you send
  the link to can download it, and the link is revocable.
- On each phone: download → tap the file → Android prompts to "allow this source
  to install apps" (one-time per installer) → install. Play Protect may flag it
  as unrecognised (it's not from the Play Store) → **Install anyway**.
- **Updates**: redeploy the site → everyone gets it on next app open. When you
  change `sw.js`, bump its cache name (`sweepstake-v1` → `-v2`). Only rebuild
  and resend the APK for metadata changes (name / icon / package id /
  fingerprint), signing with the same keystore.

## Configuration

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

| Variable | Description | Default |
| ---------- | ------------- | --------- |
| `NEXT_PUBLIC_API_URL` | API base URL for frontend | `http://localhost:3001` |
| `IS_LOCAL` | Use local DynamoDB endpoint | `true` |
| `TABLE_PREFIX` | DynamoDB table name prefix | (empty) |
| `JWT_SECRET` | Admin JWT signing secret | `dev-secret-change-in-production` |
| `FOOTBALL_DATA_API_KEY` | football-data.org API key | (required for refresh) |
| `PORT` | API server port | `3001` |

## Football Data API Setup

The app fetches live scores and fixtures from
[football-data.org](https://www.football-data.org/) (v4 API).

### 1. Register for an API key

Sign up at <https://www.football-data.org/client/register>. The **free tier**
allows 10 requests/minute and includes World Cup data.

### 2. Set the environment variable

Add to your `.env` file:

```bash
FOOTBALL_DATA_API_KEY=your-api-key-here
```

For AWS deployments, pass it as a Terraform variable:

```bash
terraform apply -var="football_data_api_key=YOUR_KEY" -var="jwt_secret=YOUR_SECRET"
```

### 3. How it works

- The `POST /api/refresh` endpoint fetches all matches for the configured
  competition from football-data.org
- Match scores, statuses, and fixtures are merged into DynamoDB
- A 20-second cooldown is enforced server-side (one refresh per 20s globally,
  regardless of how many users click), well within the free tier's 10/min
  limit
- The competition ID is configured in
  `packages/api/src/clients/footballData.ts` as `2000` (football-data.org's
  persistent ID for the FIFA World Cup; the current season under that ID is
  the 2026 edition)

### 4. What it provides

- Match schedules (dates, times, venues)
- Final results once a match is over
- Group stage and knockout stage classification

> ⚠️ **The free tier does not push live, in-play data.** During a match it keeps
> returning the fixture as `TIMED` (→ `SCHEDULED`) with a null score until the
> game is over — it never flips to `IN_PLAY` or carries a running scoreline.
> Live scores, status, and the match minute therefore come from the **BBC
> scraper** (see below), which the refresh consults whenever a match is in its
> active window — not just when the API errors.

### 5. Rate limits

| Plan | Requests/minute |
| ------ | ---------------- |
| Free | 10 |
| Standard | 30 |
| Advanced | 60 |

## BBC Scraper (live scores + fallback)

The BBC scraper plays **two roles**, because football-data.org's free tier
doesn't serve in-play data (see the caveat above):

1. **Live overlay (primary live source).** Whenever a match is in its active
   window, `/api/refresh` scrapes BBC **on top of** the successful
   football-data.org sync and overlays the live `homeScore`, `awayScore`,
   `status`, match `minute`, and per-player `actions` (goals + bookings). This
   drives live scores and the KICKOFF / GOAL (with scorer) / HALF_TIME /
   FULL_TIME / YELLOW_CARD / RED_CARD feed events, plus the per-team card counts.
2. **Outage fallback.** If the football-data.org call itself fails (rate limit,
   outage, expired key, etc.), the refresh falls back to BBC for the whole sync.

The response includes a `source` field so callers know which path was used:

| `source` | Meaning |
| ---------- | --------- |
| `api` | football-data.org returned fresh data; no live BBC patch applied this cycle |
| `bbc` | scores/minute came from BBC — either the live overlay patched a match, or the API failed and BBC was the fallback |
| `cache` | within cooldown, or both sources failed — returns DynamoDB state |

When `source === 'bbc'`, the navbar shows an amber **"via BBC"** badge next to
the Refresh button.

### Don't-regress merge guard

Because the free-tier API keeps returning a live match as `SCHEDULED` with null
scores, the merge **never lets a stale source regress live state**: a known
score is never overwritten back to `null`, and a status never moves backwards
(`LIVE`/`FINISHED` → `SCHEDULED`). A genuine downward score correction (VAR) is
still allowed — that's number → smaller number, not number → null. Without this,
each API poll would wipe the score BBC just supplied and re-fire phantom
kickoff/goal events.

### Lifecycle constraint

The BBC patch **only touches `homeScore`, `awayScore`, `status`, `minute`, and
`actions` on matches that already exist in DynamoDB**. It never creates new rows.
That means football-data.org (or seed data) must have populated the fixtures
table at least once with the correct `stage`, `group`, `datetime`, and team TLAs
before BBC can do anything useful. Fixtures BBC reports that don't correspond to an
existing row are silently dropped, as are knockout placeholders ("TBC" /
"Winner Group A" etc.).

### How it works

BBC's fixture pages are a client-rendered SPA, but they server-render a JSON
hydration blob into `window.__INITIAL_DATA__`. The scraper extracts that blob,
walks
`data["sport-data-scores-fixtures..."].data.eventGroups[].secondaryGroups[].events[]`,
and maps each event's team `fullName` to a TLA via
[`packages/shared/src/teamNames.ts`](packages/shared/src/teamNames.ts). Both
`2026-06` and `2026-07` pages are fetched in parallel and deduped by
`(homeTLA, awayTLA, date)`. A live match is `status: "MidEvent"` with the clock
in `statusComment` (`"19'"`, `"45+2'"`, `"HT"`); the scraper maps `MidEvent` →
`LIVE` and carries that clock through as the match `minute` (only while live, so
a finished row never shows a stale clock). `MatchList` renders it beside the
**LIVE** badge.

### Player actions, cards & the per-match page

The fixtures feed also carries each match's **goals and red cards** (per player,
with the scorer/bookee name and minute), which the scraper flattens onto
`Match.actions`. **Yellow cards are *not* in that feed** — BBC only lists "key
events" there — so for in-play matches the refresh additionally fetches BBC's
**per-match page** ([`bbcMatchPage.ts`](packages/api/src/clients/bbcMatchPage.ts);
`/sport/football/live/<id>`, linked from each fixture) and reads the full booking
list (yellows + reds) from its lineup data. These actions drive the GOAL-scorer /
YELLOW_CARD / RED_CARD feed events and the per-team card counts. The match page
is authoritative for cards, so a red reported by both sources is de-duped rather
than doubled. Goal-scorer attachment reconciles each poll, so a scorer that
arrives a poll after the score still lands on the goal (same `eventId`, newest
wins at read time).

### Team standings (derived from results)

The group table (`Team.stats`: P/W/D/L, GF/GA/GD, points) is **computed from the
stored, BBC-driven match results** ([`teamStats.ts`](packages/api/src/services/teamStats.ts)),
not a separate standings feed. football-data has a standings endpoint, but it
lagged and could contradict the live scoreline (rendering a 2-1 win as a 1-1
draw), so the table is derived from the same finished matches shown everywhere
else and can't disagree with them. Card counts come from `Match.actions`. Both
feed the dashboard, the group table, qualification, and the knockout bracket
seeding.

### Verifying live scores / the fallback locally

```bash
# The live overlay runs automatically whenever a match is in its active window.
# To force the *fallback* path, temporarily set an invalid API key (or unset
# FOOTBALL_DATA_API_KEY and restart api:local), then click Refresh, or:
curl -s -X POST http://localhost:3001/api/refresh | jq '.data.source'
# → "bbc"
```

## TV Channel Listings

`/api/refresh` also enriches matches with the UK broadcast channels showing
each game, scraped from
[live-footballontv.com](https://www.live-footballontv.com/live-world-cup-football-on-tv.html).
The channels are stored on `Match.channels` as `{ name, bg, fg }` objects —
each carrying the broadcaster's brand colours scraped verbatim from the source
(e.g. `{ name: "ITV1", bg: "#127b60", fg: "rgba(255,255,255,1)" }`) — and
rendered as colour-coded pills under each fixture in the `MatchList` component.

### How channel scraping works

The site server-renders fixtures as a flat list of sibling `<div>`s: a
`fixture-date` header sets the current day, then each `fixture` block carries
`fixture__time`, `fixture__teams` ("Mexico v South Africa"),
`fixture__competition`, and a set of `channel-pill` spans. The scraper
([`packages/api/src/clients/footballTvScraper.ts`](packages/api/src/clients/footballTvScraper.ts))
walks these tokens in document order, maps each team name to a TLA via
[`packages/shared/src/teamNames.ts`](packages/shared/src/teamNames.ts), and
collects each channel pill's name and inline brand colours. Storing the colours
verbatim keeps the UI correct with no hardcoded colour map, even as
broadcasters change.

### Channel scrape constraints

The channel scrape is an **independent, best-effort step**: the channel source
is unrelated to scores, so a failure is logged and never blocks a score
refresh. Like the BBC fallback, it **only patches existing matches** (matched
by unordered team pair) and never creates rows. Redundant writes are skipped
when the channel list is unchanged.

## Key Design Decisions

- **Winner takes all**: The person whose team wins the final wins the
  sweepstake. The **honours board** adds side prizes so eliminated players stay
  in it
- **Manual + background refresh**: a user-triggered refresh button with a 20s
  global cooldown, plus a scheduled background refresh while matches are live.
  football-data.org seeds fixtures/schedule; BBC scraping is the live source
  (and the automatic fallback when the API errors). Each refresh also derives
  **feed events** (goals + scorers, cards, kickoffs, half/full-time, eliminations)
  and **team stats** (the group table from results, card counts from match actions)
- **Static export**: Frontend is pure static HTML/JS served from S3/CloudFront
- **Shared group key + on-device identity**: a passphrase per group (no
  server-side accounts); each device remembers who you are and which groups
  you've joined in `localStorage`
- **Admin auth**: Separate bcrypt-hashed secret, independent of group keys
