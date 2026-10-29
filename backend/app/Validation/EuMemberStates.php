<?php

declare(strict_types = 1);

namespace App\Validation;

use LogicException;

/**
 * The EU member states, each with the prefix its VAT numbers carry.
 */
final class EuMemberStates
{
    /**
     * Keyed by ISO 3166-1 alpha-2 code. The prefix matches the code everywhere except Greece, whose VAT numbers use
     * EL, from its Greek name Ελλάδα.
     */
    private const array VAT_PREFIXES = [
        'AT' => 'AT', 'BE' => 'BE', 'BG' => 'BG', 'CY' => 'CY', 'CZ' => 'CZ', 'DE' => 'DE', 'DK' => 'DK',
        'EE' => 'EE', 'ES' => 'ES', 'FI' => 'FI', 'FR' => 'FR', 'GR' => 'EL', 'HR' => 'HR', 'HU' => 'HU',
        'IE' => 'IE', 'IT' => 'IT', 'LT' => 'LT', 'LU' => 'LU', 'LV' => 'LV', 'MT' => 'MT', 'NL' => 'NL',
        'PL' => 'PL', 'PT' => 'PT', 'RO' => 'RO', 'SE' => 'SE', 'SI' => 'SI', 'SK' => 'SK',
    ];

    public static function contains(string $countryCode): bool
    {
        return array_key_exists($countryCode, self::VAT_PREFIXES);
    }

    /**
     * Throws rather than returning null: a caller checks contains() first, so a non-member here is a bug, and a
     * nullable return would push a null check into every caller for it.
     */
    public static function vatPrefix(string $countryCode): string
    {
        if (! self::contains($countryCode))
        {
            throw new LogicException("{$countryCode} is not an EU member state.");
        }

        return self::VAT_PREFIXES[$countryCode];
    }
}
