<?php

declare(strict_types = 1);

use App\Models\InvoiceLine;

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
});
