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
     * Bootstrap any application services.
     */
    public function boot(RateLimiter $rateLimiter): void
    {
        // One bucket per route: the plain throttle:N,M middleware keys guests on IP alone, so every route using it shares one bucket.
        $rateLimiter->for('register', static fn (Request $request): Limit => Limit::perMinute(5)->by('ip:'.$request->ip()));
        $rateLimiter->for('verify-email', static fn (Request $request): Limit => Limit::perMinute(5)->by('ip:'.$request->ip()));

        // Per-IP stops one client guessing many accounts; per-email stops many IPs guessing one account.
        $rateLimiter->for('login', static fn (Request $request): array => [
            Limit::perMinute(5)->by('ip:'.$request->ip()),
            Limit::perMinutes(15, 10)->by('email:'.Str::lower($request->string('email')->toString())),
        ]);

        // Per-IP stops one client spraying many emails; per-email stops many IPs flooding one inbox.
        $rateLimiter->for('resend-verification', static fn (Request $request): array => [
            Limit::perMinute(5)->by('ip:'.$request->ip()),
            Limit::perHour(3)->by('email:'.Str::lower($request->string('email')->toString())),
        ]);

        // Same threats as resend: one client spraying many inboxes, many IPs flooding one inbox.
        $rateLimiter->for('forgot-password', static fn (Request $request): array => [
            Limit::perMinute(5)->by('ip:'.$request->ip()),
            Limit::perHour(3)->by('email:'.Str::lower($request->string('email')->toString())),
        ]);

        // IP only: reset tokens are unguessable, so this caps bcrypt work per client rather than guessing.
        $rateLimiter->for('reset-password', static fn (Request $request): Limit => Limit::perMinute(5)->by('ip:'.$request->ip()));
    }
}
