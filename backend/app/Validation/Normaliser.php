<?php

declare(strict_types = 1);

namespace App\Validation;

/**
 * Turns input into the one canonical shape the rules accept, for a request's prepareForValidation(). Every rule,
 * including unique, and the stored value then see "1234 AB", never "1234ab" and "1234 AB" as two values.
 *
 * Trimming is not here: Laravel's global TrimStrings middleware trims every string input, and
 * ConvertEmptyStringsToNull turns "" into null, before any request sees it.
 *
 * Each method hands back a non-string unchanged, so the string rule rejects it with its own message instead of
 * this class casting 1234 to "1234".
 */
final class Normaliser
{
    /**
     * For codes that are uppercase by definition, such as a country code. ASCII only, on purpose: strtoupper()
     * leaves "ß" and other non-ASCII letters alone, so the rule still rejects them rather than this method turning
     * them into something that passes.
     */
    public static function uppercase(mixed $value): mixed
    {
        return is_string($value) ? strtoupper($value) : $value;
    }

    /**
     * A btw-id as people write it, "NL 1234.56.789.B01" or "nl123456789b01", becomes "NL123456789B01": spaces and
     * dots removed, then uppercased. Only those two separators: anything else stays, for the BtwId rule to reject.
     */
    public static function btwId(mixed $value): mixed
    {
        return is_string($value) ? self::uppercase(str_replace([' ', '.'], '', $value)) : $value;
    }

    /**
     * Four digits and two letters, with or without spaces between and in any case, become "1234 AB". Anything
     * else is handed back as given, for the Postcode rule to reject: this method reshapes, it does not validate.
     */
    public static function dutchPostcode(mixed $value): mixed
    {
        if (! is_string($value) || preg_match('/^(\d{4}) *([a-zA-Z]{2})\z/', $value, $matches) !== 1)
        {
            return $value;
        }

        return $matches[1].' '.strtoupper($matches[2]);
    }
}
