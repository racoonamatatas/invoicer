# Invoicer

[![CI](https://github.com/racoonamatatas/invoicer/actions/workflows/ci.yml/badge.svg)](https://github.com/racoonamatatas/invoicer/actions/workflows/ci.yml)

An invoicing app designed with Dutch freelancers (zzp'ers) in mind. Today you
can set up your business and bank accounts and keep a list of clients. Drawing
up invoices, with the BTW worked out per line, is in progress.

It is also a learning project. It is built in small steps, and wherever there
was a choice between a loose design and a stricter one, it takes the stricter
one.

## Stack

- **Backend:** Laravel 13, Sanctum (SPA cookie auth), SQLite, Pest
- **Frontend:** Vue 3.5, TypeScript 6, Vite, Pinia, Vue Router, Vitest

## Running it locally

You need PHP 8.5 with Composer, and Node 24 (what CI uses; 22.18+ also works).

```bash
# Backend: installs, creates .env and the SQLite database, runs the migrations
cd backend
composer run setup
composer run dev          # http://localhost:8000

# Frontend, in a second terminal
cd frontend
npm ci
npm run dev               # Vite on :3000, serves assets only
```

Open **http://localhost:8000**. Laravel serves the page and the `/api` routes,
and its Blade shell loads the scripts from Vite.

To get an account:

1. Register with any email address.
2. Mail is written to the log, not sent. Open `backend/storage/logs/laravel.log`
   and find the "Set password" link.
3. Open the link, enter your name and a password, then log in.

## Running the checks

These are the same checks CI runs on every push to `main` and every PR.

```bash
# Backend (from backend/)
php artisan test --compact
vendor/bin/pint --test

# Frontend (from frontend/)
./node_modules/.bin/vitest run
./node_modules/.bin/vue-tsc --build --force
./node_modules/.bin/eslint .
./node_modules/.bin/oxlint .
```

Use these rather than the npm scripts: `npm run test:unit` starts Vitest in
watch mode and never exits, and `npm run lint` changes files with `--fix`.

## Design decisions

**Data from the network is checked at runtime.** TypeScript types disappear at
runtime, so a response body typed as `Client` is only a claim. Every service
runs the body through a type guard (`isClient`, `isBusiness`, …) before the rest
of the app sees it. A missing key or a wrong type is an error at the boundary,
not a bug three components later.

**Unions instead of optional fields.** A Dutch address and a foreign address are
two types, each with its own postcode and region rules, not one type with
optional fields that might or might not apply. The same goes for a failed form
submit: a validation error, a rate limit, an ended session and anything else are
separate cases, told apart by a `kind` field that TypeScript narrows on.

**Money and quantities are integers.** Prices are stored in cents and
quantities in hundredths (1,5 hours is `150`), so totals and BTW never pick up
floating-point rounding errors.

**Validation lives in one place per rule.** IBAN, KvK number, Dutch postcode,
EU VAT number and the like are each their own validation rule class with their
own tests, reused across requests.

**Thin controllers, one action per use case.** A controller validates the
request, turns it into a typed input object, and hands it to an action class
(`CreateClientAction`, …). The business logic can be tested without HTTP.

**Cookie auth, not tokens in local storage.** The SPA and the API share an
origin, so Sanctum's session cookie works: it is `HttpOnly`, so page scripts
can't read it, and CSRF is covered by Sanctum's XSRF cookie.

## Conventions

- Every new test is proven to fail: it is run against deliberately broken code
  first, to show it catches the bug it is named after.
- Test names state what is asserted, including the status code:
  `should return 429 (too many requests) on the 6th login from one IP within a minute`.

## Documentation

- [`docs/database.dbml`](docs/database.dbml): the database schema
- [`backend/CLAUDE.md`](backend/CLAUDE.md) and
  [`frontend/CLAUDE.md`](frontend/CLAUDE.md): conventions per side
