<?php

declare(strict_types = 1);

namespace App\Exceptions\BankAccount;

use Exception;

/**
 * An invoice names this bank account, so it can't be deleted: invoices must be kept for the Belastingdienst, and an
 * invoice must keep saying where it was to be paid.
 */
final class BankAccountInUseException extends Exception
{
    public function __construct()
    {
        parent::__construct('This bank account is on an invoice, so it can\'t be deleted.');
    }
}
