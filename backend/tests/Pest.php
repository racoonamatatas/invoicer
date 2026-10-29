<?php

declare(strict_types = 1);

use App\Enums\VatOption;
use App\Invoicing\InvoiceLineAmounts;
use App\Invoicing\InvoiceTotals;
use App\Invoicing\VatGroupTotal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind different classes or traits.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

// Validation rules are run through the Validator facade, which needs the app booted, but they touch no database,
// so they skip RefreshDatabase and the migrations it runs before every test.
pest()->extend(TestCase::class)
    ->in('Unit/Validation');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

function something()
{
    // ..
}

/**
 * A valid create or update body for a business, in canonical form, with $changes on top. A null in $changes
 * removes the field, the way a client that leaves it out sends the request.
 *
 * @param  array<string, mixed>  $changes
 * @return array<string, mixed>
 */
function businessPayload(array $changes = []): array
{
    return array_filter([
        'registered_name' => 'Bakkerij de Vries',
        'kvk_number' => '12345678',
        'vat_number' => 'NL123456789B01',
        'street' => 'Oosterstraat',
        'house_number' => '123',
        'house_number_addition' => 'A',
        'postal_code' => '9711 LM',
        'city' => 'Groningen',
        'country_code' => 'NL',
        'payment_term_days' => 30,
        ...$changes,
    ], static fn (mixed $value): bool => $value !== null);
}

/**
 * A valid create or update body for a Dutch client with a VAT number, in canonical form, with $changes on top. A
 * null in $changes removes the field, the way a client that leaves it out sends the request.
 *
 * @param  array<string, mixed>  $changes
 * @return array<string, mixed>
 */
function clientPayload(array $changes = []): array
{
    return array_filter([
        'name' => 'Jansen Advies',
        'email' => 'factuur@jansen.example',
        'vat_number' => 'NL123456789B01',
        'street' => 'Dorpsstraat',
        'house_number' => '12',
        'house_number_addition' => 'B',
        'postal_code' => '9712 CP',
        'city' => 'Groningen',
        'country_code' => 'NL',
        ...$changes,
    ], static fn (mixed $value): bool => $value !== null);
}

/**
 * An invoice line's amounts. No VAT option unless one is given, as on a ReverseCharge or OutsideScope line.
 */
function invoiceLine(int $quantityHundredths, int $unitPriceCents, ?VatOption $vatOption = null): InvoiceLineAmounts
{
    return new InvoiceLineAmounts($quantityHundredths, $unitPriceCents, $vatOption);
}

/**
 * The groups as plain [option, base, VAT] rows. VatGroupTotal's constructor is private, so a test can't build the
 * expected objects to compare against.
 *
 * @return list<array{VatOption, int, int}>
 */
function vatGroupRows(InvoiceTotals $totals): array
{
    return array_map(
        static fn (VatGroupTotal $group): array => [$group->option, $group->baseCents, $group->vatCents],
        $totals->vatGroups,
    );
}
