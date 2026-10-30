<?php

declare(strict_types = 1);

namespace App\DataTransferObjects\Input\Invoice;

use App\Enums\VatOption;

/**
 * One line of a draft as the request hands it over. No position: the action numbers the lines from the order they
 * arrive in, so a request can't send two lines for one place.
 */
final readonly class InvoiceLineData
{
    public function __construct(
        public string $description,
        public int $quantityHundredths,
        public int $unitPriceCents,
        public ?VatOption $vatOption,
    ) {}

    /**
     * @return array{position: int, description: string, quantity_hundredths: int, unit_price_cents: int, vat_option: ?VatOption}
     */
    public function toAttributes(int $position): array
    {
        return [
            'position' => $position,
            'description' => $this->description,
            'quantity_hundredths' => $this->quantityHundredths,
            'unit_price_cents' => $this->unitPriceCents,
            'vat_option' => $this->vatOption,
        ];
    }
}
