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
use RuntimeException;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database with one demo freelancer: a business, a bank account, three clients (one in
     * Belgium) and a draft invoice with lines.
     *
     * Every record comes from its factory, which keeps each one in the form the validation rules accept. Only the
     * fields a visitor reads are fixed here, so a new column only needs a factory change, not a seeder change.
     *
     * The demo password is in the README, so this throws in production rather than create an account anyone can log
     * in to. A throw, not a silent return: `db:seed --force` skips Laravel's production prompt, and whoever ran it
     * should learn that nothing was seeded.
     */
    public function run(): void
    {
        if (app()->isProduction())
        {
            throw new RuntimeException('The demo seeder creates a login whose password is public, so it does not run in production.');
        }

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
            'email' => 'femke.wiersma@example.com',
            'street' => 'Herestraat',
            'house_number' => '88',
            'postal_code' => '9711 LM',
            'city' => 'Groningen',
        ]);

        Client::factory()->for($business)->create([
            'name' => 'Hoekstra Fietsen',
            'email' => 'administratie@hoekstra-fietsen.example',
            'vat_number' => 'NL123456789B01',
            'street' => 'Rijksstraatweg',
            'house_number' => '210',
            'postal_code' => '9752 BK',
            'city' => 'Haren',
        ]);

        // The client abroad, inside the EU, so it may have a VAT number.
        Client::factory()->for($business)->create([
            'name' => 'Peeters Drukwerk',
            'email' => 'boekhouding@peeters-drukwerk.example',
            'vat_number' => 'BE0123456789',
            'street' => 'Veldstraat',
            'house_number' => '31',
            'postal_code' => '9000',
            'city' => 'Gent',
            'country_code' => 'BE',
        ]);

        Invoice::factory()
            ->for($business)
            ->has(
                InvoiceLine::factory()
                    ->count(3)
                    // Positions are unique per invoice, and the factory always gives 1. Amounts are fixed too, so the
                    // demo invoice has the same total after every reseed.
                    ->sequence(
                        ['position' => 1, 'description' => 'Ontwerp website', 'quantity_hundredths' => 1200, 'unit_price_cents' => 7500],
                        ['position' => 2, 'description' => 'Bouw en oplevering', 'quantity_hundredths' => 2400, 'unit_price_cents' => 7500],
                        ['position' => 3, 'description' => 'Hosting, eerste jaar', 'quantity_hundredths' => 100, 'unit_price_cents' => 12000],
                    ),
                'lines',
            )
            // Set explicitly: otherwise the factory's closures make an extra client and bank account.
            ->create(['client_id' => $client->id, 'bank_account_id' => $bankAccount->id]);
    }
}
