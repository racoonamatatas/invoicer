<?php

declare(strict_types = 1);

namespace App\Providers;

use App\Models\Business;
use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Contracts\Validation\UncompromisedVerifier;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Illuminate\Validation\NotPwnedVerifier;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->configureLeakCheckTimeout();
    }

    /**
     * The haveibeenpwned lookup behind Password::uncompromised() waits 30 seconds by default, which would hold a
     * set-password, reset or change request that long when the API is slow. It already fails open on an error,
     * so a short timeout only makes that happen sooner.
     *
     * extend(), not singleton(): Laravel's ValidationServiceProvider is deferred, so its own binding is registered
     * later, when the validator is first resolved, and would replace a binding made here. An extender is applied
     * on resolution, after that binding. Only Laravel's verifier is rebuilt: a deliberately swapped one (a fake
     * bound by a test, say) passes through untouched.
     */
    private function configureLeakCheckTimeout(): void
    {
        $this->app->extend(
            UncompromisedVerifier::class,
            static fn (UncompromisedVerifier $verifier, Application $app): UncompromisedVerifier => $verifier instanceof NotPwnedVerifier
                ? new NotPwnedVerifier($app->make(HttpFactory::class), 3)
                : $verifier,
        );
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(RateLimiter $rateLimiter): void
    {
        $this->configurePasswordPolicy();
        $this->configureRateLimiters($rateLimiter);
        $this->configureRouteBindings();
    }

    /**
     * Explicit route model bindings. The {business} segment of /api/businesses/7 starts out as the string "7";
     * binding is the step that swaps it for the Business with that id. Implicit binding only runs when the matched
     * action type-hints Business, so a route in the business group whose action doesn't (a store() that only needs
     * the id, say) would hand the policy middleware the string "7" instead of a Business, and it would deny the
     * owner. Route::model() runs the binding for the parameter name alone, whatever the action's signature.
     *
     * Here and not in routes/api.php: once routes are cached (route:cache, optimize) the routes file is never loaded
     * again, and a binding registered there is lost. A provider boots on every request.
     */
    private function configureRouteBindings(): void
    {
        Route::model('business', Business::class);
    }

    /**
     * The rules every new password must pass (set through the link, reset, change), via PasswordRules::forNewPassword().
     */
    private function configurePasswordPolicy(): void
    {
        // NIST SP 800-63B: at least 15 characters when the password is the only login factor, no composition
        // rules, and reject passwords known from breaches (checked against haveibeenpwned).
        Password::defaults(static fn (): Password => Password::min(15)->uncompromised());
    }

    /**
     * Registers the named rate limiters used by the throttle:<name> middleware.
     *
     * A limiter's bucket is its name plus the string given to by(): requests that produce the same
     * string share one counter. The same by() string under two limiter names gives two separate
     * counters, so the ip:/email: prefixes only keep apart the limits within one limiter (see login).
     */
    private function configureRateLimiters(RateLimiter $rateLimiter): void
    {
        // One bucket per route: the plain throttle:N,M middleware keys guests on IP alone, so every route using it shares one bucket.
        $rateLimiter->for('verify-email', static fn (Request $request): Limit => Limit::perMinute(5)->by('ip:'.$request->ip()));

        // One bucket per email: prevents one's inbox being flooded with mails from different mail-sending routes.
        $rateLimiter->for('mail-per-email', static fn (Request $request): Limit => Limit::perHour(5)->by(self::emailBucketKey($request)));

        // Per-IP stops one client mass-creating accounts.
        $rateLimiter->for('register', static fn (Request $request): Limit => Limit::perMinute(5)->by('ip:'.$request->ip()));

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
