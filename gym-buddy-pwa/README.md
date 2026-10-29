# Gym Buddy

A single-user fitness tracker for **Tenzo**, installable for Cloudflare Pages + Pages Functions + D1. The frontend uses browser-native JavaScript, CSS and IndexedDB. There is no third-party analytics or external font dependency.

## Included

Entry forms are scoped to their data model. See [FORM_AUDIT.md](FORM_AUDIT.md) for the field-by-field audit. Water, meals and workouts record editable IST times; workout fields adapt to the activity and body measurements are separate from DEXA scans.

- Today dashboard with dated targets, planned actions, completed actions and remaining amounts.
- Dashboard gym checklist with exercise targets, photo tutorials and saved completion status. Log / update opens the scheduled exercises, preserves actual sets, reps and weight, and edits the existing session. Before the schedule starts, the first workout is previewed; recovery days offer a recovery check-in.
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

To check the dashboard's mobile tutorials, partial completion, editing, offline reload and sync, start a synthetic preview with `GYM_BUDDY_TEST_MODE=1 PORT=8793 npm run dev`, then run `npm run test:dashboard`. The browser test uses the synthetic profile and records only.

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
- No automatic Samsung Health/watch connection, barcode scanner, food database, scheduled push notification, or medical diagnosis is implemented.
- Calorie estimates are starting estimates. The app does not automatically prescribe calorie cuts or add back watch calorie estimates.
- Initial water/protein targets and exercise progression are editable suggestions, not individualized clinical advice. Review dietary/fluid restrictions and symptoms with an appropriate professional.
- The service worker caches app assets only, never API responses. Clearing cookies alone does not remove IndexedDB; use the device-copy removal action on shared devices.
- Operations and deletion tombstones are retained to keep offline retries safe. There is no automatic cloud-history deletion feature.

## Layout

`public/` contains the PWA and shared validation/analysis logic. `functions/` contains production auth and D1 API handlers. `migrations/` defines D1 tables and receipts. `scripts/` contains build, setup and local-preview helpers. `tests/` contains logic, API, queue and browser checks. `dist/`, `.private/`, `.dev.vars`, production configuration and local databases are ignored.

## Exercise library and AI coach

Movement → **Exercise library** contains 876 exercises from [Free Exercise DB](https://github.com/yuhonas/free-exercise-db), pinned in `public/exercises/SOURCE.json` with its license. Search by name, muscle, equipment or difficulty; open demonstration photos and instructions, then add exercises to a workout. Mark completed exercises and optionally record sets, reps and weight in kg. Each workout records its duration once. Older activity logs remain editable. The catalog works offline after the app loads; demonstration photos work offline once viewed. These assets are static photos, not GIFs. Some source entries lack photos or written instructions; the guide explains when content is unavailable.

Movement → **AI coach** supports exercise Q&A, workout suggestions and photo/video form observations through OpenRouter. Configure `OPENROUTER_API_KEY` as a **Cloudflare Pages secret**, plus optional `OPENROUTER_TEXT_MODEL` and `OPENROUTER_VISION_MODEL` variables. Both default to `deepseek/deepseek-v4.1-flash-1017`; choose an image-capable model for vision. Model availability and prices change; check [OpenRouter models](https://openrouter.ai/models) before enabling. Apply migration `0002_ai_usage.sql` with the existing database migration command before using AI.

For the portable local preview, export these variables in the server process environment (it does not load `.dev.vars`). The Cloudflare emulator uses `.dev.vars`. Without a key the coach displays setup guidance; exercise browsing/logging still works.

AI calls require an explicit send action and sharing checkbox. Only recent synced activity details are included when selected; profile, DEXA, meals and free-text workout notes are excluded. Chat/media are kept only in the current dialog, not D1, IndexedDB, backups, or the offline queue. Shared content is processed by OpenRouter and its selected model provider under their data policies. Up to four JPEG frames are sampled locally from a photo or video under 25 MB and 60 seconds. This is limited visual feedback, not live coaching or a technique/safety certification. Outputs never alter logs or schedules automatically.

Optional reasoning is disabled to conserve tokens. For a model requiring reasoning, set `OPENROUTER_REASONING_ENABLED=true`; its reasoning shares the output budget and may leave little room for an answer. Requests allow 900 output tokens and at most 30 attempted provider calls per owner per IST day, including failed upstream calls. This is a usage cap, not a dollar budget; set a spending limit on the OpenRouter key as well. Provider errors, offline use and missing setup show retryable guidance. No real provider requests are made by automated tests. Run `npm run test:exercises` against a synthetic preview on port 8790 for the exercise flow.

### OpenRouter key settings and meal photos

**Settings & data → OpenRouter API key** shows whether the current server has a key and opens the Cloudflare dashboard. Select the `gym-buddy` Pages project, then **Settings → Variables and Secrets**. Add or update `OPENROUTER_API_KEY`, select **Encrypt**, save, and redeploy. Return to the app and recheck the connection. The app never displays, stores locally, or edits the secret itself; key entry takes place in Cloudflare. See [Cloudflare Pages secrets](https://developers.cloudflare.com/pages/functions/bindings/#secrets).

**Log a meal → Estimate calories from a photo** accepts an uploaded image or camera photo. Add portion details, select the sharing checkbox and request an estimate. OpenRouter uses the configured vision model to suggest a meal name, portion, calories, protein and assumptions. These are approximate estimates, especially for portion size, oil and hidden ingredients. **Use this estimate** fills editable meal fields; **Discard estimate** leaves them unchanged. Save the meal separately after review. Date, time and notes are preserved. Photos are not added to saved meals, backups or the offline queue, and are not uploaded automatically. Manual meal logging works without an API key or internet connection. Meal estimation shares only the selected image and entered meal name/portion, and uses the same daily AI request cap.

Verify the meal-photo flow with `npm run test:meal-photo` against a synthetic preview on port 8792, or set `TEST_URL` to your local synthetic preview. This browser check mocks AI responses and makes no paid requests.
