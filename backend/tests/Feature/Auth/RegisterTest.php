<?php

declare(strict_types = 1);

use App\Models\User;
use Illuminate\Support\Facades\Hash;

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
});
