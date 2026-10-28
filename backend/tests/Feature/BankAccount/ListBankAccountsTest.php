<?php

declare(strict_types = 1);

use App\Models\BankAccount;
use App\Models\Business;

describe('Listing bank accounts', function (): void {

    it('should return 200 (ok) with only this business\'s accounts, ordered by label regardless of case', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $zakelijk = BankAccount::factory()->for($business)->create(['label' => 'Zakelijk']);
        $main = BankAccount::factory()->for($business)->create(['label' => 'main']); // lowercase first letter
        $belasting = BankAccount::factory()->for($business)->create(['label' => 'Belasting']);
        // The same user's other business: listed under its own URL, not this one.
        BankAccount::factory()->for(Business::factory()->for($business->user))->create(['label' => 'Other']);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/bank-accounts");

        // Assert
        $response->assertOk()
            ->assertJsonCount(3)
            ->assertJsonPath('0.id', $belasting->id)
            ->assertJsonPath('1.id', $main->id)
            ->assertJsonPath('2.id', $zakelijk->id);
    });

    it('should return 200 (ok) with exactly the allowlisted keys of each account', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $account = BankAccount::factory()->for($business)->create(['iban' => 'NL91ABNA0417164300', 'label' => 'Main']);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/bank-accounts");

        // Assert
        $response->assertOk()->assertExactJson([
            ['id' => $account->id, 'iban' => 'NL91ABNA0417164300', 'label' => 'Main'],
        ]);
    });

    it('should return 404 (not found) for a business of another user', function (): void {
        // Arrange
        $business = Business::factory()->create();
        BankAccount::factory()->for($business)->create();
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/bank-accounts");

        // Assert
        $response->assertNotFound();
    });

    it('should return 401 (unauthorized) for a guest', function (): void {
        // Arrange
        $business = Business::factory()->create();

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/bank-accounts");

        // Assert
        $response->assertUnauthorized();
    });
});
