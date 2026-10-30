<?php

declare(strict_types = 1);

namespace Database\Factories;

use App\Enums\VatOption;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<InvoiceLine>
 */
class InvoiceLineFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * A line at the high rate, which fits the invoice factory's domestic default. Position is always 1, so a test
     * with several lines on one invoice passes a sequence: positions are unique per invoice.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'invoice_id' => Invoice::factory(),
            'position' => 1,
            'description' => fake()->sentence(3),
            'quantity_hundredths' => fake()->numberBetween(25, 4000), // 0,25 to 40 units
            'unit_price_cents' => fake()->numberBetween(1000, 15000), // € 10 to € 150
            'vat_option' => VatOption::High,
        ];
    }
}
