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

    it('should not log in a user with an incorrect password', function (): void {
        // Arrange
        $user = User::factory()->create();

        // Act
        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'incorrect',
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email' => 'These credentials do not match our records.']);
        $this->assertGuest('web');
    });

    it('should not log in with an email that does not exist', function (): void {
        // Arrange
        // empty

        // Act
        $response = $this->postJson('/api/auth/login', [
            'email' => 'nobody@example.com',
            'password' => 'password',
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email' => 'These credentials do not match our records.']);
        $this->assertGuest('web');
    });

    it('should return 422 (unprocessable) with the verify-email message and not log in when the email is unverified', function (): void {
        // Arrange
        $user = User::factory()->unverified()->create();

        // Act
        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email' => 'Verify your email before logging in.']);
        $this->assertGuest('web');
    });

    it('should throttle login after 5 attempts per minute', function (): void {
        // Arrange
        $user = User::factory()->create();
        $credentials = ['email' => $user->email, 'password' => 'incorrect'];

        for ($attempt = 0; $attempt < 5; $attempt++)
        {
            $this->postJson('/api/auth/login', $credentials)->assertUnprocessable();
        }

        // Act
        $response = $this->postJson('/api/auth/login', $credentials);

        // Assert
        $response->assertTooManyRequests();
    });
});
