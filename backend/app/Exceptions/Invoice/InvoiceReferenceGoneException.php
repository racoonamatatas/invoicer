<?php

declare(strict_types = 1);

namespace App\Exceptions\Invoice;

use App\DataTransferObjects\Input\Invoice\InvoiceData;
use App\Exceptions\ForeignKeyViolation;
use App\Models\Business;
use Exception;
use Illuminate\Database\QueryException;

/**
 * The client or bank account an invoice names was deleted after the request checked it and before the invoice was
 * stored, so the foreign key refused the write. To the user it is the same 422 as naming an unknown id.
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

    /**
     * Says what a failed invoice create or update means. The request checked that the client and the account exist,
     * but another request can delete one before the write, and the foreign key then refuses it. Call this after the
     * rollback, outside the transaction, so the answer is what the other request committed. Any other failure is a
     * real error and is rethrown as it came, a 500.
     *
     * @throws self when the client or the bank account the data names is no longer in the business
     * @throws QueryException when the failure was anything else
     */
    public static function rethrow(QueryException $exception, Business $business, InvoiceData $data): never
    {
        if (! ForeignKeyViolation::matches($exception))
        {
            throw $exception;
        }

        $gone = [];
        if (! $business->clients()->whereKey($data->clientId)->exists())
        {
            $gone[] = 'client_id';
        }
        if (! $business->bankAccounts()->whereKey($data->bankAccountId)->exists())
        {
            $gone[] = 'bank_account_id';
        }

        // Both still there: the violation came from somewhere else, so it isn't this case.
        if ($gone === [])
        {
            throw $exception;
        }

        throw new self($gone, $exception);
    }
}
