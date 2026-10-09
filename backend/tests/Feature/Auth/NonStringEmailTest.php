<?php

declare(strict_types = 1);

describe('Rate limiting a request with a non-string email', function (): void {

    it('should return 422 (unprocessable) with an email error instead of 500 (internal server error) for an array email', function (string $uri): void {
        // Act
        $response = $this->postJson($uri, ['email' => ['jan@example.com']]);

        // Assert
        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['email']);
    })->with([
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/resend-verification',
        '/api/auth/forgot-password',
    ]);
});
