<?php

declare(strict_types = 1);

use App\Models\BankAccount;
use App\Models\Business;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Schema;

describe('The bank_accounts table', function (): void {

    it('should refuse to delete a business that has a bank account (business_id restricts deletion)', function (): void {
        // Arrange
        $account = BankAccount::factory()->create();

        // Act
        $delete = fn () => $account->business->delete();

        // Assert
        expect($delete)->toThrow(QueryException::class)
            ->and($account->business()->exists())->toBeTrue();
    });

    it('should refuse the same iban twice for one business, but allow it for another business', function (): void {
        // Arrange
        $first = BankAccount::factory()->create(['iban' => 'NL91ABNA0417164300']);

        // Act
        $sameBusiness = fn () => BankAccount::factory()->for($first->business)->create(['iban' => 'NL91ABNA0417164300']);
        $otherBusiness = BankAccount::factory()->for(Business::factory())->create(['iban' => 'NL91ABNA0417164300']);

        // Assert
        expect($sameBusiness)->toThrow(QueryException::class)
            ->and($otherBusiness->exists)->toBeTrue();
    });

    it('should refuse the same label twice for one business, but allow it for another business', function (): void {
        // Arrange
        $first = BankAccount::factory()->create(['label' => 'Main']);

        // Act
        $sameBusiness = fn () => BankAccount::factory()->for($first->business)->create(['label' => 'Main']);
        $otherBusiness = BankAccount::factory()->for(Business::factory())->create(['label' => 'Main']);

        // Assert
        expect($sameBusiness)->toThrow(QueryException::class)
            ->and($otherBusiness->exists)->toBeTrue();
    });

    it('should refuse a bank account without a label (label is NOT NULL)', function (): void {
        // Act
        $create = fn () => BankAccount::factory()->create(['label' => null]);

        // Assert
        expect($create)->toThrow(QueryException::class);
    });

    it('should name the (business_id, iban) unique index bank_accounts_business_id_iban_unique', function (): void {
        // Act. DuplicateIbanException will match on this name, which is all MySQL reports about a violation; a
        // renamed index would turn a raced duplicate back into a 500 there.
        $index = collect(Schema::getIndexes('bank_accounts'))->firstWhere('name', 'bank_accounts_business_id_iban_unique');

        // Assert
        expect($index)->toMatchArray(['columns' => ['business_id', 'iban'], 'unique' => true]);
    });

    it('should have an index that leads with business_id (SQLite does not index a foreign key by itself)', function (): void {
        // Act
        $indexedColumns = collect(Schema::getIndexes('bank_accounts'))->pluck('columns');

        // Assert: the leading column is what serves "where business_id = ?", whether or not more columns follow.
        expect($indexedColumns->contains(fn (array $columns): bool => $columns[0] === 'business_id'))->toBeTrue();
    });
});
