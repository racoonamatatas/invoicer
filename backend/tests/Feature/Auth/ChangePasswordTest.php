<?php

declare(strict_types = 1);

use App\Mail\PasswordChanged;
use App\Models\User;
use Illuminate\Auth\SessionGuard;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;

describe('Changing the password', function (): void {

    it('should return 204 (no content), change the password and keep the user logged in when the current password is correct', function (): void {
        // Arrange
        $user = User::factory()->create(['password' => 'old-horse-battery1']);
        $this->actingAs($user, 'web');

        // Act
        $response = $this->putJson('/api/auth/password', [
            'current_password' => 'old-horse-battery1',
            'password' => 'new-horse-battery2',
            'password_confirmation' => 'new-horse-battery2',
        ]);

        // Assert
        $response->assertNoContent();
        $this->assertAuthenticatedAs($user, 'web');
        expect(Hash::check('new-horse-battery2', $user->fresh()->password))->toBeTrue();
    });

    it('should return 422 (unprocessable) with a current_password error and keep the old password when the current password is wrong', function (): void {
        // Arrange
        $user = User::factory()->create(['password' => 'old-horse-battery1']);
        $this->actingAs($user, 'web');

        // Act
        $response = $this->putJson('/api/auth/password', [
            'current_password' => 'wrong-horse-battery1',
            'password' => 'new-horse-battery2',
            'password_confirmation' => 'new-horse-battery2',
        ]);

        // Assert
        $response->assertUnprocessable()
            ->assertOnlyJsonValidationErrors(['current_password']);
        expect(Hash::check('old-horse-battery1', $user->fresh()->password))->toBeTrue();
    });

    it('should return 401 (unauthorized) for a guest', function (): void {
        // Act
        $response = $this->putJson('/api/auth/password', [
            'current_password' => 'old-horse-battery1',
            'password' => 'new-horse-battery2',
            'password_confirmation' => 'new-horse-battery2',
        ]);

        // Assert
        $response->assertUnauthorized();
    });

    it('should return 204 (no content), keep only the current session of the user and keep the sessions of all other users', function (): void {
        // Arrange
        $user = User::factory()->create(['email' => 'jan@example.com', 'password' => 'old-horse-battery1']);
        // Bait: Piet's session, so code that emptied the whole table would also pass the "Jan's are gone" check.
        $otherUser = User::factory()->create(['email' => 'piet@example.com']);
        $this->actingAs($user, 'web');
        $currentSessionId = session()->getId();
        DB::table('sessions')->insert([
            ['id' => $currentSessionId, 'user_id' => $user->id, 'payload' => '', 'last_activity' => now()->getTimestamp()],
            ['id' => 'jan-phone', 'user_id' => $user->id, 'payload' => '', 'last_activity' => now()->getTimestamp()],
            ['id' => 'piet-laptop', 'user_id' => $otherUser->id, 'payload' => '', 'last_activity' => now()->getTimestamp()],
        ]);

        // Act
        $response = $this->putJson('/api/auth/password', [
            'current_password' => 'old-horse-battery1',
            'password' => 'new-horse-battery2',
            'password_confirmation' => 'new-horse-battery2',
        ]);

        // Assert
        $response->assertNoContent();
        $this->assertDatabaseMissing('sessions', ['id' => 'jan-phone']);
        $this->assertDatabaseHas('sessions', ['id' => $currentSessionId, 'user_id' => $user->id]);
        $this->assertDatabaseHas('sessions', ['id' => 'piet-laptop', 'user_id' => $otherUser->id]);
    });

    // Guards third-party code: Sanctum's AuthenticateSession logs out sessions with an outdated password hash, not ChangePasswordAction.
    // Catches authenticate_session being removed from config/sanctum.php, or the SPA requests no longer being stateful.
    it('should return 401 (unauthorized) on the next request from another session after the password changed, whatever the session driver', function (): void {
        // Arrange
        $user = User::factory()->create(['password' => 'old-horse-battery1']);
        $this->actingAs($user, 'web');
        // A Referer from the SPA makes the requests stateful, so Sanctum runs its session checks.
        $this->withHeader('Referer', config('app.url'));
        // What another device's session holds since its login: a fingerprint of the old password.
        $guard = Auth::guard('web');
        if (! $guard instanceof SessionGuard)
        {
            throw new LogicException('The web guard must be session-based for this test.');
        }
        $otherSessionPasswordHash = $guard->hashPasswordForCookie($user->password);
        $this->putJson('/api/auth/password', [
            'current_password' => 'old-horse-battery1',
            'password' => 'new-horse-battery2',
            'password_confirmation' => 'new-horse-battery2',
        ])->assertNoContent();

        // Act
        $response = $this->withSession(['password_hash_web' => $otherSessionPasswordHash])
            ->getJson('/api/auth/user');

        // Assert
        $response->assertUnauthorized();
    });

    // Guards third-party code: Sanctum's AuthenticateSession stores the new password hash in the current session, not ChangePasswordAction.
    // Catches a Sanctum change that stops refreshing the hash, which would log the user out right after changing their password.
    it('should return 200 (ok) on the next request from the same session after the password changed', function (): void {
        // Arrange
        $user = User::factory()->create(['password' => 'old-horse-battery1']);
        $this->actingAs($user, 'web');
        // A Referer from the SPA makes the requests stateful, so Sanctum runs its session checks.
        $this->withHeader('Referer', config('app.url'));
        // What this session holds since its login: a fingerprint of the old password.
        $guard = Auth::guard('web');
        if (! $guard instanceof SessionGuard)
        {
            throw new LogicException('The web guard must be session-based for this test.');
        }
        $this->withSession(['password_hash_web' => $guard->hashPasswordForCookie($user->password)]);
        $this->putJson('/api/auth/password', [
            'current_password' => 'old-horse-battery1',
            'password' => 'new-horse-battery2',
            'password_confirmation' => 'new-horse-battery2',
        ])->assertNoContent();

        // Act
        $response = $this->getJson('/api/auth/user');

        // Assert
        $response->assertOk();
    });

    it('should return 204 (no content) and queue a password-changed mail with the forgot-password link to the user', function (): void {
        // Arrange
        Mail::fake();
        $email = 'jan@example.com';
        $user = User::factory()->create(['email' => $email, 'password' => 'old-horse-battery1']);
        $this->actingAs($user, 'web');

        // Act
        $response = $this->putJson('/api/auth/password', [
            'current_password' => 'old-horse-battery1',
            'password' => 'new-horse-battery2',
            'password_confirmation' => 'new-horse-battery2',
        ]);

        // Assert
        $response->assertNoContent();
        Mail::assertQueuedCount(1);
        Mail::assertQueued(PasswordChanged::class, function (PasswordChanged $mail) use ($email): bool {
            $mail->assertSeeInHtml(config('app.url').'/forgot-password');

            return $mail->hasTo($email);
        });
    });

    it('should return 429 (too many requests) on the 6th attempt by one user within a minute, even from different IPs', function (): void {
        // Arrange
        $user = User::factory()->create(['password' => 'old-horse-battery1']);
        $this->actingAs($user, 'web');
        $guess = [
            'current_password' => 'wrong-horse-battery1',
            'password' => 'new-horse-battery2',
            'password_confirmation' => 'new-horse-battery2',
        ];

        // Start at 1: the counter is the IP's last octet, and .0 is a network address, not a host.
        for ($attempt = 1; $attempt <= 5; $attempt++)
        {
            $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.'.$attempt])
                ->putJson('/api/auth/password', $guess)
                ->assertUnprocessable();
        }

        // Act
        // The right password this time: the limit must block it anyway, or guessing would just continue.
        $response = $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.6'])
            ->putJson('/api/auth/password', [...$guess, 'current_password' => 'old-horse-battery1']);

        // Assert
        $response->assertTooManyRequests();
    });

    it('should return 422 (unprocessable) with a password error and keep the old password when the confirmation does not match', function (): void {
        // Arrange
        $user = User::factory()->create(['password' => 'old-horse-battery1']);
        $this->actingAs($user, 'web');

        // Act
        $response = $this->putJson('/api/auth/password', [
            'current_password' => 'old-horse-battery1',
            'password' => 'new-horse-battery2',
            'password_confirmation' => 'other-horse-battery3',
        ]);

        // Assert
        $response->assertUnprocessable()
            ->assertOnlyJsonValidationErrors(['password']);
        expect(Hash::check('old-horse-battery1', $user->fresh()->password))->toBeTrue();
    });
});
