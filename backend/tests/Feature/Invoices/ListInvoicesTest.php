<?php

declare(strict_types = 1);

use App\Enums\VatOption;
use App\Enums\VatTreatment;
use App\Models\Business;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use Illuminate\Support\Facades\DB;

describe('Listing invoices', function (): void {

    it('should return 200 (ok) with only this business\'s invoices, newest first', function (): void {
        // Arrange
        $business = Business::factory()->create();
        // The older invoice gets the later created_at, so a sort on created_at instead of id puts them the other way
        // round rather than tying and passing by luck.
        $first = Invoice::factory()->for($business)->create(['created_at' => now()]);
        $second = Invoice::factory()->for($business)->create(['created_at' => now()->subDay()]);
        // An invoice of the same user's other business: listed under that business's URL, not this one.
        Invoice::factory()->for(Business::factory()->for($business->user))->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/invoices");

        // Assert
        $response->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.id', $second->id)
            ->assertJsonPath('1.id', $first->id);
    });

    it('should return 200 (ok) with exactly the allowlisted keys of each invoice, enums as API names', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $invoice = Invoice::factory()->for($business)->create([
            'vat_treatment' => VatTreatment::ReverseCharge,
            'payment_term_days' => 14,
        ]);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/invoices");

        // Assert
        // assertExactJson: an extra key such as business_id or lines fails this, so nothing leaks unnoticed. The
        // enums are literal strings, so a renamed API name fails it too.
        $response->assertOk()->assertExactJson([
            [
                'id' => $invoice->id,
                'status' => 'draft',
                'vat_treatment' => 'reverse_charge',
                'number' => null,
                'client_id' => $invoice->client_id,
                'bank_account_id' => $invoice->bank_account_id,
                'payment_term_days' => 14,
                'total_cents' => 0, // no lines yet
            ],
        ]);
    });

    it('should return 200 (ok) with each invoice\'s total computed from its lines, VAT rounded once per group', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $invoice = Invoice::factory()->for($business)->create();
        // Three lines of €10,01 at 21%: VAT on the group's base is 630,63 → 631, so the total is 3634. A sum of
        // per-line rounded VAT (3 × 210) would give 3633, so this fails if the list adds up totals itself.
        InvoiceLine::factory()->for($invoice)->count(3)->sequence(
            ['position' => 1],
            ['position' => 2],
            ['position' => 3],
        )->create([
            'quantity_hundredths' => 100,
            'unit_price_cents' => 1001,
            'vat_option' => VatOption::High,
        ]);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/invoices");

        // Assert
        $response->assertOk()->assertJsonPath('0.total_cents', 3634);
    });

    it('should return 200 (ok) with a reverse-charge invoice\'s total equal to its lines, with no VAT added', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $invoice = Invoice::factory()->for($business)->create(['vat_treatment' => VatTreatment::ReverseCharge]);
        // 1,5 × €100 and 1 × €25: 15000 + 2500. At 21% the same lines would total 21175.
        InvoiceLine::factory()->for($invoice)->sequence(
            ['position' => 1, 'quantity_hundredths' => 150, 'unit_price_cents' => 10000],
            ['position' => 2, 'quantity_hundredths' => 100, 'unit_price_cents' => 2500],
        )->count(2)->create(['vat_option' => null]);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/invoices");

        // Assert
        $response->assertOk()->assertJsonPath('0.total_cents', 17500);
    });

    it('should load the lines of all invoices in one query, however many invoices there are', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');
        $queriesForList = function () use ($business): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson("/api/businesses/{$business->id}/invoices")->assertOk();

            return count(DB::getQueryLog());
        };
        InvoiceLine::factory()->for(Invoice::factory()->for($business))->create();
        $queriesForOne = $queriesForList();
        InvoiceLine::factory()->for(Invoice::factory()->for($business))->create();
        InvoiceLine::factory()->for(Invoice::factory()->for($business))->create();

        // Act
        $queriesForThree = $queriesForList();

        // Assert
        // The same count, not a fixed number: the session and the business binding query too, and this test is
        // about the lines only. Without the eager load, each extra invoice adds one query for its lines.
        expect($queriesForThree)->toBe($queriesForOne);
    });

    it('should return 404 (not found) for a business of another user', function (): void {
        // Arrange
        $business = Business::factory()->create();
        Invoice::factory()->for($business)->create();
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/invoices");

        // Assert
        $response->assertNotFound();
    });

    it('should return 401 (unauthorized) for a guest', function (): void {
        // Arrange
        $business = Business::factory()->create();

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/invoices");

        // Assert
        $response->assertUnauthorized();
    });
});
