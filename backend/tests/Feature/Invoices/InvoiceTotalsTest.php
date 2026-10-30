<?php

declare(strict_types = 1);

use App\Enums\VatOption;
use App\Enums\VatTreatment;
use App\Models\Invoice;
use App\Models\InvoiceLine;

// The arithmetic is covered by tests/Unit/Invoicing. These prove the wiring: that totals() hands InvoiceTotals the
// invoice's own treatment and each stored line's amounts.
describe('Invoice::totals()', function (): void {

    it('should total a domestic draft from its stored lines, one VAT group per rate', function (): void {
        // Arrange
        // 1,5 × €100 at 21% and 2 × €25 at 9%: quantities other than 1, so a line that lost its quantity shows.
        $invoice = Invoice::factory()
            ->has(InvoiceLine::factory()->count(2)->sequence(
                ['position' => 1, 'quantity_hundredths' => 150, 'unit_price_cents' => 10000, 'vat_option' => VatOption::High],
                ['position' => 2, 'quantity_hundredths' => 200, 'unit_price_cents' => 2500, 'vat_option' => VatOption::Low],
            ), 'lines')
            ->create();

        // Act
        $totals = $invoice->totals();

        // Assert
        expect(vatGroupRows($totals))->toBe([[VatOption::High, 15000, 3150], [VatOption::Low, 5000, 450]])
            ->and($totals->subtotalCents)->toBe(20000)
            ->and($totals->vatCents)->toBe(3600)
            ->and($totals->totalCents)->toBe(23600);
    });

    it('should total a reverse-charge draft without VAT, using the invoice\'s own treatment', function (): void {
        // Arrange
        // Lines without a VAT option: if totals() passed Domestic instead of the invoice's treatment, InvoiceTotals
        // would refuse them.
        $invoice = Invoice::factory()
            ->state(['vat_treatment' => VatTreatment::ReverseCharge])
            ->has(InvoiceLine::factory()->state(['quantity_hundredths' => 300, 'unit_price_cents' => 8000, 'vat_option' => null]), 'lines')
            ->create();

        // Act
        $totals = $invoice->totals();

        // Assert
        expect(vatGroupRows($totals))->toBe([])
            ->and($totals->subtotalCents)->toBe(24000)
            ->and($totals->vatCents)->toBe(0)
            ->and($totals->totalCents)->toBe(24000);
    });

});
