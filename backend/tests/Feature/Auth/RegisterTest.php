<?php

declare(strict_types = 1);

use App\Mail\VerifyEmail;
use App\Models\User;
use Illuminate\Contracts\Mail\Mailer;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Mockery\MockInterface;

describe('Registering', function (): void {

    it('should register a user with a new email', function (): void {
        // Arrange
        $name = 'Jan Jansen';
        $email = 'jan@example.com';
        $password = 'correct-horse-battery2';

        // Act
        $response = $this->postJson('/api/auth/register', [
            'name' => $name,
            'email' => $email,
            'password' => $password,
            'password_confirmation' => $password,
        ]);

        // Assert
        $response->assertNoContent();
        $this->assertGuest('web');
        $this->assertDatabaseHas('users', [
            'name' => $name,
            'email' => $email,
            'email_verified_at' => null,
        ]);

        $user = User::query()->where('email', $email)->sole();
        expect(Hash::check($password, $user->password))->toBeTrue();
    });

    // Returns no content so that taken emails can't be enumerated.
    it('should return no content and leave the existing user unchanged when the email is taken', function (): void {
        // Arrange
        $name = 'Jan Jansen';
        $email = 'jan@example.com';
        $password = 'correct-horse-battery2';
        $existing = User::factory()->create(['email' => $email]);

        // Act
        $response = $this->postJson('/api/auth/register', [
            'name' => $name,
            'email' => $email,
            'password' => $password,
            'password_confirmation' => $password,
        ]);

        // Assert
        $response->assertNoContent();
        $this->assertGuest('web');
        $this->assertDatabaseCount('users', 1);
        expect($existing->fresh()->password)->toBe($existing->password);
    });

    it('should return 422 (unprocessable) and create no user when a field is invalid', function (array $overrides, string $field): void {
        // Arrange
        $valid = [
            'name' => 'Jan Jansen',
            'email' => 'jan@example.com',
            'password' => 'correct-horse-battery2',
            'password_confirmation' => 'correct-horse-battery2',
        ];

        // Act
        $response = $this->postJson('/api/auth/register', [...$valid, ...$overrides]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([$field]);
        $this->assertDatabaseCount('users', 0);
    })->with([
        'missing name' => [['name' => ''], 'name'],
        'invalid email' => [['email' => 'not-an-email'], 'email'],
        'password too short' => [['password' => 'short', 'password_confirmation' => 'short'], 'password'],
        'password too long' => [['password' => str_repeat('a', 73), 'password_confirmation' => str_repeat('a', 73)], 'password'],
        'confirmation mismatch' => [['password_confirmation' => 'something-else'], 'password'],
    ]);

    it('should throttle registration after 5 attempts per minute', function (): void {
        // Arrange
        $payload = [
            'name' => 'Jan Jansen',
            'email' => 'jan@example.com',
            'password' => 'correct-horse-battery2',
            'password_confirmation' => 'correct-horse-battery2',
        ];

        for ($attempt = 0; $attempt < 5; $attempt++)
        {
            $this->postJson('/api/auth/register', $payload)->assertNoContent();
        }

        // Act
        $response = $this->postJson('/api/auth/register', $payload);

        // Assert
        $response->assertTooManyRequests();
    });

    it('should queue a verification mail with the token link to the new user', function (): void {
        // Arrange
        Mail::fake();
        $email = 'jan@example.com';
        $password = 'correct-horse-battery2';
        $token = 'fixed-verification-token';
        Str::createRandomStringsUsing(fn (): string => $token);
        $verifyUrl = config('app.url').'/verify-email?token='.$token;

        // Act
        $this->postJson('/api/auth/register', [
            'name' => 'Jan Jansen',
            'email' => $email,
            'password' => $password,
            'password_confirmation' => $password,
        ]);

        // Assert
        Mail::assertQueued(VerifyEmail::class, function (VerifyEmail $mail) use ($email, $verifyUrl): bool {
            $mail->assertSeeInHtml($verifyUrl);

            return $mail->hasTo($email);
        });
    });

    it('should store the sha256 hash of the token with an expiry 24 hours from now', function (): void {
        // Arrange
        $now = $this->freezeTime();
        $email = 'jan@example.com';
        $password = 'correct-horse-battery2';
        $token = 'fixed-verification-token';
        Str::createRandomStringsUsing(fn (): string => $token);

        // Act
        $this->postJson('/api/auth/register', [
            'name' => 'Jan Jansen',
            'email' => $email,
            'password' => $password,
            'password_confirmation' => $password,
        ]);

        // Assert
        $this->assertDatabaseHas('users', [
            'email' => $email,
            'verification_token' => hash('sha256', $token),
            'verification_token_expires_at' => $now->addHours(24),
        ]);
    });

    it('should queue no mail when the email is taken', function (): void {
        // Arrange
        Mail::fake();
        $email = 'jan@example.com';
        $password = 'correct-horse-battery2';
        User::factory()->create(['email' => $email]);

        // Act
        $this->postJson('/api/auth/register', [
            'name' => 'Jan Jansen',
            'email' => $email,
            'password' => $password,
            'password_confirmation' => $password,
        ]);

        // Assert
        Mail::assertNothingOutgoing();
    });

    it('should return no content, create no second user and queue no mail when the email is taken with different casing', function (): void {
        // Arrange
        Mail::fake();
        $password = 'correct-horse-battery2';
        User::factory()->create(['email' => 'jan@example.com']);

        // Act
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Jan Jansen',
            'email' => 'Jan@Example.com',
            'password' => $password,
            'password_confirmation' => $password,
        ]);

        // Assert
        $response->assertNoContent();
        $this->assertDatabaseCount('users', 1);
        Mail::assertNothingOutgoing();
    });

    it('should return 500 and create no user when queueing the verification mail throws', function (): void {
        // Arrange
        $password = 'correct-horse-battery2';
        $this->mock(Mailer::class, function (MockInterface $mailer): void {
            $mailer->shouldReceive('to')->andThrow(new RuntimeException('Mail queue unavailable'));
        });

        // Act
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Jan Jansen',
            'email' => 'jan@example.com',
            'password' => $password,
            'password_confirmation' => $password,
        ]);

        // Assert
        $response->assertInternalServerError();
        $this->assertDatabaseCount('users', 0);
    });
});
