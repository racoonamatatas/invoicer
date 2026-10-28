<?php

declare(strict_types = 1);

use App\Models\BankAccount;
use App\Models\Business;

describe('Deleting a bank account', function (): void {

    it('should return 204 (no content) and remove the account', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $account = BankAccount::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->deleteJson("/api/businesses/{$business->id}/bank-accounts/{$account->id}");

        // Assert
        $response->assertNoContent();
        expect(BankAccount::query()->whereKey($account->id)->exists())->toBeFalse();
    });

    it('should return 404 (not found) for an account of the user\'s other business, and keep it', function (): void {
        // Arrange. Both businesses are the user's, so only the scoped binding refuses this.
        $business = Business::factory()->create();
        $sibling = BankAccount::factory()->for(Business::factory()->for($business->user))->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->deleteJson("/api/businesses/{$business->id}/bank-accounts/{$sibling->id}");

        // Assert
        $response->assertNotFound();
        expect(BankAccount::query()->whereKey($sibling->id)->exists())->toBeTrue();
    });

    it('should return 404 (not found) for a business of another user, and keep the account', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $account = BankAccount::factory()->for($business)->create();
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $response = $this->deleteJson("/api/businesses/{$business->id}/bank-accounts/{$account->id}");

        // Assert
        $response->assertNotFound();
        expect(BankAccount::query()->whereKey($account->id)->exists())->toBeTrue();
    });

    it('should return the same 404 (not found) for an existing and an unknown account id on a business of another user', function (): void {
        // Arrange. If {bankAccount} were looked up before the owner check, the existing id would answer differently
        // and reveal that it belongs to this business.
        config(['app.debug' => false]); // production's body; debug adds a trace with this file's line numbers
        $business = Business::factory()->create();
        $account = BankAccount::factory()->for($business)->create();
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $existing = $this->deleteJson("/api/businesses/{$business->id}/bank-accounts/{$account->id}");
        $unknown = $this->deleteJson("/api/businesses/{$business->id}/bank-accounts/".($account->id + 1000));

        // Assert. The whole body too, not only the status: a different body would leak the same way.
        $existing->assertNotFound();
        $unknown->assertNotFound();
        expect($existing->json())->toBe($unknown->json());
    });

    it('should return 401 (unauthorized) for a guest, and keep the account', function (): void {
        // Arrange
        $account = BankAccount::factory()->create();

        // Act
        $response = $this->deleteJson("/api/businesses/{$account->business_id}/bank-accounts/{$account->id}");

        // Assert
        $response->assertUnauthorized();
        expect(BankAccount::query()->whereKey($account->id)->exists())->toBeTrue();
    });
});
