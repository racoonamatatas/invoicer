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
    /**
     * The rate is a percentage, so base × rate is in hundredths of a cent until it's divided by this.
     */
    private const int PERCENT = 100;

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
        // Half up the same way as a line total: half the divisor added before intdiv() truncates.
        $vatCents = $ratePercent === null ? 0 : intdiv($baseCents * $ratePercent + self::PERCENT / 2, self::PERCENT);

        return new self($option, $baseCents, $vatCents);
    }
}
