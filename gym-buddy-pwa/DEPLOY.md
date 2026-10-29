# Deploy to your Cloudflare account

The app is prepared for **Cloudflare Pages**, **D1** and **Cloudflare Access**, with the intended custom hostname **gym.kamleshmerugu.me**. No production database, DNS record or Access application has been created by this checkout. A live deployment requires authentication to the Cloudflare account that owns the domain.

## 1. Authenticate and install

Use Node 22.13+ and npm, then run from `gym-buddy-pwa/`:

```bash
npm ci
npx wrangler login
npx wrangler whoami
```

Authenticate in the browser using the account that owns `kamleshmerugu.me`. Do not paste API tokens or sign-in codes into chat or commit them. If using an API token instead, set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your own terminal environment. Keep account credentials outside the source tree.

## 2. Create a D1 database

```bash
npx wrangler d1 create gym-buddy --location apac
```

Copy the returned database UUID. If you already have a database named `gym-buddy`, inspect it with `npx wrangler d1 list` and reuse its ID rather than creating another one. The location is a hint, not a data-residency guarantee.

## 3. Set up private sign-in

In Cloudflare Zero Trust:

1. Configure your team domain and enable the One-time PIN login method (or your preferred identity provider).
2. Add a **self-hosted Access application** for the entire hostname `gym.kamleshmerugu.me`, with no path restriction.
3. Create an **Allow** policy whose email selector includes only your chosen sign-in email. Do not add Everyone, Bypass, public or group rules.
4. Copy the application's **Application Audience (AUD) Tag** and your team domain, `https://YOUR-TEAM.cloudflareaccess.com`.

The requested owner email and hostname are saved locally in ignored `.private/deployment.json` when available. If using another checkout, provide the owner email explicitly below.

## 4. Generate production configuration

```bash
npm run configure -- \
  --database-id YOUR_D1_DATABASE_UUID \
  --team-domain https://YOUR-TEAM.cloudflareaccess.com \
  --aud YOUR_APPLICATION_AUDIENCE \
  --email YOUR_ALLOWED_EMAIL
```

The script produces **wrangler.production.json**, ignored by Git. It contains the real D1 binding and these runtime variables:

| Variable | Purpose |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | Trusted Cloudflare Access issuer and signing-key endpoint |
| `ACCESS_AUD` | This application's audience tag |
| `ALLOWED_EMAIL` | Only allowed health-record owner |

Never add `DEV_USER_EMAIL` to production variables. The API fails closed if required sign-in variables are missing. The D1 binding must be named **DB**.

Apply the production schema:

```bash
npm run db:remote
```

## 5. Create the Pages project and deploy

```bash
npx wrangler pages project create gym-buddy --production-branch main
npm test
npm run deploy
```

If the project already exists in this Cloudflare account, reuse it and skip project creation. The deploy command first initializes the private owner profile in D1 from `.private/dexa-baseline.json`, without overwriting existing profiles. It then deploys `dist/` **together with the root functions/ directory**, using the real production configuration. Keep that directory structure: uploading only static files through a dashboard drag-and-drop does not deploy the API.

For a Git-connected Pages deployment instead, set root directory to `gym-buddy-pwa`, build command `npm run build`, output directory `dist`, and a supported Node 22 version. Configure `DB` and all three Access variables in the Pages project dashboard for the production environment. Use `npm ci` for dependency installation. Apply D1 migrations and run `npm run profile:remote` from the private configured checkout before the first sign-in. Keep `.private/dexa-baseline.json` on that checkout; it must never be committed or copied to `public/` or `dist/`. Do not connect preview deployments to production health data; either provision a separate protected environment or leave previews without database/auth bindings.

## 6. Attach the custom domain

In **Workers & Pages → gym-buddy → Custom domains**, add `gym.kamleshmerugu.me`. Follow Cloudflare's domain verification and DNS instructions in the account that owns the zone. Wait for the domain and certificate to become active. Confirm the Access application from step 3 covers this hostname before entering health records.

Open the exact URL returned by Cloudflare. Deployment is not verified until a deployment reports success and sign-in works on the custom domain. Protect preview access separately if you enable previews. The app's own JWT checks remain required even when Access guards the hostname.

## 7. Verify your automatically configured profile

1. Open the custom hostname in a private browser window. It must require sign-in; an unallowed email must not gain access.
2. Sign in with the allowed email. The dashboard should open directly with your DEXA profile; no statistics questionnaire or manual baseline import is required.
3. Deployment initializes a missing profile from the private report file, with an editable plan beginning **1 November 2026 at 11:00 IST**. Targets can be reviewed and edited in Settings. Existing profiles are preserved on subsequent deployments.
4. Log a small water entry. Wait for **All changes saved**.
5. Sign in on your second device. It should display the same entry after syncing.
6. Disconnect one device, add another entry, reconnect and verify that the entry appears once on the other device.
7. Install the PWA from the browser menu. Recheck offline opening after the first successful online load.
8. Export a backup and keep it privately.

## Official references

- [Pages Functions bindings, including D1](https://developers.cloudflare.com/pages/functions/bindings/)
- [Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [D1 batch transactions and sessions](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Cloudflare Access JWT verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Cloudflare Access session management](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)
