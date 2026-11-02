<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter\Fixtures;

use Illuminate\Http\Request;

final class EmailKeys
{
    public function key(Request $request): string
    {
        return 'email:'.$request->string('email')->value();
    }
}
