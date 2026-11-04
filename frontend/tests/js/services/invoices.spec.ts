import type { AxiosResponse } from 'axios';
import { beforeEach, describe, it, expect, expectTypeOf, vi } from 'vitest';

import { deleteRequest, getRequest, postRequest, putRequest, UnexpectedResponseError } from '@/services/http';
import {
    createInvoice,
    deleteInvoice,
    fetchInvoice,
    InvoiceNotFoundError,
    InvoiceVersionConflictError,
    isInvoice,
    isInvoiceListItem,
    isInvoiceSummary,
    listInvoices,
    updateInvoice,
    type Invoice,
    type InvoicePayload,
    type VatTreatment,
} from '@/services/invoices';

import { axiosErrorWith } from '../utility/axiosErrorWith';

// Only the request functions become vi.fn()s, so no request leaves the test.
// checkResponse, versionFrom and UnexpectedResponseError stay real: they are
// what the service tests are about.
vi.mock('@/services/http', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/services/http')>(),
    getRequest: vi.fn<typeof getRequest>(),
    postRequest: vi.fn<typeof postRequest>(),
    putRequest: vi.fn<typeof putRequest>(),
    deleteRequest: vi.fn<typeof deleteRequest>(),
}));

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

    it('should keep every field the form sends in the invoice the backend sends back', () =>
    {
        // Assert: an Invoice is assignable to an InvoicePayload only if it has
        // every payload field, its lines included, with the same type. The
        // two share their field lists today; this fails if someone gives the
        // payload a field of its own. Each treatment matches its own member,
        // because `vat_treatment` is a literal on both sides.
        expectTypeOf<Invoice>().toExtend<InvoicePayload>();
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

    // The same for the keys inside the totals and inside a VAT group, which
    // the walk over the top-level keys never reaches.
    it.each(Object.keys(domesticInvoice.totals))('should reject an invoice whose totals have no %s', (key) =>
    {
        // Act + Assert
        expect(isInvoice({ ...domesticInvoice, totals: without(domesticInvoice.totals, key) })).toBe(false);
    });

    it.each(Object.keys(domesticInvoice.totals.vat_groups[0] ?? {}))('should reject an invoice with a VAT group without %s', (key) =>
    {
        // Act + Assert
        expect(isInvoice(withTotals(domesticInvoice, { vat_groups: domesticInvoice.totals.vat_groups.map((group) => without(group, key)) }))).toBe(false);
    });

    it.each(Object.keys(domesticInvoice.lines[0] ?? {}))('should reject an invoice with a line without %s', (key) =>
    {
        // Act + Assert
        expect(isInvoice({ ...domesticInvoice, lines: domesticInvoice.lines.map((line) => without(line, key)) })).toBe(false);
    });

    it.each([
        ['a string id', { ...domesticInvoice, id: '7' }],
        ['a status it doesn\'t know', { ...domesticInvoice, status: 'sent' }],
        ['a number that is not a string', { ...domesticInvoice, number: 42 }],
        ['a fractional payment term', { ...domesticInvoice, payment_term_days: 14.5 }],
        ['lines that are not an array', { ...domesticInvoice, lines: {} }],
        ['a fractional quantity', withLine(domesticInvoice, { quantity_hundredths: 7.5 })], // hundredths are already the fraction
        ['a vat_option it doesn\'t know', withLine(domesticInvoice, { vat_option: 'standard' })],
        ['fractional VAT on a domestic invoice', withTotals(domesticInvoice, { vat_cents: 2048.5 })],
        ['a VAT group with a string rate', withTotals(domesticInvoice, { vat_groups: [{ vat_option: 'high', rate_percent: '21', base_cents: 9750, vat_cents: 2048 }] })],
    ])('should reject an invoice with %s', (_case, invoice) =>
    {
        // Act + Assert
        expect(isInvoice(invoice)).toBe(false);
    });

    // Every amount the editor formats. formatCents and formatHundredths throw
    // on a negative or unsafe value, so the guard refuses those before they
    // reach the page.
    it.for([
        { place: 'a line\'s quantity_hundredths', invoice: withLine(domesticInvoice, { quantity_hundredths: -1 }) },
        { place: 'a line\'s unit_price_cents', invoice: withLine(domesticInvoice, { unit_price_cents: Number.MAX_SAFE_INTEGER + 1 }) },
        { place: 'a line\'s total_cents', invoice: withLine(domesticInvoice, { total_cents: -1 }) },
        { place: 'subtotal_cents', invoice: withTotals(domesticInvoice, { subtotal_cents: -1 }) },
        { place: 'vat_cents', invoice: withTotals(domesticInvoice, { vat_cents: -1 }) },
        { place: 'total_cents', invoice: withTotals(domesticInvoice, { total_cents: Number.MAX_SAFE_INTEGER + 1 }) },
        { place: 'a VAT group\'s base_cents', invoice: withTotals(domesticInvoice, { vat_groups: [{ vat_option: 'high', rate_percent: 21, base_cents: -1, vat_cents: 0 }] }) },
        { place: 'a VAT group\'s vat_cents', invoice: withTotals(domesticInvoice, { vat_groups: [{ vat_option: 'high', rate_percent: 21, base_cents: 0, vat_cents: -1 }] }) },
    ])('should reject an invoice with a negative or unsafe amount in $place', ({ invoice }) =>
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
        ['a VAT group on an outside_scope invoice', withTotals({ ...reverseChargeInvoice, vat_treatment: 'outside_scope' }, { vat_groups: domesticInvoice.totals.vat_groups })],
        ['VAT charged on an outside_scope invoice', withTotals({ ...reverseChargeInvoice, vat_treatment: 'outside_scope' }, { vat_cents: 21 })],
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

describe('isInvoiceListItem', () =>
{
    // What the list sends: the invoice without its lines and totals, plus the
    // total on its own.
    const { lines: _lines, totals, ...summary } = domesticInvoice;
    const listItem = { ...summary, total_cents: totals.total_cents };

    it('should accept a summary with its total in whole cents', () =>
    {
        // Act + Assert
        expect(isInvoiceListItem(listItem)).toBe(true);
    });

    it('should accept a total of zero, a draft without lines', () =>
    {
        // Act + Assert
        expect(isInvoiceListItem({ ...listItem, total_cents: 0 })).toBe(true);
    });

    it.each([
        ['without total_cents', summary],
        ['with a fraction of a cent', { ...listItem, total_cents: 12.5 }],
        ['with total_cents as a string', { ...listItem, total_cents: '1250' }],
        ['with a negative total', { ...listItem, total_cents: -1 }],
        ['with a total past the safe integers', { ...listItem, total_cents: Number.MAX_SAFE_INTEGER + 1 }],
        ['whose summary is malformed', without(listItem, 'vat_treatment')],
    ])('should reject a list item %s', (_case, item) =>
    {
        // Act + Assert
        expect(isInvoiceListItem(item)).toBe(false);
    });
});

// A successful response as axios hands it over: the body, and the version as
// a quoted ETag under its lowercased name. Through `unknown`: with only the
// two fields the service reads, TypeScript calls the cast a likely mistake.
const respondWith = (data: unknown, version: number) =>
    ({ data, headers: { etag: `"${version}"` } }) as unknown as AxiosResponse;

// What the form sends for the domestic fixture: its fields without the ones
// the backend adds (id, status, number, line totals, totals).
const domesticPayload: InvoicePayload = {
    vat_treatment: 'domestic',
    client_id: 3,
    bank_account_id: 5,
    payment_term_days: 14,
    lines: [
        { description: 'Fietsreparatie', quantity_hundredths: 150, unit_price_cents: 6500, vat_option: 'high' },
        { description: 'Fietsles', quantity_hundredths: 100, unit_price_cents: 4000, vat_option: 'exempt' },
    ],
};

describe('invoices service', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    describe('listInvoices', () =>
    {
        const { lines: _lines, totals, ...summary } = domesticInvoice;
        const listItem = { ...summary, total_cents: totals.total_cents };

        it('should get the business\'s invoices and return them with their totals', async () =>
        {
            // Arrange
            vi.mocked(getRequest).mockResolvedValue({ data: [listItem] } as AxiosResponse);

            // Act
            const invoices = await listInvoices(1);

            // Assert
            expect(getRequest).toHaveBeenCalledWith('/businesses/1/invoices');
            expect(invoices).toEqual([listItem]);
        });

        it.each([
            ['without its treatment', { ...listItem, vat_treatment: undefined }],
            ['without its total', summary],
        ])('should throw an UnexpectedResponseError when one item is malformed: %s', async (_case, malformed) =>
        {
            // Arrange: one good item next to the malformed one, so the whole
            // array is checked, not only its first item
            vi.mocked(getRequest).mockResolvedValue({ data: [listItem, malformed] } as AxiosResponse);

            // Act + Assert
            await expect(listInvoices(1)).rejects.toThrow(UnexpectedResponseError);
        });
    });

    // Every function that returns a versioned invoice runs both checks: the
    // body against isInvoice, and the ETag through versionFrom.
    describe.each([
        ['fetchInvoice', getRequest, () => fetchInvoice(1, 7)],
        ['createInvoice', postRequest, () => createInvoice(1, domesticPayload)],
        ['updateInvoice', putRequest, () => updateInvoice(1, 7, domesticPayload, 3)],
    ] as const)('%s', (_name, request, call) =>
    {
        it('should throw an UnexpectedResponseError when the response has no ETag', async () =>
        {
            // Arrange: a valid body, so only the missing version can fail it
            vi.mocked(request).mockResolvedValue({ data: domesticInvoice, headers: {} } as AxiosResponse);

            // Act + Assert
            await expect(call()).rejects.toThrow(UnexpectedResponseError);
        });

        it('should throw an UnexpectedResponseError when the body is malformed', async () =>
        {
            // Arrange: a valid ETag, so only the body can fail it
            vi.mocked(request).mockResolvedValue(respondWith({ ...domesticInvoice, totals: undefined }, 3));

            // Act + Assert
            await expect(call()).rejects.toThrow(UnexpectedResponseError);
        });
    });

    describe('fetchInvoice', () =>
    {
        it('should get the invoice and return it with the version its ETag names', async () =>
        {
            // Arrange
            vi.mocked(getRequest).mockResolvedValue(respondWith(domesticInvoice, 3));

            // Act
            const result = await fetchInvoice(1, 7);

            // Assert
            expect(getRequest).toHaveBeenCalledWith('/businesses/1/invoices/7');
            expect(result).toEqual({ invoice: domesticInvoice, version: 3 });
        });

        it('should throw an InvoiceNotFoundError carrying the 404 (not found) when the invoice isn\'t the business\'s', async () =>
        {
            // Arrange
            const error = axiosErrorWith(404, { message: 'Not Found' });
            vi.mocked(getRequest).mockRejectedValue(error);

            // Act
            const thrown: unknown = await fetchInvoice(1, 7).catch((rejection: unknown) => rejection);

            // Assert
            expect(thrown).toBeInstanceOf(InvoiceNotFoundError);
            expect(thrown).toMatchObject({ cause: error });
        });

        it('should rethrow a 500 (server error) unchanged', async () =>
        {
            // Arrange
            const error = axiosErrorWith(500, { message: 'Server Error' });
            vi.mocked(getRequest).mockRejectedValue(error);

            // Act + Assert
            await expect(fetchInvoice(1, 7)).rejects.toBe(error);
        });
    });

    describe('createInvoice', () =>
    {
        it('should post the payload and return the draft with its first version', async () =>
        {
            // Arrange
            vi.mocked(postRequest).mockResolvedValue(respondWith(domesticInvoice, 1));

            // Act
            const result = await createInvoice(1, domesticPayload);

            // Assert
            expect(postRequest).toHaveBeenCalledWith('/businesses/1/invoices', domesticPayload);
            expect(result).toEqual({ invoice: domesticInvoice, version: 1 });
        });
    });

    describe('updateInvoice', () =>
    {
        it('should put the payload with the version it last saw and return the next version', async () =>
        {
            // Arrange
            vi.mocked(putRequest).mockResolvedValue(respondWith(domesticInvoice, 4));

            // Act
            const result = await updateInvoice(1, 7, domesticPayload, 3);

            // Assert: version 3 goes out as If-Match, version 4 comes back
            expect(putRequest).toHaveBeenCalledWith('/businesses/1/invoices/7', domesticPayload, 3);
            expect(result).toEqual({ invoice: domesticInvoice, version: 4 });
        });

        it('should throw an InvoiceVersionConflictError carrying the 412 (precondition failed) when the draft was saved elsewhere', async () =>
        {
            // Arrange
            const error = axiosErrorWith(412, { message: 'Precondition Failed' });
            vi.mocked(putRequest).mockRejectedValue(error);

            // Act
            const thrown: unknown = await updateInvoice(1, 7, domesticPayload, 3).catch((rejection: unknown) => rejection);

            // Assert
            expect(thrown).toBeInstanceOf(InvoiceVersionConflictError);
            expect(thrown).toMatchObject({ cause: error });
        });

        it('should throw an InvoiceNotFoundError carrying the 404 (not found) when the draft was deleted elsewhere', async () =>
        {
            // Arrange: another tab deleted it after this one loaded it
            const error = axiosErrorWith(404, { message: 'Not Found' });
            vi.mocked(putRequest).mockRejectedValue(error);

            // Act
            const thrown: unknown = await updateInvoice(1, 7, domesticPayload, 3).catch((rejection: unknown) => rejection);

            // Assert
            expect(thrown).toBeInstanceOf(InvoiceNotFoundError);
            expect(thrown).toMatchObject({ cause: error });
        });

        it('should rethrow a 428 (precondition required) unchanged, because a missing If-Match is a bug, not a conflict', async () =>
        {
            // Arrange
            const error = axiosErrorWith(428, { message: 'Precondition Required' });
            vi.mocked(putRequest).mockRejectedValue(error);

            // Act + Assert
            await expect(updateInvoice(1, 7, domesticPayload, 3)).rejects.toBe(error);
        });
    });

    describe('deleteInvoice', () =>
    {
        it('should delete the invoice with the version it last saw', async () =>
        {
            // Arrange: a 204 (no content) has no body
            vi.mocked(deleteRequest).mockResolvedValue({ data: '' } as AxiosResponse);

            // Act
            const result = await deleteInvoice(1, 7, 3);

            // Assert
            expect(deleteRequest).toHaveBeenCalledWith('/businesses/1/invoices/7', 3);
            expect(result).toBeUndefined();
        });

        it('should throw an InvoiceVersionConflictError carrying the 412 (precondition failed) when the draft was saved elsewhere', async () =>
        {
            // Arrange
            const error = axiosErrorWith(412, { message: 'Precondition Failed' });
            vi.mocked(deleteRequest).mockRejectedValue(error);

            // Act
            const thrown: unknown = await deleteInvoice(1, 7, 3).catch((rejection: unknown) => rejection);

            // Assert
            expect(thrown).toBeInstanceOf(InvoiceVersionConflictError);
            expect(thrown).toMatchObject({ cause: error });
        });

        it('should throw an InvoiceNotFoundError carrying the 404 (not found) when the draft was already deleted', async () =>
        {
            // Arrange: a second click on Delete, or another tab, got there first
            const error = axiosErrorWith(404, { message: 'Not Found' });
            vi.mocked(deleteRequest).mockRejectedValue(error);

            // Act
            const thrown: unknown = await deleteInvoice(1, 7, 3).catch((rejection: unknown) => rejection);

            // Assert
            expect(thrown).toBeInstanceOf(InvoiceNotFoundError);
            expect(thrown).toMatchObject({ cause: error });
        });
    });
});
