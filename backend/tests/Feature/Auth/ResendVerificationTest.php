<?php

declare(strict_types = 1);

use App\Mail\VerifyEmail;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

describe('Resending a verification email', function (): void {

    it('should return 204 (no content), replace the stored token with a fresh 24 hour expiry and queue a mail with the new link when the user is unverified', function (): void {
        // Arrange
        Mail::fake();
        $now = $this->freezeTime();
        $email = 'jan@example.com';
        $oldToken = 'old-verification-token';
        $newToken = 'new-verification-token';
        User::factory()->unverified()->create([
            'email' => $email,
            'verification_token' => hash('sha256', $oldToken),
            'verification_token_expires_at' => $now->copy()->subHour(),
        ]);
        Str::createRandomStringsUsing(fn (): string => $newToken);
        $verifyUrl = config('app.url').'/verify-email?token='.$newToken;

        // Act
        $response = $this->postJson('/api/auth/resend-verification', ['email' => $email]);

        // Assert
        $response->assertNoContent();
        $this->assertDatabaseHas('users', [
            'email' => $email,
            'verification_token' => hash('sha256', $newToken),
            'verification_token_expires_at' => $now->copy()->addHours(24),
        ]);
        Mail::assertQueued(VerifyEmail::class, function (VerifyEmail $mail) use ($email, $verifyUrl): bool {
            $mail->assertSeeInHtml($verifyUrl);

            return $mail->hasTo($email);
        });
    });

    it('should return 204 (no content) and queue a mail to the stored address when the email differs from it only in casing', function (): void {
        // Arrange
        Mail::fake();
        $email = 'jan@example.com';
        User::factory()->unverified()->create(['email' => $email]);

        // Act
        $response = $this->postJson('/api/auth/resend-verification', ['email' => 'Jan@Example.com']);

        // Assert
        $response->assertNoContent();
        Mail::assertQueued(VerifyEmail::class, fn (VerifyEmail $mail): bool => $mail->hasTo($email));
    });

    it('should return 204 (no content) and queue no mail when the user is already verified', function (): void {
        // Arrange
        Mail::fake();
        $email = 'jan@example.com';
        User::factory()->create(['email' => $email]);

        // Act
        $response = $this->postJson('/api/auth/resend-verification', ['email' => $email]);

        // Assert
        $response->assertNoContent();
        Mail::assertNothingOutgoing();
    });

    it('should return 204 (no content) and queue no mail when the email is unknown', function (): void {
        // Arrange
        Mail::fake();
        // Bait: with no other unverified user, code that ignores the email would have no one to mail and still pass.
        User::factory()->unverified()->create(['email' => 'piet@example.com']);

        // Act
        $response = $this->postJson('/api/auth/resend-verification', ['email' => 'unknown@example.com']);

        // Assert
        $response->assertNoContent();
        Mail::assertNothingOutgoing();
    });

    it('should return 429 (too many requests) on the 4th resend for one email within an hour, even from different IPs', function (): void {
        // Arrange
        $payload = ['email' => 'jan@example.com'];

        // Start at 1: the counter is the IP's last octet, and .0 is a network address, not a host.
        for ($attempt = 1; $attempt <= 3; $attempt++)
        {
            $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.'.$attempt])
                ->postJson('/api/auth/resend-verification', $payload)
                ->assertNoContent();
        }

        // Act
        $response = $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.4'])
            ->postJson('/api/auth/resend-verification', $payload);

        // Assert
        $response->assertTooManyRequests();
    });

    it('should return 429 (too many requests) on the 6th resend from one IP within a minute, even for different emails', function (): void {
        // Arrange
        for ($attempt = 1; $attempt <= 5; $attempt++)
        {
            $this->postJson('/api/auth/resend-verification', ['email' => 'user'.$attempt.'@example.com'])
                ->assertNoContent();
        }

        // Act
        $response = $this->postJson('/api/auth/resend-verification', ['email' => 'user6@example.com']);

        // Assert
        $response->assertTooManyRequests();
    });
});
