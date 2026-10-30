<?php

declare(strict_types = 1);

use App\Models\Invoice;
use App\Models\InvoiceLine;
use Illuminate\Database\QueryException;

describe('The invoice_lines table', function (): void {

    it('should delete an invoice\'s lines along with it (invoice_id cascades on delete)', function (): void {
        // Arrange
        $line = InvoiceLine::factory()->create();

        // Act
        // A plain delete of the row, no model events: the foreign key alone must take the lines with it.
        $line->invoice->delete();

        // Assert
        expect(InvoiceLine::query()->whereKey($line->id)->exists())->toBeFalse();
    });

    it('should refuse the same position twice on one invoice, but allow it on another invoice', function (): void {
        // Arrange
        $first = InvoiceLine::factory()->create(['position' => 1]);

        // Act
        $sameInvoice = fn () => InvoiceLine::factory()->for($first->invoice)->create(['position' => 1]);
        $otherInvoice = InvoiceLine::factory()->for(Invoice::factory())->create(['position' => 1]);

        // Assert
        expect($sameInvoice)->toThrow(QueryException::class)
            ->and($otherInvoice->exists)->toBeTrue();
    });

    it('should accept a line without a vat_option (nullable: a reverse-charge or outside-scope invoice has none)', function (): void {
        // Act
        $line = InvoiceLine::factory()->create(['vat_option' => null]);

        // Assert
        expect($line->exists)->toBeTrue();
    });
});
