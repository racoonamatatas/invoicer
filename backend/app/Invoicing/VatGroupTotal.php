<?php

declare(strict_types = 1);

namespace App\Invoicing;

use App\Enums\VatOption;
use InvalidArgumentException;

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
     *
     * Refuses a negative base, because the rounding is half up only for 0 or more, and a base whose base × rate is too
     * large for an int. Lines can't be negative, so a negative base means a bug, hence InvalidArgumentException.
     *
     * @throws InvalidArgumentException
     */
    public static function forBase(VatOption $option, int $baseCents): self
    {
        if ($baseCents < 0)
        {
            throw new InvalidArgumentException("A VAT group's base can't be negative, got {$baseCents} cents.");
        }

        // An exempt group has no rate at all, so it has no VAT, rather than VAT at 0%.
        $ratePercent = $option->ratePercent();
        if ($ratePercent === null)
        {
            return new self($option, $baseCents, 0);
        }

        // base × rate + 50 must fit in an int, or PHP turns it into a float that intdiv() refuses with a TypeError. For
        // a rate above 0 that holds exactly when base ≤ intdiv(PHP_INT_MAX - 50, rate), a check that can't overflow.
        if ($ratePercent > 0 && $baseCents > intdiv(PHP_INT_MAX - self::PERCENT / 2, $ratePercent))
        {
            throw new InvalidArgumentException("A VAT group's base is too large to compute its VAT, got {$baseCents} cents.");
        }

        // Half up the same way as a line total: half the divisor added before intdiv() truncates.
        $vatCents = intdiv($baseCents * $ratePercent + self::PERCENT / 2, self::PERCENT);

        return new self($option, $baseCents, $vatCents);
    }
}
