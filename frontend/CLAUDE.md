# Frontend

Vue 3.5 single-page app that talks to the Laravel API under `/api` with Sanctum's session cookie.
Commands and commit conventions: the root [`CLAUDE.md`](../CLAUDE.md).

## Where things live

- `src/domains/<domain>/`: a feature's `pages/`, `components/`, `routes.ts` and Pinia `store.ts`. Pages are only reached through the router.
- `src/router/`: `AppRoute` and `authGuard`. Every route is an `AppRoute`, protected unless it calls `.public()`, so a route can't forget its access rule.
- `src/services/`: the only place requests are made. `http/` wraps axios; `auth.ts` holds the auth endpoints and their request/response types.
- `src/form/formSubmitFailure.ts`: turns whatever a failed submit threw into a `FormSubmitFailure` union. The only file that knows Laravel's 422 and 429 shapes.
- `src/composables/useForm.ts`: one form's submit state (errors, general message, code, throttle message, pending). Every form uses it.

## Patterns to follow

- **A new form** uses `useForm<keyof Payload>('form-name', { field: true, ... })` and reads errors through `fieldError(field)`. That gives typo-safe field names and error ids prefixed with the form name, so two forms on one page don't clash. The object marks every field `true` if the form displays its error, `false` if not; its status region ends with `generalMessage`, for a 422 none of those fields can show. Copy `ResendVerificationForm.vue`.
- **A failed submit** is handled by `useForm`: a 422 fills the errors, a 429 fills the throttle message, anything else is re-thrown to the page. A page should only add the step that comes after success, inside the `submit()` callback.
- **Network data is `unknown` until checked.** Check it with a type guard (`value is X`), and keep that guard next to the type it proves. A value the frontend branches on (e.g. `ErrorCode`) is a union derived from a runtime `as const` array, so the type and the check can't disagree.
- **Accessibility:** a `role="status"` live region is always rendered and only its content changes. Error text is linked with `aria-invalid` and `aria-describedby` from one `fieldError` value.

## Style

- ESLint enforces Allman braces, 4-space indentation, semicolons and single quotes. `noUncheckedIndexedAccess` is on.
- Imports go under `// Package imports` and `// Project imports`, using the `@/` alias.
- Use `import type` or an inline `type` for type-only imports.

## Tests

- `tests/js/` mirrors `src/`, so `src/form/x.ts` is tested in `tests/js/form/x.spec.ts`.
- `vi.mock('@/services/auth')` turns every export into a `vi.fn()`, so no request leaves a test. Reset mocks in `beforeEach`.
- Helpers live in `tests/js/utility/`: `axiosErrorWith(status, body, headers)` builds the error a failed request throws, and `createDeferred()` holds a request in flight.
- A page spec has a `mount<Page>()` helper that sets up Pinia and a memory-history router with the real routes. Copy `Login.spec.ts`.
- After a submit, `await flushPromises()` before asserting. A test for something being absent first asserts something that proves the response was rendered.
- Find elements by id or accessible name (`form[aria-label="Log in"]`), not by CSS classes.
