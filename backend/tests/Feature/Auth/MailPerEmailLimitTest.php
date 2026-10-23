<?php

declare(strict_types = 1);

use App\Models\User;
use Illuminate\Support\Facades\Mail;

describe('Sharing one mail budget per email', function (): void {

    it('should return 429 (too many requests) on the 6th mail-sending request for one email within an hour, counting register and forgot-password together, and queue only the first 5 mails', function (): void {
        // Arrange
        Mail::fake();
        $email = 'jan@example.com';
        // An existing user, so every request below mails the inbox: register sends account-already-exists,
        // forgot-password the reset link. For an unknown email forgot-password stays silent and the count would prove nothing.
        // One forgot-password only: the password broker drops a second reset within a minute (passwords.throttle) without a mail.
        User::factory()->create(['email' => $email]);
        $requests = [
            ['/api/auth/register', ['email' => $email]],
            ['/api/auth/register', ['email' => $email]],
            ['/api/auth/register', ['email' => $email]],
            ['/api/auth/register', ['email' => $email]],
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
        // The limiter runs before the action, so the 429 alone doesn't show the 6th mail never left: the count does.
        Mail::assertQueuedCount(count($requests));
    });
});
