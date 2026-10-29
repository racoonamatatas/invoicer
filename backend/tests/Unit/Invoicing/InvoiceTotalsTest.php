<?php

declare(strict_types = 1);

use App\Enums\VatOption;
use App\Enums\VatTreatment;
use App\Invoicing\InvoiceTotals;

describe('InvoiceTotals', function (): void {

    it("should compute VAT once on each group's base, rounding half a cent up", function (array $lines, int $baseCents, int $vatCents): void {
        // Act
        $totals = InvoiceTotals::fromLines(VatTreatment::Domestic, $lines);

        // Assert
        expect(vatGroupRows($totals))->toBe([[VatOption::High, $baseCents, $vatCents]]);
    })->with([
        // Three lines, not one line of 3: rounding each line's VAT gives 3 × 210 = 630, the base gives 630.63 → 631.
        '3 × €10.01 at 21%, VAT 6.31 not 6.30' => [
            [invoiceLine(100, 1001, VatOption::High), invoiceLine(100, 1001, VatOption::High), invoiceLine(100, 1001, VatOption::High)],
            3003,
            631,
        ],
        '€2.50 at 21%, VAT 52.5 cents up to 53' => [[invoiceLine(100, 250, VatOption::High)], 250, 53],
    ]);

    it('should give a mixed-rate invoice one group per rate, in High, Low order, and a VAT total that adds them up', function (): void {
        // Arrange
        // The Low line comes first, so the order of the groups can't just be the order of the lines.
        $lines = [invoiceLine(100, 5000, VatOption::Low), invoiceLine(100, 10000, VatOption::High)];

        // Act
        $totals = InvoiceTotals::fromLines(VatTreatment::Domestic, $lines);

        // Assert
        expect(vatGroupRows($totals))->toBe([[VatOption::High, 10000, 2100], [VatOption::Low, 5000, 450]])
            ->and($totals->subtotalCents)->toBe(15000)
            ->and($totals->vatCents)->toBe(2550)
            ->and($totals->totalCents)->toBe(17550);
    });

    it('should give Zero and Exempt lines a group with no VAT', function (): void {
        // Arrange
        $lines = [invoiceLine(100, 4000, VatOption::Zero), invoiceLine(100, 6000, VatOption::Exempt)];

        // Act
        $totals = InvoiceTotals::fromLines(VatTreatment::Domestic, $lines);

        // Assert
        expect(vatGroupRows($totals))->toBe([[VatOption::Zero, 4000, 0], [VatOption::Exempt, 6000, 0]])
            ->and($totals->totalCents)->toBe(10000);
    });

    it('should give a ReverseCharge or OutsideScope invoice no VAT groups and no VAT, so the total is the subtotal', function (VatTreatment $treatment): void {
        // Arrange
        $lines = [invoiceLine(200, 10000), invoiceLine(150, 3000)];

        // Act
        $totals = InvoiceTotals::fromLines($treatment, $lines);

        // Assert
        expect($totals->vatGroups)->toBe([])
            ->and($totals->subtotalCents)->toBe(24500)
            ->and($totals->vatCents)->toBe(0)
            ->and($totals->totalCents)->toBe(24500);
    })->with([
        'ReverseCharge' => [VatTreatment::ReverseCharge],
        'OutsideScope' => [VatTreatment::OutsideScope],
    ]);

    it('should refuse a line without a VAT option on a Domestic invoice', function (): void {
        // Arrange
        // The bad line is the second, so "Line 2" in the message proves the count starts at 1.
        $lines = [invoiceLine(100, 1000, VatOption::High), invoiceLine(100, 1000)];

        // Act
        $build = static fn (): InvoiceTotals => InvoiceTotals::fromLines(VatTreatment::Domestic, $lines);

        // Assert
        expect($build)->toThrow(InvalidArgumentException::class, "Line 2 needs a VAT option, because the invoice's treatment is Domestic.");
    });

    it('should name a refused line by its position, whatever the keys of the array it came in', function (array $lines): void {
        // Act
        // The keys break the list<> the docblock asks for, which PHP doesn't check: an array_filter() result keeps
        // its old keys, and a caller can pass string keys.
        $build = static fn (): InvoiceTotals => InvoiceTotals::fromLines(VatTreatment::Domestic, $lines);

        // Assert
        expect($build)->toThrow(InvalidArgumentException::class, "Line 2 needs a VAT option, because the invoice's treatment is Domestic.");
    })->with([
        'keys left by array_filter()' => [[3 => invoiceLine(100, 1000, VatOption::High), 7 => invoiceLine(100, 1000)]],
        'string keys' => [['first' => invoiceLine(100, 1000, VatOption::High), 'second' => invoiceLine(100, 1000)]],
    ]);

    it('should refuse a line with a VAT option on a ReverseCharge or OutsideScope invoice', function (VatTreatment $treatment, string $message): void {
        // Arrange
        $lines = [invoiceLine(100, 1000, VatOption::High)];

        // Act
        $build = static fn (): InvoiceTotals => InvoiceTotals::fromLines($treatment, $lines);

        // Assert
        expect($build)->toThrow(InvalidArgumentException::class, $message);
    })->with([
        'ReverseCharge' => [VatTreatment::ReverseCharge, "Line 1 can't have a VAT option, because the invoice's treatment is ReverseCharge."],
        'OutsideScope' => [VatTreatment::OutsideScope, "Line 1 can't have a VAT option, because the invoice's treatment is OutsideScope."],
    ]);
});
