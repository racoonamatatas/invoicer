<?php

declare(strict_types = 1);

describe('Sharing one mail budget per email', function (): void {

    it('should return 429 (too many requests) on the 6th mail-sending request for one email within an hour, even when spread across routes', function (): void {
        // Arrange
        $email = 'jan@example.com';
        $requests = [
            ['/api/auth/register', ['email' => $email]],
            ['/api/auth/register', ['email' => $email]],
            ['/api/auth/resend-verification', ['email' => $email]],
            ['/api/auth/resend-verification', ['email' => $email]],
            ['/api/auth/forgot-password', ['email' => $email]],
        ];

        // Start at 1: the counter is the IP's last octet, and .0 is a network address, not a host.
        foreach ($requests as $index => [$uri, $payload])
        {
            $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.'.($index + 1)])
                ->postJson($uri, $payload)
                ->assertNoContent();
        }

        // Act
        $response = $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.6'])
            ->postJson('/api/auth/forgot-password', ['email' => $email]);

        // Assert
        $response->assertTooManyRequests();
    });
});
