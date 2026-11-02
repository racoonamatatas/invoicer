<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter\Fixtures;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

final class FacadeClosure
{
    public function boot(): void
    {
        RateLimiter::for('login', static fn (Request $request): Limit => Limit::perMinute(5)->by($request->string('email')->value()));
    }
}
