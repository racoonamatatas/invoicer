// Project imports
import { formatCentsForInput, formatHundredths, parseCents, parseHundredths, type Cents, type Hundredths } from '@/form/amounts';
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
// what's on screen is what was saved: `7,50` comes back as `7,5`. Each row
// gets a new key, so nothing typed before can stay tied to a stored line.
export const rowsFrom = (lines: readonly InvoiceLine[]): LineRow[] => lines.map((line) => ({
    key: nextKey(),
    description: line.description,
    // The guard proved them integers; the brand says which unit they are in.
    quantity: formatHundredths(line.quantity_hundredths as Hundredths),
    unit_price: formatCentsForInput(line.unit_price_cents as Cents),
    vat_option: line.vat_option,
}));

// A row's numbers, or null while either can't be read. The form shows why
// next to the field; this only decides whether the row can be sent.
const amountsOf = (row: LineRow): { quantity_hundredths: number; unit_price_cents: number } | null =>
{
    const quantity = parseHundredths(row.quantity);
    const unitPrice = parseCents(row.unit_price);

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
