<?php

declare(strict_types = 1);

namespace App\Validation\Country\Netherlands;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Accepts a Dutch house number: a whole number from 1 to 99999, digits only, no leading zero. A letter or an
 * addition ("12a", "12-2", "12 bis") is rejected, because the BAG keeps those apart (huisletter and
 * huisnummertoevoeging) and so does house_number_addition: storing "12a" here and "12" + "a" elsewhere would be
 * two ways to write one address. The value stays a string, so a well-formed number is not proven to exist.
 */
final readonly class HouseNumber implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        // A non-string is for the string rule to reject; this rule only reads what it can.
        if (! is_string($value))
        {
            return;
        }

        if (preg_match('/^[1-9]\d{0,4}\z/', $value) !== 1)
        {
            $fail('The :attribute field must be a Dutch house number, like 12.')->translate();
        }
    }
}
