<?php

declare(strict_types = 1);

namespace App\Actions\Invoice;

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
     * @throws StaleVersionException when the invoice's version is no longer the one the client saw
     * @throws ModelNotFoundException when the invoice was deleted after the route found it
     */
    public function execute(Invoice $invoice, IfMatch $ifMatch): void
    {
        $deleted = Invoice::query()
            ->whereKey($invoice->getKey())
            ->where('version', $ifMatch->version)
            ->delete();

        if ($deleted === 0)
        {
            StaleVersionException::throwForMissedWrite($invoice);
        }
    }
}
