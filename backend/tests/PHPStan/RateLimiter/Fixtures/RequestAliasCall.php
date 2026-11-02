<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter\Fixtures;

use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;

final class RequestAliasCall
{
    public function boot(RateLimiter $rateLimiter): void
    {
        // Laravel's default aliases make \Request the Request facade.
        $rateLimiter->for('login', static fn (Request $request): Limit => Limit::perMinute(5)->by(\Request::string('email')->value()));
    }
}
