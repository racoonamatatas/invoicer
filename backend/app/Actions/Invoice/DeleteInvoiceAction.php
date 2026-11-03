<?php

declare(strict_types = 1);

namespace App\Actions\Invoice;

use App\Enums\InvoiceStatus;
use App\Exceptions\Http\StaleVersionException;
use App\Http\IfMatch;
use App\Models\Invoice;
use Illuminate\Database\Eloquent\ModelNotFoundException;

/**
 * Deletes a draft invoice. Its lines go with it through the foreign key's cascade, so only the invoice row is deleted
 * here.
 */
final readonly class DeleteInvoiceAction
{
    /**
     * The version check is part of the DELETE itself, not a read before it: between a read and a delete another save
     * could land, and its changes would be thrown away unseen. One statement leaves no such gap.
     *
     * A query, not $invoice->delete(): the model's delete() matches on the id alone, so it can't carry the version.
     *
     * @throws StaleVersionException when the invoice's version is no longer the one the client saw, or, once a second
     *                               status exists, when it is no longer a draft (see InvoiceStatusTest)
     * @throws ModelNotFoundException when the invoice was deleted after the route found it
     */
    public function execute(Invoice $invoice, IfMatch $ifMatch): void
    {
        // The status is checked in the same statement, so no send can slip in between a draft check and the delete.
        // Only Draft exists today; a second status needs its own refusal for a non-draft, since throwForMissedWrite()
        // would call it "changed elsewhere". InvoiceStatusTest fails until it has one.
        $deleted = Invoice::query()
            ->whereKey($invoice->getKey())
            ->where('status', InvoiceStatus::Draft)
            ->where('version', $ifMatch->version)
            ->delete();

        if ($deleted === 0)
        {
            StaleVersionException::throwForMissedWrite($invoice);
        }
    }
}
