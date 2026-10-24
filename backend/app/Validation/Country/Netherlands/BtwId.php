<?php

declare(strict_types = 1);

namespace App\Validation\Country\Netherlands;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Accepts a Dutch VAT identification number (btw-id) in canonical form: NL, nine digits, B, two digits, all
 * uppercase and without spaces, 14 characters in all. This is a format check only: the two checksums in use
 * (mod-97 over the whole id for ids issued since 2020, the elfproef over the nine digits for the older
 * RSIN-based numbers) are not applied, so a passing value is well-formed, not proven to exist.
 */
final readonly class BtwId implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        // A non-string is for the string rule to reject; this rule only reads what it can.
        if (! is_string($value))
        {
            return;
        }

        if (preg_match('/^NL\d{9}B\d{2}$/', $value) !== 1)
        {
            $fail('The :attribute field must be a valid btw-id, like NL123456789B01.')->translate();
        }
    }
}
