<?php

declare(strict_types = 1);

namespace App\Invoicing;

use App\Enums\VatOption;

/**
 * The lines of one VatOption added together, with the VAT on them. The constructor is private so a group's VAT always
 * comes from its base: forBase() is the only way in.
 */
final readonly class VatGroupTotal
{
    private function __construct(
        public VatOption $option,
        public int $baseCents,
        public int $vatCents,
    ) {}

    /**
     * Computes the VAT once on the whole base and rounds it once, half up. Rounding per line instead can be a cent
     * off: three lines of €10.01 at 21% give €6.30 that way and €6.31 on the base, and the invoice shows the base.
     */
    public static function forBase(VatOption $option, int $baseCents): self
    {
        // An exempt group has no rate at all, so it has no VAT, rather than VAT at 0%.
        $ratePercent = $option->ratePercent();
        $vatCents = $ratePercent === null ? 0 : intdiv($baseCents * $ratePercent + 50, 100);

        return new self($option, $baseCents, $vatCents);
    }
}
