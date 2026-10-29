import { isAxiosError } from 'axios';

import { isAddress, isNullableString, type Address } from '@/services/address';
import { checkResponse, getRequest, postRequest, putRequest } from '@/services/http';

// What the create and edit forms send. Keys match the request's validation
// rules, so they are also the keys of a 422's errors. Built up with `&`,
// which applies to each half of the `Address` union separately: a Dutch
// client and a foreign client stay two shapes, each with its own postcode
// and region rules.
export type ClientPayload = {
    name: string;
    email: string;
    vat_number: string | null; // only accepted for a client in the EU
} & Address;

// A client as the backend sends it: the payload plus its server-assigned id.
export type Client = { id: number } & ClientPayload;

// The body came over the network, so it is checked at runtime: TypeScript
// trusts the `value is` claim without verifying it. The address checks
// include which country goes with which postcode and region rules. Extra
// keys pass, a missing key or a wrong type doesn't.
export const isClient = (value: unknown): value is Client =>
{
    return typeof value === 'object'
           && value !== null // typeof null is 'object'
           && 'id' in value && Number.isInteger(value.id)
           && 'name' in value && typeof value.name === 'string'
           && 'email' in value && typeof value.email === 'string'
           && 'vat_number' in value && isNullableString(value.vat_number)
           && isAddress(value);
};

const isClientList = (value: unknown): value is Client[] =>
{
    return Array.isArray(value) && value.every(isClient);
};

const endpointFor = (businessId: number): string => `/businesses/${businessId}/clients`;

// A business's clients, sorted by name. A 404 (not found) means the business
// isn't the user's, or no longer exists.
export const listClients = async (businessId: number): Promise<Client[]> =>
{
    const endpoint = endpointFor(businessId);
    const response = await getRequest<unknown>(endpoint);

    return checkResponse(endpoint, response.data, isClientList);
};

// A fetch's 404: the client isn't one of the business's. Its own class, so
// the page can tell it from other failures with instanceof and never reads a
// status code itself. The original 404 is kept as `cause`, like
// SessionEndedError.
export class ClientNotFoundError extends Error
{
    constructor(cause: unknown)
    {
        super('The client does not exist', { cause });
        this.name = 'ClientNotFoundError';
    }
}

// One client of the business. An unknown id and a client of another business
// are both a 404 (not found), thrown as a ClientNotFoundError. Anything else
// is thrown as it is.
export const fetchClient = async (businessId: number, clientId: number): Promise<Client> =>
{
    const endpoint = `${endpointFor(businessId)}/${clientId}`;

    try
    {
        const response = await getRequest<unknown>(endpoint);

        return checkResponse(endpoint, response.data, isClient);
    }
    catch (error) // unknown: anything can be thrown
    {
        if (isAxiosError(error) && error.response?.status === 404)
        {
            throw new ClientNotFoundError(error);
        }

        throw error;
    }
};

// 201 (created) with the client. A 422 is thrown, not caught, so the form can
// show it next to the field.
export const createClient = async (businessId: number, payload: ClientPayload): Promise<Client> =>
{
    const endpoint = endpointFor(businessId);
    const response = await postRequest<ClientPayload, unknown>(endpoint, payload);

    return checkResponse(endpoint, response.data, isClient);
};

// Replaces every field of a client: 200 (ok) with the result. A 422 is thrown
// for the form, a 404 (not found) for the page.
export const updateClient = async (businessId: number, clientId: number, payload: ClientPayload): Promise<Client> =>
{
    const endpoint = `${endpointFor(businessId)}/${clientId}`;
    const response = await putRequest<ClientPayload, unknown>(endpoint, payload);

    return checkResponse(endpoint, response.data, isClient);
};
