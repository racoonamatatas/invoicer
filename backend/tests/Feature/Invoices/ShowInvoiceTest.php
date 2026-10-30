<?php

declare(strict_types = 1);

use App\Enums\VatOption;
use App\Enums\VatTreatment;
use App\Models\Business;
use App\Models\Invoice;
use App\Models\InvoiceLine;

describe('Showing an invoice', function (): void {

    it('should return 200 (ok) with exactly the allowlisted keys, the lines in position order and the totals', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $invoice = Invoice::factory()->for($business)->create(['payment_term_days' => 14]);
        // Position 2 is stored first, so a list in insertion order would come back the wrong way round. This can't
        // catch a missing orderBy('position') on SQLite, though: it reads the lines through the (invoice_id, position)
        // index, which happens to return them in order. InvoiceLinesOrderTest checks the ORDER BY itself.
        InvoiceLine::factory()->for($invoice)->create([
            'position' => 2,
            'description' => 'Lesmateriaal',
            'quantity_hundredths' => 100,
            'unit_price_cents' => 2500,
            'vat_option' => VatOption::Low,
        ]);
        InvoiceLine::factory()->for($invoice)->create([
            'position' => 1,
            'description' => 'Advieswerk',
            'quantity_hundredths' => 150,
            'unit_price_cents' => 10000,
            'vat_option' => VatOption::High,
        ]);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/invoices/{$invoice->id}");

        // Assert
        // assertExactJson: an extra key anywhere, such as a line's id or position, fails this. 1,5 × €100 at 21% and
        // 1 × €25 at 9%, worked out by hand.
        $response->assertOk()->assertExactJson([
            'id' => $invoice->id,
            'status' => 'draft',
            'vat_treatment' => 'domestic',
            'number' => null,
            'client_id' => $invoice->client_id,
            'bank_account_id' => $invoice->bank_account_id,
            'payment_term_days' => 14,
            'lines' => [
                [
                    'description' => 'Advieswerk',
                    'quantity_hundredths' => 150,
                    'unit_price_cents' => 10000,
                    'vat_option' => 'high',
                    'total_cents' => 15000,
                ],
                [
                    'description' => 'Lesmateriaal',
                    'quantity_hundredths' => 100,
                    'unit_price_cents' => 2500,
                    'vat_option' => 'low',
                    'total_cents' => 2500,
                ],
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
    });

    it('should return 200 (ok) with a null vat_option on each line and no VAT groups for a reverse-charge or outside-scope invoice', function (VatTreatment $treatment, string $apiName): void {
        // Arrange
        $business = Business::factory()->create();
        $invoice = Invoice::factory()->for($business)->create(['vat_treatment' => $treatment]);
        InvoiceLine::factory()->for($invoice)->create([
            'description' => 'Advieswerk',
            'quantity_hundredths' => 200,
            'unit_price_cents' => 7500,
            'vat_option' => null,
        ]);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/invoices/{$invoice->id}");

        // Assert
        $response->assertOk()
            ->assertJsonPath('vat_treatment', $apiName)
            ->assertJsonPath('lines', [[
                'description' => 'Advieswerk',
                'quantity_hundredths' => 200,
                'unit_price_cents' => 7500,
                'vat_option' => null,
                'total_cents' => 15000,
            ]])
            ->assertJsonPath('totals', [
                'subtotal_cents' => 15000,
                'vat_groups' => [],
                'vat_cents' => 0,
                'total_cents' => 15000,
            ]);
    })->with([
        'ReverseCharge' => [VatTreatment::ReverseCharge, 'reverse_charge'],
        'OutsideScope' => [VatTreatment::OutsideScope, 'outside_scope'],
    ]);

    it('should return 200 (ok) with a null rate_percent for the VAT group of an exempt line', function (): void {
        // Arrange
        // Exempt has no rate at all, unlike Zero's 0%, so the group must say null rather than 0.
        $business = Business::factory()->create();
        $invoice = Invoice::factory()->for($business)->create();
        InvoiceLine::factory()->for($invoice)->create([
            'quantity_hundredths' => 100,
            'unit_price_cents' => 4000,
            'vat_option' => VatOption::Exempt,
        ]);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/invoices/{$invoice->id}");

        // Assert
        $response->assertOk()
            ->assertJsonPath('lines.0.vat_option', 'exempt')
            ->assertJsonPath('totals', [
                'subtotal_cents' => 4000,
                'vat_groups' => [
                    ['vat_option' => 'exempt', 'rate_percent' => null, 'base_cents' => 4000, 'vat_cents' => 0],
                ],
                'vat_cents' => 0,
                'total_cents' => 4000,
            ]);
    });

    it('should return 200 (ok) with no lines and zero totals for an invoice without lines', function (): void {
        // Arrange. A new draft has no lines until the first one is added.
        $business = Business::factory()->create();
        $invoice = Invoice::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/invoices/{$invoice->id}");

        // Assert
        $response->assertOk()
            ->assertJsonPath('lines', [])
            ->assertJsonPath('totals', [
                'subtotal_cents' => 0,
                'vat_groups' => [],
                'vat_cents' => 0,
                'total_cents' => 0,
            ]);
    });

    it('should return 404 (not found) for the id of an invoice under the user\'s other business', function (): void {
        // Arrange. Both businesses are the user's, so only the scoped binding stands between them.
        $business = Business::factory()->create();
        $otherBusinessInvoice = Invoice::factory()->for(Business::factory()->for($business->user))->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/invoices/{$otherBusinessInvoice->id}");

        // Assert
        $response->assertNotFound();
    });

    it('should return 404 (not found) for an invoice under a business of another user', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $invoice = Invoice::factory()->for($business)->create();
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/invoices/{$invoice->id}");

        // Assert
        $response->assertNotFound();
    });

    it('should return the same 404 (not found) for an existing and an unknown invoice id under a business of another user', function (): void {
        // Arrange. If {invoice} were looked up before the owner check, the existing id would answer differently and
        // reveal that it belongs to this business.
        config(['app.debug' => false]); // production's body; debug adds a trace with this file's line numbers
        $business = Business::factory()->create();
        $invoice = Invoice::factory()->for($business)->create();
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $existing = $this->getJson("/api/businesses/{$business->id}/invoices/{$invoice->id}");
        $unknown = $this->getJson("/api/businesses/{$business->id}/invoices/".($invoice->id + 1000));

        // Assert. The whole body too, not only the status: a different body would leak the same way.
        $existing->assertNotFound();
        $unknown->assertNotFound();
        expect($existing->json())->toBe($unknown->json());
    });

    it('should return 404 (not found) for an unknown invoice id', function (): void {
        // Guards third-party code: Laravel's ImplicitRouteBinding turns a missing Invoice into the 404, as long as
        // InvoiceController::show() type-hints Invoice.

        // Arrange
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/invoices/999999");

        // Assert
        $response->assertNotFound();
    });

    it('should return 404 (not found) for a non-numeric invoice id without querying the database', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');

        // Act & Assert: whereNumber() on the route rejects "abc" before any binding would look it up.
        $this->expectsDatabaseQueryCount(0);
        $this->getJson("/api/businesses/{$business->id}/invoices/abc")->assertNotFound();
    });

    it('should return 401 (unauthorized) for a guest', function (): void {
        // Arrange
        $invoice = Invoice::factory()->create();

        // Act
        $response = $this->getJson("/api/businesses/{$invoice->business_id}/invoices/{$invoice->id}");

        // Assert
        $response->assertUnauthorized();
    });
});
