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
     * The name Laravel gives $table->unique(['user_id', 'kvk_number']) on businesses.
     */
    private const string INDEX = 'businesses_user_id_kvk_number_unique';

    public function __construct(UniqueConstraintViolationException $violation)
    {
        parent::__construct('This user already has a business with this kvk_number.', previous: $violation);
    }

    /**
     * Only a violation on kvk_number is this exception. Any other unique index is a bug, not a race, and the caller
     * rethrows it as it is so it still ends up as a reported 500.
     *
     * Laravel parses what it can out of the driver's error message, and drivers differ: SQLite names the columns
     * only, MySQL and MariaDB the index only, PostgreSQL both. Either one is enough.
     */
    public static function isCausedBy(UniqueConstraintViolationException $violation): bool
    {
        return $violation->index === self::INDEX || in_array('kvk_number', $violation->columns, true);
    }
}
