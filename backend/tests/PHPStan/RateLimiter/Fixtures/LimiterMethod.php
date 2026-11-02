<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter\Fixtures;

use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;

final class LimiterMethod
{
    public function boot(RateLimiter $rateLimiter): void
    {
        $rateLimiter->for('login', $this->loginLimit(...));
        $rateLimiter->for(callback: self::registerLimit(...), name: 'register');
    }

    /**
     * Runs after validation, so a typed accessor is safe here: no limiter calls it.
     */
    public function afterValidation(Request $request): string
    {
        return $request->string('email')->value();
    }

    private function loginLimit(Request $request): Limit
    {
        return Limit::perMinute(5)->by($request->string('email')->value().$this->deviceKey($request));
    }

    private static function registerLimit(Request $request): Limit
    {
        return Limit::perMinute(5)->by($request->string('email')->value());
    }

    private function deviceKey(Request $request): string
    {
        return $request->string('device')->value();
    }
}
