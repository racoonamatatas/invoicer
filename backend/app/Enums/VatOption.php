<?php

declare(strict_types = 1);

namespace App\Enums;

/**
 * The VAT a line on a Domestic invoice is charged at. The rates are Dutch law, not a setting: no user edits a
 * percentage, and if a rate ever changes, that is the day to add effective dates.
 *
 * The backing integers are what invoice_lines.vat_option stores, so they are a storage format, not an order: never
 * renumber or reuse one. They start at 1 so a stray 0 can't pass for an option.
 *
 * The order of the cases is a different thing: it's the order the VAT groups appear in on an invoice, because the
 * totals loop over cases(). So adding or moving a case is also a decision about how invoices look.
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

    /**
     * What the API sends and accepts for this option. Not the backing integer, which is a storage format, and not
     * derived from the case name, so renaming a case can't change the API.
     */
    public function apiName(): string
    {
        // No default arm: a new case throws an UnhandledMatchError until it has a name on the wire.
        return match ($this)
        {
            self::High => 'high',
            self::Low => 'low',
            self::Zero => 'zero',
            self::Exempt => 'exempt',
        };
    }

    /**
     * The case the API calls $name, or null for a name it doesn't know. The inbound side of apiName(), built from it so
     * the two can't disagree. Null rather than a throw: a request rule calls this, and there an unknown name is a 422,
     * not a bug.
     */
    public static function tryFromApiName(string $name): ?self
    {
        foreach (self::cases() as $case)
        {
            if ($case->apiName() === $name)
            {
                return $case;
            }
        }

        return null;
    }
}
