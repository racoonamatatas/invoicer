<?php

declare(strict_types = 1);

namespace App\Http\Controllers;

use App\Actions\Invoice\ListInvoicesAction;
use App\Http\Resources\InvoiceSummaryResourceData;
use App\Models\Business;
use Illuminate\Http\JsonResponse;

/**
 * The {business} binding has already proven the business is the user's. Every query starts from that business, so
 * another business's invoices can't appear.
 */
final class InvoiceController extends Controller
{
    public function index(Business $business, ListInvoicesAction $action): JsonResponse
    {
        $invoices = $action->execute($business)
            ->map(InvoiceSummaryResourceData::from(...))
            ->all();

        return new JsonResponse($invoices);
    }
}
