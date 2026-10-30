<?php

declare(strict_types = 1);

namespace App\Exceptions\Http;

use Exception;

/**
 * A write to a versioned row came without If-Match. Our own frontend always sends it, so this means a bug there, not
 * a user mistake.
 */
final class IfMatchMissingException extends Exception
{
    public function __construct()
    {
        parent::__construct('This request needs an If-Match header with the version it was based on.');
    }
}
