<?php

declare(strict_types = 1);

use App\Models\User;

describe('Logging in', function (): void {
    it('should log in a user with a correct email and password', function (): void {
        // Arrange
        $user = User::factory()->create();

        // Act
        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        // Assert
        $response->assertOk();
        $this->assertAuthenticatedAs($user, 'web');
    });
});
