<?php

declare(strict_types = 1);

namespace App\Validation;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Accepts a well-formed IBAN in canonical form: uppercase, no spaces. Anything else, including a spaced or
 * lowercase value, is rejected: this rule validates one shape and does not normalise.
 *
 * Well-formed means: two letters, two check digits, 11 to 30 letters or digits, and the ISO 7064 mod-97 checksum
 * holds. A Dutch IBAN must also have the exact national shape (NL + 2 digits + 4-letter bank code + 10 digits),
 * because a wrong-length string passes mod-97 about one time in 97, and that gap is worth closing where the
 * shape is known. A passing value is well-formed, not proven to exist.
 */
final readonly class Iban implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        // A non-string is for the string rule to reject; this rule only reads what it can.
        if (! is_string($value))
        {
            return;
        }

        if (! $this->isWellFormed($value))
        {
            $fail('The :attribute field must be a valid IBAN.')->translate();
        }
    }

    private function isWellFormed(string $iban): bool
    {
        if (preg_match('/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/', $iban) !== 1)
        {
            return false;
        }

        if (str_starts_with($iban, 'NL') && preg_match('/^NL\d{2}[A-Z]{4}\d{10}$/', $iban) !== 1)
        {
            return false;
        }

        return $this->mod97($this->toDigits($iban)) === 1;
    }

    /**
     * The ISO 7064 rearrangement: the country code and check digits move to the end, then every letter becomes
     * two digits (A = 10 ... Z = 35), so the whole IBAN is one long decimal number.
     */
    private function toDigits(string $iban): string
    {
        $rearranged = substr($iban, 4).substr($iban, 0, 4);
        $digits = '';

        foreach (str_split($rearranged) as $character)
        {
            // ord('A') is 65 and A must become 10, hence the 55.
            $digits .= ctype_alpha($character) ? (string) (ord($character) - 55) : $character;
        }

        return $digits;
    }

    /**
     * The number can be 68 digits long and PHP's int stops at 19, so it is divided in pieces, like long division
     * by hand: the remainder so far (at most two digits) is prefixed to the next seven digits, and that number
     * (at most nine digits) is divided again. Modular arithmetic guarantees the same remainder as dividing the
     * whole number at once: (a·10^k + b) mod 97 = ((a mod 97)·10^k + b) mod 97. No bcmath or gmp needed.
     */
    private function mod97(string $digits): int
    {
        $remainder = 0;

        foreach (str_split($digits, 7) as $chunk)
        {
            $remainder = (int) ($remainder.$chunk) % 97;
        }

        return $remainder;
    }
}
