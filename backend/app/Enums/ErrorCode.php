<?php

declare(strict_types = 1);

namespace App\Enums;

// These are codes the frontend branches on.
// Add new cases, and never rename a value.
enum ErrorCode: string
{
    case EmailNotVerified = 'email_not_verified';
}
