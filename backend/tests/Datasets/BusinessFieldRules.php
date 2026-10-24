<?php

declare(strict_types = 1);

/*
 * One rejected value per field rule of a business request, with the message the API sends. Shared by the create
 * and the update tests, because both requests take their rules from BusinessRequest. The rule classes' own tests
 * carry the detailed cases; this proves each rule is wired to its field.
 */
dataset('business field rules', [
    'legal name missing' => [['legal_name' => null], 'legal_name', 'The legal name field is required.'],
    'legal name too long' => [['legal_name' => str_repeat('x', 256)], 'legal_name', 'The legal name field must not be greater than 255 characters.'],
    'kvk number missing' => [['kvk_number' => null], 'kvk_number', 'The kvk number field is required.'],
    'kvk number of 7 digits' => [['kvk_number' => '1234567'], 'kvk_number', 'The kvk number field must be a KvK number of 8 digits.'],
    'vat number missing' => [['vat_number' => null], 'vat_number', 'The vat number field is required.'],
    'vat number malformed' => [['vat_number' => 'NL123456789'], 'vat_number', 'The vat number field must be a valid btw-id, like NL123456789B01.'],
    'street missing' => [['street' => null], 'street', 'The street field is required.'],
    'house number missing' => [['house_number' => null], 'house_number', 'The house number field is required.'],
    'house number with a letter' => [['house_number' => '12a'], 'house_number', 'The house number field must be a Dutch house number, like 12.'],
    'house number addition too long' => [['house_number_addition' => str_repeat('x', 11)], 'house_number_addition', 'The house number addition field must not be greater than 10 characters.'],
    'postcode missing' => [['postal_code' => null], 'postal_code', 'The postal code field is required.'],
    // Three digits: a shape the normaliser can't fix, so the Postcode rule sees it.
    'postcode malformed' => [['postal_code' => '123 AB'], 'postal_code', 'The postal code field must be a Dutch postcode, like 1234 AB.'],
    'city missing' => [['city' => null], 'city', 'The city field is required.'],
    'region given' => [['region' => 'Noord-Holland'], 'region', 'The region field is prohibited.'],
    'country code missing' => [['country_code' => null], 'country_code', 'The country code field is required.'],
    'country code unknown' => [['country_code' => 'XX'], 'country_code', 'The country code field must be a country code, like NL.'],
    // A real country, and a valid one for a client, but a business is a KvK registration.
    'country code not NL' => [['country_code' => 'DE'], 'country_code', 'A business must be registered in the Netherlands.'],
    'payment term missing' => [['payment_term_days' => null], 'payment_term_days', 'The payment term days field is required.'],
    'payment term as a string' => [['payment_term_days' => '30'], 'payment_term_days', 'The payment term days field must be an integer.'],
    'payment term of 0 days' => [['payment_term_days' => 0], 'payment_term_days', 'The payment term days field must be between 1 and 365.'],
    'payment term of 366 days' => [['payment_term_days' => 366], 'payment_term_days', 'The payment term days field must be between 1 and 365.'],
]);
