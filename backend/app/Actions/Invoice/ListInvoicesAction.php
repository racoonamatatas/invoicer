<?php

declare(strict_types = 1);

namespace App\Actions\Invoice;

use App\Models\Business;
use App\Models\Invoice;
use Illuminate\Database\Eloquent\Collection;

/**
 * A business's invoices, newest first, without their lines: the list shows no amounts, so loading lines here would
 * only cost queries.
 *
 * Every invoice, unpaginated: a freelancer writes tens of invoices a year, a few hundred over the years the list
 * covers. If that ever grows into thousands, the list needs pagination.
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
            ->get();
    }
}
