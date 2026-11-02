<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter\Fixtures;

use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;

final class NoReports
{
    public function boot(RateLimiter $rateLimiter): void
    {
        $rateLimiter->for('login', static fn (Request $request): array => [
            Limit::perMinute(5)->by('ip:'.$request->ip()),
            Limit::perMinute(5)->by(self::emailKey($request)),
        ]);
    }

    /**
     * Runs after validation, so a typed accessor is safe here: no limiter calls it.
     */
    public function afterValidation(Request $request): string
    {
        return $request->string('email')->value();
    }

    private static function emailKey(Request $request): string
    {
        $email = $request->input('email');

        return is_string($email) ? 'email:'.$email : 'email:';
    }
}
