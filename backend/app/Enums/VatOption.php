<?php

declare(strict_types = 1);

namespace App\Enums;

/**
 * The VAT a line on a Domestic invoice is charged at. The rates are Dutch law, not a setting: no user edits a
 * percentage, and if a rate ever changes, that is the day to add effective dates.
 *
 * The backing integers are what invoice_lines.vat_option stores, so they are a storage format, not an order: never
 * renumber or reuse one. They start at 1 so a stray 0 can't pass for an option.
 */
enum VatOption: int
{
    case High = 1;
    case Low = 2;
    case Zero = 3;
    case Exempt = 4;

    /**
     * Zero and Exempt both charge no VAT, but they differ: 0% is a rate the invoice shows, while an exempt line has no
     * rate at all because VAT doesn't apply to it. Hence null, not 0.
     */
    public function ratePercent(): ?int
    {
        // No default arm: a new case without a rate throws an UnhandledMatchError instead of falling through to a
        // made-up rate.
        return match ($this)
        {
            self::High => 21,
            self::Low => 9,
            self::Zero => 0,
            self::Exempt => null,
        };
    }
}
