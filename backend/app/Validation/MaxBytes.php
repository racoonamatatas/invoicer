<?php

declare(strict_types = 1);

namespace App\Validation;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Caps a string's size in bytes. Laravel's max rule counts characters (mb_strlen), which is the wrong unit for a
 * limit that comes from storage or hashing: bcrypt reads 72 bytes, so 72 two-byte characters are 144 bytes.
 */
final readonly class MaxBytes implements ValidationRule
{
    public function __construct(
        private int $bytes,
    ) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        // A non-string is for the string rule to reject; this rule only measures what it can.
        if (! is_string($value))
        {
            return;
        }

        // strlen() counts bytes whatever the mbstring settings, which is exactly what bcrypt counts.
        if (strlen($value) > $this->bytes)
        {
            // Worded like Laravel's own max message, with the unit this rule measures in.
            $fail('The :attribute field must not be greater than :max bytes.')->translate(['max' => $this->bytes]);
        }
    }
}
