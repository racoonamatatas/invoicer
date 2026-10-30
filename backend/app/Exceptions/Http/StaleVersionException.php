<?php

declare(strict_types = 1);

namespace App\Exceptions\Http;

use Exception;

/**
 * The row was saved or deleted by someone else after the client read it, so its If-Match names a version that is no
 * longer current. Nothing was written.
 */
final class StaleVersionException extends Exception
{
    public function __construct()
    {
        parent::__construct('This was changed elsewhere since you opened it. Load the latest version and try again.');
    }
}
