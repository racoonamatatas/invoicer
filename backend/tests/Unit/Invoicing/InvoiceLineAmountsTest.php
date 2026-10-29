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

    it('should refuse a quantity × unit price too large for an int, with the 50 for rounding added', function (int $quantityHundredths, int $unitPriceCents): void {
        // Act
        $build = static fn (): InvoiceLineAmounts => new InvoiceLineAmounts($quantityHundredths, $unitPriceCents, VatOption::High);

        // Assert
        $message = "An invoice line's quantity × unit price is too large to compute, got {$quantityHundredths} hundredths × {$unitPriceCents} cents.";
        expect($build)->toThrow(InvalidArgumentException::class, $message);
    })->with([
        'far past the limit' => [100, PHP_INT_MAX],
        // The product itself fits, but totalCents() adds 50 before dividing, and that no longer does.
        'within 50 of the limit' => [1, PHP_INT_MAX - 10],
    ]);

    it('should accept the largest unit price whose product with 1.00 still fits, and compute its line total', function (): void {
        // Arrange
        // 100 hundredths × this price + 50 is at most PHP_INT_MAX, so it's the largest price a quantity of 1.00 allows.
        $largestPriceCents = intdiv(PHP_INT_MAX - 50, 100);

        // Act
        $line = new InvoiceLineAmounts(100, $largestPriceCents, VatOption::High);

        // Assert
        expect($line->totalCents())->toBe($largestPriceCents);
    });
});
