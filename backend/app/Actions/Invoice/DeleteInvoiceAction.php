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

        if ($deleted !== 0)
        {
            return;
        }

        // 0 rows has two causes, told apart only now that the delete has failed, so the check and the delete stay one
        // statement. Gone: a double-click or a second tab deleted it first, and "changed elsewhere" would be untrue.
        // The same 404 as an unknown id in the URL.
        if (! Invoice::query()->whereKey($invoice->getKey())->exists())
        {
            throw (new ModelNotFoundException)->setModel(Invoice::class, [$invoice->getKey()]);
        }

        throw new StaleVersionException;
    }
}
