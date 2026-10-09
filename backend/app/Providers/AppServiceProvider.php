<?php

declare(strict_types = 1);

namespace App\Providers;

use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Registers the named rate limiters used by the throttle:<name> middleware.
     *
     * A limiter's bucket is its name plus the string given to by(): requests that produce the same
     * string share one counter. The same by() string under two limiter names gives two separate
     * counters, so the ip:/email: prefixes only keep apart the limits within one limiter (see login).
     */
    public function boot(RateLimiter $rateLimiter): void
    {
        // One bucket per route: the plain throttle:N,M middleware keys guests on IP alone, so every route using it shares one bucket.
        $rateLimiter->for('verify-email', static fn (Request $request): Limit => Limit::perMinute(5)->by('ip:'.$request->ip()));

        // One bucket per email: prevents one's inbox being flooded with mails from different mail-sending routes.
        $rateLimiter->for('mail-per-email', static fn (Request $request): Limit => Limit::perHour(5)->by(self::emailBucketKey($request)));

        // Per-IP stops one client mass-creating accounts.
        $rateLimiter->for('register', static fn (Request $request): Limit => Limit::perMinute(5)->by('ip:'.$request->ip()));

        // Per-IP stops one client spraying many emails.
        $rateLimiter->for('resend-verification', static fn (Request $request): Limit => Limit::perMinute(5)->by('ip:'.$request->ip()));

        // Per-IP stops one client spraying many emails.
        $rateLimiter->for('forgot-password', static fn (Request $request): Limit => Limit::perMinute(5)->by('ip:'.$request->ip()));

        // IP only: reset tokens are unguessable, so this caps bcrypt work per client rather than guessing.
        $rateLimiter->for('reset-password', static fn (Request $request): Limit => Limit::perMinute(5)->by('ip:'.$request->ip()));

        // Per-user: caps current-password guesses from a taken-over session; switching IPs buys no extra guesses.
        $rateLimiter->for('change-password', static fn (Request $request): Limit => Limit::perMinute(5)->by('user:'.$request->user()?->getAuthIdentifier()));

        // Per-IP stops one client guessing many accounts; per-email stops many IPs guessing one account.
        $rateLimiter->for('login', static fn (Request $request): array => [
            Limit::perMinute(5)->by('ip:'.$request->ip()),
            Limit::perMinutes(15, 10)->by(self::emailBucketKey($request)),
        ]);
    }

    /**
     * Rate limiters run before validation, so the email can be missing or not a string.
     * Non-strings all share the 'email:' bucket; validation rejects them with a 422 afterwards.
     */
    private static function emailBucketKey(Request $request): string
    {
        $email = $request->input('email');

        return is_string($email) ? 'email:'.Str::lower($email) : 'email:';
    }
}
