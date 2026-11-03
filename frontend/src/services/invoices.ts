import { isAxiosError, type AxiosResponse } from 'axios';

import { isNullableString } from '@/services/address';
import type { Identified } from '@/services/entity';
import { checkResponse, deleteRequest, getRequest, postRequest, putRequest, versionFrom } from '@/services/http';

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

// The fields the form sends and the backend sends back alike. The response
// types below are built up from these and LinePayloadUnder, adding only what
// the backend computes, so a field the form sends can't be missing from what
// comes back. Up from the payload, not down from the entity as New<T> does:
// an invoice's response has more fields of its own (status, number, totals,
// each line's total) than a stripped id.
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

// `some` with ===, not includes(): includes() on an `as const` tuple only
// accepts its own literals, and `value` could be anything at this point.
const isVatTreatment = (value: unknown): value is VatTreatment =>
{
    return VAT_TREATMENTS.some((treatment) => treatment === value);
};

const isVatOption = (value: unknown): value is VatOption =>
{
    return VAT_OPTIONS.some((option) => option === value);
};

const isInvoiceStatus = (value: unknown): value is InvoiceStatus =>
{
    return INVOICE_STATUSES.some((status) => status === value);
};

// Number.isInteger rather than typeof: an amount in cents or a count of days
// is never 7.5, and a fraction would mean the backend changed units.
const isNullableInteger = (value: unknown): value is number | null =>
{
    return value === null || Number.isInteger(value);
};

const isVatGroup = (value: unknown): value is VatGroup =>
{
    return typeof value === 'object'
           && value !== null // typeof null is 'object'
           && 'vat_option' in value && isVatOption(value.vat_option)
           && 'rate_percent' in value && isNullableInteger(value.rate_percent)
           && 'base_cents' in value && Number.isInteger(value.base_cents)
           && 'vat_cents' in value && Number.isInteger(value.vat_cents);
};

// The treatment is passed in, not read from the line: a line doesn't carry
// it, and checking each line against its invoice's treatment is what makes a
// vat_option on a reverse-charge line fail here rather than pass as
// `VatOption | null`.
const isLineUnder = (treatment: VatTreatment, value: unknown): value is InvoiceLine =>
{
    return typeof value === 'object'
           && value !== null
           && 'description' in value && typeof value.description === 'string'
           && 'quantity_hundredths' in value && Number.isInteger(value.quantity_hundredths)
           && 'unit_price_cents' in value && Number.isInteger(value.unit_price_cents)
           && 'total_cents' in value && Number.isInteger(value.total_cents)
           && 'vat_option' in value
           && (treatment === 'domestic' ? isVatOption(value.vat_option) : value.vat_option === null);
};

// The same rules for the totals: VAT groups on a domestic invoice, and on the
// others none at all and zero VAT, as InvoiceTotals::fromLines() sends them.
const isTotalsUnder = (treatment: VatTreatment, value: unknown): value is InvoiceTotals =>
{
    if (typeof value !== 'object'
        || value === null
        || !('subtotal_cents' in value && Number.isInteger(value.subtotal_cents))
        || !('total_cents' in value && Number.isInteger(value.total_cents))
        || !('vat_groups' in value && Array.isArray(value.vat_groups))
        || !('vat_cents' in value))
    {
        return false;
    }

    return treatment === 'domestic'
        ? value.vat_groups.every(isVatGroup) && Number.isInteger(value.vat_cents)
        : value.vat_groups.length === 0 && value.vat_cents === 0;
};

// The body came over the network, so it is checked at runtime: TypeScript
// trusts the `value is` claim without verifying it. Extra keys pass, a
// missing key or a wrong type doesn't.
export const isInvoiceSummary = (value: unknown): value is InvoiceSummary =>
{
    return typeof value === 'object'
           && value !== null
           && 'id' in value && Number.isInteger(value.id)
           && 'status' in value && isInvoiceStatus(value.status)
           && 'vat_treatment' in value && isVatTreatment(value.vat_treatment)
           && 'number' in value && isNullableString(value.number)
           && 'client_id' in value && Number.isInteger(value.client_id)
           && 'bank_account_id' in value && Number.isInteger(value.bank_account_id)
           && 'payment_term_days' in value && isNullableInteger(value.payment_term_days);
};

// Built on the summary, as the type is. Once the summary has passed,
// `value.vat_treatment` is known, and every line and the totals are checked
// against that one treatment.
export const isInvoice = (value: unknown): value is Invoice =>
{
    return isInvoiceSummary(value)
           && 'lines' in value && Array.isArray(value.lines)
           && value.lines.every((line: unknown) => isLineUnder(value.vat_treatment, line))
           && 'totals' in value && isTotalsUnder(value.vat_treatment, value.totals);
};

const isInvoiceSummaryList = (value: unknown): value is InvoiceSummary[] =>
{
    return Array.isArray(value) && value.every(isInvoiceSummary);
};

