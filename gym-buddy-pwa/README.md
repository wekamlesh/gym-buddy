# Gym Buddy

A single-user fitness tracker for **Tenzo**, installable for Cloudflare Pages + Pages Functions + D1. The frontend uses browser-native JavaScript, CSS and IndexedDB. There is no third-party analytics or external font dependency.

## Included

Entry forms are scoped to their data model. See [FORM_AUDIT.md](FORM_AUDIT.md) for the field-by-field audit. Water, meals and workouts record editable IST times; workout fields adapt to the activity and body measurements are separate from DEXA scans.

- Today dashboard with dated targets, planned actions, completed actions and remaining amounts.
- Meals with portion descriptions, calories and protein; reusable saved meals. Nutritional values are entered explicitly, not inferred from a name.
- Quick/custom water logging; edit and delete any entry.
- Walking, walk–run, strength, badminton and other activity logs; optional manual Samsung Watch heart rate and estimated calorie readings.
- Daily steps, sleep, notes, food-completeness and recovery check-ins.
- Dated weight, waist, chest, hips, arm and DEXA measurements; weight trend and 7/30-day plan analysis.
- Editable November beginner schedule, initially 11 AM IST, plus a calorie-needs calculator. Calorie targets are optional.
- Private sign-in using Cloudflare Access. API checks JWT signature, issuer, audience, expiry and the allowed owner email.
- Cloud records in D1; local IndexedDB outbox for offline use; automatic retry and refresh while the app is open.
- Record-level conflict review, transactional idempotency receipts and versioned deletion tombstones.
- JSON backup export/import, installable manifest, offline service worker and explicit app-update notice.

## Start locally

Use Node **22.13 or later** and npm. From this directory:

```bash
npm ci
npm test
npm run dev
```

Open `http://127.0.0.1:8788`. The portable dev server runs the same production API handlers against SQLite in `.private/gym-buddy.sqlite`. It uses the owner email from `.private/deployment.json` (or `local@example.test` when not configured) and displays a local-development banner. This is not production cloud storage. The local bypass only accepts loopback hostnames; production fails closed without Access configuration.

For Cloudflare's native emulator:

```bash
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev:cloudflare
```

## Deploy

Follow [DEPLOY.md](DEPLOY.md). The intended custom hostname is `gym.kamleshmerugu.me`; it is a planned address until Cloudflare confirms the domain and deployment. The default `wrangler.jsonc` has a deliberately invalid placeholder database ID for production. A separate, ignored `wrangler.production.json` is generated only after account-specific configuration.

The private DEXA baseline is `.private/dexa-baseline.json`, excluded from Git and the build. The local server and production deployment initialize the owner profile from this file automatically, only when a profile does not already exist. First sign-in opens the dashboard without a statistics questionnaire or manual import. Tenzo is the fixed owner. Settings edits daily goals and workout settings without requesting personal details or changing the report baseline. Transfer this private file separately if deploying from another checkout. No personal scan measurements or owner email are embedded in the public frontend source. See [ARCHITECTURE.md](ARCHITECTURE.md) for the diagrams.

## Verification

```bash
npm test
npm run build
npx wrangler pages functions build --outdir .private/functions-build
npx playwright install chromium
# Start a separate synthetic-data preview first:
# GYM_BUDDY_TEST_MODE=1 npm run dev
npm run test:browser
npm run test:forms
```

The browser test uses a synthetic profile and records in the separate `.private/browser-tests.sqlite` database when the server is started with `GYM_BUDDY_TEST_MODE=1`. Run it against a disposable local database, not a production URL. It exercises automatic profile loading without registration, offline reload, independent device sync, conflicting edits, food completeness, workouts, measurements, calculator, backup review and mobile layout. Screenshots and test exports go to ignored `test-results/`.

## Data behavior

Every mutation is first committed to IndexedDB, then sent with a unique operation ID and expected server version. D1 writes and operation receipts run in the same transaction. Retrying the same operation cannot create an extra log. Stale edits return a conflict. A blocked edit prevents later edits of the same record from bypassing conflict review. Other records may continue syncing.

Online, visible apps refresh every 30 seconds and on focus/reconnection. This is periodic sync, not live WebSocket sync. Offline queues require the app to be open again before uploading. Entries from different devices merge by unique record ID. Server reads use a primary D1 session. Conflicts show the two versions and require choosing one explicitly.

Only food days explicitly marked complete contribute to calorie/protein averages. Water averages use days with water entries; missing days remain unknown. Planned-session counts exclude future dates and dates before the plan start. Badminton may fulfill a walking target when logged minutes reach that day's target; it does not replace strength.

## Privacy and current limits

- Access must protect the **entire custom hostname**, including `/api/*` and `/signin`. D1 API authentication is also enforced independently. Alternate `pages.dev` hosts cannot read records without a valid owner JWT.
- An offline browser copy is accessible to anyone who can use that device's browser profile. It is not separately encrypted or protected by an app PIN. Settings can export a backup, then remove the device copy and sign out.
- Backups contain private health data. Cloud storage is not a substitute for keeping a backup; browser clearing can erase unsynced records.
- No automatic Samsung Health/watch connection, barcode scanner, food database, photo analysis, scheduled push notification, or medical diagnosis is implemented.
- Calorie estimates are starting estimates. The app does not automatically prescribe calorie cuts or add back watch calorie estimates.
- Initial water/protein targets and exercise progression are editable suggestions, not individualized clinical advice. Review dietary/fluid restrictions and symptoms with an appropriate professional.
- The service worker caches app assets only, never API responses. Clearing cookies alone does not remove IndexedDB; use the device-copy removal action on shared devices.
- Operations and deletion tombstones are retained to keep offline retries safe. There is no automatic cloud-history deletion feature.

## Layout

`public/` contains the PWA and shared validation/analysis logic. `functions/` contains production auth and D1 API handlers. `migrations/` defines D1 tables and receipts. `scripts/` contains build, setup and local-preview helpers. `tests/` contains logic, API, queue and browser checks. `dist/`, `.private/`, `.dev.vars`, production configuration and local databases are ignored.
