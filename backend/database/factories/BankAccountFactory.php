<?php

declare(strict_types = 1);

namespace Database\Factories;

use App\Models\BankAccount;
use App\Models\Business;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<BankAccount>
 */
class BankAccountFactory extends Factory
{
    /**
     * Dutch IBANs in canonical form that pass the Iban rule's mod-97 check. A fixed list instead of generated
     * ones, so the factory doesn't need a second copy of the checksum code.
     */
    private const array IBANS = [
        'NL91ABNA0417164300',
        'NL20INGB0001234567',
        'NL44RABO0123456789',
        'NL69INGB0123456789',
        'NL18RABO0123459876',
    ];

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'business_id' => Business::factory(),
            // unique(): a plain random pick repeats within a few accounts and breaks the (business_id, iban) index
            // with an error far from its cause. This way the 6th account in one test throws an OverflowException
            // that names the problem; a test that needs more passes its own iban.
            'iban' => fake()->unique()->randomElement(self::IBANS),
            'label' => fake()->optional()->word(),
        ];
    }
}
