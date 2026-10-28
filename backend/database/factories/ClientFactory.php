<?php

declare(strict_types = 1);

namespace Database\Factories;

use App\Models\Business;
use App\Models\Client;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Client>
 */
class ClientFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * A Dutch client without a VAT number. Every value is in the canonical form the validation rules accept, so a
     * factory client would pass its own create request. A test that needs a client abroad or a business client
     * passes those fields itself.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'business_id' => Business::factory(),
            'name' => fake()->name(),
            'email' => fake()->safeEmail(),
            'vat_number' => null,
            'street' => fake()->streetName(),
            'house_number' => (string) fake()->numberBetween(1, 999),
            'house_number_addition' => null,
            // "1234 AB", first digit 1-9. Leaving S out of the first letter sidesteps the reserved SA, SD and SS.
            'postal_code' => fake()->regexify('[1-9][0-9]{3} [A-RT-Z][A-Z]'),
            'city' => fake()->city(),
            'region' => null,
            'country_code' => 'NL',
        ];
    }
}
