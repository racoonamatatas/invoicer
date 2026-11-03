import { describe, it, expect, expectTypeOf } from 'vitest';

import type { Invoice, InvoicePayload, VatTreatment } from '@/services/invoices';

// Type-level tests: vue-tsc checks this file, an `@ts-expect-error` with no
// error under it fails the build, and so does a failed expectTypeOf. The
// runtime assertions only give Vitest a test to run.
describe('invoice types', () =>
{
    // The fields every treatment shares. Unannotated, so they spread into
    // either member of the union without being widened to one.
    const invoiceFields = { client_id: 3, bank_account_id: 5, payment_term_days: null };
    const lineFields = { description: 'Fietsreparatie', quantity_hundredths: 750, unit_price_cents: 6500 };

    it('should require a vat_option on every line of a domestic payload', () =>
    {
        // Act
        const payload: InvoicePayload = { ...invoiceFields, vat_treatment: 'domestic', lines: [{ ...lineFields, vat_option: 'high' }] };
        // @ts-expect-error a domestic invoice charges VAT, so every line names its option
        const withoutOption: InvoicePayload = { ...invoiceFields, vat_treatment: 'domestic', lines: [{ ...lineFields, vat_option: null }] };

        // Assert
        expect(payload.lines).toHaveLength(1);
        expect(withoutOption.lines).toHaveLength(1);
    });

    // Both no-VAT treatments share one set of rules, so each is checked: a
    // treatment that fell out of that set would accept any vat_option.
    it.each(['reverse_charge', 'outside_scope'] as const)('should refuse a vat_option on a line of a %s payload', (treatment) =>
    {
        // Act
        const payload: InvoicePayload = { ...invoiceFields, vat_treatment: treatment, lines: [{ ...lineFields, vat_option: null }] };
        // @ts-expect-error this invoice charges no VAT, so its lines carry no option
        const withOption: InvoicePayload = { ...invoiceFields, vat_treatment: treatment, lines: [{ ...lineFields, vat_option: 'high' }] };

        // Assert
        expect(payload.vat_treatment).toBe(treatment);
        expect(withOption.vat_treatment).toBe(treatment);
    });

    it('should give every treatment in VAT_TREATMENTS a set of VAT rules', () =>
    {
        // Assert: the rules list their treatments by hand, so a treatment
        // added to VAT_TREATMENTS and to neither set would be missing here
        expectTypeOf<InvoicePayload['vat_treatment']>().toEqualTypeOf<VatTreatment>();
    });

    it('should narrow the totals to no VAT groups and zero VAT when an invoice is not domestic', () =>
    {
        // Arrange: only the type matters, so a function that is never called
        const totalsOf = (invoice: Invoice) =>
        {
            // Act
            if (invoice.vat_treatment !== 'domestic')
            {
                // Assert: the literal types, not number[] and number
                expectTypeOf(invoice.totals.vat_groups).toEqualTypeOf<[]>();
                expectTypeOf(invoice.totals.vat_cents).toEqualTypeOf<0>();
            }

            return invoice.totals;
        };

        // Assert
        expect(totalsOf).toBeTypeOf('function');
    });
});
