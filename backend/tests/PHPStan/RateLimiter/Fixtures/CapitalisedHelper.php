<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter\Fixtures;

use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;

final class CapitalisedHelper
{
    public function boot(RateLimiter $rateLimiter): void
    {
        // PHP method names are case-insensitive, so this runs emailKey().
        $rateLimiter->for('login', static fn (Request $request): Limit => Limit::perMinute(5)->by(self::EmailKey($request)));
    }

    private static function emailKey(Request $request): string
    {
        return 'email:'.$request->string('email')->value();
    }
}
