<?php

declare(strict_types = 1);

namespace App\Validation\Country\Netherlands;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Accepts a Dutch postcode in canonical form: four digits, one space, two uppercase letters ("1234 AB"). The
 * first digit is never 0, and the letter pairs SA, SD and SS are never issued, because of what they spelled out
 * in the past. Anything else, including "1234AB" or "1234 ab", is rejected: this rule validates one shape and
 * does not normalise. A passing value is well-formed, not proven to exist.
 */
final readonly class Postcode implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        // A non-string is for the string rule to reject; this rule only reads what it can.
        if (! is_string($value))
        {
            return;
        }

        if (preg_match('/^[1-9]\d{3} (?!SA|SD|SS)[A-Z]{2}$/', $value) !== 1)
        {
            $fail('The :attribute field must be a Dutch postcode, like 1234 AB.')->translate();
        }
    }
}
