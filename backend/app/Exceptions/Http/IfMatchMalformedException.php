<?php

declare(strict_types = 1);

namespace App\Exceptions\Http;

use Exception;

/**
 * If-Match was sent but isn't one quoted version, such as "3".
 */
final class IfMatchMalformedException extends Exception
{
    public function __construct()
    {
        parent::__construct('The If-Match header must be one version in quotes, such as "3".');
    }
}
