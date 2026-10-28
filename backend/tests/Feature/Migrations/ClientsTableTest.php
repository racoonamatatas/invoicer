<?php

declare(strict_types = 1);

use App\Models\Business;
use App\Models\Client;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Schema;

describe('The clients table', function (): void {

    it('should refuse to delete a business that has a client (business_id restricts deletion)', function (): void {
        // Arrange
        $client = Client::factory()->create();

        // Act
        $delete = fn () => $client->business->delete();

        // Assert
        expect($delete)->toThrow(QueryException::class)
            ->and($client->business()->exists())->toBeTrue();
    });

    it('should refuse a client whose business does not exist (business_id is a foreign key)', function (): void {
        // Arrange. One past the highest id, so no business can have it.
        $missingBusinessId = Business::factory()->create()->id + 1;

        // Act
        $create = fn () => Client::factory()->create(['business_id' => $missingBusinessId]);

        // Assert
        expect($create)->toThrow(QueryException::class);
    });

    it('should have an index that leads with business_id (SQLite does not index a foreign key by itself)', function (): void {
        // Act
        $indexedColumns = collect(Schema::getIndexes('clients'))->pluck('columns');

        // Assert: the leading column is what serves "where business_id = ?", whether or not more columns follow.
        expect($indexedColumns->contains(fn (array $columns): bool => $columns[0] === 'business_id'))->toBeTrue();
    });

    it('should refuse a client without a name (name is NOT NULL)', function (): void {
        // Act
        $create = fn () => Client::factory()->create(['name' => null]);

        // Assert
        expect($create)->toThrow(QueryException::class);
    });

    it('should allow two clients with the same name for one business (name is not unique)', function (): void {
        // Arrange
        $first = Client::factory()->create(['name' => 'Jansen']);

        // Act
        $second = Client::factory()->for($first->business)->create(['name' => 'Jansen']);

        // Assert
        expect($second->exists)->toBeTrue();
    });

    it('should accept a client abroad without email, vat_number, postal_code or region (all four are nullable)', function (): void {
        // Act. A consumer abroad has no VAT number, and many countries have no postcode or region.
        $client = Client::factory()->create([
            'email' => null,
            'vat_number' => null,
            'postal_code' => null,
            'region' => null,
            'country_code' => 'IE',
        ]);

        // Assert
        expect($client->exists)->toBeTrue();
    });
});
