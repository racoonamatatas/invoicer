<?php

declare(strict_types = 1);

namespace App\DataTransferObjects\Input\Client;

/**
 * A client as a create or update request hands it over: validated and in canonical form. Creating and updating take
 * the same fields, all of them, because PUT replaces the whole client.
 */
final readonly class ClientData
{
    public function __construct(
        public string $name,
        public string $email,
        public ?string $vatNumber,
        public string $street,
        public string $houseNumber,
        public ?string $houseNumberAddition,
        public ?string $postalCode,
        public string $city,
        public ?string $region,
        public string $countryCode,
    ) {}

    /**
     * The columns as the model takes them, for creating and updating alike. A null is set, not left out, so a PUT
     * that drops the VAT number clears it.
     *
     * @return array{
     *     name: string,
     *     email: string,
     *     vat_number: ?string,
     *     street: string,
     *     house_number: string,
     *     house_number_addition: ?string,
     *     postal_code: ?string,
     *     city: string,
     *     region: ?string,
     *     country_code: string,
     * }
     */
    public function toAttributes(): array
    {
        return [
            'name' => $this->name,
            'email' => $this->email,
            'vat_number' => $this->vatNumber,
            'street' => $this->street,
            'house_number' => $this->houseNumber,
            'house_number_addition' => $this->houseNumberAddition,
            'postal_code' => $this->postalCode,
            'city' => $this->city,
            'region' => $this->region,
            'country_code' => $this->countryCode,
        ];
    }
}
