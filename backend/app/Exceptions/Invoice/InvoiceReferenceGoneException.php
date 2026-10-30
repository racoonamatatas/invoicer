<?php

declare(strict_types = 1);

namespace App\Exceptions\Invoice;

use Exception;
use Illuminate\Database\QueryException;

/**
 * The client or bank account an invoice names was deleted after the request checked it and before the invoice was
 * stored, so the foreign key refused the insert. To the user it is the same 422 as naming an unknown id.
 */
final class InvoiceReferenceGoneException extends Exception
{
    /**
     * @param  non-empty-list<'client_id'|'bank_account_id'>  $fields  the body fields whose row is gone
     */
    public function __construct(
        public readonly array $fields,
        QueryException $violation,
    ) {
        parent::__construct('An invoice names a client or bank account that no longer exists: '.implode(', ', $fields).'.', previous: $violation);
    }
}
