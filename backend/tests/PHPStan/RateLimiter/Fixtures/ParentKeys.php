<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter\Fixtures;

use Illuminate\Http\Request;

abstract class ParentKeys
{
    protected static function emailKey(Request $request): string
    {
        return 'email:'.$request->string('email')->value();
    }
}
