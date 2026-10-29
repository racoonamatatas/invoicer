import type { AxiosResponse } from 'axios';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import { ClientNotFoundError, createClient, fetchClient, isClient, listClients, updateClient, type Client, type ClientPayload } from '@/services/clients';
import { getRequest, postRequest, putRequest, UnexpectedResponseError } from '@/services/http';

import { axiosErrorWith } from '../utility/axiosErrorWith';

// Only the request functions become vi.fn()s, so no request leaves the test.
// checkResponse and UnexpectedResponseError stay real: they are what the
// service tests are about.
vi.mock('@/services/http', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/services/http')>(),
    getRequest: vi.fn<typeof getRequest>(),
    postRequest: vi.fn<typeof postRequest>(),
    putRequest: vi.fn<typeof putRequest>(),
}));

// What a form sends for a Dutch client. The client the backend answers with
// is built from it, so the two can't drift apart.
const dutchPayload: ClientPayload = {
    name: 'Fietsenmakerij Bakker',
    email: 'info@fietsenmakerijbakker.nl',
    vat_number: 'NL987654321B01',
    street: 'Oosterstraat',
    house_number: '123',
    house_number_addition: 'A',
    postal_code: '9711 LM',
    city: 'Groningen',
    region: null,
    country_code: 'NL',
};

const dutchClient: Client = { id: 3, ...dutchPayload };

const foreignPayload: ClientPayload = {
    name: 'Brauerei Huber',
    email: 'kontakt@brauerei-huber.de',
    vat_number: 'DE123456789',
    street: 'Leopoldstraße',
    house_number: '12',
    house_number_addition: null,
    postal_code: '80802',
    city: 'München',
    region: 'Bayern',
    country_code: 'DE',
};

const foreignClient: Client = { id: 4, ...foreignPayload };

// A copy of the Dutch client without one key.
const clientWithout = (key: keyof Client): Record<string, unknown> =>
{
    const copy: Record<string, unknown> = { ...dutchClient };
    delete copy[key];

    return copy;
};

describe('isClient', () =>
{
    it.for([
        { name: 'a Dutch client with a VAT number', value: dutchClient },
        { name: 'a Dutch client without a VAT number', value: { ...dutchClient, vat_number: null } },
        { name: 'a foreign client with a VAT number', value: foreignClient },
        { name: 'a foreign client without a VAT number', value: { ...foreignClient, vat_number: null } },
        // A field added to the response mustn't break the SPA before it uses it
        { name: 'an extra key', value: { ...dutchClient, created_at: '2026-10-29' } },
    ])('should accept $name', ({ value }) =>
    {
        // Act + Assert
        expect(isClient(value)).toBe(true);
    });

    // Every key, the address ones included: a client with a broken address is not a client
    it.for(Object.keys(dutchClient).map((key) => ({ name: key, value: clientWithout(key as keyof Client) })))(
        'should reject a client without a key: $name',
        ({ value }) =>
        {
            // Act + Assert
            expect(isClient(value)).toBe(false);
        },
    );

    it.for([
        { name: 'id as a string', value: { ...dutchClient, id: '3' } },
        { name: 'id as a fraction', value: { ...dutchClient, id: 3.5 } },
        { name: 'name as null', value: { ...dutchClient, name: null } },
        // The app mails every invoice to its client, so an email is always there
        { name: 'email as null', value: { ...dutchClient, email: null } },
        { name: 'vat_number as a number', value: { ...dutchClient, vat_number: 987654321 } },
        { name: 'street as null', value: { ...dutchClient, street: null } },
    ])('should reject a client with a value of the wrong type: $name', ({ value }) =>
    {
        // Act + Assert
        expect(isClient(value)).toBe(false);
    });

    it('should reject a Dutch client with a region, since a Dutch postal address has none', () =>
    {
        // Act + Assert: a region is valid abroad, so the client's country has to decide this
        expect(isClient({ ...dutchClient, region: 'Groningen' })).toBe(false);
    });

    it('should reject null', () =>
    {
        // Act + Assert
        expect(isClient(null)).toBe(false);
    });
});

