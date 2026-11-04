import { describe, it, expect } from 'vitest';

import { emptyRow, payloadWithRows, rowsFrom, type LineRow } from '@/domains/invoices/lineRows';

import { domesticDraftWithLine } from '../../utility/invoices';

const fields = { client_id: 3, bank_account_id: 5, payment_term_days: null } as const;

// A row as the user typed it: Dutch decimals, a VAT option picked.
const typedRow = (overrides: Partial<LineRow> = {}): LineRow => ({
    ...emptyRow(),
    description: 'Website redesign',
    quantity: '7,50',
    unit_price: '80,00',
    vat_option: 'high',
    ...overrides,
});

describe('rowsFrom', () =>
{
    it('should show a stored line\'s numbers the way they would be typed', () =>
    {
        // Act: the stored line is 750 hundredths at 8000 cents
        const [row] = rowsFrom(domesticDraftWithLine(11, 3, 5).lines);

        // Assert: the quantity drops its trailing zero, the price keeps two decimals
        expect(row).toStrictEqual({
            key: expect.any(Number),
            description: 'Website redesign',
            quantity: '7,5',
            unit_price: '80,00',
            vat_option: 'high',
        });
    });

    it('should give every row a key of its own, also across calls', () =>
    {
        // Arrange
        const { lines } = domesticDraftWithLine(11, 3, 5);

        // Act: the same stored line, loaded twice, and a new row
        const keys = [...rowsFrom(lines), ...rowsFrom(lines), emptyRow()].map((row) => row.key);

        // Assert: Vue would reuse one row's inputs for another if two shared a key
        expect(new Set(keys).size).toBe(3);
    });
});

describe('payloadWithRows', () =>
{
    it('should send a typed "7,50" as 750 hundredths and "80,00" as 8000 cents on a domestic invoice', () =>
    {
        // Act
        const payload = payloadWithRows({ ...fields, vat_treatment: 'domestic' }, [typedRow()]);

        // Assert: the key stays in the browser
        expect(payload).toStrictEqual({
            ...fields,
            vat_treatment: 'domestic',
            lines: [{ description: 'Website redesign', quantity_hundredths: 750, unit_price_cents: 8000, vat_option: 'high' }],
        });
    });

    it('should send no lines when there are no rows', () =>
    {
        // Act
        const payload = payloadWithRows({ ...fields, vat_treatment: 'domestic' }, []);

        // Assert: a draft may be empty, so this is a payload, not null
        expect(payload).toStrictEqual({ ...fields, vat_treatment: 'domestic', lines: [] });
    });

    it.for([
        { field: 'quantity', input: 'seven' },
        { field: 'quantity', input: '' },
        { field: 'unit_price', input: '80,005' },
        { field: 'unit_price', input: '-80' },
    ] as const)('should return null when the second row\'s $field is $input', ({ field, input }) =>
    {
        // Act: the first row is fine, so one bad row is enough to block
        const payload = payloadWithRows({ ...fields, vat_treatment: 'domestic' }, [typedRow(), typedRow({ [field]: input })]);

        // Assert: a save replaces every line, so sending the rest would lose this one
        expect(payload).toBeNull();
    });

    it('should return null when a row on a domestic invoice has no VAT option yet', () =>
    {
        // Act
        const payload = payloadWithRows({ ...fields, vat_treatment: 'domestic' }, [typedRow({ vat_option: null })]);

        // Assert
        expect(payload).toBeNull();
    });

    it('should send null as the VAT option on a reverse-charge invoice, even when a row still holds one', () =>
    {
        // Act: the form clears options on a switch; this checks the payload doesn't rely on it
        const payload = payloadWithRows({ ...fields, vat_treatment: 'reverse_charge' }, [typedRow({ vat_option: 'high' })]);

        // Assert
        expect(payload).toStrictEqual({
            ...fields,
            vat_treatment: 'reverse_charge',
            lines: [{ description: 'Website redesign', quantity_hundredths: 750, unit_price_cents: 8000, vat_option: null }],
        });
    });

    it('should send a reverse-charge row without a VAT option', () =>
    {
        // Act
        const payload = payloadWithRows({ ...fields, vat_treatment: 'reverse_charge' }, [typedRow({ vat_option: null })]);

        // Assert: only domestic rows need one
        expect(payload?.lines).toHaveLength(1);
    });
});
