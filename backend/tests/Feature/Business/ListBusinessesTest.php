<?php

declare(strict_types = 1);

use App\Models\Business;
use App\Models\User;

describe('Listing businesses', function (): void {

    it('should return 200 (ok) with only the logged-in user\'s businesses, ordered by legal name regardless of case', function (): void {
        // Arrange
        $user = User::factory()->create();
        $zebra = Business::factory()->for($user)->create(['legal_name' => 'Zebra Consultancy']);
        $deVries = Business::factory()->for($user)->create(['legal_name' => 'de Vries Advies']); // lowercase first letter
        $apple = Business::factory()->for($user)->create(['legal_name' => 'Apple Webdesign']);
        Business::factory()->create(['legal_name' => 'Another User Holding']); // its own user, so not listed
        $this->actingAs($user, 'web');

        // Act
        $response = $this->getJson('/api/businesses');

        // Assert
        $response->assertOk()
            ->assertJsonCount(3)
            ->assertJsonPath('0.id', $apple->id)
            ->assertJsonPath('1.id', $deVries->id)
            ->assertJsonPath('2.id', $zebra->id);
    });

    it('should return 200 (ok) with an empty list for a user without a business', function (): void {
        // Arrange
        $user = User::factory()->create();
        Business::factory()->create(); // somebody else's
        $this->actingAs($user, 'web');

        // Act
        $response = $this->getJson('/api/businesses');

        // Assert
        $response->assertOk()
            ->assertExactJson([]);
    });

    it('should return 401 (unauthorized) for a guest', function (): void {
        // Act
        $response = $this->getJson('/api/businesses');

        // Assert
        $response->assertUnauthorized();
    });
});
