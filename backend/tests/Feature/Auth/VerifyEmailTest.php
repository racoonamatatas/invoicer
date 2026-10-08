<?php

declare(strict_types = 1);

use App\Models\User;

describe('Verifying an email', function (): void {

    it('should return no content, set email_verified_at and clear the token fields when the token is valid', function (): void {
        // Arrange
        $now = $this->freezeTime();
        $token = 'fixed-verification-token';
        $user = User::factory()->unverified()->create([
            'verification_token' => hash('sha256', $token),
            'verification_token_expires_at' => $now->copy()->addHours(24),
        ]);

        // Act
        $response = $this->postJson('/api/auth/verify-email', ['token' => $token]);

        // Assert
        $response->assertNoContent();
        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'email_verified_at' => $now,
            'verification_token' => null,
            'verification_token_expires_at' => null,
        ]);
    });

    it('should return 422 (unprocessable) with the invalid-link message and leave the user unverified when the token is unknown', function (): void {
        // Arrange
        $token = 'fixed-verification-token';
        $differentToken = 'different-verification-token';
        $user = User::factory()->unverified()->create([
            'verification_token' => hash('sha256', $token),
            'verification_token_expires_at' => now()->addHours(24),
        ]);

        // Act
        $response = $this->postJson('/api/auth/verify-email', ['token' => $differentToken]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([
            'token' => 'This verification link is invalid or has expired.',
        ]);
        expect($user->fresh()->email_verified_at)->toBeNull();
    });

    it('should return 422 (unprocessable) with the invalid-link message and leave the user unverified when the token has expired', function (): void {
        // Arrange
        $token = 'fixed-verification-token';
        $user = User::factory()->unverified()->create([
            'verification_token' => hash('sha256', $token),
            'verification_token_expires_at' => now()->addHours(24),
        ]);
        $this->travel(25)->hours();

        // Act
        $response = $this->postJson('/api/auth/verify-email', ['token' => $token]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([
            'token' => 'This verification link is invalid or has expired.',
        ]);
        expect($user->fresh()->email_verified_at)->toBeNull();
    });

    it('should throttle verification after 5 attempts per minute', function (): void {
        // Arrange
        $payload = ['token' => 'unknown-verification-token'];

        for ($attempt = 0; $attempt < 5; $attempt++)
        {
            $this->postJson('/api/auth/verify-email', $payload)->assertUnprocessable();
        }

        // Act
        $response = $this->postJson('/api/auth/verify-email', $payload);

        // Assert
        $response->assertTooManyRequests();
    });

    it('should return 422 (unprocessable), not 429 (too many requests), on verify-email after 5 login attempts from the same IP', function (): void {
        // Arrange
        $loginPayload = ['email' => 'nobody@example.com', 'password' => 'wrong'];

        for ($attempt = 0; $attempt < 5; $attempt++)
        {
            $this->postJson('/api/auth/login', $loginPayload)->assertUnprocessable();
        }

        // Act
        $response = $this->postJson('/api/auth/verify-email', ['token' => 'unknown-verification-token']);

        // Assert
        $response->assertUnprocessable();
    });
});
