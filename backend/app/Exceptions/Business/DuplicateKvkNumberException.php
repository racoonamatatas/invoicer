<?php

declare(strict_types = 1);

namespace App\Exceptions\Business;

use Exception;
use Illuminate\Database\UniqueConstraintViolationException;

/**
 * The user already has a business with this kvk_number, found by the (user_id, kvk_number) index rather than the
 * request's unique rule: two requests passed validation at the same moment, and the second one's write lost.
 */
final class DuplicateKvkNumberException extends Exception
{
    /**
     * Only a violation on kvk_number becomes this exception. Any other unique index is a bug, not a race, and is
     * rethrown as it is so it still ends up as a reported 500.
     *
     * The columns are what Laravel parses out of the driver's error message; for SQLite that is the column list of
     * the violated index.
     */
    public static function from(UniqueConstraintViolationException $exception): UniqueConstraintViolationException|self
    {
        return in_array('kvk_number', $exception->columns, true)
            ? new self('This user already has a business with this kvk_number.', previous: $exception)
            : $exception;
    }
}
