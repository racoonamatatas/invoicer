<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter\Fixtures;

use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;

final class UnionReceiver
{
    public function boot(RateLimiter $rateLimiter, EmailKeys|IpKeys $keys): void
    {
        $rateLimiter->for('login', static fn (Request $request): Limit => Limit::perMinute(5)->by($keys->key($request)));
    }
}
