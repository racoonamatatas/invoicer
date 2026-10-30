<?php

declare(strict_types = 1);

namespace App\Actions\Invoice;

use App\Exceptions\Http\StaleVersionException;
use App\Http\IfMatch;
use App\Models\Invoice;

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
     */
    public function execute(Invoice $invoice, IfMatch $ifMatch): void
    {
        $deleted = Invoice::query()
            ->whereKey($invoice->getKey())
            ->where('version', $ifMatch->version)
            ->delete();

        // 0 rows also covers an invoice deleted since the route found it: a known limit, accepted because a reload
        // shows it gone.
        if ($deleted === 0)
        {
            throw new StaleVersionException;
        }
    }
}
