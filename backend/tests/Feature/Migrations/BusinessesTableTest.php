<?php

declare(strict_types = 1);

use App\Models\Business;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Schema;

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

    it('should refuse the same kvk_number twice for one user, but allow it for another user', function (): void {
        // Arrange
        $first = Business::factory()->create(['kvk_number' => '12345678']);

        // Act
        $sameUser = fn () => Business::factory()->for($first->user)->create(['kvk_number' => '12345678']);
        $otherUser = Business::factory()->create(['kvk_number' => '12345678']);

        // Assert
        expect($sameUser)->toThrow(QueryException::class)
            ->and($otherUser->exists)->toBeTrue();
    });

    it('should have an index that leads with user_id (SQLite does not index a foreign key by itself)', function (): void {
        // Act
        $indexedColumns = collect(Schema::getIndexes('businesses'))->pluck('columns');

        // Assert: the leading column is what serves "where user_id = ?", whether or not more columns follow.
        expect($indexedColumns->contains(fn (array $columns): bool => $columns[0] === 'user_id'))->toBeTrue();
    });

    it('should name the (user_id, kvk_number) unique index businesses_user_id_kvk_number_unique', function (): void {
        // Act. DuplicateKvkNumberException matches on this name, which is all MySQL reports about a violation; a
        // renamed index would turn a raced duplicate back into a 500 there.
        $index = collect(Schema::getIndexes('businesses'))->firstWhere('name', 'businesses_user_id_kvk_number_unique');

        // Assert
        expect($index)->not->toBeNull()
            ->and($index['columns'])->toBe(['user_id', 'kvk_number'])
            ->and($index['unique'])->toBeTrue();
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