describe('clients service', () =>
{
    // Each test programs its own responses; none leak into the next.
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should get /businesses/{id}/clients and return the list from the 200 (ok) response', async () =>
    {
        // Arrange: only data matters, so the rest of the axios response is left out
        vi.mocked(getRequest).mockResolvedValue({ data: [dutchClient, foreignClient] } as AxiosResponse);

        // Act
        const result = await listClients(7);

        // Assert
        expect(getRequest).toHaveBeenCalledExactlyOnceWith('/businesses/7/clients');
        expect(result).toStrictEqual([dutchClient, foreignClient]);
    });

    it('should return an empty list from a 200 (ok) response without clients', async () =>
    {
        // Arrange: a new business has none, which is a valid list, not a malformed one
        vi.mocked(getRequest).mockResolvedValue({ data: [] } as AxiosResponse);

        // Act
        const result = await listClients(7);

        // Assert
        expect(result).toStrictEqual([]);
    });

    it.for([
        { name: 'one malformed client', data: [dutchClient, clientWithout('email')] },
        { name: 'a wrapped list', data: { data: [dutchClient] } },
        { name: 'a single client', data: dutchClient },
    ])('should throw an UnexpectedResponseError naming the endpoint when /businesses/{id}/clients answers with $name', async ({ data }) =>
    {
        // Arrange
        vi.mocked(getRequest).mockResolvedValue({ data } as AxiosResponse);

        // Act
        const promise = listClients(7);

        // Assert
        await expect(promise).rejects.toThrow(UnexpectedResponseError);
        await expect(promise).rejects.toThrow('Unexpected response from /businesses/7/clients');
    });

    it('should get /businesses/{id}/clients/{id} and return the client from the 200 (ok) response', async () =>
    {
        // Arrange
        vi.mocked(getRequest).mockResolvedValue({ data: dutchClient } as AxiosResponse);

        // Act
        const result = await fetchClient(7, 3);

        // Assert
        expect(getRequest).toHaveBeenCalledExactlyOnceWith('/businesses/7/clients/3');
        expect(result).toStrictEqual(dutchClient);
    });

    // An unknown id and another business's client are the same 404, so one
    // test covers both
    it('should throw a ClientNotFoundError when the fetch gets a 404 (not found): the client isn\'t the business\'s', async () =>
    {
        // Arrange
        const error = axiosErrorWith(404, { message: 'Not Found' });
        vi.mocked(getRequest).mockRejectedValue(error);

        // Act
        const promise = fetchClient(7, 3);

        // Assert: the 404 kept as cause, so the console still shows the request
        await expect(promise).rejects.toThrow(ClientNotFoundError);
        await expect(promise).rejects.toMatchObject({ cause: error });
    });

    // A foreign payload too: its postcode and region rules differ, and the
    // service must send it as given
    it.for([
        { name: 'a Dutch client', payload: dutchPayload, client: dutchClient },
        { name: 'a foreign client', payload: foreignPayload, client: foreignClient },
    ])('should post the payload to /businesses/{id}/clients and return the client from the 201 (created) response: $name', async ({ payload, client }) =>
    {
        // Arrange
        vi.mocked(postRequest).mockResolvedValue({ data: client } as AxiosResponse);

        // Act
        const result = await createClient(7, payload);

        // Assert
        expect(postRequest).toHaveBeenCalledExactlyOnceWith('/businesses/7/clients', payload);
        expect(result).toStrictEqual(client);
    });

    it.for([
        { name: 'a Dutch client', payload: dutchPayload, client: dutchClient },
        { name: 'a foreign client', payload: foreignPayload, client: foreignClient },
    ])('should put the payload to /businesses/{id}/clients/{id} and return the client from the 200 (ok) response: $name', async ({ payload, client }) =>
    {
        // Arrange
        vi.mocked(putRequest).mockResolvedValue({ data: client } as AxiosResponse);

        // Act
        const result = await updateClient(7, client.id, payload);

        // Assert
        expect(putRequest).toHaveBeenCalledExactlyOnceWith(`/businesses/7/clients/${client.id}`, payload);
        expect(result).toStrictEqual(client);
    });

    // One case per function: each must hand its own response to the check.
    it.for([
        { name: 'fetchClient', send: () => fetchClient(7, 3), endpoint: '/businesses/7/clients/3' },
        { name: 'createClient', send: () => createClient(7, dutchPayload), endpoint: '/businesses/7/clients' },
        { name: 'updateClient', send: () => updateClient(7, 3, dutchPayload), endpoint: '/businesses/7/clients/3' },
    ])('should throw an UnexpectedResponseError naming the endpoint when the client is malformed: $name', async ({ send, endpoint }) =>
    {
        // Arrange: every request function answers with a client missing its id
        const response = { data: clientWithout('id') } as AxiosResponse;
        vi.mocked(getRequest).mockResolvedValue(response);
        vi.mocked(postRequest).mockResolvedValue(response);
        vi.mocked(putRequest).mockResolvedValue(response);

        // Act: one request, so both assertions are about the same response
        const promise = send();

        // Assert
        await expect(promise).rejects.toThrow(UnexpectedResponseError);
        await expect(promise).rejects.toThrow(`Unexpected response from ${endpoint}`);
    });

    // The form shows a 422 next to its fields and the page handles a 404, so
    // the service must hand on the very error it got, not a wrapped or swallowed one
    it.for([
        { name: 'listClients', status: 404, meaning: '404 (not found)', request: getRequest, send: () => listClients(7) },
        { name: 'fetchClient', status: 500, meaning: '500 (server error)', request: getRequest, send: () => fetchClient(7, 3) },
        { name: 'createClient', status: 422, meaning: '422 (unprocessable content)', request: postRequest, send: () => createClient(7, dutchPayload) },
        { name: 'updateClient', status: 422, meaning: '422 (unprocessable content)', request: putRequest, send: () => updateClient(7, 3, dutchPayload) },
    ])('should rethrow the request\'s error unchanged: $name with a $meaning', async ({ status, request, send }) =>
    {
        // Arrange
        const error = axiosErrorWith(status, { message: 'Request failed' });
        vi.mocked(request).mockRejectedValue(error);

        // Act + Assert: toBe, so the same object, not one that only looks like it
        await expect(send()).rejects.toBe(error);
    });
});
