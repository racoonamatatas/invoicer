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

    /**
     * The columns as the model takes them, for creating and updating alike. region is set to null rather than
     * left out, so a PUT replaces every address column.
     *
     * @return array{
     *     legal_name: string,
     *     kvk_number: string,
     *     vat_number: string,
     *     street: string,
     *     house_number: string,
     *     house_number_addition: ?string,
     *     postal_code: string,
     *     city: string,
     *     region: null,
     *     country_code: string,
     *     payment_term_days: int,
     * }
     */
    public function toAttributes(): array
    {
        return [
            'legal_name' => $this->legalName,
            'kvk_number' => $this->kvkNumber,
            'vat_number' => $this->vatNumber,
            'street' => $this->street,
            'house_number' => $this->houseNumber,
            'house_number_addition' => $this->houseNumberAddition,
            'postal_code' => $this->postalCode,
            'city' => $this->city,
            'region' => null,
            'country_code' => $this->countryCode,
            'payment_term_days' => $this->paymentTermDays,
        ];
    }
}
