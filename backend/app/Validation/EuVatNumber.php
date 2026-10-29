<?php

declare(strict_types = 1);

namespace App\Validation;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Accepts a VAT number from an EU member state other than the Netherlands, in canonical form: the country's prefix
 * (from EuMemberStates, so EL for Greece), then 2 to 12 uppercase letters or digits, 14 characters at most. A shape
 * check only: each country has its own exact format, and whether the number exists is for VIES to answer, which is
 * known and planned to be added. A Dutch number goes through the stricter BtwId instead.
 */
final readonly class EuVatNumber implements ValidationRule
{
    public function __construct(private string $prefix) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        // A non-string is for the string rule to reject; this rule only reads what it can.
        if (! is_string($value))
        {
            return;
        }

        if (preg_match('/^'.preg_quote($this->prefix, '/').'[A-Z0-9]{2,12}\z/', $value) !== 1)
        {
            $fail("The :attribute field must be a VAT number starting with {$this->prefix}.")->translate();
        }
    }
}
