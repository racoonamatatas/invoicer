<?php

declare(strict_types = 1);

namespace App\Validation;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Accepts a VAT number from an EU member state in canonical form: the country's prefix (from EuMemberStates, so EL
 * for Greece), then 2 to 12 uppercase letters or digits, 14 characters at most. That shape fits every member state,
 * so it is the default; a country with a stricter format gets a subclass that overrides pattern() and message(). A
 * shape check only: whether the number exists is for VIES to answer, which is known and planned to be added.
 *
 * Not final, unlike the other rules here: being extended is its job. validate() is final instead, so a subclass
 * changes what is matched and what is said, never the steps around them.
 */
readonly class VatNumber implements ValidationRule
{
    public function __construct(protected string $prefix) {}

    final public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        // A non-string is for the string rule to reject; this rule only reads what it can.
        if (! is_string($value))
        {
            return;
        }

        if (preg_match($this->pattern(), $value) !== 1)
        {
            $fail($this->message())->translate();
        }
    }

    protected function pattern(): string
    {
        return '/^'.preg_quote($this->prefix, '/').'[A-Z0-9]{2,12}\z/';
    }

    protected function message(): string
    {
        return "The :attribute field must be a VAT number starting with {$this->prefix}.";
    }
}
