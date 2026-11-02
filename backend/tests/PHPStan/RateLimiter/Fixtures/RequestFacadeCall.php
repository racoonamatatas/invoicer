<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter\Fixtures;

use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Request as RequestFacade;

final class RequestFacadeCall
{
    public function boot(RateLimiter $rateLimiter): void
    {
        $rateLimiter->for('login', static fn (Request $request): Limit => Limit::perMinute(5)->by(RequestFacade::string('email')->value()));
    }
}
