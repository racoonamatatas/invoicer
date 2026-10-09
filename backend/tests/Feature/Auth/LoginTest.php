<?php

declare(strict_types = 1);

use App\Models\User;
use Illuminate\Support\Facades\Auth;

describe('Logging in', function (): void {
    it('should log in a user with a correct email and password', function (): void {
        // Arrange
        $user = User::factory()->create();

        // Act
        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        // Assert
        $response->assertOk();
        $this->assertAuthenticatedAs($user, 'web');
    });

    it('should return 200 (ok) with only the id, name and email of the user', function (): void {
        // Arrange
        $user = User::factory()->create();

        // Act
        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        // Assert
        $response->assertOk();
        // Exact: a new column on users must not reach the browser unless it is added on purpose.
        $response->assertExactJson([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);
    });

    it('should return 200 (ok) and log in when the email differs from the stored one only in casing', function (): void {
        // Arrange
        $user = User::factory()->create(['email' => 'jan@example.com']);

        // Act
        $response = $this->postJson('/api/auth/login', [
            'email' => 'Jan@Example.com',
            'password' => 'password',
        ]);

        // Assert
        $response->assertOk();
        $this->assertAuthenticatedAs($user, 'web');
    });

    it('should not log in a user with an incorrect password', function (): void {
        // Arrange
        $user = User::factory()->create();

        // Act
        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'incorrect',
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email' => 'These credentials do not match our records.']);
        $this->assertGuest('web');
    });

    it('should not log in with an email that does not exist', function (): void {
        // Arrange
        // empty

        // Act
        $response = $this->postJson('/api/auth/login', [
            'email' => 'nobody@example.com',
            'password' => 'password',
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email' => 'These credentials do not match our records.']);
        $this->assertGuest('web');
    });

    // Guards third-party code: Laravel's SessionGuard::validate() pads failed logins, not LoginUserAction.
    // Catches a renamed auth.timebox_duration key, or a login rewritten to skip validate().
    it('should return 422 (unprocessable) no sooner than the timebox duration for an email that does not exist', function (): void {
        // Arrange
        // The test suite runs with the timebox at 0 (phpunit.xml) for speed; dev and production use 500ms.
        // Set to 250ms for this test only: above Laravel's 200ms default, so a renamed config key fails the test.
        $timeboxMicroseconds = 250_000;
        config(['auth.timebox_duration' => $timeboxMicroseconds]);
        Auth::forgetGuards(); // The guard reads the duration when it is built, so rebuild it.
        $startedAt = hrtime(true);

        // Act
        $response = $this->postJson('/api/auth/login', [
            'email' => 'nobody@example.com',
            'password' => 'password',
        ]);

        // Assert
        $elapsedMicroseconds = (hrtime(true) - $startedAt) / 1_000;
        $response->assertUnprocessable();
        expect($elapsedMicroseconds)->toBeGreaterThanOrEqual($timeboxMicroseconds);
    });

    it('should return 422 (unprocessable) with the verify-email message and not log in when the email is unverified', function (): void {
        // Arrange
        $user = User::factory()->unverified()->create();

        // Act
        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['email' => 'Verify your email before logging in.']);
        $this->assertGuest('web');
    });

    it('should return 429 (too many requests) on the 6th login from one IP within a minute, even for different emails', function (): void {
        // Arrange
        for ($attempt = 1; $attempt <= 5; $attempt++)
        {
            $this->postJson('/api/auth/login', ['email' => 'user'.$attempt.'@example.com', 'password' => 'incorrect'])
                ->assertUnprocessable();
        }

        // Act
        $response = $this->postJson('/api/auth/login', ['email' => 'user6@example.com', 'password' => 'incorrect']);

        // Assert
        $response->assertTooManyRequests();
    });

    it('should return 429 (too many requests) on the 11th login for one email within 15 minutes, even from different IPs', function (): void {
        // Arrange
        $credentials = ['email' => 'jan@example.com', 'password' => 'incorrect'];

        // Start at 1: the counter is the IP's last octet, and .0 is a network address, not a host.
        for ($attempt = 1; $attempt <= 10; $attempt++)
        {
            $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.'.$attempt])
                ->postJson('/api/auth/login', $credentials)
                ->assertUnprocessable();
        }

        // Act
        $response = $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.11'])
            ->postJson('/api/auth/login', $credentials);

        // Assert
        $response->assertTooManyRequests();
    });
});
