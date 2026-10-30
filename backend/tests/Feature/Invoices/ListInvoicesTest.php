<?php

declare(strict_types = 1);

use App\Enums\VatTreatment;
use App\Models\Business;
use App\Models\Invoice;

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
            ],
        ]);
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
