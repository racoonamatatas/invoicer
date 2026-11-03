import { describe, it, expect, expectTypeOf } from 'vitest';

import { isInvoice, isInvoiceSummary, type Invoice, type InvoicePayload, type VatTreatment } from '@/services/invoices';

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

// A domestic draft as the backend sends it: one line at 21% and one exempt,
// so the totals hold a group with a rate and one without (rate_percent null).
const domesticInvoice: Invoice = {
    id: 7,
    status: 'draft',
    vat_treatment: 'domestic',
    number: null,
    client_id: 3,
    bank_account_id: 5,
    payment_term_days: 14,
    lines: [
        { description: 'Fietsreparatie', quantity_hundredths: 150, unit_price_cents: 6500, vat_option: 'high', total_cents: 9750 },
        { description: 'Fietsles', quantity_hundredths: 100, unit_price_cents: 4000, vat_option: 'exempt', total_cents: 4000 },
    ],
    totals: {
        subtotal_cents: 13750,
        vat_groups: [
            { vat_option: 'high', rate_percent: 21, base_cents: 9750, vat_cents: 2048 },
            { vat_option: 'exempt', rate_percent: null, base_cents: 4000, vat_cents: 0 },
        ],
        vat_cents: 2048,
        total_cents: 15798,
    },
};

// A reverse-charge draft: no option on its line, no groups and zero VAT.
const reverseChargeInvoice: Invoice = {
    id: 8,
    status: 'draft',
    vat_treatment: 'reverse_charge',
    number: null,
    client_id: 4,
    bank_account_id: 5,
    payment_term_days: null,
    lines: [
        { description: 'Webshop onderhoud', quantity_hundredths: 800, unit_price_cents: 7500, vat_option: null, total_cents: 60000 },
    ],
    totals: { subtotal_cents: 60000, vat_groups: [], vat_cents: 0, total_cents: 60000 },
};

// The guards see `unknown`, so the broken bodies below are plain objects:
// built from a fixture with one thing changed, they can't be wrong in some
// other way that makes the test pass for the wrong reason.
const withLine = (invoice: Invoice, change: Record<string, unknown>): unknown => ({
    ...invoice,
    lines: invoice.lines.map((line, index) => (index === 0 ? { ...line, ...change } : line)),
});

// The object without `key`: really absent, not present as undefined, which
// would test a wrong type instead of a missing key.
const without = (object: object, key: string): unknown =>
    Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));

const withTotals = (invoice: Invoice, change: Record<string, unknown>): unknown => ({
    ...invoice,
    totals: { ...invoice.totals, ...change },
});

describe('isInvoice', () =>
{
    it.each([
        ['domestic', domesticInvoice],
        ['reverse_charge', reverseChargeInvoice],
        // Same rules as reverse charge, so the same body with the treatment swapped
        ['outside_scope', { ...reverseChargeInvoice, vat_treatment: 'outside_scope' }],
    ])('should accept a valid %s draft', (_treatment, invoice) =>
    {
        // Act + Assert
        expect(isInvoice(invoice)).toBe(true);
    });

    // Every key of the fixture, so a key added to the type and the fixture but
    // not to the guard fails here without a list to keep up to date.
    it.each(Object.keys(domesticInvoice))('should reject an invoice without %s', (key) =>
    {
        // Act + Assert
        expect(isInvoice(without(domesticInvoice, key))).toBe(false);
    });

    it.each([
        ['a string id', { ...domesticInvoice, id: '7' }],
        ['a status it doesn\'t know', { ...domesticInvoice, status: 'sent' }],
        ['a number that is not a string', { ...domesticInvoice, number: 42 }],
        ['a fractional payment term', { ...domesticInvoice, payment_term_days: 14.5 }],
        ['lines that are not an array', { ...domesticInvoice, lines: {} }],
        ['a fractional quantity', withLine(domesticInvoice, { quantity_hundredths: 7.5 })], // hundredths are already the fraction
        ['a line without its total', { ...domesticInvoice, lines: domesticInvoice.lines.map((line) => without(line, 'total_cents')) }],
        ['a vat_option it doesn\'t know', withLine(domesticInvoice, { vat_option: 'standard' })],
        ['a VAT group with a string rate', withTotals(domesticInvoice, { vat_groups: [{ vat_option: 'high', rate_percent: '21', base_cents: 9750, vat_cents: 2048 }] })],
    ])('should reject an invoice with %s', (_case, invoice) =>
    {
        // Act + Assert
        expect(isInvoice(invoice)).toBe(false);
    });

    // The guard holds the type's promise: each row breaks exactly one
    // treatment rule, and only checking against the invoice's treatment
    // catches it, because each value is valid under the other treatment.
    it.each([
        ['a vat_option on a reverse_charge line', withLine(reverseChargeInvoice, { vat_option: 'high' })],
        ['a vat_option on an outside_scope line', withLine({ ...reverseChargeInvoice, vat_treatment: 'outside_scope' }, { vat_option: 'high' })],
        ['no vat_option on a domestic line', withLine(domesticInvoice, { vat_option: null })],
        ['a VAT group on a reverse_charge invoice', withTotals(reverseChargeInvoice, { vat_groups: domesticInvoice.totals.vat_groups })],
        ['VAT charged on a reverse_charge invoice', withTotals(reverseChargeInvoice, { vat_cents: 21 })],
    ])('should reject %s', (_case, invoice) =>
    {
        // Act + Assert
        expect(isInvoice(invoice)).toBe(false);
    });

    it('should accept a key it doesn\'t know, so a new backend field doesn\'t break the app', () =>
    {
        // Act + Assert
        expect(isInvoice({ ...domesticInvoice, issued_on: null })).toBe(true);
    });
});

describe('isInvoiceSummary', () =>
{
    // What the list sends: the invoice without its lines and totals.
    const { lines: _lines, totals: _totals, ...summary } = domesticInvoice;

    it('should accept an invoice without lines and totals, as the list sends it', () =>
    {
        // Act + Assert
        expect(isInvoiceSummary(summary)).toBe(true);
    });

    it.each(Object.keys(summary))('should reject a summary without %s', (key) =>
    {
        // Act + Assert
        expect(isInvoiceSummary(without(summary, key))).toBe(false);
    });
});
