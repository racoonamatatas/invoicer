<?php

declare(strict_types = 1);

use App\Enums\VatOption;
use App\Invoicing\InvoiceLineAmounts;

describe('InvoiceLineAmounts', function (): void {

    it('should refuse a negative quantity or unit price', function (int $quantityHundredths, int $unitPriceCents, string $message): void {
        // Act
        $build = static fn (): InvoiceLineAmounts => new InvoiceLineAmounts($quantityHundredths, $unitPriceCents, VatOption::High);

        // Assert
        expect($build)->toThrow(InvalidArgumentException::class, $message);
    })->with([
        'quantity -1.00' => [-100, 1000, "An invoice line's quantity can't be negative, got -100 hundredths."],
        'unit price -€0.01' => [100, -1, "An invoice line's unit price can't be negative, got -1 cents."],
    ]);

    it('should accept a zero quantity and a zero unit price, with a line total of 0', function (int $quantityHundredths, int $unitPriceCents): void {
        // Act
        $line = new InvoiceLineAmounts($quantityHundredths, $unitPriceCents, VatOption::High);

        // Assert
        expect($line->totalCents())->toBe(0);
    })->with([
        'zero quantity' => [0, 1000],
        'zero unit price' => [100, 0],
    ]);
});
