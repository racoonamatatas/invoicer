<?php

declare(strict_types = 1);

namespace App\Validation\Country\Netherlands;

use App\Validation\VatNumber;

/**
 * Accepts a Dutch VAT identification number (btw-id) in canonical form: NL, nine digits, B, two digits, all
 * uppercase and without spaces, 14 characters in all. This is a format check only: the two checksums in use
 * (mod-97 over the whole id for ids issued since 2020, the elfproef over the nine digits for the older
 * RSIN-based numbers) are not applied, so a passing value is well-formed, not proven to exist.
 *
 * The Dutch case of VatNumber: the EU-wide shape would let "NL12" through, so this narrows it to the Dutch format.
 */
final readonly class BtwId extends VatNumber
{
    public function __construct()
    {
        parent::__construct('NL');
    }

    protected function pattern(): string
    {
        return '/^NL\d{9}B\d{2}\z/';
    }

    protected function message(): string
    {
        return 'The :attribute field must be a valid btw-id, like NL123456789B01.';
    }
}
