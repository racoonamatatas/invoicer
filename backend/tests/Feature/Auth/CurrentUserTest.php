<?php

declare(strict_types = 1);

use App\Models\User;

describe('Fetching the current user', function (): void {
    it('should return 200 (ok) with only the id, name and email of the logged-in user', function (): void {
        // Arrange
        $user = User::factory()->create();
        $this->actingAs($user, 'web');

        // Act
        $response = $this->getJson('/api/auth/user');

        // Assert
        $response->assertOk();
        // Exact: a new column on users must not reach the browser unless it is added on purpose.
        $response->assertExactJson([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);
    });

    it('should reject a guest', function (): void {
        // Act
        $response = $this->getJson('/api/auth/user');

        // Assert
        $response->assertUnauthorized();
    });
});
