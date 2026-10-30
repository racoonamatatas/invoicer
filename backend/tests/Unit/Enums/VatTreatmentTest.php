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

    it('should answer chargesVat() for every case without an UnhandledMatchError', function (VatTreatment $treatment): void {
        // Act
        // The match in chargesVat() has no default arm, so a case it doesn't list throws an UnhandledMatchError.
        // The dataset is cases() itself, so a new case is in this test the moment it exists.
        $chargesVat = static fn (): bool => $treatment->chargesVat();

        // Assert
        expect($chargesVat)->not->toThrow(UnhandledMatchError::class);
    })->with(VatTreatment::cases());

    it('should name Domestic, ReverseCharge and OutsideScope "domestic", "reverse_charge" and "outside_scope" in the API', function (VatTreatment $treatment, string $apiName): void {
        // Act
        $name = $treatment->apiName();

        // Assert
        // These strings are what the frontend sends and checks, so a renamed one must break this test.
        expect($name)->toBe($apiName);
    })->with([
        'Domestic' => [VatTreatment::Domestic, 'domestic'],
        'ReverseCharge' => [VatTreatment::ReverseCharge, 'reverse_charge'],
        'OutsideScope' => [VatTreatment::OutsideScope, 'outside_scope'],
    ]);

    it('should answer apiName() for every case without an UnhandledMatchError', function (VatTreatment $treatment): void {
        // Act
        // The match in apiName() has no default arm, so a case it doesn't list throws an UnhandledMatchError.
        // The dataset is cases() itself, so a new case is in this test the moment it exists.
        $apiName = static fn (): string => $treatment->apiName();

        // Assert
        expect($apiName)->not->toThrow(UnhandledMatchError::class);
    })->with(VatTreatment::cases());

    it('should give every case a different API name', function (): void {
        // Act
        $apiNames = array_map(static fn (VatTreatment $treatment): string => $treatment->apiName(), VatTreatment::cases());

        // Assert
        // Two cases with one name would read back as the same case.
        expect(array_unique($apiNames))->toHaveCount(count(VatTreatment::cases()));
    });
});
