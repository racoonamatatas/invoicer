<?php

declare(strict_types = 1);

namespace Database\Factories;

use App\Enums\InvoiceStatus;
use App\Enums\VatTreatment;
use App\Models\BankAccount;
use App\Models\Business;
use App\Models\Client;
use App\Models\Invoice;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Invoice>
 */
class InvoiceFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * A domestic draft without lines. A test that needs lines adds them with has(InvoiceLine::factory()) and a
     * position sequence.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'business_id' => Business::factory(),
            // Closures, so the client and the account belong to the invoice's own business, whichever business a test
            // passes. Laravel resolves the keys in order, so business_id is already an id when these run.
            'client_id' => static fn (array $attributes): ClientFactory => Client::factory()->state(['business_id' => $attributes['business_id']]),
            'bank_account_id' => static fn (array $attributes): BankAccountFactory => BankAccount::factory()->state(['business_id' => $attributes['business_id']]),
            'status' => InvoiceStatus::Draft,
            'vat_treatment' => VatTreatment::Domestic,
            'number' => null,
            'payment_term_days' => null,
        ];
    }
}
