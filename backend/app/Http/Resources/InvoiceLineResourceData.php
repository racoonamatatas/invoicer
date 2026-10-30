<?php

declare(strict_types = 1);

namespace App\Http\Resources;

use App\Models\InvoiceLine;
use JsonSerializable;

/**
 * A line as the frontend sees it, only ever inside an invoice. No id: a draft's lines are recreated on every save, so
 * an id would be stale after the next one. No position: the order of the lines array is the position.
 *
 * total_cents is computed, like the invoice's totals, so the editor shows the same rounding the totals use.
 */
final readonly class InvoiceLineResourceData implements JsonSerializable
{
    public function __construct(
        public string $description,
        public int $quantityHundredths,
        public int $unitPriceCents,
        public ?string $vatOption,
        public int $totalCents,
    ) {}

    public static function from(InvoiceLine $line): self
    {
        return new self(
            description: $line->description,
            quantityHundredths: $line->quantity_hundredths,
            unitPriceCents: $line->unit_price_cents,
            vatOption: $line->vat_option?->apiName(),
            totalCents: $line->toAmounts()->totalCents(),
        );
    }

    /**
     * @return array{
     *     description: string,
     *     quantity_hundredths: int,
     *     unit_price_cents: int,
     *     vat_option: ?string,
     *     total_cents: int,
     * }
     */
    public function jsonSerialize(): array
    {
        return [
            'description' => $this->description,
            'quantity_hundredths' => $this->quantityHundredths,
            'unit_price_cents' => $this->unitPriceCents,
            'vat_option' => $this->vatOption,
            'total_cents' => $this->totalCents,
        ];
    }
}
