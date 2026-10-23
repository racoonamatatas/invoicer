<?php

declare(strict_types = 1);

describe('Resending a verification email', function (): void {

    // Removed in INV-0044: since INV-0042 a signup that isn't finished is a pending registration, and registering
    // again sends a fresh set-password link. A client that still posts here must not get a silent 204.
    it('should return 404 (not found) because the route no longer exists', function (): void {
        // Act
        $response = $this->postJson('/api/auth/resend-verification', ['email' => 'jan@example.com']);

        // Assert
        $response->assertNotFound();
    });
});
