<?php

declare(strict_types = 1);

namespace App\Exceptions;

use Illuminate\Database\QueryException;

/**
 * Tells a foreign key violation apart from any other failed query. Not an exception itself: each domain exception
 * that a foreign key can cause asks this, then says what the violation means in its own case.
 */
final class ForeignKeyViolation
{
    private function __construct() {}

    /**
     * Laravel has no exception class for this, unlike UniqueConstraintViolationException, and drivers report it
     * differently. SQLite's SQLSTATE is the generic 23000, shared with unique and NOT NULL violations, so its message
     * is what tells them apart, the way Laravel's own SQLiteConnection::isUniqueConstraintError() does it. MySQL and
     * MariaDB use driver code 1451 for a delete or update refused by a child row and 1452 for an insert or update
     * whose parent row is missing; PostgreSQL uses SQLSTATE 23503 for both.
     */
    public static function matches(QueryException $exception): bool
    {
        $driverCode = $exception->errorInfo[1] ?? null;

        return str_contains($exception->getMessage(), 'FOREIGN KEY constraint failed')
            || $driverCode === 1451
            || $driverCode === 1452
            || $exception->getCode() === '23503';
    }
}
