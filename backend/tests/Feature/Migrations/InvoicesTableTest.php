<?php

declare(strict_types = 1);

use App\Models\BankAccount;
use App\Models\Business;
use App\Models\Client;
use App\Models\Invoice;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

describe('The invoices table', function (): void {

    it('should refuse to delete a business that has an invoice (business_id restricts deletion)', function (): void {
        // Arrange
        // The invoice's client and account belong to another business: a business with its own clients can't be
        // deleted anyway, so only the invoice must stand in the way here.
        $other = Business::factory()->create();
        $invoice = Invoice::factory()->create([
            'client_id' => Client::factory()->for($other),
            'bank_account_id' => BankAccount::factory()->for($other),
        ]);

        // Act
        $delete = fn () => $invoice->business->delete();

        // Assert
        expect($delete)->toThrow(QueryException::class)
            ->and($invoice->business()->exists())->toBeTrue();
    });

    it('should refuse to delete a client that has an invoice (client_id restricts deletion)', function (): void {
        // Arrange
        $invoice = Invoice::factory()->create();

        // Act
        $delete = fn () => $invoice->client->delete();

        // Assert
        expect($delete)->toThrow(QueryException::class)
            ->and($invoice->client()->exists())->toBeTrue();
    });

    it('should refuse to delete a bank account that an invoice names (bank_account_id restricts deletion)', function (): void {
        // Arrange
        $invoice = Invoice::factory()->create();

        // Act
        $delete = fn () => $invoice->bankAccount->delete();

        // Assert
        expect($delete)->toThrow(QueryException::class)
            ->and($invoice->bankAccount()->exists())->toBeTrue();
    });

    it('should refuse an invoice that leaves out status or vat_treatment (NOT NULL, no default)', function (string $column): void {
        // Arrange
        // A raw insert without the column, not a null: a column default would fill in a missing value, and the point
        // is that none does.
        $row = Invoice::factory()->make()->getAttributes();
        unset($row[$column]);

        // Act
        $insert = fn () => DB::table('invoices')->insert($row);

        // Assert
        expect($insert)->toThrow(QueryException::class);
    })->with(['status', 'vat_treatment']);

    it('should allow several drafts without a number for one business (NULLs are distinct in the unique index)', function (): void {
        // Arrange
        $first = Invoice::factory()->create(['number' => null]);

        // Act
        $second = Invoice::factory()->for($first->business)->create(['number' => null]);

        // Assert
        expect($second->exists)->toBeTrue();
    });

    it('should refuse the same number twice for one business, but allow it for another business', function (): void {
        // Arrange
        $first = Invoice::factory()->create(['number' => '2026-001']);

        // Act
        $sameBusiness = fn () => Invoice::factory()->for($first->business)->create(['number' => '2026-001']);
        $otherBusiness = Invoice::factory()->create(['number' => '2026-001']);

        // Assert
        expect($sameBusiness)->toThrow(QueryException::class)
            ->and($otherBusiness->exists)->toBeTrue();
    });
});
