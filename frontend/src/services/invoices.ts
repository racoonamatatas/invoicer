import type { Identified } from '@/services/entity';

// How VAT applies to a whole invoice. The strings are the backend's
// VatTreatment::apiName(), not its storage integers. A runtime array, not only
// a type, because the guards check incoming values against it; the type is
// derived from it, so the two can't disagree.
export const VAT_TREATMENTS = ['domestic', 'reverse_charge', 'outside_scope'] as const;

export type VatTreatment = (typeof VAT_TREATMENTS)[number];

// The VAT a line on a domestic invoice is charged at (VatOption::apiName()).
// The order is the backend's too, the order VAT groups appear in.
export const VAT_OPTIONS = ['high', 'low', 'zero', 'exempt'] as const;

export type VatOption = (typeof VAT_OPTIONS)[number];

// Where an invoice is in its life. Only drafts exist until sending arrives.
export const INVOICE_STATUSES = ['draft'] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// One VAT group in the totals: the lines at one option, added up, with VAT
// computed once on their base. `rate_percent` is sent rather than looked up
// here, so the rates stay Dutch law in one place, the backend. null for
// exempt, which has no rate; it isn't tied to `vat_option` in this type,
// because the frontend shows the rate and never decides it.
export interface VatGroup
{
    vat_option: VatOption;
    rate_percent: number | null;
    base_cents: number;
    vat_cents: number;
}

// The two ways a treatment shapes an invoice, written once so the treatment,
// its lines and its totals can't be mixed: every type below takes all four
// from the same member. Listed by hand, not with Exclude<>: a treatment added
// to VAT_TREATMENTS should fail the type tests until someone decides which
// rules it follows, as the backend's chargesVat() has no default arm.
interface ChargesVat
{
    vat_treatment: 'domestic';
    vat_option: VatOption;
    vat_groups: VatGroup[];
    vat_cents: number;
}

// No VAT on the invoice: the client accounts for it (reverse charge), or none
// applies (outside the EU). The backend sends no groups and zero VAT
// (InvoiceTotals::fromLines()), so the type says exactly that.
interface ChargesNoVat
{
    vat_treatment: 'reverse_charge' | 'outside_scope';
    vat_option: null;
    vat_groups: [];
    vat_cents: 0;
}

type VatRules = ChargesVat | ChargesNoVat;

// Each type below is conditional on a bare `Rules`, so given the whole
// `VatRules` union it is built once per member and the results are joined.
// The same trick as New<T>: `extends unknown` is always true.

// A line as the form sends it, under one set of rules. Money and quantities
// stay integers here (cents, hundredths): converting them is the form's job.
type LinePayloadUnder<Rules extends VatRules> = Rules extends unknown
    ? {
        description: string;
        quantity_hundredths: number;
        unit_price_cents: number;
        vat_option: Rules['vat_option'];
    }
    : never;

// The fields the form sends and the backend sends back alike. Written by
// hand, apart from the response types below, and so able to drift from them:
// known, and a decision still open.
type InvoiceFieldsUnder<Rules extends VatRules> = Rules extends unknown
    ? {
        vat_treatment: Rules['vat_treatment'];
        client_id: number;
        bank_account_id: number;
        payment_term_days: number | null; // null: the business's default term
    }
    : never;

type InvoicePayloadUnder<Rules extends VatRules> = Rules extends unknown
    ? InvoiceFieldsUnder<Rules> & { lines: LinePayloadUnder<Rules>[] }
    : never;

type InvoiceLineUnder<Rules extends VatRules> = Rules extends unknown
    ? LinePayloadUnder<Rules> & { total_cents: number }
    : never;

type InvoiceTotalsUnder<Rules extends VatRules> = Rules extends unknown
    ? {
        subtotal_cents: number;
        vat_groups: Rules['vat_groups'];
        vat_cents: Rules['vat_cents'];
        total_cents: number;
    }
    : never;

// What the create and edit forms send (InvoiceRequest). Keys match its rules,
// so they are also the keys of a 422's errors. The whole list of lines goes
// every time: a save replaces them all.
export type InvoicePayload = InvoicePayloadUnder<VatRules>;

// One line of what the form sends, under either set of rules. Only use it
// where the invoice's treatment isn't known; inside an `InvoicePayload` the
// lines already match the treatment.
export type InvoiceLinePayload = LinePayloadUnder<VatRules>;

type InvoiceSummaryUnder<Rules extends VatRules> = Rules extends unknown
    ? Identified & InvoiceFieldsUnder<Rules> & {
        status: InvoiceStatus;
        number: string | null; // null on a draft, which has no number yet
    }
    : never;

// Built on the summary, as the backend's InvoiceResourceData is, so whatever
// the list sends, a whole invoice sends too.
type InvoiceUnder<Rules extends VatRules> = Rules extends unknown
    ? InvoiceSummaryUnder<Rules> & {
        lines: InvoiceLineUnder<Rules>[];
        totals: InvoiceTotalsUnder<Rules>;
    }
    : never;

// An invoice as the invoices list sends it (InvoiceSummaryResourceData): no
// lines, no totals.
export type InvoiceSummary = InvoiceSummaryUnder<VatRules>;

// A line as the backend sends it, with its total computed by the backend so
// the editor shows the same rounding as the totals. No id: a draft's lines are
// recreated on every save.
export type InvoiceLine = InvoiceLineUnder<VatRules>;

// An invoice's totals in cents. The frontend shows these and never adds them
// up itself, so the rounding lives in one place, the backend.
export type InvoiceTotals = InvoiceTotalsUnder<VatRules>;

// A whole invoice (InvoiceResourceData): the summary, its lines and its
// totals, all under the same treatment's rules.
export type Invoice = InvoiceUnder<VatRules>;
