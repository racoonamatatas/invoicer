<?php

declare(strict_types = 1);

namespace App\Enums;

// These are codes the frontend branches on, sent as `code` next to a 422's errors.
// Add new cases, and never rename a value. Empty since INV-0044: no 422 needs telling apart right now.
enum ErrorCode: string {}
