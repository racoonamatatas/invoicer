<?php

declare(strict_types = 1);

namespace App\Invoicing;

use App\Enums\VatOption;
use InvalidArgumentException;

/**
 * The numbers of one invoice line that the totals need: no description, no id. Amounts are integers (a quantity in
 * hundredths, a price in cents) because SQLite would store a decimal as a float.
 */
final readonly class InvoiceLineAmounts
{
    /**
     * A negative amount is refused here, so no negative line can exist: totalCents()'s rounding is half up only for
     * amounts of 0 or more. The request validates first, so this firing means a bug, hence a plain
     * InvalidArgumentException and no HTTP mapping. Zero is fine: a line of 0 hours or a free item rounds correctly.
     *
     * @throws InvalidArgumentException
     */
    public function __construct(
        public int $quantityHundredths,
        public int $unitPriceCents,
        public ?VatOption $vatOption,
    ) {
        if ($quantityHundredths < 0)
        {
            throw new InvalidArgumentException("An invoice line's quantity can't be negative, got {$quantityHundredths} hundredths.");
        }

        if ($unitPriceCents < 0)
        {
            throw new InvalidArgumentException("An invoice line's unit price can't be negative, got {$unitPriceCents} cents.");
        }
    }

    /**
     * Quantity × price, rounded to the cent, half up. The line owns this rounding so that the totals and anything that
     * shows a single line's total agree on it.
     */
    public function totalCents(): int
    {
        // Integer-only half-up rounding: adding half the divisor before intdiv() turns its truncation into rounding.
        // There is no float anywhere, so no 0.5 that is really 0.4999.
        return intdiv($this->quantityHundredths * $this->unitPriceCents + 50, 100);
    }
}
