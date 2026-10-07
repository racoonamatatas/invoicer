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
});