// An invoice with the version its ETag named. Beside the invoice, not inside
// it: the backend sends the version as a header, so `Invoice` stays exactly
// the body. A later update or delete hands the version back as If-Match.
export interface VersionedInvoice
{
    invoice: Invoice;
    version: number;
}

const endpointFor = (businessId: number): string => `/businesses/${businessId}/invoices`;

// A business's invoices, as summaries: no lines, no totals, and no version,
// because the list is only read. A 404 (not found) means the business isn't
// the user's, or no longer exists.
export const listInvoices = async (businessId: number): Promise<InvoiceSummary[]> =>
{
    const endpoint = endpointFor(businessId);
    const response = await getRequest<unknown>(endpoint);

    return checkResponse(endpoint, response.data, isInvoiceSummaryList);
};

// A fetch's 404: the invoice isn't one of the business's. Its own class, so
// the page can tell it from other failures with instanceof and never reads a
// status code itself. The original 404 is kept as `cause`.
export class InvoiceNotFoundError extends Error
{
    constructor(cause: unknown)
    {
        super('The invoice does not exist', { cause });
        this.name = 'InvoiceNotFoundError';
    }
}

// An update's or delete's 412 (precondition failed): the draft was saved
// elsewhere since this version was read, so nothing was stored. The editor
// keeps its unsaved edits and offers to load the latest version. A 428
// (precondition required) is not wrapped: it means this service sent no
// If-Match, a bug, so it goes the unexpected-error path as it is.
export class InvoiceVersionConflictError extends Error
{
    constructor(cause: unknown)
    {
        super('The invoice was changed elsewhere', { cause });
        this.name = 'InvoiceVersionConflictError';
    }
}

// Rethrows `error`, as `wrapped` when it is a failed request with `status`.
// Returns never: every path throws, so a catch block that calls it ends there.
const rethrow = (error: unknown, status: number, wrapped: (cause: unknown) => Error): never =>
{
    if (isAxiosError(error) && error.response?.status === status)
    {
        throw wrapped(error);
    }

    throw error;
};

// The body checked against isInvoice and the ETag read as its version.
const versionedInvoiceFrom = (endpoint: string, response: AxiosResponse<unknown>): VersionedInvoice =>
{
    return {
        invoice: checkResponse(endpoint, response.data, isInvoice),
        version: versionFrom(endpoint, response),
    };
};

// One invoice of the business, with its version. An unknown id and an invoice
// of another business are both a 404 (not found), thrown as an
// InvoiceNotFoundError. Anything else is thrown as it is.
export const fetchInvoice = async (businessId: number, invoiceId: number): Promise<VersionedInvoice> =>
{
    const endpoint = `${endpointFor(businessId)}/${invoiceId}`;

    try
    {
        return versionedInvoiceFrom(endpoint, await getRequest<unknown>(endpoint));
    }
    catch (error) // unknown: anything can be thrown
    {
        return rethrow(error, 404, (cause) => new InvoiceNotFoundError(cause));
    }
};

// 201 (created) with the draft and its first version. A 422 is thrown, not
// caught, so the form can show it next to the field.
export const createInvoice = async (businessId: number, payload: InvoicePayload): Promise<VersionedInvoice> =>
{
    const endpoint = endpointFor(businessId);

    return versionedInvoiceFrom(endpoint, await postRequest<InvoicePayload, unknown>(endpoint, payload));
};

// Replaces the draft, lines included, if `version` is still its current one:
// 200 (ok) with the result and its next version. A 412 (precondition failed)
// is thrown as an InvoiceVersionConflictError; a 422 for the form and a 404
// (not found) for the page are thrown as they are. `version` is required here
// although putRequest() makes it optional: an invoice is always versioned.
export const updateInvoice = async (businessId: number, invoiceId: number, payload: InvoicePayload, version: number): Promise<VersionedInvoice> =>
{
    const endpoint = `${endpointFor(businessId)}/${invoiceId}`;

    try
    {
        return versionedInvoiceFrom(endpoint, await putRequest<InvoicePayload, unknown>(endpoint, payload, version));
    }
    catch (error)
    {
        return rethrow(error, 412, (cause) => new InvoiceVersionConflictError(cause));
    }
};

// Deletes the draft, lines included, if `version` is still its current one:
// 204 (no content). A 412 (precondition failed) is thrown as an
// InvoiceVersionConflictError, anything else as it is.
export const deleteInvoice = async (businessId: number, invoiceId: number, version: number): Promise<void> =>
{
    const endpoint = `${endpointFor(businessId)}/${invoiceId}`;

    try
    {
        await deleteRequest<unknown>(endpoint, version);
    }
    catch (error)
    {
        rethrow(error, 412, (cause) => new InvoiceVersionConflictError(cause));
    }
};
