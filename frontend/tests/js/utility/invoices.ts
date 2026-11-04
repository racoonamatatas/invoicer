import type { Invoice, InvoiceListItem, VersionedInvoice } from '@/services/invoices';

// A domestic draft as the invoices list sends it. No number: a draft has none.
export const draftListItem = (id: number, clientId: number, totalCents: number): InvoiceListItem => ({
    id,
    status: 'draft',
    vat_treatment: 'domestic',
    number: null,
    client_id: clientId,
    bank_account_id: 5,
    payment_term_days: null,
    total_cents: totalCents,
});

// A new domestic draft with no lines, as createInvoice resolves it: version 1,
// the first one a POST stores.
export const newDraft = (id: number, clientId: number, bankAccountId: number): VersionedInvoice => ({
    invoice: {
        id,
        status: 'draft',
        vat_treatment: 'domestic',
        number: null,
        client_id: clientId,
        bank_account_id: bankAccountId,
        payment_term_days: null,
        lines: [],
        totals: { subtotal_cents: 0, vat_groups: [], vat_cents: 0, total_cents: 0 },
    },
    version: 1,
});

// A domestic draft with one line: 7.5 hours at € 80,00, at 21% VAT.
export const domesticDraftWithLine = (id: number, clientId: number, bankAccountId: number): Invoice => ({
    id,
    status: 'draft',
    vat_treatment: 'domestic',
    number: null,
    client_id: clientId,
    bank_account_id: bankAccountId,
    payment_term_days: 14,
    lines: [{ description: 'Website redesign', quantity_hundredths: 750, unit_price_cents: 8000, vat_option: 'high', total_cents: 60000 }],
    totals: {
        subtotal_cents: 60000,
        vat_groups: [{ vat_option: 'high', rate_percent: 21, base_cents: 60000, vat_cents: 12600 }],
        vat_cents: 12600,
        total_cents: 72600,
    },
});

// A reverse-charge draft with one line: no VAT option, no VAT.
export const reverseChargeDraftWithLine = (id: number, clientId: number, bankAccountId: number): Invoice => ({
    id,
    status: 'draft',
    vat_treatment: 'reverse_charge',
    number: null,
    client_id: clientId,
    bank_account_id: bankAccountId,
    payment_term_days: null,
    lines: [{ description: 'Website redesign', quantity_hundredths: 750, unit_price_cents: 8000, vat_option: null, total_cents: 60000 }],
    totals: { subtotal_cents: 60000, vat_groups: [], vat_cents: 0, total_cents: 60000 },
});
