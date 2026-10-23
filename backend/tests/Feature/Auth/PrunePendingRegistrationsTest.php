<?php

declare(strict_types = 1);

use App\Models\PendingRegistration;
use Illuminate\Support\Facades\Schedule;

describe('Pruning pending registrations', function (): void {

    it('should delete expired pending registrations only when model:prune runs', function (): void {
        // Arrange
        $expired = PendingRegistration::factory()->expired()->create();
        $live = PendingRegistration::factory()->create();

        // Act
        $this->artisan('model:prune')->assertSuccessful();

        // Assert
        $this->assertDatabaseMissing('pending_registrations', ['id' => $expired->id]);
        $this->assertDatabaseHas('pending_registrations', ['id' => $live->id]);
    });

    it('should schedule model:prune daily', function (): void {
        // Act
        $events = collect(Schedule::events())
            ->filter(fn ($event): bool => str_contains($event->command ?? '', 'model:prune'));

        // Assert
        expect($events)->toHaveCount(1)
            ->and($events->first()->expression)->toBe('0 0 * * *'); // daily(): midnight, every day
    });
});
