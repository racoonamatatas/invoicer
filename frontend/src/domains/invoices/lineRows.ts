// Project imports
import { formatCentsForInput, formatHundredths, parseCents, parseHundredths, type Cents, type Hundredths, type ParseResult } from '@/form/amounts';
import type { InvoiceFieldsPayload, InvoiceLine, InvoicePayload, VatOption } from '@/services/invoices';

// One line as the editor holds it. Quantity and price are text, because an
// input holds text; they become integers only when the payload is built.
// `vat_option` is null until picked, and always null off a domestic invoice.
export interface LineRow
{
    key: number; // the frontend's own, for v-for: a draft's lines have no id, and it is never sent
    description: string;
    quantity: string;
    unit_price: string;
    vat_option: VatOption | null;
}

// InvoiceRequest::MAX_LINES, pinned to it by a test that reads the PHP file.
// Add line stops there, so the backend's limit is only reached by a bug,
// which then shows in the form's general message.
export const MAX_LINES = 100;

// InvoiceRequest's other limits, pinned the same way. Checked here, so a too
// large amount gets the editor's own message next to its input instead of
// the backend's, which names the field by its key (`lines.0.unit_price_cents`).
export const MAX_QUANTITY_HUNDREDTHS = 10_000_000; // 100 000 units
export const MAX_UNIT_PRICE_CENTS = 100_000_000; // € 1 000 000
export const MAX_DESCRIPTION_LENGTH = 255; // the description input's maxlength

// The parser's result, with an amount over `max` refused as too_large, the
// reason the parser gives a number past the safe integers too: both are
// fixed by typing a smaller number.
const atMost = <T extends number>(parsed: ParseResult<T>, max: number): ParseResult<T> =>
{
    return parsed.ok && parsed.value > max ? { ok: false, reason: 'too_large' } : parsed;
};

export const parseLineQuantity = (input: string): ParseResult<Hundredths> => atMost(parseHundredths(input), MAX_QUANTITY_HUNDREDTHS);

export const parseLineUnitPrice = (input: string): ParseResult<Cents> => atMost(parseCents(input), MAX_UNIT_PRICE_CENTS);

// Shared by every editor on the page. A key only has to be unique within
// one list, and counting up across all of them gives that for free.
let lastKey = 0;

const nextKey = (): number =>
{
    lastKey += 1;

    return lastKey;
};

export const emptyRow = (): LineRow => ({ key: nextKey(), description: '', quantity: '', unit_price: '', vat_option: null });

// Rows from what the backend stored, written the way it would be typed, so
// what's on screen is what was saved: a quantity typed `7,50` comes back as
// `7,5`, a price typed `80` as `80,00`.
//
// `keys` are the keys of the rows a save just sent. The backend keeps the
// order it was sent, so stored line 3 is sent row 3, and keeping its key
// lets Vue keep its inputs, and the focus in them. Only when the counts
// match; otherwise, and on a load, every row gets a new key.
export const rowsFrom = (lines: readonly InvoiceLine[], keys: readonly number[] = []): LineRow[] => lines.map((line, index) => ({
    key: (keys.length === lines.length ? keys[index] : undefined) ?? nextKey(),
    description: line.description,
    // The guard proved them integers; the brand says which unit they are in.
    quantity: formatHundredths(line.quantity_hundredths as Hundredths),
    unit_price: formatCentsForInput(line.unit_price_cents as Cents),
    vat_option: line.vat_option,
}));

// What a row holds, for telling whether it changed: the numbers where they
// parse, so `7,50` and `7,5` are the same line, and the text where they
// don't. Without the key, which says nothing about the line.
export const rowContent = (row: LineRow): unknown[] =>
{
    const quantity = parseHundredths(row.quantity);
    const unitPrice = parseCents(row.unit_price);

    return [
        row.description,
        quantity.ok ? quantity.value : row.quantity,
        unitPrice.ok ? unitPrice.value : row.unit_price,
        row.vat_option,
    ];
};

// A row's numbers, or null while either can't be read. The form shows why
// next to the field; this only decides whether the row can be sent.
const amountsOf = (row: LineRow): { quantity_hundredths: number; unit_price_cents: number } | null =>
{
    const quantity = parseLineQuantity(row.quantity);
    const unitPrice = parseLineUnitPrice(row.unit_price);

    return quantity.ok && unitPrice.ok ? { quantity_hundredths: quantity.value, unit_price_cents: unitPrice.value } : null;
};

// Every item, or null if any is missing: one unreadable row blocks the whole
// save, because a save replaces every line and a skipped row would be lost.
const allOrNone = <T>(items: readonly (T | null)[]): T[] | null =>
{
    const present = items.filter((item): item is T => item !== null);

    return present.length === items.length ? present : null;
};

// The payload for a save: the invoice's own fields and every row as a line.
// null while a row's quantity or price can't be read, or a domestic row has
// no VAT option yet. Narrowed on the treatment, so each branch's lines are
// typed for it and the result type-checks without a cast.
export const payloadWithRows = (fields: InvoiceFieldsPayload, rows: readonly LineRow[]): InvoicePayload | null =>
{
    if (fields.vat_treatment === 'domestic')
    {
        const lines = allOrNone(rows.map((row) =>
        {
            const amounts = amountsOf(row);

            return amounts === null || row.vat_option === null
                ? null
                : { description: row.description, ...amounts, vat_option: row.vat_option };
        }));

        return lines === null ? null : { ...fields, lines };
    }

    // null, whatever the row holds: the server refuses an option here. The
    // form clears them on a switch, so this is the second line of defence.
    const lines = allOrNone(rows.map((row) =>
    {
        const amounts = amountsOf(row);

        return amounts === null ? null : { description: row.description, ...amounts, vat_option: null };
    }));

    return lines === null ? null : { ...fields, lines };
};
