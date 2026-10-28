<?php

declare(strict_types = 1);

namespace App\Exceptions\BankAccount;

use Exception;
use Illuminate\Database\UniqueConstraintViolationException;

/**
 * The business already has a bank account with this IBAN, found by the (business_id, iban) index rather than the
 * request's unique rule: two requests passed validation at the same moment, and the second one's write lost.
 */
final class DuplicateIbanException extends Exception
{
    /**
     * The name Laravel gives $table->unique(['business_id', 'iban']) on bank_accounts.
     */
    private const string INDEX = 'bank_accounts_business_id_iban_unique';

    public function __construct(UniqueConstraintViolationException $violation)
    {
        parent::__construct('This business already has a bank account with this IBAN.', previous: $violation);
    }

    /**
     * Only a violation on iban is this exception. The (business_id, label) index can also be hit by a race, and
     * that one is rethrown as it is: a 500 for two identical labels saved at the same instant is rare and harmless.
     *
     * Laravel parses what it can out of the driver's error message, and drivers differ: SQLite names the columns
     * only, MySQL and MariaDB the index only, PostgreSQL both. Either one is enough.
     */
    public static function isCausedBy(UniqueConstraintViolationException $violation): bool
    {
        return $violation->index === self::INDEX || in_array('iban', $violation->columns, true);
    }
}
