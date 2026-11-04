// @vitest-environment node
// No DOM here, and the drift test reads a file: jsdom's import.meta.url is
// not a file:// URL, so fileURLToPath would throw.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import {
    MAX_DESCRIPTION_LENGTH,
    MAX_LINES,
    MAX_QUANTITY_HUNDREDTHS,
    MAX_UNIT_PRICE_CENTS,
    emptyRow,
    parseLineQuantity,
    parseLineUnitPrice,
    payloadWithRows,
    rowContent,
    rowsFrom,
    type LineRow,
} from '@/domains/invoices/lineRows';

import { domesticDraftWithLine } from '../../utility/invoices';

const INVOICE_REQUEST = fileURLToPath(new URL('../../../../../backend/app/Http/Requests/InvoiceRequest.php', import.meta.url));

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

    it('should keep the keys it is given when there is one for every line', () =>
    {
        // Act: the keys of the rows a save just sent
        const rows = rowsFrom(domesticDraftWithLine(11, 3, 5).lines, [42]);

        // Assert: the same key, so Vue keeps the row's inputs and their focus
        expect(rows.map((row) => row.key)).toStrictEqual([42]);
    });

    it('should give new keys when the keys it is given don\'t match the lines one for one', () =>
    {
        // Act: two keys for one stored line. Negative, so the counter, which
        // only counts up from 1, can never hand one out by chance.
        const rows = rowsFrom(domesticDraftWithLine(11, 3, 5).lines, [-1, -2]);

        // Assert: neither, because which line a key belongs to is unknown
        expect(rows.map((row) => row.key)).not.toContain(-1);
        expect(rows.map((row) => row.key)).not.toContain(-2);
    });
});

// InvoiceRequest.php without its comments, as in the country code drift
// tests, so a commented-out old value doesn't count.
const invoiceRequestSource = (): string => readFileSync(INVOICE_REQUEST, 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/\/\/.*$/gm, '');

describe('the limits copied from InvoiceRequest', () =>
{
    it.for([
        { constant: 'MAX_LINES', frontend: MAX_LINES },
        { constant: 'MAX_QUANTITY_HUNDREDTHS', frontend: MAX_QUANTITY_HUNDREDTHS },
        { constant: 'MAX_UNIT_PRICE_CENTS', frontend: MAX_UNIT_PRICE_CENTS },
    ])('should hold the backend\'s $constant', ({ constant, frontend }) =>
    {
        // Act: PHP allows `_` between digits (10_000_000)
        const backend = new RegExp(`\\b${constant} = ([\\d_]+);`).exec(invoiceRequestSource())?.[1]?.replaceAll('_', '');

        // Assert: undefined when the constant was renamed or reformatted,
        // which fails too, instead of passing by finding nothing
        expect(backend).toBe(String(frontend));
    });

    it('should hold the backend\'s max: on lines.*.description as MAX_DESCRIPTION_LENGTH', () =>
    {
        // Act
        const backend = /'lines\.\*\.description' => \[[^\]]*'max:(\d+)'/.exec(invoiceRequestSource())?.[1];

        // Assert
        expect(backend).toBe(String(MAX_DESCRIPTION_LENGTH));
    });
});

describe('parseLineQuantity and parseLineUnitPrice', () =>
{
    it.for([
        { parse: parseLineQuantity, name: 'parseLineQuantity', atMax: '100000', overMax: '100000,01', max: 10_000_000 },
        { parse: parseLineUnitPrice, name: 'parseLineUnitPrice', atMax: '1000000', overMax: '1000000,01', max: 100_000_000 },
    ])('should accept $atMax and refuse $overMax as too_large in $name', ({ parse, atMax, overMax, max }) =>
    {
        // Act + Assert: the backend's limit is inclusive (between:0,max)
        expect(parse(atMax)).toStrictEqual({ ok: true, value: max });
        expect(parse(overMax)).toStrictEqual({ ok: false, reason: 'too_large' });
    });

    it('should keep the parser\'s own reason for input that isn\'t a number', () =>
    {
        // Act + Assert
        expect(parseLineUnitPrice('eighty')).toStrictEqual({ ok: false, reason: 'not_a_number' });
    });
});

describe('payloadWithRows at the limits', () =>
{
    it('should return null when a row\'s price is over MAX_UNIT_PRICE_CENTS', () =>
    {
        // Act
        const payload = payloadWithRows({ ...fields, vat_treatment: 'domestic' }, [typedRow({ unit_price: '1000000,01' })]);

        // Assert: the backend would refuse it with a 422
        expect(payload).toBeNull();
    });
});

describe('rowContent', () =>
{
    it('should be equal for two ways of typing the same amounts', () =>
    {
        // Act + Assert: 7,50 and 7,5 are the same quantity, 80 and 80,00 the same price
        expect(rowContent(typedRow({ quantity: '7,50', unit_price: '80' })))
            .toStrictEqual(rowContent(typedRow({ quantity: '7,5', unit_price: '80,00' })));
    });

    it('should keep text that doesn\'t parse, so two different typos are different', () =>
    {
        // Act + Assert
        expect(rowContent(typedRow({ quantity: 'seven' }))).not.toStrictEqual(rowContent(typedRow({ quantity: 'eight' })));
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

    // Both treatments without VAT take the same branch; each is listed, so
    // one moved to another branch fails here.
    it.for([
        { treatment: 'reverse_charge', held: 'high', why: 'even when a row still holds one' },
        { treatment: 'outside_scope', held: 'high', why: 'even when a row still holds one' },
        { treatment: 'reverse_charge', held: null, why: 'for a row that has none' },
        { treatment: 'outside_scope', held: null, why: 'for a row that has none' },
    ] as const)('should send null as the VAT option on a $treatment invoice, $why', ({ treatment, held }) =>
    {
        // Act: the form clears options on a switch; this checks the payload doesn't rely on it
        const payload = payloadWithRows({ ...fields, vat_treatment: treatment }, [typedRow({ vat_option: held })]);

        // Assert
        expect(payload).toStrictEqual({
            ...fields,
            vat_treatment: treatment,
            lines: [{ description: 'Website redesign', quantity_hundredths: 750, unit_price_cents: 8000, vat_option: null }],
        });
    });
});
