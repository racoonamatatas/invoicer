<?php

declare(strict_types = 1);

namespace App\Exceptions\BankAccount;

use App\Exceptions\ForeignKeyViolation;
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
     */
    public static function isCausedBy(QueryException $exception): bool
    {
        return ForeignKeyViolation::matches($exception);
    }
}
