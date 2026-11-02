<?php

declare(strict_types = 1);

namespace App\Actions\Invoice;

use App\DataTransferObjects\Input\Invoice\InvoiceData;
use App\Exceptions\Http\StaleVersionException;
use App\Exceptions\Invoice\InvoiceReferenceGoneException;
use App\Http\IfMatch;
use App\Models\Business;
use App\Models\Invoice;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * Replaces a draft's fields and its whole list of lines. The request carries no line ids, so the old lines are deleted
 * and the new ones inserted: there is no "does this line belong to this invoice" check to get wrong.
 */
final readonly class UpdateInvoiceAction
{
    /**
     * One transaction for the invoice row and its lines. The treatment and the lines' VAT options must change
     * together: a half-done save could store a treatment its lines don't fit, and every later read of that draft
     * would be a 500, because its totals can't be computed.
     *
     * The version check is part of the UPDATE itself, not a read before it: between a read and a write another save
     * could land, and this one would overwrite it unseen. The row is written first, so a stale save stops before it
     * touches a line.
     *
     * @throws StaleVersionException when the invoice's version is no longer the one the client saw
     * @throws ModelNotFoundException when the invoice was deleted after the route found it
     * @throws InvoiceReferenceGoneException when the client or bank account was deleted after the request checked it
     */
    public function execute(Business $business, Invoice $invoice, InvoiceData $data, IfMatch $ifMatch): Invoice
    {
        try
        {
            return DB::transaction(static function () use ($invoice, $data, $ifMatch): Invoice {
                // increment() with extra columns is one UPDATE ... SET version = version + 1, ... WHERE version = ?.
                // It bumps the version on every save, a lines-only one too, whose invoice columns don't change.
                $updated = Invoice::query()
                    ->whereKey($invoice->getKey())
                    ->where('version', $ifMatch->version)
                    ->increment('version', 1, $data->toAttributes());

                if ($updated === 0)
                {
                    StaleVersionException::throwForMissedWrite($invoice);
                }

                // Deleted before the insert: positions are unique per invoice, and the new lines start again at 1.
                $invoice->lines()->delete();
                $invoice->lines()->createMany($data->lineAttributes());

                // The UPDATE went past the model, so its attributes are stale. Reread with the lines, so the response's
                // totals cost no extra query.
                return $invoice->refresh()->load('lines');
            });
        }
        catch (QueryException $exception)
        {
            // Outside the transaction, so it has rolled back before the check asks what is still there. The bound
            // business, not $invoice->business, which would be one more query to load what the route already has.
            InvoiceReferenceGoneException::rethrow($exception, $business, $data);
        }
    }
}
