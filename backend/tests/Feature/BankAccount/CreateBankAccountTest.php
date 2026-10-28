<?php

declare(strict_types = 1);

use App\Models\BankAccount;
use App\Models\Business;
use Illuminate\Support\Facades\DB;

describe('Creating a bank account', function (): void {

    it('should return 201 (created) with the account and store the IBAN in canonical form', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/bank-accounts", [
            'iban' => 'nl91 abna 0417 1643 00',
            'label' => 'Main',
        ]);

        // Assert
        $response->assertCreated();
        $account = $business->bankAccounts()->sole();
        $response->assertExactJson(['id' => $account->id, 'iban' => 'NL91ABNA0417164300', 'label' => 'Main']);
        expect($account->iban)->toBe('NL91ABNA0417164300');
    });

    it('should store the account under the business in the URL, whatever business_id the body holds', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $other = Business::factory()->for($business->user)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $this->postJson("/api/businesses/{$business->id}/bank-accounts", [
            'iban' => 'NL91ABNA0417164300',
            'label' => 'Main',
            'business_id' => $other->id,
        ])->assertCreated();

        // Assert
        expect($business->bankAccounts()->count())->toBe(1)
            ->and($other->bankAccounts()->count())->toBe(0);
    });

    it('should return 403 (forbidden) for a business of another user, and store nothing', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/bank-accounts", [
            'iban' => 'NL91ABNA0417164300',
            'label' => 'Main',
        ]);

        // Assert
        $response->assertForbidden();
        expect(BankAccount::query()->count())->toBe(0);
    });

    it('should return 422 (unprocessable) on the field whose rule fails, and store nothing', function (array $body, string $field, string $message): void {
        // Arrange
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/bank-accounts", $body);

        // Assert
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors([$field => $message]);
        expect(BankAccount::query()->count())->toBe(0);
    })->with([
        'iban missing' => [['label' => 'Main'], 'iban', 'The iban field is required.'],
        'iban fails mod-97' => [['iban' => 'NL91ABNA0417164301', 'label' => 'Main'], 'iban', 'The iban field must be a valid IBAN.'],
        'iban not a string' => [['iban' => 1234, 'label' => 'Main'], 'iban', 'The iban field must be a string.'],
        'label missing' => [['iban' => 'NL91ABNA0417164300'], 'label', 'The label field is required.'],
        'label too long' => [['iban' => 'NL91ABNA0417164300', 'label' => str_repeat('a', 256)], 'label', 'The label field must not be greater than 255 characters.'],
        'label not a string' => [['iban' => 'NL91ABNA0417164300', 'label' => 12], 'label', 'The label field must be a string.'],
    ]);

    it('should return 422 (unprocessable) on iban for an IBAN the business already has, written differently', function (): void {
        // Arrange
        $business = Business::factory()->create();
        BankAccount::factory()->for($business)->create(['iban' => 'NL91ABNA0417164300', 'label' => 'Main']); // another label, so only the IBAN clashes
        $this->actingAs($business->user, 'web');

        // Act. Spaced and lowercase: the normaliser runs before the unique rule, so this is the same IBAN.
        $response = $this->postJson("/api/businesses/{$business->id}/bank-accounts", [
            'iban' => 'nl91 abna 0417 1643 00',
            'label' => 'Second',
        ]);

        // Assert
        $response->assertUnprocessable()
            ->assertOnlyJsonValidationErrors(['iban' => 'The iban has already been taken.']);
    });

    it('should return 201 (created) for an IBAN another business already has', function (): void {
        // Arrange. One user with two registrations may be paid into the same account for both.
        $business = Business::factory()->create();
        BankAccount::factory()->for(Business::factory()->for($business->user))->create(['iban' => 'NL91ABNA0417164300']);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/bank-accounts", [
            'iban' => 'NL91ABNA0417164300',
            'label' => 'Main',
        ]);

        // Assert
        $response->assertCreated();
    });

    it('should return 422 (unprocessable) on label for a label the business already has in another case', function (): void {
        // Arrange
        $business = Business::factory()->create();
        BankAccount::factory()->for($business)->create(['iban' => 'NL20INGB0001234567', 'label' => 'Main']); // another IBAN, so only the label clashes
        $this->actingAs($business->user, 'web');

        // Act. "MAIN" next to "Main": SQLite's "=" would let it through, which is why the rule compares lower().
        $response = $this->postJson("/api/businesses/{$business->id}/bank-accounts", [
            'iban' => 'NL91ABNA0417164300',
            'label' => 'MAIN',
        ]);

        // Assert
        $response->assertUnprocessable()
            ->assertOnlyJsonValidationErrors(['label' => 'The label has already been taken.']);
    });

    it('should return 201 (created) for a label another business already has', function (): void {
        // Arrange
        $business = Business::factory()->create();
        BankAccount::factory()->for(Business::factory()->for($business->user))->create(['label' => 'Main']);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/bank-accounts", [
            'iban' => 'NL91ABNA0417164300',
            'label' => 'Main',
        ]);

        // Assert
        $response->assertCreated();
    });

    it('should return 422 (unprocessable) on iban, not 500, when the same IBAN is added between validation and insert', function (): void {
        // Arrange. A concurrent double submit, played in order: the listener runs after this request has passed
        // its unique rule and just before its insert, and inserts the same account the way the other request
        // would. Another label, so only the iban index breaks. DB::table() fires no model events.
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');
        BankAccount::creating(static function (BankAccount $account): void {
            DB::table('bank_accounts')->insert([...$account->getAttributes(), 'label' => 'Other']);
        });

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/bank-accounts", [
            'iban' => 'NL91ABNA0417164300',
            'label' => 'Main',
        ]);

        // Assert
        $response->assertUnprocessable()
            ->assertOnlyJsonValidationErrors(['iban' => 'The iban has already been taken.']);
        expect($business->bankAccounts()->count())->toBe(1);
    });

    it('should return 422 (unprocessable) on iban, not 500, for an identical double submit that breaks both unique indexes', function (): void {
        // Arrange. The real double submit: the same IBAN and the same label, so both indexes break at once and the
        // driver reports only one of them (SQLite: the label one).
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');
        BankAccount::creating(static function (BankAccount $account): void {
            DB::table('bank_accounts')->insert($account->getAttributes());
        });

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/bank-accounts", [
            'iban' => 'NL91ABNA0417164300',
            'label' => 'Main',
        ]);

        // Assert
        $response->assertUnprocessable()
            ->assertOnlyJsonValidationErrors(['iban' => 'The iban has already been taken.']);
        expect($business->bankAccounts()->count())->toBe(1);
    });

    it('should return 500 (server error) when the same label, not the IBAN, is added between validation and insert', function (): void {
        // Arrange. The same race on the label index, which is left unmapped on purpose: only iban is a 422.
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');
        BankAccount::creating(static function (BankAccount $account): void {
            DB::table('bank_accounts')->insert([...$account->getAttributes(), 'iban' => 'NL20INGB0001234567']);
        });

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/bank-accounts", [
            'iban' => 'NL91ABNA0417164300',
            'label' => 'Main',
        ]);

        // Assert
        $response->assertInternalServerError();
    });

    it('should return 401 (unauthorized) for a guest, and store nothing', function (): void {
        // Arrange
        $business = Business::factory()->create();

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/bank-accounts", [
            'iban' => 'NL91ABNA0417164300',
            'label' => 'Main',
        ]);

        // Assert
        $response->assertUnauthorized();
        expect(BankAccount::query()->count())->toBe(0);
    });
});
