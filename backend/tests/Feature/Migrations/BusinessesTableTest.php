<?php

declare(strict_types = 1);

use App\Models\Business;
use Illuminate\Database\QueryException;

describe('The businesses table', function (): void {

    it('should refuse to delete a user who has a business (user_id restricts deletion)', function (): void {
        // Arrange
        $business = Business::factory()->create();

        // Act
        $delete = fn () => $business->user->delete();

        // Assert
        expect($delete)->toThrow(QueryException::class)
            ->and($business->user()->exists())->toBeTrue();
    });

    it('should allow one user to own several businesses (user_id is not unique)', function (): void {
        // Arrange
        $first = Business::factory()->create();

        // Act
        $second = Business::factory()->for($first->user)->create();

        // Assert
        expect($second->user_id)->toBe($first->user_id);
    });
});
