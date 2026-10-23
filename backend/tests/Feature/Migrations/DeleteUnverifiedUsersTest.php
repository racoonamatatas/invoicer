<?php

declare(strict_types = 1);

use App\Models\User;
use Illuminate\Database\Migrations\Migration;

describe('The delete-unverified-users migration', function (): void {

    it('should delete unverified users and keep verified users', function (): void {
        // Arrange
        $unverified = User::factory()->unverified()->create();
        $verified = User::factory()->create();
        /** @var Migration $migration */
        $migration = require database_path('migrations/2026_10_23_162435_delete_unverified_users.php');

        // Act
        $migration->up();

        // Assert
        $this->assertDatabaseMissing('users', ['id' => $unverified->id]);
        $this->assertDatabaseHas('users', ['id' => $verified->id]);
    });
});
