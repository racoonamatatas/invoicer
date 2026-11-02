<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter\Fixtures;

use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;

final class AccessorsInClosure
{
    public function boot(RateLimiter $rateLimiter): void
    {
        $rateLimiter->for('string', static fn (Request $request): Limit => Limit::perMinute(5)->by($request->string('key')->value()));
        $rateLimiter->for('str', static fn (Request $request): Limit => Limit::perMinute(5)->by($request->str('key')->value()));
        $rateLimiter->for('integer', static fn (Request $request): Limit => Limit::perMinute(5)->by((string) $request->integer('key')));
        $rateLimiter->for('float', static fn (Request $request): Limit => Limit::perMinute(5)->by((string) $request->float('key')));
        $rateLimiter->for('boolean', static fn (Request $request): Limit => Limit::perMinute(5)->by($request->boolean('key') ? 'yes' : 'no'));
        $rateLimiter->for('date', static fn (Request $request): Limit => Limit::perMinute(5)->by((string) $request->date('key')?->toDateString()));
        $rateLimiter->for('enum', static fn (Request $request): Limit => Limit::perMinute(5)->by((string) $request->enum('key', Plan::class)?->value));
        $rateLimiter->for('enums', static fn (Request $request): Limit => Limit::perMinute(5)->by((string) count($request->enums('key', Plan::class))));
        $rateLimiter->for('array', static fn (Request $request): Limit => Limit::perMinute(5)->by((string) count($request->array('key'))));
        $rateLimiter->for('collect', static fn (Request $request): Limit => Limit::perMinute(5)->by((string) $request->collect('key')->count()));
        $rateLimiter->for('clamp', static fn (Request $request): Limit => Limit::perMinute(5)->by((string) $request->clamp('key', 1, 10)));
        $rateLimiter->for('fluent', static fn (Request $request): Limit => Limit::perMinute(5)->by((string) $request->fluent()->string('key')));
    }
}
