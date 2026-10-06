<?php

declare(strict_types = 1);

use App\Models\User;

describe('Fetching the current user', function (): void {
    it('should return the logged-in user', function (): void {
        // Arrange
        $user = User::factory()->create();
        $this->actingAs($user, 'web');

        // Act
        $response = $this->getJson('/api/auth/user');

        // Assert
        $response->assertOk();
        $response->assertJsonPath('id', $user->id);
        $response->assertJsonPath('email', $user->email);
    });

    it('should reject a guest', function (): void {
        // Act
        $response = $this->getJson('/api/auth/user');

        // Assert
        $response->assertUnauthorized();
    });
});
