<?php

declare(strict_types = 1);

use App\Models\User;

describe('Logging out', function (): void {
    it('should log out a logged-in user', function (): void {
        // Arrange
        $user = User::factory()->create();
        $this->actingAs($user, 'web');

        // Act
        $response = $this->deleteJson('/api/auth/logout');

        // Assert
        $response->assertNoContent();
        $this->assertGuest('web');
    });

    it('should reject logout from a guest', function (): void {
        // Act
        $response = $this->deleteJson('/api/auth/logout');

        // Assert
        $response->assertUnauthorized();
    });
});
