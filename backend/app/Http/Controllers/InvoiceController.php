<?php

declare(strict_types = 1);

namespace App\Http\Controllers;

use App\Actions\Invoice\CreateInvoiceAction;
use App\Actions\Invoice\DeleteInvoiceAction;
use App\Actions\Invoice\ListInvoicesAction;
use App\Http\IfMatch;
use App\Http\Requests\InvoiceRequest;
use App\Http\Resources\InvoiceResourceData;
use App\Http\Resources\InvoiceSummaryResourceData;
use App\Http\Responses\NoContentResponse;
use App\Models\Business;
use App\Models\Invoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
     * A new draft for the business, as 201 with the draft as show returns it, totals included, and its version as the
     * ETag.
     */
    public function store(InvoiceRequest $request, CreateInvoiceAction $action, Business $business): JsonResponse
    {
        $invoice = $action->execute($business, $request->toDto());

        return self::withVersion(new JsonResponse(InvoiceResourceData::from($invoice), JsonResponse::HTTP_CREATED), $invoice);
    }

    /**
     * $invoice comes from the scoped binding, so it is one of this business's invoices: an invoice of another business
     * was a 404 before this method ran.
     *
     * $business is unused but must be here: Laravel hands route parameters to a controller by position, not by
     * name, so without it the bound Business would land in $invoice and the call would be a TypeError.
     */
    public function show(Business $business, Invoice $invoice): JsonResponse
    {
        // Loaded here rather than on first read inside the resource: the same one query, but in sight.
        return self::withVersion(new JsonResponse(InvoiceResourceData::from($invoice->load('lines'))), $invoice);
    }

    /**
     * Deletes the draft if the client's If-Match still names its current version. The header is read before the action
     * runs, so a missing or malformed one is refused before the delete. The route bindings have queried by then, so
     * another business's invoice is a 404 whatever the header says.
     */
    public function destroy(DeleteInvoiceAction $action, Request $request, Business $business, Invoice $invoice): NoContentResponse
    {
        $action->execute($invoice, IfMatch::fromRequest($request));

        return new NoContentResponse;
    }

    /**
     * Sends the invoice's version as its ETag, which an update or delete hands back in If-Match. A strong ETag: the
     * version changes on every save, so equal versions mean the same draft. setEtag() adds the quotes the header needs,
     * so version 3 goes out as "3".
     */
    private static function withVersion(JsonResponse $response, Invoice $invoice): JsonResponse
    {
        return $response->setEtag((string) $invoice->version);
    }
}
