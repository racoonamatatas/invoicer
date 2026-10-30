<?php

declare(strict_types = 1);

namespace App\Actions\Invoice;

use App\DataTransferObjects\Input\Invoice\InvoiceData;
use App\Enums\InvoiceStatus;
use App\Exceptions\ForeignKeyViolation;
use App\Exceptions\Invoice\InvoiceReferenceGoneException;
use App\Models\Business;
use App\Models\Invoice;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * Creates a draft invoice with its lines. A draft has no number: sending gives it one.
 */
final readonly class CreateInvoiceAction
{
    /**
     * @throws InvoiceReferenceGoneException when the client or bank account was deleted after the request checked it
     */
    public function execute(Business $business, InvoiceData $data): Invoice
    {
        try
        {
            // One transaction, so a line that fails to insert leaves no invoice without its lines behind.
            return DB::transaction(static function () use ($business, $data): Invoice {
                // Through the relation: business_id is not fillable. status isn't either, and has no column default, so
                // it is set here; only this code decides that a new invoice is a draft.
                $invoice = $business->invoices()->make($data->toAttributes());
                $invoice->status = InvoiceStatus::Draft;
                // Set rather than left to the column default, so the model holds it for the ETag without reading it
                // back.
                $invoice->version = 1;
                $invoice->save();

                $invoice->lines()->createMany($data->lineAttributes());

                // Loaded now, so the response's totals cost no extra query.
                return $invoice->load('lines');
            });
        }
        catch (QueryException $exception)
        {
            // The request checked that the client and the account exist, but another request can delete one before
            // the insert, and the foreign key then refuses it. Asked after the rollback, outside the transaction, so
            // the answer is what the other request committed. Any other failure is a real error and stays a 500.
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

            throw new InvoiceReferenceGoneException($gone, $exception);
        }
    }
}
