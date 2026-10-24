<?php

declare(strict_types = 1);

namespace App\Validation\Country\Netherlands;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Accepts a KvK number: exactly eight digits, as the Kamer van Koophandel issues them. A leading zero is a digit
 * like any other, so the value is a string, never an integer. There is no checksum to check, and a passing value
 * is well-formed, not proven to exist.
 */
final readonly class KvkNumber implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        // A non-string is for the string rule to reject; this rule only reads what it can.
        if (! is_string($value))
        {
            return;
        }

        if (preg_match('/^\d{8}\z/', $value) !== 1)
        {
            $fail('The :attribute field must be a KvK number of 8 digits.')->translate();
        }
    }
}
