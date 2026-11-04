<?php

declare(strict_types = 1);

namespace App\Http\Resources;

use App\Models\Invoice;
use Illuminate\Contracts\Support\Responsable;
use JsonSerializable;

/**
 * An invoice as one row of the invoices list: the summary plus its total. Only the total, not the VAT groups: a row
 * shows one amount, and the full breakdown is what the single invoice is for.
 */
final readonly class InvoiceListItemResourceData implements JsonSerializable, Responsable
{
    use RespondsWithJson;

    public function __construct(
        public InvoiceSummaryResourceData $summary,
        public int $totalCents,
    ) {}

    /**
     * totals() reads $invoice->lines, so a caller that didn't eager-load them pays one query per invoice.
     */
    public static function from(Invoice $invoice): self
    {
        return new self(
            summary: InvoiceSummaryResourceData::from($invoice),
            totalCents: $invoice->totals()->totalCents,
        );
    }

    /**
     * @return array{
     *     id: int,
     *     status: string,
     *     vat_treatment: string,
     *     number: ?string,
     *     client_id: int,
     *     bank_account_id: int,
     *     payment_term_days: ?int,
     *     total_cents: int,
     * }
     */
    public function jsonSerialize(): array
    {
        return [
            ...$this->summary->jsonSerialize(),
            'total_cents' => $this->totalCents,
        ];
    }
}
