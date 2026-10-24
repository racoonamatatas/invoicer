<?php

declare(strict_types = 1);

namespace App\Http\Resources;

use App\Models\Business;
use Illuminate\Contracts\Support\Responsable;
use JsonSerializable;

/**
 * A business as the frontend sees it. An allowlist, like UserResourceData: a new column on businesses stays
 * private until it is added here.
 */
final readonly class BusinessResourceData implements JsonSerializable, Responsable
{
    use RespondsWithJson;

    public function __construct(
        public int $id,
        public string $legalName,
        public string $kvkNumber,
        public string $vatNumber,
        public string $street,
        public string $houseNumber,
        public ?string $houseNumberAddition,
        public string $postalCode,
        public string $city,
        public ?string $region,
        public string $countryCode,
        public int $paymentTermDays,
    ) {}

    public static function from(Business $business): self
    {
        return new self(
            id: $business->id,
            legalName: $business->legal_name,
            kvkNumber: $business->kvk_number,
            vatNumber: $business->vat_number,
            street: $business->street,
            houseNumber: $business->house_number,
            houseNumberAddition: $business->house_number_addition,
            postalCode: $business->postal_code,
            city: $business->city,
            region: $business->region,
            countryCode: $business->country_code,
            paymentTermDays: $business->payment_term_days,
        );
    }

    /**
     * @return array{
     *     id: int,
     *     legal_name: string,
     *     kvk_number: string,
     *     vat_number: string,
     *     street: string,
     *     house_number: string,
     *     house_number_addition: ?string,
     *     postal_code: string,
     *     city: string,
     *     region: ?string,
     *     country_code: string,
     *     payment_term_days: int,
     * }
     */
    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'legal_name' => $this->legalName,
            'kvk_number' => $this->kvkNumber,
            'vat_number' => $this->vatNumber,
            'street' => $this->street,
            'house_number' => $this->houseNumber,
            'house_number_addition' => $this->houseNumberAddition,
            'postal_code' => $this->postalCode,
            'city' => $this->city,
            'region' => $this->region,
            'country_code' => $this->countryCode,
            'payment_term_days' => $this->paymentTermDays,
        ];
    }
}
