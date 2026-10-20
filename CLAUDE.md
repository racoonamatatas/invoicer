# Invoicer

An invoicing app for Dutch freelancers (zzp'ers). It's also a learning project:
it's built in small steps, every step gets explained, and when there's a choice
between a loose design and a stricter one, the stricter one comes first.

Laravel 13 + Sanctum (SPA cookie auth) + SQLite + Pest in `backend/`.
Vue 3.5 + TypeScript 6 + Vite + Pinia + Vue Router + Vitest in `frontend/`.

This repo is **public**: no secrets, no private URLs, no details about other codebases.

## Where to look

- [`backend/CLAUDE.md`](backend/CLAUDE.md): Laravel conventions and the Boost guidelines
- [`frontend/CLAUDE.md`](frontend/CLAUDE.md): Vue and TypeScript conventions
- [`docs/database.dbml`](docs/database.dbml): the database schema

## Critical gotchas

- **Run `git` from the repo root.** Paths are relative to your cwd, so copy-pasted `backend/...` paths only work from the repo root.
- **Frontend tools: use `./node_modules/.bin/<tool>` from `frontend/`.** A bare `npx` can pick up a different, global copy.
- **`npm run test:unit` starts Vitest in watch mode and never exits.** Use `vitest run`.
- **`npm run lint` runs with `--fix`.** To check without changing files, run `eslint .` and `oxlint .` directly.

## Commands

```bash
# Backend (from backend/)
php artisan test --compact                    # whole suite
php artisan test --compact tests/Feature/Auth/LoginTest.php --filter="unverified"
vendor/bin/pint --test                        # style check, changes nothing

# Frontend (from frontend/)
./node_modules/.bin/vitest run                # whole suite, or pass a spec path
./node_modules/.bin/vue-tsc --build --force   # type check
./node_modules/.bin/eslint .
./node_modules/.bin/oxlint .
```

Dev servers: `composer run dev` in `backend/` (http://localhost:8000) and `npm run dev` in `frontend/` (http://localhost:3000).

## Conventions

**Commits**
- One short conventional subject line with a `backend` or `frontend` scope, no body: `feat(frontend): useForm exposes a 422's error code`.
- One small piece per commit. The code (`feat`/`fix`/`refactor`) and its tests are separate commits, code first.
- Commits made with Claude end with Claude Code's `Co-Authored-By` trailer.

**Branches and PRs**
- `feat/INV-0004-short-slug`. `INV-` keys refer to the maintainer's private issue board.
- PRs go into `main` and are merged with a merge commit.

**Tests**
- The name states what is asserted, including any status code and its meaning: `should return 422 (unprocessable) with code email_not_verified when the email is unverified`.
- `// Arrange`, `// Act`, `// Assert` comments, with a short why where the step isn't obvious.
- Every new test is proven to fail: break the code it covers, watch it go red, restore.

**Code**
- Strict over loose: discriminated unions instead of optional fields, data from the network checked at runtime, strict compiler flags.
- Why-comments are welcome here, because this is a learning project. Say why, not what.
- A suppression (`@phpstan-ignore`, `eslint-disable`) carries its reason inline. If the real fix takes under 10 minutes, make the fix instead.
