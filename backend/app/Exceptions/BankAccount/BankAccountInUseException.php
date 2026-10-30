<?php

declare(strict_types = 1);

namespace App\Exceptions\BankAccount;

use Exception;
use Illuminate\Database\QueryException;

/**
 * An invoice names this bank account, so it can't be deleted: invoices must be kept for the Belastingdienst, and an
 * invoice must keep saying where it was to be paid.
 */
final class BankAccountInUseException extends Exception
{
    public function __construct(?QueryException $violation = null)
    {
        parent::__construct('This bank account is on an invoice, so it can\'t be deleted.', previous: $violation);
    }

    /**
     * Whether a failed delete of a bank account was the foreign key refusing it. Deleting an account only touches its
     * own row, so a foreign key violation there can only come from a row that points at it: an invoice.
     *
     * Laravel has no exception class for this, unlike UniqueConstraintViolationException, and drivers report it
     * differently. SQLite's SQLSTATE is the generic 23000, shared with unique and NOT NULL violations, so its message
     * is what tells them apart, the way Laravel's own SQLiteConnection::isUniqueConstraintError() does it. MySQL and
     * MariaDB use driver code 1451, PostgreSQL SQLSTATE 23503.
     */
    public static function isCausedBy(QueryException $exception): bool
    {
        $driverCode = $exception->errorInfo[1] ?? null;

        return str_contains($exception->getMessage(), 'FOREIGN KEY constraint failed')
            || $driverCode === 1451
            || $exception->getCode() === '23503';
    }
}
