<?php

declare(strict_types = 1);

use App\Models\PendingRegistration;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

describe('Setting a password through the set-password link', function (): void {

    it('should return 204 (no content), create a verified user with the name and password, delete the pending registration and not log in', function (): void {
        // Arrange
        $now = $this->freezeTime();
        $token = 'fixed-set-password-token';
        $email = 'jan@example.com';
        $password = 'correct-horse-battery2';
        PendingRegistration::factory()->create(['email' => $email, 'token' => hash('sha256', $token)]);

        // Act
        $response = $this->postJson('/api/auth/verify-email', [
            'token' => $token,
            'name' => 'Jan Jansen',
            'password' => $password,
            'password_confirmation' => $password,
        ]);

        // Assert
        $response->assertNoContent();
        $this->assertDatabaseHas('users', [
            'name' => 'Jan Jansen',
            'email' => $email,
            'email_verified_at' => $now,
        ]);
        $user = User::query()->where('email', $email)->sole();
        expect(Hash::check($password, $user->password))->toBeTrue();
        $this->assertDatabaseCount('pending_registrations', 0);
        // Not logged in: only a login starts a session, so a mailed link never hands out one.
        $this->getJson('/api/auth/user')->assertUnauthorized();
    });

    it('should let the new user log in with the password set through the link', function (): void {
        // Arrange
        $token = 'fixed-set-password-token';
        $email = 'jan@example.com';
        $password = 'correct-horse-battery2';
        PendingRegistration::factory()->create(['email' => $email, 'token' => hash('sha256', $token)]);
        $this->postJson('/api/auth/verify-email', [
            'token' => $token,
            'name' => 'Jan Jansen',
            'password' => $password,
            'password_confirmation' => $password,
        ])->assertNoContent();

        // Act
        $response = $this->postJson('/api/auth/login', ['email' => $email, 'password' => $password]);

        // Assert
        $response->assertOk();
        $this->assertAuthenticated('web');
    });

    it('should return 422 (unprocessable) with the invalid-link message, create no user and keep the pending registration when the token is unknown', function (): void {
        // Arrange
        $token = 'fixed-set-password-token';
        PendingRegistration::factory()->create(['token' => hash('sha256', $token)]);

        // Act
        $response = $this->postJson('/api/auth/verify-email', [
            'token' => 'different-set-password-token',
            'name' => 'Jan Jansen',
            'password' => 'correct-horse-battery2',
            'password_confirmation' => 'correct-horse-battery2',
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([
            'token' => 'This verification link is invalid or has expired.',
        ]);
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('pending_registrations', 1);
    });

    it('should return 422 (unprocessable) with the invalid-link message, create no user and keep the pending registration when the token has expired', function (): void {
        // Arrange
        $token = 'fixed-set-password-token';
        PendingRegistration::factory()->create(['token' => hash('sha256', $token), 'expires_at' => now()->addHours(24)]);
        $this->travel(25)->hours();

        // Act
        $response = $this->postJson('/api/auth/verify-email', [
            'token' => $token,
            'name' => 'Jan Jansen',
            'password' => 'correct-horse-battery2',
            'password_confirmation' => 'correct-horse-battery2',
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([
            'token' => 'This verification link is invalid or has expired.',
        ]);
        $this->assertDatabaseCount('users', 0);
        // Kept for model:prune: deleting here would tell an attacker whether the token existed.
        $this->assertDatabaseCount('pending_registrations', 1);
    });

    it('should return 422 (unprocessable) with the invalid-link message for the link from an earlier registration once the same email registered again', function (): void {
        // Arrange
        $email = 'jan@example.com';
        Str::createRandomStringsUsing(fn (): string => 'first-token');
        $this->postJson('/api/auth/register', ['email' => $email])->assertNoContent();
        Str::createRandomStringsUsing(fn (): string => 'second-token');
        $this->postJson('/api/auth/register', ['email' => $email])->assertNoContent();

        // Act
        $response = $this->postJson('/api/auth/verify-email', [
            'token' => 'first-token',
            'name' => 'Jan Jansen',
            'password' => 'correct-horse-battery2',
            'password_confirmation' => 'correct-horse-battery2',
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['token']);
        $this->assertDatabaseCount('users', 0);
    });

    it('should return 422 (unprocessable) on the field, create no user and keep the pending registration when a field is invalid', function (array $overrides, string $field): void {
        // Arrange
        $token = 'fixed-set-password-token';
        PendingRegistration::factory()->create(['token' => hash('sha256', $token)]);
        $valid = [
            'token' => $token,
            'name' => 'Jan Jansen',
            'password' => 'correct-horse-battery2',
            'password_confirmation' => 'correct-horse-battery2',
        ];

        // Act
        $response = $this->postJson('/api/auth/verify-email', [...$valid, ...$overrides]);

        // Assert
        $response->assertUnprocessable();
        $response->assertOnlyJsonValidationErrors([$field]);
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('pending_registrations', 1);
    })->with([
        'missing name' => [['name' => ''], 'name'],
        'password one character below the minimum' => [['password' => 'horse-battery2', 'password_confirmation' => 'horse-battery2'], 'password'],
        'password too long' => [['password' => str_repeat('a', 73), 'password_confirmation' => str_repeat('a', 73)], 'password'],
        // 37 characters, so Laravel's character-counting max:72 would let it through; bcrypt would hash only the first 72 bytes.
        'password of 73 bytes in fewer than 72 characters' => [['password' => str_repeat('é', 36).'a', 'password_confirmation' => str_repeat('é', 36).'a'], 'password'],
        // Reaches MaxBytes and WithoutNulBytes too (no bail): their non-string guards keep strlen() and str_contains() from a TypeError.
        'array password' => [['password' => ['correct-horse-battery2']], 'password'],
        'confirmation mismatch' => [['password_confirmation' => 'something-else'], 'password'],
    ]);

    it('should return 422 (unprocessable) with the bytes message when the password is 73 bytes', function (): void {
        // Arrange
        $token = 'fixed-set-password-token';
        $password = str_repeat('é', 36).'a';
        PendingRegistration::factory()->create(['token' => hash('sha256', $token)]);

        // Act
        $response = $this->postJson('/api/auth/verify-email', [
            'token' => $token,
            'name' => 'Jan Jansen',
            'password' => $password,
            'password_confirmation' => $password,
        ]);

        // Assert
        // The literal: the message is what tells the user the unit, since a 37-character password is "too long" only in bytes.
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['password' => 'The password field must not be greater than 72 bytes.']);
    });

    it('should return 422 (unprocessable) with the null-character message and create no user when the password holds a NUL byte', function (): void {
        // Arrange
        $token = 'fixed-set-password-token';
        // Legal JSON ("\u0000" on the wire) that passes every other rule; PHP's bcrypt throws on it, which would be a 500.
        $password = "correct-horse\0battery2";
        PendingRegistration::factory()->create(['token' => hash('sha256', $token)]);

        // Act
        $response = $this->postJson('/api/auth/verify-email', [
            'token' => $token,
            'name' => 'Jan Jansen',
            'password' => $password,
            'password_confirmation' => $password,
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['password' => 'The password field must not contain a null character.']);
        $this->assertDatabaseCount('users', 0);
    });

    it('should return 204 (no content) and create the user when the password is exactly 72 bytes', function (): void {
        // Arrange
        $token = 'fixed-set-password-token';
        $email = 'jan@example.com';
        $password = str_repeat('é', 36); // 36 characters, 72 bytes: the most bcrypt reads in full.
        PendingRegistration::factory()->create(['email' => $email, 'token' => hash('sha256', $token)]);

        // Act
        $response = $this->postJson('/api/auth/verify-email', [
            'token' => $token,
            'name' => 'Jan Jansen',
            'password' => $password,
            'password_confirmation' => $password,
        ]);

        // Assert
        $response->assertNoContent();
        $user = User::query()->where('email', $email)->sole();
        expect(Hash::check($password, $user->password))->toBeTrue();
    });

    // Guards third-party code: Laravel's NotPwnedVerifier rejects leaked passwords, not VerifyEmailRequest.
    // Catches uncompromised() being dropped from the password policy, or Laravel misreading the API's answer.
    it('should return 422 (unprocessable) with a password error and create no user when the password appears in a data leak', function (): void {
        // Arrange
        $token = 'fixed-set-password-token';
        $password = 'correct-horse-battery2';
        PendingRegistration::factory()->create(['token' => hash('sha256', $token)]);
        // Read by the fake haveibeenpwned API in tests/TestCase.php (pwnedRange()), which then reports this password as leaked.
        $this->leakedPasswords = [$password];

        // Act
        $response = $this->postJson('/api/auth/verify-email', [
            'token' => $token,
            'name' => 'Jan Jansen',
            'password' => $password,
            'password_confirmation' => $password,
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertOnlyJsonValidationErrors(['password']);
        $this->assertDatabaseCount('users', 0);
    });

    // A user appeared for the email after the registration was stored, e.g. seeded or created by hand.
    it('should return 422 (unprocessable) on the token, delete the pending registration and leave the user unchanged when the email already has a user', function (): void {
        // Arrange
        $token = 'fixed-set-password-token';
        $email = 'jan@example.com';
        $existing = User::factory()->create(['email' => $email]);
        PendingRegistration::factory()->create(['email' => $email, 'token' => hash('sha256', $token)]);

        // Act
        $response = $this->postJson('/api/auth/verify-email', [
            'token' => $token,
            'name' => 'Someone Else',
            'password' => 'correct-horse-battery2',
            'password_confirmation' => 'correct-horse-battery2',
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([
            'token' => 'This verification link is invalid or has expired.',
        ]);
        $this->assertDatabaseCount('pending_registrations', 0);
        $this->assertDatabaseCount('users', 1);
        expect(reloaded($existing)->name)->toBe($existing->name)
            ->and(reloaded($existing)->password)->toBe($existing->password);
    });

    it('should throttle verification after 5 attempts per minute', function (): void {
        // Arrange
        $payload = ['token' => 'unknown-set-password-token'];

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
        $response = $this->postJson('/api/auth/verify-email', ['token' => 'unknown-set-password-token']);

        // Assert
        $response->assertUnprocessable();
    });
});
