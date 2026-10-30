<?php

declare(strict_types = 1);

namespace App\Http\Controllers;

use App\Actions\Invoice\CreateInvoiceAction;
use App\Actions\Invoice\ListInvoicesAction;
use App\Http\Requests\InvoiceRequest;
use App\Http\Resources\InvoiceResourceData;
use App\Http\Resources\InvoiceSummaryResourceData;
use App\Models\Business;
use App\Models\Invoice;
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

    /**
     * A new draft for the business, as 201 with the draft as show returns it, totals included.
     */
    public function store(InvoiceRequest $request, CreateInvoiceAction $action, Business $business): JsonResponse
    {
        $invoice = $action->execute($business, $request->toDto());

        return new JsonResponse(InvoiceResourceData::from($invoice), JsonResponse::HTTP_CREATED);
    }

    /**
     * $invoice comes from the scoped binding, so it is one of this business's invoices: an invoice of another business
     * was a 404 before this method ran.
     *
     * $business is unused but must be here: Laravel hands route parameters to a controller by position, not by
     * name, so without it the bound Business would land in $invoice and the call would be a TypeError.
     */
    public function show(Business $business, Invoice $invoice): InvoiceResourceData
    {
        // Loaded here rather than on first read inside the resource: the same one query, but in sight.
        return InvoiceResourceData::from($invoice->load('lines'));
    }
}
