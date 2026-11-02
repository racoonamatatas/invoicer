<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter\Fixtures;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

final class FacadeLimiterMethod
{
    public function boot(): void
    {
        RateLimiter::for('login', $this->loginLimit(...));
    }

    private function loginLimit(Request $request): Limit
    {
        return Limit::perMinute(5)->by($request->string('email')->value().$this->deviceKey($request));
    }

    private function deviceKey(Request $request): string
    {
        return $request->string('device')->value();
    }
}
