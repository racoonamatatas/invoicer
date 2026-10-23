<?php

declare(strict_types = 1);

namespace App\Validation;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Rejects a string holding a NUL byte. JSON allows "\u0000" in a string, and PHP's bcrypt refuses it with a
 * ValueError, which would turn a validation problem into a 500. Laravel's BcryptHasher doesn't check it either.
 */
final readonly class WithoutNulBytes implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        // A non-string is for the string rule to reject; this rule only reads what it can.
        if (! is_string($value))
        {
            return;
        }

        if (str_contains($value, "\0"))
        {
            $fail('The :attribute field must not contain a null character.')->translate();
        }
    }
}
