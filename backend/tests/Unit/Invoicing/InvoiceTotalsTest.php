<?php

declare(strict_types = 1);

use App\Enums\VatOption;
use App\Enums\VatTreatment;
use App\Invoicing\InvoiceLineAmounts;
use App\Invoicing\InvoiceTotals;
use App\Invoicing\VatGroupTotal;

function invoiceLine(int $quantityHundredths, int $unitPriceCents, ?VatOption $vatOption = null): InvoiceLineAmounts
{
    return new InvoiceLineAmounts($quantityHundredths, $unitPriceCents, $vatOption);
}

/**
 * The groups as plain [option, base, VAT] rows. VatGroupTotal's constructor is private, so a test can't build the
 * expected objects to compare against.
 *
 * @return list<array{VatOption, int, int}>
 */
function vatGroupRows(InvoiceTotals $totals): array
{
    return array_map(
        static fn (VatGroupTotal $group): array => [$group->option, $group->baseCents, $group->vatCents],
        $totals->vatGroups,
    );
}

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

    it('should round a line total to the cent, half up', function (int $quantityHundredths, int $unitPriceCents, int $lineTotalCents): void {
        // Arrange
        $lines = [invoiceLine($quantityHundredths, $unitPriceCents, VatOption::High)];

        // Act
        $totals = InvoiceTotals::fromLines(VatTreatment::Domestic, $lines);

        // Assert
        expect($totals->subtotalCents)->toBe($lineTotalCents);
    })->with([
        '0.33 × €1.01 = 33.33 cents, down to 33' => [33, 101, 33],
        '0.50 × €0.01 = 0.5 cents, up to 1' => [50, 1, 1],
    ]);

    it('should give a mixed-rate invoice one group per rate, in High, Low order', function (): void {
        // Arrange
        // The Low line comes first, so the order of the groups can't just be the order of the lines.
        $lines = [invoiceLine(100, 5000, VatOption::Low), invoiceLine(100, 10000, VatOption::High)];

        // Act
        $totals = InvoiceTotals::fromLines(VatTreatment::Domestic, $lines);

        // Assert
        expect(vatGroupRows($totals))->toBe([[VatOption::High, 10000, 2100], [VatOption::Low, 5000, 450]])
            ->and($totals->subtotalCents)->toBe(15000)
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

    it('should give a ReverseCharge or OutsideScope invoice no VAT groups, so the total is the subtotal', function (VatTreatment $treatment): void {
        // Arrange
        $lines = [invoiceLine(200, 10000), invoiceLine(150, 3000)];

        // Act
        $totals = InvoiceTotals::fromLines($treatment, $lines);

        // Assert
        expect($totals->vatGroups)->toBe([])
            ->and($totals->subtotalCents)->toBe(24500)
            ->and($totals->totalCents)->toBe(24500);
    })->with([
        'ReverseCharge' => [VatTreatment::ReverseCharge],
        'OutsideScope' => [VatTreatment::OutsideScope],
    ]);
});
