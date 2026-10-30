<?php

declare(strict_types = 1);

namespace App\Http\Resources;

use App\Models\Invoice;
use App\Models\InvoiceLine;
use Illuminate\Contracts\Support\Responsable;
use JsonSerializable;

/**
 * A whole invoice as the frontend sees it: the summary the list sends, plus its lines and its totals. Built on the
 * summary rather than repeating its fields, so the two can't drift apart: whatever the list sends, this sends too.
 */
final readonly class InvoiceResourceData implements JsonSerializable, Responsable
{
    use RespondsWithJson;

    /**
     * @param  list<InvoiceLineResourceData>  $lines
     */
    public function __construct(
        public InvoiceSummaryResourceData $summary,
        public array $lines,
        public InvoiceTotalsResourceData $totals,
    ) {}

    /**
     * Reads $invoice->lines twice (for the lines and for the totals), so the caller loads them first: one query, not
     * one per read.
     */
    public static function from(Invoice $invoice): self
    {
        return new self(
            summary: InvoiceSummaryResourceData::from($invoice),
            lines: $invoice->lines->map(static fn (InvoiceLine $line): InvoiceLineResourceData => InvoiceLineResourceData::from($line))->values()->all(),
            totals: InvoiceTotalsResourceData::from($invoice->totals()),
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return [
            ...$this->summary->jsonSerialize(),
            'lines' => $this->lines,
            'totals' => $this->totals,
        ];
    }
}
