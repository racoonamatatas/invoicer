<?php

declare(strict_types = 1);

use App\Models\BankAccount;
use App\Models\Business;

describe('Updating a bank account', function (): void {

    it('should return 200 (ok) with the new label and leave the IBAN as it was', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $account = BankAccount::factory()->for($business)->create(['iban' => 'NL91ABNA0417164300', 'label' => 'Main']);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/bank-accounts/{$account->id}", ['label' => 'Zakelijk']);

        // Assert
        $response->assertOk()
            ->assertExactJson(['id' => $account->id, 'iban' => 'NL91ABNA0417164300', 'label' => 'Zakelijk']);
        expect($account->fresh()?->label)->toBe('Zakelijk')
            ->and($account->fresh()?->iban)->toBe('NL91ABNA0417164300');
    });

    it('should return 200 (ok) when an account keeps its own label in another case', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $account = BankAccount::factory()->for($business)->create(['label' => 'Main']);
        $this->actingAs($business->user, 'web');

        // Act. The label rule leaves the account itself out, or it would clash with its own "Main".
        $response = $this->putJson("/api/businesses/{$business->id}/bank-accounts/{$account->id}", ['label' => 'MAIN']);

        // Assert
        $response->assertOk()->assertJsonPath('label', 'MAIN');
    });

    it('should return 422 (unprocessable) on iban when the body holds one, and change nothing', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $account = BankAccount::factory()->for($business)->create(['iban' => 'NL91ABNA0417164300', 'label' => 'Main']);
        $this->actingAs($business->user, 'web');

        // Act. A valid IBAN and a valid label: only "an IBAN was sent at all" can fail.
        $response = $this->putJson("/api/businesses/{$business->id}/bank-accounts/{$account->id}", [
            'iban' => 'NL20INGB0001234567',
            'label' => 'Zakelijk',
        ]);

        // Assert
        $response->assertUnprocessable()
            ->assertOnlyJsonValidationErrors(['iban' => 'The iban field is prohibited.']);
        expect($account->fresh()?->iban)->toBe('NL91ABNA0417164300')
            ->and($account->fresh()?->label)->toBe('Main');
    });

    it('should return 422 (unprocessable) on label for a label another account of the business has in another case', function (): void {
        // Arrange
        $business = Business::factory()->create();
        BankAccount::factory()->for($business)->create(['label' => 'Main']);
        $account = BankAccount::factory()->for($business)->create(['label' => 'Zakelijk']);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/bank-accounts/{$account->id}", ['label' => 'main']);

        // Assert
        $response->assertUnprocessable()
            ->assertOnlyJsonValidationErrors(['label' => 'The label has already been taken.']);
        expect($account->fresh()?->label)->toBe('Zakelijk');
    });

    it('should return 404 (not found) for an account of the user\'s other business, and change nothing', function (): void {
        // Arrange. Both businesses are the user's, so ->can() passes: only the scoped binding stands between this
        // request and the other business's account.
        $business = Business::factory()->create();
        $sibling = BankAccount::factory()->for(Business::factory()->for($business->user))->create(['label' => 'Main']);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/bank-accounts/{$sibling->id}", ['label' => 'Renamed']);

        // Assert
        $response->assertNotFound();
        expect($sibling->fresh()?->label)->toBe('Main');
    });

    it('should return 403 (forbidden) for a business of another user, and change nothing', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $account = BankAccount::factory()->for($business)->create(['label' => 'Main']);
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/bank-accounts/{$account->id}", ['label' => 'Renamed']);

        // Assert
        $response->assertForbidden();
        expect($account->fresh()?->label)->toBe('Main');
    });

    it('should return 401 (unauthorized) for a guest, and change nothing', function (): void {
        // Arrange
        $account = BankAccount::factory()->create(['label' => 'Main']);

        // Act
        $response = $this->putJson("/api/businesses/{$account->business_id}/bank-accounts/{$account->id}", ['label' => 'Renamed']);

        // Assert
        $response->assertUnauthorized();
        expect($account->fresh()?->label)->toBe('Main');
    });
});
