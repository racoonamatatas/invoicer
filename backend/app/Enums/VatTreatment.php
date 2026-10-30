<?php

declare(strict_types = 1);

namespace App\Enums;

/**
 * How VAT applies to a whole invoice, set on the invoice rather than per line:
 *
 * - Domestic: Dutch VAT on every line, each at its own VatOption.
 * - ReverseCharge: a business client in another EU country, with a VAT number. The client accounts for the VAT
 *   ("btw verlegd"), so the invoice charges none.
 * - OutsideScope: a client outside the EU. No Dutch VAT applies.
 *
 * "Domestic" is relative to the business's country, which is the Netherlands only for now: a business must be
 * registered there.
 *
 * The backing integers are what invoices.vat_treatment stores, so they are a storage format, not an order: never
 * renumber or reuse one.
 */
enum VatTreatment: int
{
    case Domestic = 1;
    case ReverseCharge = 2;
    case OutsideScope = 3;

    /**
     * Whether this invoice charges VAT itself, and so whether its lines carry a VatOption. Not "has VAT": on a
     * reverse-charge invoice VAT is still due, but the client pays it, not us.
     */
    public function chargesVat(): bool
    {
        // No default arm: a new treatment throws an UnhandledMatchError until someone decides whether it charges VAT.
        return match ($this)
        {
            self::Domestic => true,
            self::ReverseCharge, self::OutsideScope => false,
        };
    }

    /**
     * What the API sends and accepts for this treatment. Not the backing integer, which is a storage format, and not
     * derived from the case name, so renaming a case can't change the API.
     */
    public function apiName(): string
    {
        // No default arm: a new case throws an UnhandledMatchError until it has a name on the wire.
        return match ($this)
        {
            self::Domestic => 'domestic',
            self::ReverseCharge => 'reverse_charge',
            self::OutsideScope => 'outside_scope',
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
