<?php

declare(strict_types = 1);

use App\Models\Business;
use App\Models\User;

describe('A business\'s owner', function (): void {

    it('should not change through fill(), so no request input can hand a business to another user', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $otherUser = User::factory()->create();

        // Act: what a create or update request would do with validated input that smuggled in a user_id.
        $business->fill(['user_id' => $otherUser->id, 'legal_name' => 'Renamed']);

        // Assert
        expect($business->user_id)->not->toBe($otherUser->id)
            ->and($business->legal_name)->toBe('Renamed');
    });
});
