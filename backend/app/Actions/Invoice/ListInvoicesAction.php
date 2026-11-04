<?php

declare(strict_types = 1);

namespace App\Actions\Invoice;

use App\Models\Business;
use App\Models\Invoice;
use Illuminate\Database\Eloquent\Collection;

/**
 * A business's invoices, newest first, with their lines: the list shows each invoice's total, computed from its lines
 * as it always is. Eager-loaded, so all the lines come in one query instead of one per invoice.
 *
 * Every invoice, unpaginated: a freelancer writes tens of invoices a year, a few hundred over the years the list
 * covers. Each invoice brings up to 100 lines with it (InvoiceRequest's limit), so a few hundred invoices can mean tens
 * of thousands of lines read to compute the totals. If either grows much, the list needs pagination, or totals summed
 * in SQL.
 */
final readonly class ListInvoicesAction
{
    /**
     * @return Collection<int, Invoice>
     */
    public function execute(Business $business): Collection
    {
        // By id, not created_at: ids only go up, and two invoices created in the same second still have a fixed order.
        return $business->invoices()
            ->orderByDesc('id')
            ->with('lines')
            ->get();
    }
}
