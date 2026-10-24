<?php

declare(strict_types = 1);

use App\Models\Business;
use App\Models\User;

describe('Showing a business', function (): void {

    it('should return 200 (ok) with exactly the allowlisted keys of the user\'s own business', function (): void {
        // Arrange
        $user = User::factory()->create();
        $business = Business::factory()->for($user)->create(['house_number_addition' => 'a']);
        $this->actingAs($user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}");

        // Assert
        $response->assertOk();
        // Exact: a new column on businesses must not reach the browser unless it is added on purpose.
        $response->assertExactJson([
            'id' => $business->id,
            'legal_name' => $business->legal_name,
            'kvk_number' => $business->kvk_number,
            'vat_number' => $business->vat_number,
            'street' => $business->street,
            'house_number' => $business->house_number,
            'house_number_addition' => 'a',
            'postal_code' => $business->postal_code,
            'city' => $business->city,
            'region' => null,
            'country_code' => 'NL',
            'payment_term_days' => $business->payment_term_days,
        ]);
    });

    it('should return 403 (forbidden) for a business of another user', function (): void {
        // Arrange
        $user = User::factory()->create();
        $business = Business::factory()->create(); // its own user
        $this->actingAs($user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}");

        // Assert
        $response->assertForbidden();
    });

    it('should return 404 (not found) for an unknown id', function (): void {
        // Arrange
        $user = User::factory()->create();
        $this->actingAs($user, 'web');

        // Act
        $response = $this->getJson('/api/businesses/999999');

        // Assert
        $response->assertNotFound();
    });

    it('should return 401 (unauthorized) for a guest, even for an unknown id', function (): void {
        // Guards third-party code: Laravel's middleware priority runs Authenticate before SubstituteBindings, so a
        // guest can't learn from a 404 whether an id exists.

        // Act
        $response = $this->getJson('/api/businesses/999999');

        // Assert
        $response->assertUnauthorized();
    });
});
