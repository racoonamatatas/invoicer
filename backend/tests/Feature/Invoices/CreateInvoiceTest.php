<?php

declare(strict_types = 1);

use App\Enums\InvoiceStatus;
use App\Models\BankAccount;
use App\Models\Business;
use App\Models\Client;
use App\Models\Invoice;

describe('Creating an invoice', function (): void {

    it('should return 201 (created) with the draft as show returns it, its lines numbered in the order sent, and store it', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $account = BankAccount::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", invoicePayload($client, $account, [
            'lines' => [
                ['description' => 'Advieswerk', 'quantity_hundredths' => 150, 'unit_price_cents' => 10000, 'vat_option' => 'high'],
                ['description' => 'Lesmateriaal', 'quantity_hundredths' => 100, 'unit_price_cents' => 2500, 'vat_option' => 'low'],
            ],
        ]));

        // Assert
        // 1,5 × €100 at 21% and 1 × €25 at 9%, worked out by hand. A draft has no number.
        $response->assertCreated();
        $invoice = $business->invoices()->sole();
        $response->assertExactJson([
            'id' => $invoice->id,
            'status' => 'draft',
            'vat_treatment' => 'domestic',
            'number' => null,
            'client_id' => $client->id,
            'bank_account_id' => $account->id,
            'payment_term_days' => 14,
            'lines' => [
                ['description' => 'Advieswerk', 'quantity_hundredths' => 150, 'unit_price_cents' => 10000, 'vat_option' => 'high', 'total_cents' => 15000],
                ['description' => 'Lesmateriaal', 'quantity_hundredths' => 100, 'unit_price_cents' => 2500, 'vat_option' => 'low', 'total_cents' => 2500],
            ],
            'totals' => [
                'subtotal_cents' => 17500,
                'vat_groups' => [
                    ['vat_option' => 'high', 'rate_percent' => 21, 'base_cents' => 15000, 'vat_cents' => 3150],
                    ['vat_option' => 'low', 'rate_percent' => 9, 'base_cents' => 2500, 'vat_cents' => 225],
                ],
                'vat_cents' => 3375,
                'total_cents' => 20875,
            ],
        ]);
        expect($invoice->status)->toBe(InvoiceStatus::Draft)
            ->and($invoice->lines()->orderBy('position')->pluck('description', 'position')->all())
            ->toBe([1 => 'Advieswerk', 2 => 'Lesmateriaal']);
    });

    it('should return 201 (created) with version 1 as a quoted ETag', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $account = BankAccount::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", invoicePayload($client, $account));

        // Assert
        $response->assertCreated()->assertHeader('ETag', '"1"');
        expect($business->invoices()->sole()->version)->toBe(1);
    });

    it('should return 201 (created) and store a null payment_term_days as null, not 0', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $account = BankAccount::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", invoicePayload($client, $account, ['payment_term_days' => null]));

        // Assert
        // null means "the business's default"; 0 would mean "pay at once".
        $response->assertCreated()->assertJsonPath('payment_term_days', null);
        expect($business->invoices()->sole()->payment_term_days)->toBeNull();
    });

    it('should return 201 (created) with no lines and zero totals for a draft without lines', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $account = BankAccount::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", invoicePayload($client, $account, ['lines' => []]));

        // Assert
        // A draft is edited freely; "at least one line" is a rule for sending.
        $response->assertCreated()
            ->assertJsonPath('lines', [])
            ->assertJsonPath('totals.total_cents', 0);
    });

    it('should return 201 (created) for reverse charge to an EU client outside NL with a VAT number, and for outside scope to a client outside the EU', function (string $treatment, array $clientAttributes): void {
        // Arrange
        // The passing side of the treatment rules, so a rule that refuses everything fails here.
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create($clientAttributes);
        $account = BankAccount::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", invoicePayload($client, $account, [
            'vat_treatment' => $treatment,
            'lines' => [
                ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000, 'vat_option' => null],
            ],
        ]));

        // Assert
        $response->assertCreated()
            ->assertJsonPath('vat_treatment', $treatment)
            ->assertJsonPath('lines.0.vat_option', null)
            ->assertJsonPath('totals.vat_cents', 0);
    })->with([
        'reverse charge, German client with a VAT number' => ['reverse_charge', ['country_code' => 'DE', 'vat_number' => 'DE123456789']],
        'outside scope, American client' => ['outside_scope', ['country_code' => 'US']],
    ]);

    it('should return 422 (unprocessable) on client_id or bank_account_id for one of another business of the same user, and store nothing', function (string $field): void {
        // Arrange
        // The same user's other business: the request has to scope the id to the URL's business, not just to the user.
        $business = Business::factory()->create();
        $otherBusiness = Business::factory()->for($business->user)->create();
        $client = Client::factory()->for($business)->create();
        $account = BankAccount::factory()->for($business)->create();
        $foreignId = match ($field)
        {
            'client_id' => Client::factory()->for($otherBusiness)->create()->id,
            'bank_account_id' => BankAccount::factory()->for($otherBusiness)->create()->id,
        };
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", invoicePayload($client, $account, [$field => $foreignId]));

        // Assert
        // A 422 on the field, not a 404: the id is in the body, not the URL.
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors([$field]);
        $this->assertDatabaseCount('invoices', 0);
    })->with(['client_id', 'bank_account_id']);

    it('should return 422 (unprocessable) on vat_treatment for a treatment that doesn\'t fit the client, and store nothing', function (string $treatment, array $clientAttributes, string $message): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create($clientAttributes);
        $account = BankAccount::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", invoicePayload($client, $account, [
            'vat_treatment' => $treatment,
            'lines' => [
                ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000, 'vat_option' => null],
            ],
        ]));

        // Assert
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors(['vat_treatment' => $message]);
        $this->assertDatabaseCount('invoices', 0);
    })->with([
        'reverse charge, Dutch client with a VAT number' => [
            'reverse_charge', ['country_code' => 'NL', 'vat_number' => 'NL123456789B01'], 'Reverse charge needs a client in an EU country other than the Netherlands.',
        ],
        'reverse charge, American client' => [
            'reverse_charge', ['country_code' => 'US'], 'Reverse charge needs a client in an EU country other than the Netherlands.',
        ],
        'reverse charge, German client without a VAT number' => [
            'reverse_charge', ['country_code' => 'DE', 'vat_number' => null], 'Reverse charge needs a client with a VAT number.',
        ],
        'outside scope, German client' => [
            'outside_scope', ['country_code' => 'DE'], 'Outside scope needs a client outside the EU.',
        ],
        'outside scope, Dutch client' => [
            'outside_scope', ['country_code' => 'NL'], 'Outside scope needs a client outside the EU.',
        ],
    ]);

    it('should return 422 (unprocessable) on a line\'s vat_option when a domestic line has none, or a non-domestic line has anything but null', function (string $treatment, array $line): void {
        // Arrange
        // A German client with a VAT number fits every treatment, so only the line can fail.
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create(['country_code' => 'DE', 'vat_number' => 'DE123456789']);
        $account = BankAccount::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", invoicePayload($client, $account, [
            'vat_treatment' => $treatment,
            'lines' => [$line],
        ]));

        // Assert
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors(['lines.0.vat_option']);
        $this->assertDatabaseCount('invoices', 0);
    })->with([
        'domestic without a VAT option' => [
            'domestic', ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000, 'vat_option' => null],
        ],
        'domestic with an unknown VAT option' => [
            'domestic', ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000, 'vat_option' => 'High'],
        ],
        'reverse charge with a VAT option' => [
            'reverse_charge', ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000, 'vat_option' => 'high'],
        ],
        // [] is empty, so a prohibited rule would let it through to toDto() and a 500.
        'reverse charge with an empty array as the VAT option' => [
            'reverse_charge', ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000, 'vat_option' => []],
        ],
        // An empty field is sent as null, never left out.
        'reverse charge with the VAT option left out' => [
            'reverse_charge', ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000],
        ],
    ]);

    it('should return 422 (unprocessable) on a line that sends a key the API doesn\'t take, such as a position', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $account = BankAccount::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", invoicePayload($client, $account, [
            'lines' => [
                ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000, 'vat_option' => 'high', 'position' => 5],
            ],
        ]));

        // Assert
        // The server numbers the lines, so a position from the client is refused rather than silently ignored.
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors(['lines.0']);
    });

    it('should return 422 (unprocessable) when payment_term_days is left out, rather than taking it as null', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $account = BankAccount::factory()->for($business)->create();
        $payload = invoicePayload($client, $account);
        unset($payload['payment_term_days']);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", $payload);

        // Assert
        // null means "the business's default", so it has to be sent on purpose.
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors(['payment_term_days']);
    });

    it('should return 422 (unprocessable), not 500, for an amount one over its cap', function (string $field, int $value): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $account = BankAccount::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", invoicePayload($client, $account, [
            'lines' => [
                ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000, 'vat_option' => 'high', $field => $value],
            ],
        ]));

        // Assert
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors(["lines.0.{$field}"]);
    })->with([
        'quantity_hundredths' => ['quantity_hundredths', 10_000_001],
        'unit_price_cents' => ['unit_price_cents', 100_000_001],
        'negative quantity_hundredths' => ['quantity_hundredths', -1],
        'negative unit_price_cents' => ['unit_price_cents', -1],
    ]);

    it('should return 422 (unprocessable) on lines for 101 lines', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $account = BankAccount::factory()->for($business)->create();
        $line = ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000, 'vat_option' => 'high'];
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", invoicePayload($client, $account, [
            'lines' => array_fill(0, 101, $line),
        ]));

        // Assert
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors(['lines']);
    });

    it('should return 201 (created) with a total of 1 210 000 000 000 000 cents for the largest invoice the caps allow', function (): void {
        // Arrange
        // 100 lines at both caps: 10^7 hundredths × 10^8 cents / 100 = 10^13 cents a line, 10^15 for all of them, and
        // 21% VAT on top. The frontend reads numbers exactly only up to about 9.0 × 10^15, so this must stay below it.
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $account = BankAccount::factory()->for($business)->create();
        $line = ['description' => 'Advieswerk', 'quantity_hundredths' => 10_000_000, 'unit_price_cents' => 100_000_000, 'vat_option' => 'high'];
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", invoicePayload($client, $account, [
            'lines' => array_fill(0, 100, $line),
        ]));

        // Assert
        $response->assertCreated()
            ->assertJsonPath('totals.subtotal_cents', 1_000_000_000_000_000)
            ->assertJsonPath('totals.vat_cents', 210_000_000_000_000)
            ->assertJsonPath('totals.total_cents', 1_210_000_000_000_000);
    });

    it('should return 404 (not found) for a business of another user, and store nothing', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $account = BankAccount::factory()->for($business)->create();
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", invoicePayload($client, $account));

        // Assert
        $response->assertNotFound();
        expect(Invoice::query()->count())->toBe(0);
    });

    it('should return 401 (unauthenticated) for a guest, and store nothing', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $account = BankAccount::factory()->for($business)->create();

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/invoices", invoicePayload($client, $account));

        // Assert
        $response->assertUnauthorized();
        expect(Invoice::query()->count())->toBe(0);
    });
});
