<?php

declare(strict_types = 1);

use App\Enums\VatOption;
use App\Invoicing\VatGroupTotal;

describe('VatGroupTotal', function (): void {

    it("should round the group's VAT to the cent, half up", function (VatOption $option, int $baseCents, int $vatCents): void {
        // Act
        $group = VatGroupTotal::forBase($option, $baseCents);

        // Assert
        expect($group->vatCents)->toBe($vatCents);
    })->with([
        '€1.69 at 21% = 35.49 cents, down to 35' => [VatOption::High, 169, 35],
        '€2.50 at 21% = 52.5 cents, up to 53' => [VatOption::High, 250, 53],
        '€0.50 at 9% = 4.5 cents, up to 5' => [VatOption::Low, 50, 5],
    ]);

    it('should give a Zero or Exempt group no VAT and keep its base', function (VatOption $option): void {
        // Act
        $group = VatGroupTotal::forBase($option, 6000);

        // Assert
        expect($group->option)->toBe($option)
            ->and($group->baseCents)->toBe(6000)
            ->and($group->vatCents)->toBe(0);
    })->with([
        'Zero' => [VatOption::Zero],
        'Exempt' => [VatOption::Exempt],
    ]);

    it('should refuse a negative base, with a rate or without one', function (VatOption $option): void {
        // Act
        $build = static fn (): VatGroupTotal => VatGroupTotal::forBase($option, -250);

        // Assert
        // Exempt is here because it skips the VAT arithmetic: the check must come before that shortcut.
        expect($build)->toThrow(InvalidArgumentException::class, "A VAT group's base can't be negative, got -250 cents.");
    })->with([
        'High' => [VatOption::High],
        'Exempt' => [VatOption::Exempt],
    ]);

    it('should refuse a base whose base × rate is too large for an int, with the 50 for rounding added', function (int $baseCents): void {
        // Act
        $build = static fn (): VatGroupTotal => VatGroupTotal::forBase(VatOption::High, $baseCents);

        // Assert
        $message = "A VAT group's base is too large to compute its VAT, got {$baseCents} cents.";
        expect($build)->toThrow(InvalidArgumentException::class, $message);
    })->with([
        'far past the limit' => [PHP_INT_MAX],
        // base × 21 itself fits, but the VAT adds 50 before dividing, and that no longer does.
        'within 50 of the limit' => [intdiv(PHP_INT_MAX, 21)],
    ]);

    it('should accept the largest base whose VAT at 21% still fits, and compute it', function (): void {
        // Arrange
        // base × 21 + 50 is at most PHP_INT_MAX, so it's the largest base the High rate allows.
        $largestBaseCents = intdiv(PHP_INT_MAX - 50, 21);

        // Act
        $group = VatGroupTotal::forBase(VatOption::High, $largestBaseCents);

        // Assert
        expect($group->vatCents)->toBe(intdiv($largestBaseCents * 21 + 50, 100));
    });
});
