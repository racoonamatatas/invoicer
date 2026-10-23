<?php

declare(strict_types = 1);

describe('Routes removed in INV-0044', function (): void {

    // Since INV-0042 a signup that isn't finished is a pending registration, and registering again sends a fresh
    // set-password link. A client that still posts to the old resend route must not get a silent 204.
    it('should return 404 (not found) for POST /api/auth/resend-verification', function (): void {
        // Act
        $response = $this->postJson('/api/auth/resend-verification', ['email' => 'jan@example.com']);

        // Assert
        $response->assertNotFound();
    });
});
