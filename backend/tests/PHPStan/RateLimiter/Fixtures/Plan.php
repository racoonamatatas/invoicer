<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter\Fixtures;

enum Plan: string
{
    case Free = 'free';
}
