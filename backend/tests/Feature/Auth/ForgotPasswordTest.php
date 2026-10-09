<?php

declare(strict_types = 1);

use App\Mail\ResetPassword;
use App\Models\User;
use Illuminate\Auth\Passwords\PasswordBroker;
use Illuminate\Support\Facades\Mail;

describe('Requesting a password reset link', function (): void {

    it('should return 204 (no content) and queue a mail to the user with a working reset link and the configured expiry', function (): void {
        // Arrange
        Mail::fake();
        config(['auth.passwords.users.expire' => 30]);
        $email = 'jan@example.com';
        $user = User::factory()->create(['email' => $email]);

        // Act
        $response = $this->postJson('/api/auth/forgot-password', ['email' => $email]);

        // Assert
        $response->assertNoContent();
        Mail::assertQueued(ResetPassword::class, function (ResetPassword $mail) use ($email, $user): bool {
            $html = $mail->render();
            $linkPattern = '#'.preg_quote(config('app.url'), '#').'/reset-password\?token=([0-9a-f]+)&amp;email=jan%40example\.com"#';

            expect($html)->toMatch($linkPattern)
                ->and($html)->toContain('30 minutes');

            preg_match($linkPattern, $html, $matches);
            expect($this->app->make(PasswordBroker::class)->tokenExists($user, $matches[1]))->toBeTrue();

            return $mail->hasTo($email);
        });
    });

    it('should return 204 (no content), queue no mail and store no token when the email is unknown', function (): void {
        // Arrange
        Mail::fake();
        // Bait: with an empty users table, code that ignores the email would have no one to mail and still pass.
        User::factory()->create(['email' => 'piet@example.com']);

        // Act
        $response = $this->postJson('/api/auth/forgot-password', ['email' => 'unknown@example.com']);

        // Assert
        $response->assertNoContent();
        Mail::assertNothingOutgoing();
        $this->assertDatabaseCount('password_reset_tokens', 0);
    });

    it('should return 204 (no content) and queue no second mail when a link was already sent within the last 60 seconds', function (): void {
        // Arrange
        Mail::fake();
        $email = 'jan@example.com';
        User::factory()->create(['email' => $email]);
        $this->postJson('/api/auth/forgot-password', ['email' => $email])->assertNoContent();
        Mail::assertQueuedCount(1);

        // Act
        $response = $this->postJson('/api/auth/forgot-password', ['email' => $email]);

        // Assert
        $response->assertNoContent();
        Mail::assertQueuedCount(1);
    });

    it('should return 429 (too many requests) on the 6th request for one email within an hour, even from different IPs', function (): void {
        // Arrange
        $payload = ['email' => 'jan@example.com'];

        // Start at 1: the counter is the IP's last octet, and .0 is a network address, not a host.
        for ($attempt = 1; $attempt <= 5; $attempt++)
        {
            $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.'.$attempt])
                ->postJson('/api/auth/forgot-password', $payload)
                ->assertNoContent();
        }

        // Act
        $response = $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.6'])
            ->postJson('/api/auth/forgot-password', $payload);

        // Assert
        $response->assertTooManyRequests();
    });

    it('should return 429 (too many requests) on the 6th request from one IP within a minute, even for different emails', function (): void {
        // Arrange
        for ($attempt = 1; $attempt <= 5; $attempt++)
        {
            $this->postJson('/api/auth/forgot-password', ['email' => 'user'.$attempt.'@example.com'])
                ->assertNoContent();
        }

        // Act
        $response = $this->postJson('/api/auth/forgot-password', ['email' => 'user6@example.com']);

        // Assert
        $response->assertTooManyRequests();
    });
});
