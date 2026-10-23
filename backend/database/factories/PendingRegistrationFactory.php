<?php

declare(strict_types = 1);

namespace Database\Factories;

use App\Models\PendingRegistration;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<PendingRegistration>
 */
class PendingRegistrationFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'email' => fake()->unique()->safeEmail(),
            'token' => hash('sha256', Str::random(36)),
            'expires_at' => now()->addHours(24),
        ];
    }

    /**
     * Indicate that the set-password link has expired.
     */
    public function expired(): static
    {
        return $this->state(fn (array $attributes) => [
            'expires_at' => now()->subMinute(),
        ]);
    }
}
