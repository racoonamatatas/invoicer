<?php

declare(strict_types = 1);

namespace App\Validation;

use App\Validation\Country\Netherlands\BtwId;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Built for one EU country's VAT prefix (EL for Greece); checks that a VAT number is that prefix plus 2 to 12
 * uppercase letters or digits. A country with a stricter format subclasses it. A format check only: VIES is planned.
 *
 * Not final, so it can be extended; validate() is final instead, so a subclass only changes pattern() and message().
 */
readonly class EuVatNumber implements ValidationRule
{
    public function __construct(protected string $prefix) {}

    /**
     * The one place that names a country with its own format; every other member state gets the default.
     */
    public static function forCountry(string $countryCode): self
    {
        return match ($countryCode)
        {
            'NL' => new BtwId,
            // vatPrefix() throws for a country outside the EU: whether such a client may have a VAT number at all
            // is the request's decision, made before it asks for a rule.
            default => new self(EuMemberStates::vatPrefix($countryCode)),
        };
    }

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
