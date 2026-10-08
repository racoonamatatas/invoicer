# Backlog

## Shared throttle bucket on guest auth routes

`throttle:5,1` keys guests on `domain|ip` only, so login, register and
verify-email share one 5/min bucket per IP (see
`ThrottleRequests::resolveRequestSignature()`).

Effect: a few failed logins plus a verify click can 429 a real user; users
behind one IP (office, mobile carrier NAT) drain the bucket together.

Fix: give each route its own named limiter (`RateLimiter::for(...)`); named
limiters prefix the key with the limiter name. Add a test that login attempts
don't consume the verify-email budget.
