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

// An invoice's own fields without its lines, under either treatment: what the
// editor's fields make before the lines are added.
export type InvoiceFieldsPayload = InvoiceFieldsUnder<VatRules>;

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

// The fields a row of the list and a whole invoice share
// (InvoiceSummaryResourceData): no lines, no totals.
export type InvoiceSummary = InvoiceSummaryUnder<VatRules>;

// One row of the invoices list (InvoiceListItemResourceData): the summary and
// its total, computed by the backend. Only the total, not the VAT groups: a
// row shows one amount, and the breakdown is what the whole invoice is for.
export type InvoiceListItem = InvoiceSummary & { total_cents: number };

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

// An amount the formatters can show: cents or hundredths, whole, safe and
// never negative. Stricter than isInteger, because formatCents and
// formatHundredths throw on anything else, and a throw while showing a saved
// draft would report a save that went through as failed.
const isAmount = (value: unknown): value is number =>
{
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
};

const isVatGroup = (value: unknown): value is VatGroup =>
{
    return typeof value === 'object'
           && value !== null // typeof null is 'object'
           && 'vat_option' in value && isVatOption(value.vat_option)
           && 'rate_percent' in value && isNullableInteger(value.rate_percent)
           && 'base_cents' in value && isAmount(value.base_cents)
           && 'vat_cents' in value && isAmount(value.vat_cents);
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
           && 'quantity_hundredths' in value && isAmount(value.quantity_hundredths)
           && 'unit_price_cents' in value && isAmount(value.unit_price_cents)
           && 'total_cents' in value && isAmount(value.total_cents)
           && 'vat_option' in value
           && (treatment === 'domestic' ? isVatOption(value.vat_option) : value.vat_option === null);
};

// The same rules for the totals: VAT groups on a domestic invoice, and on the
// others none at all and zero VAT, as InvoiceTotals::fromLines() sends them.
const isTotalsUnder = (treatment: VatTreatment, value: unknown): value is InvoiceTotals =>
{
    if (typeof value !== 'object'
        || value === null
        || !('subtotal_cents' in value && isAmount(value.subtotal_cents))
        || !('total_cents' in value && isAmount(value.total_cents))
        || !('vat_groups' in value && Array.isArray(value.vat_groups))
        || !('vat_cents' in value))
    {
        return false;
    }

    return treatment === 'domestic'
        ? value.vat_groups.every(isVatGroup) && isAmount(value.vat_cents)
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

// Built on the summary, as isInvoice is. The total is an amount like the
// others: refused here, the load fails and the page offers Try again; let
// through, formatCents() would throw while the table renders.
export const isInvoiceListItem = (value: unknown): value is InvoiceListItem =>
{
    return isInvoiceSummary(value)
           && 'total_cents' in value && isAmount(value.total_cents);
};

const isInvoiceListItemList = (value: unknown): value is InvoiceListItem[] =>
{
    return Array.isArray(value) && value.every(isInvoiceListItem);
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

// A business's invoices, each with its total but no lines, no VAT groups and
// no version, because the list is only read. A 404 (not found) means the
// business isn't the user's, or no longer exists.
export const listInvoices = async (businessId: number): Promise<InvoiceListItem[]> =>
{
    const endpoint = endpointFor(businessId);
    const response = await getRequest<unknown>(endpoint);

    return checkResponse(endpoint, response.data, isInvoiceListItemList);
};

// A 404 (not found): the invoice isn't one of the business's, or it was
// deleted, e.g. in another tab or by a second click on Delete. Its own class, so
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

// The wrapped errors keep the whole axios error as `cause`, so the page can
// still reach the response. Unlike UnexpectedResponseError, that means they
// carry the request too: on an update, `cause.config.data` is the invoice
// payload. An error reporter wired up later must scrub it.

// Which failed statuses a function turns into its own error class. A status
// not listed is thrown as it is.
type ErrorFor = Partial<Record<number, (cause: unknown) => Error>>;

// Rethrows `error`, wrapped when it is a failed request with a status in
// `wrappers`. Returns never: every path throws, so a catch block that calls
// it ends there.
const rethrow = (error: unknown, wrappers: ErrorFor): never =>
{
    const wrap = isAxiosError(error) && error.response !== undefined ? wrappers[error.response.status] : undefined;

    throw wrap === undefined ? error : wrap(error);
};

const notFound = (cause: unknown): Error => new InvoiceNotFoundError(cause);
const versionConflict = (cause: unknown): Error => new InvoiceVersionConflictError(cause);

// The body checked against isInvoice and the ETag read as its version. On a
// create or an update this runs after the write was stored, so an
// UnexpectedResponseError from here does not mean nothing changed: retrying
// a create would make a second draft, and an update's new version is lost.
// The page should reload the list or the invoice, not retry.
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
        return rethrow(error, { 404: notFound });
    }
};

// 201 (created) with the draft and its first version. A 422 is thrown, not
// caught, so the form can show it next to the field. An
// UnexpectedResponseError means the draft may exist: see
// versionedInvoiceFrom().
export const createInvoice = async (businessId: number, payload: InvoicePayload): Promise<VersionedInvoice> =>
{
    const endpoint = endpointFor(businessId);

    return versionedInvoiceFrom(endpoint, await postRequest<InvoicePayload, unknown>(endpoint, payload));
};

// Replaces the draft, lines included, if `version` is still its current one:
// 200 (ok) with the result and its next version. A 412 (precondition failed)
// is thrown as an InvoiceVersionConflictError and a 404 (not found) as an
// InvoiceNotFoundError; a 422 is thrown as it is, for the form. An
// UnexpectedResponseError means the save may have been stored: see
// versionedInvoiceFrom(). `version` is required here
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
        return rethrow(error, { 404: notFound, 412: versionConflict });
    }
};

// Deletes the draft, lines included, if `version` is still its current one:
// 204 (no content). A 412 (precondition failed) is thrown as an
// InvoiceVersionConflictError and a 404 (not found), a draft already deleted,
// as an InvoiceNotFoundError. Anything else is thrown as it is.
export const deleteInvoice = async (businessId: number, invoiceId: number, version: number): Promise<void> =>
{
    const endpoint = `${endpointFor(businessId)}/${invoiceId}`;

    try
    {
        await deleteRequest<unknown>(endpoint, version);
    }
    catch (error)
    {
        return rethrow(error, { 404: notFound, 412: versionConflict });
    }
};
