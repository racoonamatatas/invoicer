<?php

declare(strict_types = 1);

use App\DataTransferObjects\Input\Invoice\InvoiceData;
use App\DataTransferObjects\Input\Invoice\InvoiceLineData;
use App\Enums\VatOption;
use App\Enums\VatTreatment;

/**
 * A draft with one line of the given VAT option, under the given treatment.
 */
function invoiceDataWith(VatTreatment $treatment, ?VatOption $vatOption): InvoiceData
{
    return new InvoiceData(
        clientId: 1,
        bankAccountId: 1,
        vatTreatment: $treatment,
        paymentTermDays: null,
        lines: [new InvoiceLineData('Advieswerk', 100, 10000, $vatOption)],
    );
}

describe('InvoiceData', function (): void {

    it('should refuse a line without a VAT option on a domestic invoice', function (): void {
        // Act
        $build = static fn (): InvoiceData => invoiceDataWith(VatTreatment::Domestic, null);

        // Assert
        // The request refuses this first, so a feature test can't reach it; stored, the draft's totals couldn't be computed.
        expect($build)->toThrow(LogicException::class, "A line's VAT option doesn't fit the invoice's treatment, Domestic.");
    });

    it('should refuse a line with a VAT option on a reverse-charge or outside-scope invoice', function (VatTreatment $treatment): void {
        // Act
        $build = static fn (): InvoiceData => invoiceDataWith($treatment, VatOption::High);

        // Assert
        expect($build)->toThrow(LogicException::class, "A line's VAT option doesn't fit the invoice's treatment, {$treatment->name}.");
    })->with([VatTreatment::ReverseCharge, VatTreatment::OutsideScope]);

    it('should accept a line whose VAT option fits the treatment', function (VatTreatment $treatment, ?VatOption $vatOption): void {
        // Act
        $data = invoiceDataWith($treatment, $vatOption);

        // Assert
        // The other side of the guard, so a guard that refuses everything fails here.
        expect($data->lines[0]->vatOption)->toBe($vatOption);
    })->with([
        'domestic, high' => [VatTreatment::Domestic, VatOption::High],
        'reverse charge, none' => [VatTreatment::ReverseCharge, null],
        'outside scope, none' => [VatTreatment::OutsideScope, null],
    ]);

    it('should number the lines 1, 2, 3 in the order given', function (): void {
        // Arrange
        $data = new InvoiceData(1, 1, VatTreatment::OutsideScope, null, [
            new InvoiceLineData('Eerste', 100, 100, null),
            new InvoiceLineData('Tweede', 100, 100, null),
            new InvoiceLineData('Derde', 100, 100, null),
        ]);

        // Act
        $lines = $data->lineAttributes();

        // Assert
        expect(array_column($lines, 'description', 'position'))->toBe([1 => 'Eerste', 2 => 'Tweede', 3 => 'Derde']);
    });
});
