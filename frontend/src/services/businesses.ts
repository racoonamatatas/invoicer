import type { Address } from '@/services/address';
import { checkResponse, getRequest, postRequest, putRequest } from '@/services/http';

// The countries a business can be registered in. A business is a KvK
// registration, so only NL (BusinessRequest's 'in:NL'). A runtime array, not
// only a type, because isBusiness checks incoming codes against it; the type
// is derived from it, so the two can't disagree.
export const BUSINESS_COUNTRY_CODES = ['NL'] as const;

export type BusinessCountryCode = (typeof BUSINESS_COUNTRY_CODES)[number];

// A business as the backend sends it (BusinessResourceData).
export interface Business
{
    id: number;
    registered_name: string;
    kvk_number: string;
    vat_number: string;
    street: string;
    house_number: string;
    house_number_addition: string | null;
    postal_code: string;
    city: string;
    region: string | null;
    country_code: BusinessCountryCode;
    payment_term_days: number;
}

// What the create and edit forms send. Keys match BusinessRequest's rules, so
// they are also the keys of a 422's errors. No region: the backend prohibits
// one on a Dutch address, and a business is always Dutch, so a form has
// nothing to show or send for it. Extends Address, so AddressFields fits it.
export interface BusinessPayload extends Address
{
    registered_name: string;
    kvk_number: string;
    vat_number: string;
    country_code: BusinessCountryCode;
    // null: left empty in the form. Sent anyway, so the backend's required
    // rule answers with its own message.
    payment_term_days: number | null;
}

const isNullableString = (value: unknown): value is string | null =>
{
    return value === null || typeof value === 'string';
};

// `some` with ===, not includes(): includes() on the `as const` tuple only
// accepts its own literals, and `value` could be anything at this point.
const isBusinessCountryCode = (value: unknown): value is BusinessCountryCode =>
{
    return BUSINESS_COUNTRY_CODES.some((code) => code === value);
};

// The response body is whatever arrived over the network, so it is checked at
// runtime. TypeScript trusts the `value is` claim without verifying it: these
// checks must match the interface above, and the tests are what prove they do.
// Extra keys pass: a column added to BusinessResourceData shouldn't break the
// SPA before it uses it. A missing key or a wrong type doesn't.
export const isBusiness = (value: unknown): value is Business =>
{
    return typeof value === 'object'
           && value !== null // typeof null is 'object'
           && 'id' in value && Number.isInteger(value.id)
           && 'registered_name' in value && typeof value.registered_name === 'string'
           && 'kvk_number' in value && typeof value.kvk_number === 'string'
           && 'vat_number' in value && typeof value.vat_number === 'string'
           && 'street' in value && typeof value.street === 'string'
           && 'house_number' in value && typeof value.house_number === 'string'
           && 'house_number_addition' in value && isNullableString(value.house_number_addition)
           && 'postal_code' in value && typeof value.postal_code === 'string'
           && 'city' in value && typeof value.city === 'string'
           && 'region' in value && isNullableString(value.region)
           && 'country_code' in value && isBusinessCountryCode(value.country_code)
           && 'payment_term_days' in value && Number.isInteger(value.payment_term_days);
};

const isBusinessList = (value: unknown): value is Business[] =>
{
    return Array.isArray(value) && value.every(isBusiness);
};

// The logged-in user's businesses, in the backend's order.
export const listBusinesses = async (): Promise<Business[]> =>
{
    const response = await getRequest<unknown>('/businesses');

    return checkResponse('/businesses', response.data, isBusinessList);
};

// One business of the logged-in user. A business of another user is a 403
// (forbidden) and an unknown id a 404 (not found), both thrown.
export const fetchBusiness = async (id: number): Promise<Business> =>
{
    const endpoint = `/businesses/${id}`;
    const response = await getRequest<unknown>(endpoint);

    return checkResponse(endpoint, response.data, isBusiness);
};

// Creates a business for the logged-in user: 201 (created) with the business.
// A 422 is thrown, not caught, so useForm's submit() can show it next to the
// field.
export const createBusiness = async (payload: BusinessPayload): Promise<Business> =>
{
    const response = await postRequest<BusinessPayload, unknown>('/businesses', payload);

    return checkResponse('/businesses', response.data, isBusiness);
};

// Replaces every field of a business: 200 (ok) with the result. A 422 is
// thrown for useForm, a 403 (another user's business) for the page.
export const updateBusiness = async (id: number, payload: BusinessPayload): Promise<Business> =>
{
    const endpoint = `/businesses/${id}`;
    const response = await putRequest<BusinessPayload, unknown>(endpoint, payload);

    return checkResponse(endpoint, response.data, isBusiness);
};
