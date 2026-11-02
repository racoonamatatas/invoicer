<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter\Fixtures;

use Illuminate\Http\Request;

final class IpKeys
{
    public function key(Request $request): string
    {
        return 'ip:'.$request->string('ip')->value();
    }
}
