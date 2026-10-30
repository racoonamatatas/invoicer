<?php

declare(strict_types = 1);

use App\Models\Invoice;

describe('Invoice::lines()', function (): void {

    it('should order the lines by position (the relation carries the ORDER BY itself)', function (): void {
        // Arrange
        $invoice = Invoice::factory()->create();

        // Act
        // The query, not the rows: on SQLite the (invoice_id, position) index returns the lines in order even
        // without an ORDER BY, so only the query can show the ORDER BY is there. The builder's orders, not toSql(),
        // so the check doesn't depend on how a driver quotes column names.
        $orders = $invoice->lines()->getQuery()->getQuery()->orders;

        // Assert
        expect($orders)->toBe([['column' => 'position', 'direction' => 'asc']]);
    });
});
