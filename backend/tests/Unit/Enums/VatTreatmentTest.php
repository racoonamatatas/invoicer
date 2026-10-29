<?php

declare(strict_types = 1);

use App\Enums\VatTreatment;

describe('VatTreatment', function (): void {

    it('should back Domestic, ReverseCharge and OutsideScope with 1, 2 and 3', function (VatTreatment $treatment, int $stored): void {
        // Act
        $value = $treatment->value;

        // Assert
        // These integers are what invoices.vat_treatment stores, so a renumbering must break this test.
        expect($value)->toBe($stored);
    })->with([
        'Domestic' => [VatTreatment::Domestic, 1],
        'ReverseCharge' => [VatTreatment::ReverseCharge, 2],
        'OutsideScope' => [VatTreatment::OutsideScope, 3],
    ]);

    it('should charge VAT on a Domestic invoice', function (): void {
        // Act
        $chargesVat = VatTreatment::Domestic->chargesVat();

        // Assert
        expect($chargesVat)->toBeTrue();
    });

    it('should charge no VAT on a ReverseCharge or OutsideScope invoice', function (VatTreatment $treatment): void {
        // Act
        $chargesVat = $treatment->chargesVat();

        // Assert
        expect($chargesVat)->toBeFalse();
    })->with([
        'ReverseCharge' => [VatTreatment::ReverseCharge],
        'OutsideScope' => [VatTreatment::OutsideScope],
    ]);

    it('should say for every case whether it charges VAT, so a case missing from the match fails here', function (VatTreatment $treatment): void {
        // Act
        // The match in chargesVat() has no default arm, so a case it doesn't list throws an UnhandledMatchError.
        // The dataset is cases() itself, so a new case is in this test the moment it exists.
        $chargesVat = $treatment->chargesVat();

        // Assert
        expect($chargesVat)->toBeBool();
    })->with(VatTreatment::cases());
});
