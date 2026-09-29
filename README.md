# Surpluss Catalogue

A catalogue and enquiry portal for managing products, publishing buyer-facing catalogues, and tracking leads.

## Requirements

- Node.js 22 or later
- Docker with Docker Compose, or a local PostgreSQL 17 database

## Local setup

1. Install dependencies:

   ```powershell
   npm ci
   ```

2. Start PostgreSQL if using the provided Compose service:

   ```powershell
   docker compose up -d postgres
   ```

3. Create a local environment file from the safe template:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Set a unique local `AUTH_SECRET` in `.env`. Generate one with:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

5. Apply migrations and seed local development data:

   ```powershell
   npm run db:deploy
   npm run db:seed
   ```

6. Start the application:

   ```powershell
   npm run dev
   ```

The local application runs at `http://localhost:3001`.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npx playwright test
```

The pull request workflow in `.github/workflows/pull-request.yml` runs lint, type checking, Vitest, and the seeded Playwright buyer journey. It provisions a disposable PostgreSQL service for E2E tests.

## Credentials and secrets

- Never commit `.env`, production environment files, database credentials, API tokens, or private keys.
- `.env*` is ignored by Git; `.env.example` contains placeholders and local-only defaults, not usable credentials.
- Store deployment secrets in the hosting provider's secret manager or GitHub Actions secrets, never in workflow source.
- The seeded `admin@catalogue.test` and `staff@catalogue.test` accounts are local test accounts only. Do not use these credentials in a deployed environment.
- If a real credential was ever pushed to a public or shared remote, rotate it at its issuing service. Removing it from the latest commit does not remove it from Git history.

## Pull requests

Open a pull request to run the automated checks. Test, lint, and typecheck failures are intended to block merging. Playwright diagnostics are uploaded when available and their upload failure does not override the test result.
