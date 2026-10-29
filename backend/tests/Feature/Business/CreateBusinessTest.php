<?php

declare(strict_types = 1);

use App\Models\Business;
use App\Models\User;
use Illuminate\Support\Facades\DB;

describe('Creating a business', function (): void {

    it('should return 201 (created) with exactly the allowlisted keys and store the business for the user', function (): void {
        // Arrange
        $user = User::factory()->create();
        $this->actingAs($user, 'web');

        // Act
        $response = $this->postJson('/api/businesses', businessPayload());

        // Assert
        $response->assertCreated();
        $business = $user->businesses()->sole();
        $response->assertExactJson([
            'id' => $business->id,
            'registered_name' => 'Bakkerij de Vries',
            'kvk_number' => '12345678',
            'vat_number' => 'NL123456789B01',
            'street' => 'Oosterstraat',
            'house_number' => '123',
            'house_number_addition' => 'A',
            'postal_code' => '9711 LM',
            'city' => 'Groningen',
            'region' => null,
            'country_code' => 'NL',
            'payment_term_days' => 30,
        ]);
    });

    it('should return 201 (created) without a house number addition', function (): void {
        // Arrange
        $this->actingAs(User::factory()->create(), 'web');

        // Act
        $response = $this->postJson('/api/businesses', businessPayload(['house_number_addition' => null]));

        // Assert
        $response->assertCreated()->assertJsonPath('house_number_addition', null);
    });

    it('should store the business for the logged-in user, whatever user_id the body holds', function (): void {
        // Arrange
        $user = User::factory()->create();
        $other = User::factory()->create();
        $this->actingAs($user, 'web');

        // Act
        $this->postJson('/api/businesses', businessPayload(['user_id' => $other->id]))->assertCreated();

        // Assert
        expect($user->businesses()->count())->toBe(1)
            ->and($other->businesses()->count())->toBe(0);
    });

    it('should store the KvK number, postcode, btw-id and country code in canonical form', function (): void {
        // Arrange
        $user = User::factory()->create();
        $this->actingAs($user, 'web');

        // Act
        $response = $this->postJson('/api/businesses', businessPayload([
            'kvk_number' => '1234 5678',
            'postal_code' => '9711lm',
            'vat_number' => 'nl 1234.56.789.b01',
            'country_code' => 'nl',
        ]));

        // Assert
        $response->assertCreated();
        $business = $user->businesses()->sole();
        expect($business->kvk_number)->toBe('12345678')
            ->and($business->postal_code)->toBe('9711 LM')
            ->and($business->vat_number)->toBe('NL123456789B01')
            ->and($business->country_code)->toBe('NL');
    });

    it('should trim every field and store an empty house number addition as null', function (): void {
        // Guards third-party code: Laravel's global TrimStrings and ConvertEmptyStringsToNull middleware do this,
        // not Normaliser or BusinessRequest. If either is ever removed, this fails.

        // Arrange
        $user = User::factory()->create();
        $this->actingAs($user, 'web');

        // Act
        $response = $this->postJson('/api/businesses', businessPayload([
            'registered_name' => '  Bakkerij de Vries ',
            'kvk_number' => ' 12345678 ',
            'postal_code' => ' 9711 LM ',
            'house_number_addition' => '',
        ]));

        // Assert
        $response->assertCreated();
        $business = $user->businesses()->sole();
        expect($business->registered_name)->toBe('Bakkerij de Vries')
            ->and($business->kvk_number)->toBe('12345678')
            ->and($business->postal_code)->toBe('9711 LM')
            ->and($business->house_number_addition)->toBeNull();
    });

    it('should return 422 (unprocessable) on the field whose rule fails, and store nothing', function (array $changes, string $field, string $message): void {
        // Arrange
        $this->actingAs(User::factory()->create(), 'web');

        // Act
        $response = $this->postJson('/api/businesses', businessPayload($changes));

        // Assert
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors([$field => $message]);
        expect(Business::query()->count())->toBe(0);
    })->with('business field rules');

    it('should return 422 (unprocessable) with exactly one error on country_code for an unknown code', function (): void {
        // Arrange
        $this->actingAs(User::factory()->create(), 'web');

        // Act
        $response = $this->postJson('/api/businesses', businessPayload(['country_code' => 'XX']));

        // Assert: the whole list, since assertOnlyJsonValidationErrors() passes as long as the message is among them.
        $response->assertUnprocessable();
        expect($response->json('errors.country_code'))->toBe(['A business must be registered in the Netherlands.']);
    });

    it('should return 422 (unprocessable) on kvk_number, alongside the other field errors, for a second business with the same number for the same user', function (): void {
        // Arrange
        $user = User::factory()->create();
        Business::factory()->for($user)->create(['kvk_number' => '12345678']);
        $this->actingAs($user, 'web');

        // Act. A second invalid field: only the unique rule reports the duplicate together with it. The index
        // (the race test below) is never reached while validation fails.
        $response = $this->postJson('/api/businesses', businessPayload(['kvk_number' => '12345678', 'registered_name' => null]));

        // Assert
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors([
            'kvk_number' => 'The kvk number has already been taken.',
            'registered_name' => 'The registered name field is required.',
        ]);
    });

    it('should return 201 (created) for a kvk_number another user already holds', function (): void {
        // Arrange. Not unique across users on purpose (INV-0061).
        Business::factory()->create(['kvk_number' => '12345678']);
        $this->actingAs(User::factory()->create(), 'web');

        // Act
        $response = $this->postJson('/api/businesses', businessPayload(['kvk_number' => '12345678']));

        // Assert
        $response->assertCreated();
    });

    it('should return 422 (unprocessable) on kvk_number, not 500, when the same business is created between validation and insert', function (): void {
        // Arrange. A concurrent double submit, played in order: the listener runs after this request has passed
        // its unique rule and just before its insert, and inserts the same business the way the other request
        // would. DB::table() fires no model events, so the listener doesn't call itself.
        $user = User::factory()->create();
        $this->actingAs($user, 'web');
        Business::creating(static function (Business $business): void {
            DB::table('businesses')->insert($business->getAttributes());
        });

        // Act
        $response = $this->postJson('/api/businesses', businessPayload());

        // Assert
        $response->assertUnprocessable()
            ->assertOnlyJsonValidationErrors(['kvk_number' => 'The kvk number has already been taken.']);
        expect($user->businesses()->count())->toBe(1);
    });

    it('should return 500 (server error) when the insert breaks a unique index other than kvk_number', function (): void {
        // Arrange. A bug, not a race: the listener gives the new business the id of an existing one, so the
        // primary key breaks. Only kvk_number is mapped to a 422; this must still be a reported 500.
        $user = User::factory()->create();
        $existing = Business::factory()->for($user)->create(['kvk_number' => '87654321']);
        $this->actingAs($user, 'web');
        Business::creating(static function (Business $business) use ($existing): void {
            $business->id = $existing->id;
        });

        // Act
        $response = $this->postJson('/api/businesses', businessPayload());

        // Assert
        $response->assertInternalServerError();
    });

    it('should return 401 (unauthorized) for a guest, and store nothing', function (): void {
        // Act
        $response = $this->postJson('/api/businesses', businessPayload());

        // Assert
        $response->assertUnauthorized();
        expect(Business::query()->count())->toBe(0);
    });
});
