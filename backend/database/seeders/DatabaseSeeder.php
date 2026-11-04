<?php

declare(strict_types = 1);

namespace Database\Seeders;

use App\Models\BankAccount;
use App\Models\Business;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database with one demo freelancer: a business, a bank account, three clients (one in
     * Belgium) and a draft invoice with lines.
     *
     * Every record comes from its factory, which keeps each one in the form the validation rules accept. Only the
     * fields a visitor reads are fixed here, so a new column only needs a factory change, not a seeder change.
     */
    public function run(): void
    {
        $user = User::factory()->create([
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'invoicer-local-dev',
        ]);

        $business = Business::factory()->for($user)->create([
            'registered_name' => 'Bakker Webontwerp',
            'street' => 'Oosterstraat',
            'house_number' => '14',
            'postal_code' => '9711 NV',
            'city' => 'Groningen',
        ]);

        $bankAccount = BankAccount::factory()->for($business)->create(['label' => 'Zakelijke rekening']);

        $client = Client::factory()->for($business)->create([
            'name' => 'Femke Wiersma',
            'city' => 'Groningen',
        ]);

        Client::factory()->for($business)->create([
            'name' => 'Hoekstra Fietsen',
            'vat_number' => 'NL123456789B01',
            'city' => 'Haren',
        ]);

        // The client abroad, inside the EU, so it may have a VAT number.
        Client::factory()->for($business)->create([
            'name' => 'Peeters Drukwerk',
            'vat_number' => 'BE0123456789',
            'postal_code' => '9000',
            'city' => 'Gent',
            'country_code' => 'BE',
        ]);

        Invoice::factory()
            ->for($business)
            ->has(
                InvoiceLine::factory()
                    ->count(3)
                    // Positions are unique per invoice, and the factory always gives 1.
                    ->sequence(
                        ['position' => 1, 'description' => 'Ontwerp website'],
                        ['position' => 2, 'description' => 'Bouw en oplevering'],
                        ['position' => 3, 'description' => 'Hosting, eerste jaar'],
                    ),
                'lines',
            )
            // Set explicitly: otherwise the factory's closures make an extra client and bank account.
            ->create(['client_id' => $client->id, 'bank_account_id' => $bankAccount->id]);
    }
}
