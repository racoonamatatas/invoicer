<?php

declare(strict_types = 1);

namespace App\Http\Resources;

use App\Models\Client;
use Illuminate\Contracts\Support\Responsable;
use JsonSerializable;

/**
 * A client as the frontend sees it. An allowlist: a new column on clients stays private until it is added here.
 * business_id is left out: the URL the frontend asked already holds it.
 */
final readonly class ClientResourceData implements JsonSerializable, Responsable
{
    use RespondsWithJson;

    public function __construct(
        public int $id,
        public string $name,
        public ?string $email,
        public ?string $vatNumber,
        public string $street,
        public string $houseNumber,
        public ?string $houseNumberAddition,
        public ?string $postalCode,
        public string $city,
        public ?string $region,
        public string $countryCode,
    ) {}

    public static function from(Client $client): self
    {
        return new self(
            id: $client->id,
            name: $client->name,
            email: $client->email,
            vatNumber: $client->vat_number,
            street: $client->street,
            houseNumber: $client->house_number,
            houseNumberAddition: $client->house_number_addition,
            postalCode: $client->postal_code,
            city: $client->city,
            region: $client->region,
            countryCode: $client->country_code,
        );
    }

    /**
     * @return array{
     *     id: int,
     *     name: string,
     *     email: ?string,
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
    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
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
