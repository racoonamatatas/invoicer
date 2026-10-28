<?php

declare(strict_types = 1);

use App\Models\Business;
use App\Models\User;
use Illuminate\Support\Facades\DB;

describe('Updating a business', function (): void {

    it('should return 200 (ok) with exactly the allowlisted keys and replace the business\'s fields', function (): void {
        // Arrange
        $user = User::factory()->create();
        $business = Business::factory()->for($user)->create(['house_number_addition' => 'b', 'payment_term_days' => 14]);
        $this->actingAs($user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}", businessPayload());

        // Assert
        $response->assertOk();
        $response->assertExactJson([
            'id' => $business->id,
            'registered_name' => 'Bakkerij de Vries',
            'kvk_number' => '12345678',
            'vat_number' => 'NL123456789B01',
            'street' => 'Keizersgracht',
            'house_number' => '123',
            'house_number_addition' => 'A',
            'postal_code' => '1015 CJ',
            'city' => 'Amsterdam',
            'region' => null,
            'country_code' => 'NL',
            'payment_term_days' => 30,
        ]);
        expect($business->fresh()->registered_name)->toBe('Bakkerij de Vries');
    });

    it('should clear the house number addition when the body leaves it out', function (): void {
        // Arrange. PUT replaces the whole business, so a field that is not sent is not kept.
        $user = User::factory()->create();
        $business = Business::factory()->for($user)->create(['house_number_addition' => 'b']);
        $this->actingAs($user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}", businessPayload(['house_number_addition' => null]));

        // Assert
        $response->assertOk();
        expect($business->fresh()->house_number_addition)->toBeNull();
    });

    it('should keep the owner, whatever user_id the body holds', function (): void {
        // Arrange
        $user = User::factory()->create();
        $other = User::factory()->create();
        $business = Business::factory()->for($user)->create();
        $this->actingAs($user, 'web');

        // Act
        $this->putJson("/api/businesses/{$business->id}", businessPayload(['user_id' => $other->id]))->assertOk();

        // Assert
        expect($business->fresh()->user_id)->toBe($user->id);
    });

    it('should store the postcode in canonical form', function (): void {
        // Arrange
        $user = User::factory()->create();
        $business = Business::factory()->for($user)->create();
        $this->actingAs($user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}", businessPayload(['postal_code' => '1015cj']));

        // Assert
        $response->assertOk();
        expect($business->fresh()->postal_code)->toBe('1015 CJ');
    });

    it('should return 200 (ok) when the business keeps its own kvk_number', function (): void {
        // Arrange. The unique rule leaves the business itself out, or no business could be saved unchanged.
        $user = User::factory()->create();
        $business = Business::factory()->for($user)->create(['kvk_number' => '12345678']);
        $this->actingAs($user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}", businessPayload(['kvk_number' => '12345678']));

        // Assert
        $response->assertOk();
    });

    it('should return 422 (unprocessable) on the field whose rule fails, and change nothing', function (array $changes, string $field, string $message): void {
        // Arrange
        $user = User::factory()->create();
        $business = Business::factory()->for($user)->create();
        $this->actingAs($user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}", businessPayload($changes));

        // Assert
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors([$field => $message]);
        expect($business->fresh()->registered_name)->toBe($business->registered_name);
    })->with('business field rules');

    it('should return 422 (unprocessable) on kvk_number, alongside the other field errors, when another business of the same user has that number', function (): void {
        // Arrange
        $user = User::factory()->create();
        Business::factory()->for($user)->create(['kvk_number' => '12345678']);
        $business = Business::factory()->for($user)->create(['kvk_number' => '87654321']);
        $this->actingAs($user, 'web');

        // Act. A second invalid field: only the unique rule reports the duplicate together with it. The index
        // (the race test below) is never reached while validation fails.
        $response = $this->putJson("/api/businesses/{$business->id}", businessPayload(['kvk_number' => '12345678', 'registered_name' => null]));

        // Assert
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors([
            'kvk_number' => 'The kvk number has already been taken.',
            'registered_name' => 'The registered name field is required.',
        ]);
    });

    it('should return 422 (unprocessable) on kvk_number, not 500, when another business takes the number between validation and update', function (): void {
        // Arrange. A concurrent request, played in order: the listener runs after this request has passed its
        // unique rule and just before its update, and gives a second business of the same user the number this
        // request wants. DB::table() fires no model events.
        $user = User::factory()->create();
        $business = Business::factory()->for($user)->create(['kvk_number' => '87654321']);
        $other = Business::factory()->for($user)->create(['kvk_number' => '11111111']);
        $this->actingAs($user, 'web');
        Business::updating(static function (Business $updating) use ($other): void {
            DB::table('businesses')->where('id', $other->id)->update(['kvk_number' => $updating->kvk_number]);
        });

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}", businessPayload(['kvk_number' => '12345678']));

        // Assert
        $response->assertUnprocessable()
            ->assertOnlyJsonValidationErrors(['kvk_number' => 'The kvk number has already been taken.']);
        expect($business->fresh()->kvk_number)->toBe('87654321');
    });

    it('should return 500 (server error) when the update breaks a unique index other than kvk_number, and change nothing', function (): void {
        // Arrange. A bug, not a race: the listener gives the business the id of another one, so the primary key
        // breaks. Only kvk_number is mapped to a 422; this must still be a reported 500.
        $user = User::factory()->create();
        $business = Business::factory()->for($user)->create(['kvk_number' => '87654321']);
        $other = Business::factory()->for($user)->create(['kvk_number' => '11111111']);
        $this->actingAs($user, 'web');
        Business::updating(static function (Business $updating) use ($other): void {
            $updating->id = $other->id;
        });

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}", businessPayload());

        // Assert
        $response->assertInternalServerError();
        expect($business->fresh()->kvk_number)->toBe('87654321');
    });

    it('should return 403 (forbidden) for a business of another user, before validating the body', function (): void {
        // Arrange. An empty body would be a 422 if validation ran first; the 403 proves ->can() runs before
        // UpdateBusinessRequest, so another user's business can't be probed through validation errors.
        $business = Business::factory()->create(); // its own user
        $this->actingAs(User::factory()->create(), 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}", []);

        // Assert
        $response->assertForbidden();
    });

    it('should return 401 (unauthorized) for a guest, and change nothing', function (): void {
        // Arrange
        $business = Business::factory()->create();

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}", businessPayload());

        // Assert
        $response->assertUnauthorized();
        expect($business->fresh()->registered_name)->toBe($business->registered_name);
    });
});
