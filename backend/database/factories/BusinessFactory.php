<?php

declare(strict_types = 1);

namespace Database\Factories;

use App\Models\Business;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Business>
 */
class BusinessFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * Every value is in the canonical form the validation rules accept, so a factory business would pass its own
     * create request: a test that compares the two never trips over formatting.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'legal_name' => fake()->company(),
            'kvk_number' => fake()->numerify('########'),
            // Format only, no checksum (INV-0059): the BtwId rule doesn't check one yet either.
            'vat_number' => fake()->numerify('NL#########B##'),
            'street' => fake()->streetName(),
            'house_number' => (string) fake()->numberBetween(1, 999),
            'house_number_addition' => null,
            // "1234 AB", first digit 1-9. Leaving S out of the first letter sidesteps the reserved SA, SD and SS.
            'postal_code' => fake()->regexify('[1-9][0-9]{3} [A-RT-Z][A-Z]'),
            'city' => fake()->city(),
            'region' => null,
            'country_code' => 'NL',
            'payment_term_days' => 30,
        ];
    }
}
