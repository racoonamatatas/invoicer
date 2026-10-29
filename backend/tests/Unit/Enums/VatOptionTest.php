<?php

declare(strict_types = 1);

use App\Enums\VatOption;

describe('VatOption', function (): void {

    it('should back High, Low, Zero and Exempt with 1, 2, 3 and 4', function (VatOption $option, int $stored): void {
        // Act
        $value = $option->value;

        // Assert
        // These integers are what invoice_lines.vat_option stores, so a renumbering must break this test.
        expect($value)->toBe($stored);
    })->with([
        'High' => [VatOption::High, 1],
        'Low' => [VatOption::Low, 2],
        'Zero' => [VatOption::Zero, 3],
        'Exempt' => [VatOption::Exempt, 4],
    ]);

    it('should return a rate percent of 21 for High, 9 for Low and 0 for Zero', function (VatOption $option, int $rate): void {
        // Act
        $ratePercent = $option->ratePercent();

        // Assert
        expect($ratePercent)->toBe($rate);
    })->with([
        'High' => [VatOption::High, 21],
        'Low' => [VatOption::Low, 9],
        'Zero' => [VatOption::Zero, 0],
    ]);

    it('should return no rate percent (null) for Exempt', function (): void {
        // Act
        $ratePercent = VatOption::Exempt->ratePercent();

        // Assert
        // toBeNull, because an exempt line has no rate at all, which is not the same as 0%.
        expect($ratePercent)->toBeNull();
    });

    it('should answer ratePercent() for every case without an UnhandledMatchError', function (VatOption $option): void {
        // Act
        // The match in ratePercent() has no default arm, so a case it doesn't list throws an UnhandledMatchError.
        // The dataset is cases() itself, so a new case is in this test the moment it exists.
        $ratePercent = static fn (): ?int => $option->ratePercent();

        // Assert
        expect($ratePercent)->not->toThrow(UnhandledMatchError::class);
    })->with(VatOption::cases());
});
