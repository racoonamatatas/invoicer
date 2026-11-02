<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter\Fixtures;

use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;

final class OtherClassHelper
{
    public function __construct(private EmailKeys $keys) {}

    public function boot(RateLimiter $rateLimiter): void
    {
        $rateLimiter->for('login', fn (Request $request): Limit => Limit::perMinute(5)->by($this->keys->key($request)));
    }
}
