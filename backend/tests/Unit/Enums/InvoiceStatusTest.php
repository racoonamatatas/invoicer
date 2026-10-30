<?php

declare(strict_types = 1);

use App\Enums\InvoiceStatus;

describe('InvoiceStatus', function (): void {

    it('should back Draft with 1', function (): void {
        // Act
        $value = InvoiceStatus::Draft->value;

        // Assert
        // This integer is what invoices.status stores, so a renumbering must break this test.
        expect($value)->toBe(1);
    });

    it('should name Draft "draft" in the API', function (): void {
        // Act
        $name = InvoiceStatus::Draft->apiName();

        // Assert
        // This string is what the frontend sends and checks, so a renamed one must break this test.
        expect($name)->toBe('draft');
    });
});
