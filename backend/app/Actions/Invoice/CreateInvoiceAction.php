<?php

declare(strict_types = 1);

namespace App\Actions\Invoice;

use App\DataTransferObjects\Input\Invoice\InvoiceData;
use App\Enums\InvoiceStatus;
use App\Models\Business;
use App\Models\Invoice;
use Illuminate\Support\Facades\DB;

/**
 * Creates a draft invoice with its lines. A draft has no number: sending gives it one.
 */
final readonly class CreateInvoiceAction
{
    public function execute(Business $business, InvoiceData $data): Invoice
    {
        // One transaction, so a line that fails to insert leaves no invoice without its lines behind.
        return DB::transaction(static function () use ($business, $data): Invoice {
            // Through the relation: business_id is not fillable. status isn't either, and has no column default, so it
            // is set here; only this code decides that a new invoice is a draft.
            $invoice = $business->invoices()->make($data->toAttributes());
            $invoice->status = InvoiceStatus::Draft;
            $invoice->save();

            $invoice->lines()->createMany($data->lineAttributes());

            // Loaded now, so the response's totals cost no extra query.
            return $invoice->load('lines');
        });
    }
}
