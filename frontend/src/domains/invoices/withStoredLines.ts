// Project imports
import type { Invoice, InvoiceFieldsPayload, InvoicePayload } from '@/services/invoices';

// Key by key, not a rest copy: isInvoice lets extra keys through, and the
// backend's total is computed, never sent. Generic over the VAT option, so a
// domestic line stays one with an option and the others stay null.
const linePayload = <Option>(line: { description: string; quantity_hundredths: number; unit_price_cents: number; vat_option: Option }) => ({
    description: line.description,
    quantity_hundredths: line.quantity_hundredths,
    unit_price_cents: line.unit_price_cents,
    vat_option: line.vat_option,
});

// The payload for saving a draft's own fields: a save replaces every line, so
// the stored ones go back unchanged. null when they can't: a domestic line
// needs a VAT option and the others must have none, so a draft with lines
// can't switch between the two until the lines editor can change each line
// too. Without lines, any switch is fine.
export const withStoredLines = (fields: InvoiceFieldsPayload, invoice: Invoice): InvoicePayload | null =>
{
    // Narrowed on both sides, so each branch's lines are typed for its
    // treatment and the payload type-checks without a cast.
    if (fields.vat_treatment === 'domestic' && invoice.vat_treatment === 'domestic')
    {
        return { ...fields, lines: invoice.lines.map(linePayload) };
    }

    if (fields.vat_treatment !== 'domestic' && invoice.vat_treatment !== 'domestic')
    {
        return { ...fields, lines: invoice.lines.map(linePayload) };
    }

    return invoice.lines.length === 0 ? { ...fields, lines: [] } : null;
};
