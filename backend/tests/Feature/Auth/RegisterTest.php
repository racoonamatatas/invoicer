<?php

declare(strict_types = 1);

use App\Mail\AccountAlreadyExists;
use App\Mail\FinishSigningUp;
use App\Models\User;
use Illuminate\Contracts\Mail\Mailer;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Mockery\MockInterface;

describe('Registering', function (): void {

    it('should return 204 (no content) and store a pending registration with the sha256 hash of the token and a 24 hour expiry, and no user', function (): void {
        // Arrange
        $now = $this->freezeTime();
        $email = 'jan@example.com';
        $token = 'fixed-set-password-token';
        Str::createRandomStringsUsing(fn (): string => $token);

        // Act
        $response = $this->postJson('/api/auth/register', ['email' => $email]);

        // Assert
        $response->assertNoContent();
        $this->assertGuest('web');
        $this->assertDatabaseHas('pending_registrations', [
            'email' => $email,
            'token' => hash('sha256', $token),
            'expires_at' => $now->addHours(24),
        ]);
        $this->assertDatabaseCount('users', 0);
    });

    it('should queue a finish-signing-up mail with the set-password link and the configured expiry, and no name', function (): void {
        // Arrange
        Mail::fake();
        config(['auth.verification_ttl_hours' => 48]);
        $email = 'jan@example.com';
        $token = 'fixed-set-password-token';
        Str::createRandomStringsUsing(fn (): string => $token);
        $setPasswordUrl = config('app.url').'/verify-email?token='.$token;

        // Act
        $this->postJson('/api/auth/register', ['email' => $email]);

        // Assert
        Mail::assertQueuedCount(1);
        Mail::assertQueued(FinishSigningUp::class, function (FinishSigningUp $mail) use ($email, $setPasswordUrl): bool {
            $html = $mail->render();

            // The link is the only way in: a login or reset link would send the owner to a form that can't work yet.
            expect($html)->toContain($setPasswordUrl)
                ->and($html)->toContain('48 hours')
                ->and($html)->not->toContain(config('app.url').'/login')
                ->and($html)->not->toContain(config('app.url').'/forgot-password');

            return $mail->hasTo($email);
        });
    });

    it('should replace the stored token and expiry when the same email registers again, so the first link stops working', function (): void {
        // Arrange
        $now = $this->freezeTime();
        $email = 'jan@example.com';
        Str::createRandomStringsUsing(fn (): string => 'first-token');
        $this->postJson('/api/auth/register', ['email' => $email])->assertNoContent();
        $this->travel(1)->hour();
        Str::createRandomStringsUsing(fn (): string => 'second-token');

        // Act
        $response = $this->postJson('/api/auth/register', ['email' => $email]);

        // Assert
        $response->assertNoContent();
        $this->assertDatabaseCount('pending_registrations', 1);
        $this->assertDatabaseHas('pending_registrations', [
            'email' => $email,
            'token' => hash('sha256', 'second-token'),
            'expires_at' => $now->addHours(25),
        ]);
        $this->assertDatabaseMissing('pending_registrations', ['token' => hash('sha256', 'first-token')]);
    });

    it('should store the email lowercased when it is typed with capitals', function (): void {
        // Act
        $response = $this->postJson('/api/auth/register', ['email' => 'Jan@Example.com']);

        // Assert
        $response->assertNoContent();
        $this->assertDatabaseHas('pending_registrations', ['email' => 'jan@example.com']);
    });

    // Returns no content so that taken emails can't be enumerated.
    it('should return 204 (no content), queue an account-already-exists mail to the owner and store no pending registration when the email is taken', function (): void {
        // Arrange
        Mail::fake();
        $email = 'jan@example.com';
        $existing = User::factory()->create(['email' => $email]);

        // Act
        $response = $this->postJson('/api/auth/register', ['email' => $email]);

        // Assert
        $response->assertNoContent();
        $this->assertGuest('web');
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('pending_registrations', 0);
        expect($existing->fresh()->password)->toBe($existing->password);
        Mail::assertQueuedCount(1);
        Mail::assertQueued(AccountAlreadyExists::class, function (AccountAlreadyExists $mail) use ($email): bool {
            $html = $mail->render();

            expect($html)->toContain(config('app.url').'/login')
                ->and($html)->toContain(config('app.url').'/forgot-password');

            return $mail->hasTo($email);
        });
    });

    it('should return 204 (no content), store no pending registration and queue an account-already-exists mail to the stored email when the email is taken with different casing', function (): void {
        // Arrange
        Mail::fake();
        User::factory()->create(['email' => 'jan@example.com']);

        // Act
        $response = $this->postJson('/api/auth/register', ['email' => 'Jan@Example.com']);

        // Assert
        $response->assertNoContent();
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('pending_registrations', 0);
        Mail::assertQueued(AccountAlreadyExists::class, fn (AccountAlreadyExists $mail): bool => $mail->hasTo('jan@example.com'));
    });

    it('should return 422 (unprocessable) and store no pending registration when the email is invalid', function (array $payload): void {
        // Act
        $response = $this->postJson('/api/auth/register', $payload);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email']);
        $this->assertDatabaseCount('pending_registrations', 0);
    })->with([
        'missing email' => [[]],
        'not an email' => [['email' => 'not-an-email']],
        'email too long' => [['email' => str_repeat('a', 250).'@example.com']],
    ]);

    it('should return 429 (too many requests) on the 6th request from one IP within a minute, even for different emails', function (): void {
        // Arrange
        for ($attempt = 1; $attempt <= 5; $attempt++)
        {
            $this->postJson('/api/auth/register', ['email' => 'user'.$attempt.'@example.com'])
                ->assertNoContent();
        }

        // Act
        $response = $this->postJson('/api/auth/register', ['email' => 'user6@example.com']);

        // Assert
        $response->assertTooManyRequests();
    });

    it('should return 429 (too many requests) on the 6th request for one email within an hour, even from different IPs', function (): void {
        // Arrange
        $payload = ['email' => 'jan@example.com'];

        // Start at 1: the counter is the IP's last octet, and .0 is a network address, not a host.
        for ($attempt = 1; $attempt <= 5; $attempt++)
        {
            $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.'.$attempt])
                ->postJson('/api/auth/register', $payload)
                ->assertNoContent();
        }

        // Act
        $response = $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.6'])
            ->postJson('/api/auth/register', $payload);

        // Assert
        $response->assertTooManyRequests();
    });

    it('should return 500 (internal server error) and store no pending registration when queueing the mail throws', function (): void {
        // Arrange
        $this->mock(Mailer::class, function (MockInterface $mailer): void {
            $mailer->shouldReceive('to')->andThrow(new RuntimeException('Mail queue unavailable'));
        });

        // Act
        $response = $this->postJson('/api/auth/register', ['email' => 'jan@example.com']);

        // Assert
        $response->assertInternalServerError();
        $this->assertDatabaseCount('pending_registrations', 0);
    });
});
