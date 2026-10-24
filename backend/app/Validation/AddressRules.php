<?php

declare(strict_types = 1);

namespace App\Validation;

use App\Validation\Country\Netherlands\Postcode;
use Illuminate\Support\Fluent;
use Illuminate\Validation\ConditionalRules;
use Illuminate\Validation\Rule;

final class AddressRules
{
    /**
     * Rules for the structured address shared by businesses, clients and the invoice snapshot. The shape fits every
     * country; when country_code is NL the rules tighten to what a Dutch address is. Input reaches these rules in
     * canonical form (trimmed, postcode "1234 AB", country code uppercase): the request normalises it first.
     *
     * @return array<string, list<ConditionalRules|CountryCode|string>>
     */
    public static function forAddress(): array
    {
        // The one place that decides which side applies. It reads the input as given, so an unknown or missing
        // country code is "not NL": the loose side, which country_code's own rules then reject anyway.
        $isDutch = static fn (Fluent $input): bool => $input->get('country_code') === 'NL';

        return [
            'street' => ['required', 'string', 'max:255'],
            // A string, not an integer, everywhere: "12" and "012" must not become the same, and abroad a house
            // number can be "12-14" or "Apt 3". In NL it is a number from 1 to 99999; letters go in the addition.
            'house_number' => ['required', 'string', Rule::when($isDutch, ['regex:/^[1-9]\d{0,4}\z/'], ['max:10'])],
            'house_number_addition' => ['nullable', 'string', 'max:10'],
            // Not every country has postcodes (Ireland had none until 2015, Hong Kong has none), so only NL requires one.
            'postal_code' => [Rule::when($isDutch, ['required', 'string', new Postcode], ['nullable', 'string', 'max:12'])],
            'city' => ['required', 'string', 'max:255'],
            // A state or province, which some countries need on an address. The Netherlands has provinces, but they
            // are never part of an address, so for NL the field must be empty rather than silently stored.
            'region' => [Rule::when($isDutch, ['prohibited'], ['nullable', 'string', 'max:255'])],
            'country_code' => ['required', 'string', new CountryCode],
        ];
    }
}
