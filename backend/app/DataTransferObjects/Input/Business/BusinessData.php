<?php

declare(strict_types = 1);

namespace App\DataTransferObjects\Input\Business;

/**
 * A business as a create or update request hands it over: validated and in canonical form. Creating and updating
 * take the same fields, all of them, because PUT replaces the whole business. There is no region: a business
 * address is Dutch, the request prohibits one, and the column stays null.
 */
final readonly class BusinessData
{
    public function __construct(
        public string $legalName,
        public string $kvkNumber,
        public string $vatNumber,
        public string $street,
        public string $houseNumber,
        public ?string $houseNumberAddition,
        public string $postalCode,
        public string $city,
        public string $countryCode,
        public int $paymentTermDays,
    ) {}
}
