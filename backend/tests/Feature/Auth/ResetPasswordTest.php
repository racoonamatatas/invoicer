<?php

declare(strict_types = 1);

use App\Mail\PasswordChanged;
use App\Models\User;
use Illuminate\Auth\Passwords\PasswordBroker;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;

describe('Resetting a password', function (): void {

    it('should return 204 (no content) and store the new password hashed when the token is valid', function (): void {
        // Arrange
        $email = 'jan@example.com';
        $user = User::factory()->create(['email' => $email]);
        $token = $this->app->make(PasswordBroker::class)->createToken($user);

        // Act
        $response = $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $email,
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        // Assert
        $response->assertNoContent();
        expect(Hash::check('new-password-123', $user->fresh()->password))->toBeTrue();
    });

    it('should return 204 (no content) and queue a password-changed mail to the user with a link to request a new reset', function (): void {
        // Arrange
        Mail::fake();
        $email = 'jan@example.com';
        $user = User::factory()->create(['email' => $email]);
        $token = $this->app->make(PasswordBroker::class)->createToken($user);

        // Act
        $response = $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $email,
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        // Assert
        $response->assertNoContent();
        Mail::assertQueued(PasswordChanged::class, function (PasswordChanged $mail) use ($email): bool {
            $mail->assertSeeInHtml(config('app.url').'/forgot-password');

            return $mail->hasTo($email);
        });
    });

    it('should return 422 (unprocessable) with the invalid-link message and leave the password unchanged when the token is wrong', function (): void {
        // Arrange
        $email = 'jan@example.com';
        $user = User::factory()->create(['email' => $email, 'password' => 'old-password-123']);
        // Bait: the user has a real token, so a check that only asked "does a token exist?" would wrongly accept the wrong one.
        $this->app->make(PasswordBroker::class)->createToken($user);

        // Act
        $response = $this->postJson('/api/auth/reset-password', [
            'token' => 'wrong-token',
            'email' => $email,
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([
            'token' => 'This reset link is invalid or has expired.',
        ]);
        expect(Hash::check('old-password-123', $user->fresh()->password))->toBeTrue();
    });

    it('should return 422 (unprocessable) and queue no mail when the token is wrong', function (): void {
        // Arrange
        Mail::fake();
        $email = 'jan@example.com';
        // Bait: Jan exists and has a real token, so code that mailed whoever owns the email would find someone to mail.
        $user = User::factory()->create(['email' => $email]);
        $this->app->make(PasswordBroker::class)->createToken($user);

        // Act
        $response = $this->postJson('/api/auth/reset-password', [
            'token' => 'wrong-token',
            'email' => $email,
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        // Assert
        $response->assertUnprocessable();
        Mail::assertNothingOutgoing();
    });

    it('should return 422 (unprocessable) with the same invalid-link message and leave the password unchanged when the email is unknown', function (): void {
        // Arrange
        $user = User::factory()->create(['email' => 'jan@example.com', 'password' => 'old-password-123']);
        // Bait: a real token posted with a different email, so code that looked users up by token alone would reset Jan.
        $token = $this->app->make(PasswordBroker::class)->createToken($user);

        // Act
        $response = $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => 'unknown@example.com',
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([
            'token' => 'This reset link is invalid or has expired.',
        ]);
        expect(Hash::check('old-password-123', $user->fresh()->password))->toBeTrue();
    });

    it('should return 204 (no content), delete every session of the user and keep the sessions of other users', function (): void {
        // Arrange
        $email = 'jan@example.com';
        $user = User::factory()->create(['email' => $email]);
        // Bait: Piet's session, so code that emptied the whole table would also pass the "Jan's are gone" check.
        $otherUser = User::factory()->create(['email' => 'piet@example.com']);
        DB::table('sessions')->insert([
            ['id' => 'jan-laptop', 'user_id' => $user->id, 'payload' => '', 'last_activity' => now()->getTimestamp()],
            ['id' => 'jan-phone', 'user_id' => $user->id, 'payload' => '', 'last_activity' => now()->getTimestamp()],
            ['id' => 'piet-laptop', 'user_id' => $otherUser->id, 'payload' => '', 'last_activity' => now()->getTimestamp()],
        ]);
        $token = $this->app->make(PasswordBroker::class)->createToken($user);

        // Act
        $response = $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $email,
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        // Assert
        $response->assertNoContent();
        $this->assertDatabaseMissing('sessions', ['user_id' => $user->id]);
        $this->assertDatabaseHas('sessions', ['id' => 'piet-laptop', 'user_id' => $otherUser->id]);
    });

    it('should return 204 (no content), set email_verified_at and clear the verification token fields when the user was unverified', function (): void {
        // Arrange
        $now = $this->freezeTime();
        $email = 'jan@example.com';
        $user = User::factory()->unverified()->create([
            'email' => $email,
            'verification_token' => hash('sha256', 'fixed-verification-token'),
            'verification_token_expires_at' => $now->copy()->addHours(24),
        ]);
        $token = $this->app->make(PasswordBroker::class)->createToken($user);

        // Act
        $response = $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $email,
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        // Assert
        $response->assertNoContent();
        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'email_verified_at' => $now,
            'verification_token' => null,
            'verification_token_expires_at' => null,
        ]);
    });

    // Guards `if ($user->email_verified_at === null)` in ResetPasswordAction. The "user was unverified" test above can't:
    // its user gets verified with or without that if. Replacing the if with `if (true)` fails only this test.
    it('should return 204 (no content) and keep the original email_verified_at when the user was already verified', function (): void {
        // Arrange
        $now = $this->freezeTime();
        // Verified in the past, not now: overwriting with "now" must produce a different value for the test to catch it.
        $verifiedAt = $now->copy()->subDays(30);
        $email = 'jan@example.com';
        $user = User::factory()->create(['email' => $email, 'email_verified_at' => $verifiedAt]);
        $token = $this->app->make(PasswordBroker::class)->createToken($user);

        // Act
        $response = $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $email,
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        // Assert
        $response->assertNoContent();
        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'email_verified_at' => $verifiedAt,
        ]);
    });

    // Guards third-party code: Laravel's PasswordBroker::reset() deletes the token, not ResetPasswordAction.
    // Catches a custom broker that forgets the delete, or a transaction that rolls it back.
    it('should return 422 (unprocessable) with the invalid-link message and keep the first new password when the token is used a second time', function (): void {
        // Arrange
        $email = 'jan@example.com';
        $user = User::factory()->create(['email' => $email]);
        $token = $this->app->make(PasswordBroker::class)->createToken($user);
        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $email,
            'password' => 'first-password-123',
            'password_confirmation' => 'first-password-123',
        ])->assertNoContent();

        // Act
        $response = $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $email,
            'password' => 'second-password-123',
            'password_confirmation' => 'second-password-123',
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([
            'token' => 'This reset link is invalid or has expired.',
        ]);
        expect(Hash::check('first-password-123', $user->fresh()->password))->toBeTrue();
    });

    it('should return 422 (unprocessable) with a password error and leave the password unchanged when the confirmation does not match', function (): void {
        // Arrange
        $email = 'jan@example.com';
        $user = User::factory()->create(['email' => $email, 'password' => 'old-password-123']);
        // Bait: a valid token, so without the password rules the reset would go through.
        $token = $this->app->make(PasswordBroker::class)->createToken($user);

        // Act
        $response = $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $email,
            'password' => 'new-password-123',
            'password_confirmation' => 'different-password-123',
        ]);

        // Assert
        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['password']);
        expect(Hash::check('old-password-123', $user->fresh()->password))->toBeTrue();
    });

    it('should return 429 (too many requests) on the 6th request from one IP within a minute, even for different emails', function (): void {
        // Arrange
        for ($attempt = 1; $attempt <= 5; $attempt++)
        {
            $this->postJson('/api/auth/reset-password', [
                'token' => 'wrong-token',
                'email' => 'user'.$attempt.'@example.com',
                'password' => 'new-password-123',
                'password_confirmation' => 'new-password-123',
            ])->assertUnprocessable();
        }

        // Act
        $response = $this->postJson('/api/auth/reset-password', [
            'token' => 'wrong-token',
            'email' => 'user6@example.com',
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        // Assert
        $response->assertTooManyRequests();
    });
});
