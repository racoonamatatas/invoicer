import type { AxiosResponse } from 'axios';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import { createBusiness, fetchBusiness, isBusiness, listBusinesses, updateBusiness, type BusinessPayload } from '@/services/businesses';
import { getRequest, postRequest, putRequest, UnexpectedResponseError } from '@/services/http';

// Only the request functions become vi.fn()s, so no request leaves the test.
// checkResponse and UnexpectedResponseError stay real: they are what these
// tests are about.
vi.mock('@/services/http', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/services/http')>(),
    getRequest: vi.fn<typeof getRequest>(),
    postRequest: vi.fn<typeof postRequest>(),
    putRequest: vi.fn<typeof putRequest>(),
}));

// A business as BusinessResourceData sends it.
const business = {
    id: 7,
    registered_name: 'Bakkerij de Vries',
    kvk_number: '12345678',
    vat_number: 'NL123456789B01',
    street: 'Oosterstraat',
    house_number: '123',
    house_number_addition: 'A',
    postal_code: '9711 LM',
    city: 'Groningen',
    region: null,
    country_code: 'NL',
    payment_term_days: 30,
};

const payload: BusinessPayload = {
    registered_name: 'Bakkerij de Vries',
    kvk_number: '12345678',
    vat_number: 'NL123456789B01',
    street: 'Oosterstraat',
    house_number: '123',
    house_number_addition: 'A',
    postal_code: '9711 LM',
    city: 'Groningen',
    country_code: 'NL',
    payment_term_days: 30,
};

// A copy of the business without one key.
const businessWithout = (key: keyof typeof business): Record<string, unknown> =>
{
    const copy: Record<string, unknown> = { ...business };
    delete copy[key];

    return copy;
};

describe('isBusiness', () =>
{
    it.for([
        { name: 'every field filled', value: business },
        { name: 'no house number addition', value: { ...business, house_number_addition: null } },
        // A column added to BusinessResourceData mustn't break the SPA before it uses it.
        { name: 'an extra key', value: { ...business, created_at: '2026-10-24' } },
    ])('should accept a business with $name', ({ value }) =>
    {
        // Act + Assert
        expect(isBusiness(value)).toBe(true);
    });

    it.for(Object.keys(business).map((key) => ({ name: key, value: businessWithout(key as keyof typeof business) })))(
        'should reject a business without a key: $name',
        ({ value }) =>
        {
            // Act + Assert
            expect(isBusiness(value)).toBe(false);
        },
    );

    it.for([
        { name: 'id as a string', value: { ...business, id: '7' } },
        { name: 'id as a fraction', value: { ...business, id: 7.5 } },
        { name: 'registered_name as null', value: { ...business, registered_name: null } },
        { name: 'kvk_number as a number', value: { ...business, kvk_number: 12345678 } },
        { name: 'vat_number as null', value: { ...business, vat_number: null } },
        { name: 'street as null', value: { ...business, street: null } },
        { name: 'house_number as a number', value: { ...business, house_number: 123 } },
        { name: 'house_number_addition as a number', value: { ...business, house_number_addition: 1 } },
        { name: 'postal_code as null', value: { ...business, postal_code: null } },
        { name: 'city as null', value: { ...business, city: null } },
        { name: 'region as a number', value: { ...business, region: 1 } },
        { name: 'payment_term_days as a string', value: { ...business, payment_term_days: '30' } },
        { name: 'payment_term_days as a fraction', value: { ...business, payment_term_days: 30.5 } },
    ])('should reject a business with a value of the wrong type: $name', ({ value }) =>
    {
        // Act + Assert
        expect(isBusiness(value)).toBe(false);
    });

    it.for([
        { name: 'another country', countryCode: 'DE' },
        // The backend stores the canonical, uppercase form; anything else means the contract changed.
        { name: 'lowercase', countryCode: 'nl' },
        { name: 'null', countryCode: null },
    ])('should reject a business whose country_code is not a business country: $name', ({ countryCode }) =>
    {
        // Act + Assert
        expect(isBusiness({ ...business, country_code: countryCode })).toBe(false);
    });

    it('should reject a business with a region, since a business is Dutch and a Dutch address has none', () =>
    {
        // Act + Assert: AddressRules never stores one, so a region means the contract changed
        expect(isBusiness({ ...business, region: 'Groningen' })).toBe(false);
    });

    it.for([
        { name: 'null', value: null },
        { name: 'an array', value: [business] },
        { name: 'a string', value: 'Bakkerij de Vries' },
    ])('should reject a value that is not an object: $name', ({ value }) =>
    {
        // Act + Assert
        expect(isBusiness(value)).toBe(false);
    });
});

describe('businesses service', () =>
{
    // Each test programs its own responses; none leak into the next.
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should get /businesses and return the list from the 200 (ok) response', async () =>
    {
        // Arrange: only data matters, so the rest of the axios response is left out
        const other = { ...business, id: 8, kvk_number: '87654321' };
        vi.mocked(getRequest).mockResolvedValue({ data: [business, other] } as AxiosResponse);

        // Act
        const result = await listBusinesses();

        // Assert
        expect(getRequest).toHaveBeenCalledExactlyOnceWith('/businesses');
        expect(result).toStrictEqual([business, other]);
    });

    it('should return an empty list from a 200 (ok) response without businesses', async () =>
    {
        // Arrange: a new user has none, which is a valid list, not a malformed one
        vi.mocked(getRequest).mockResolvedValue({ data: [] } as AxiosResponse);

        // Act
        const result = await listBusinesses();

        // Assert
        expect(result).toStrictEqual([]);
    });

    it.for([
        { name: 'one malformed business', data: [business, businessWithout('kvk_number')] },
        { name: 'a wrapped list', data: { data: [business] } },
        { name: 'a single business', data: business },
    ])('should throw an UnexpectedResponseError when /businesses answers with $name', async ({ data }) =>
    {
        // Arrange
        vi.mocked(getRequest).mockResolvedValue({ data } as AxiosResponse);

        // Act + Assert
        await expect(listBusinesses()).rejects.toThrow(UnexpectedResponseError);
    });

    it('should get /businesses/{id} and return the business from the 200 (ok) response', async () =>
    {
        // Arrange
        vi.mocked(getRequest).mockResolvedValue({ data: business } as AxiosResponse);

        // Act
        const result = await fetchBusiness(7);

        // Assert
        expect(getRequest).toHaveBeenCalledExactlyOnceWith('/businesses/7');
        expect(result).toStrictEqual(business);
    });

    it('should post the payload to /businesses and return the business from the 201 (created) response', async () =>
    {
        // Arrange
        vi.mocked(postRequest).mockResolvedValue({ data: business } as AxiosResponse);

        // Act
        const result = await createBusiness(payload);

        // Assert
        expect(postRequest).toHaveBeenCalledExactlyOnceWith('/businesses', payload);
        expect(result).toStrictEqual(business);
    });

    it('should put the payload to /businesses/{id} and return the business from the 200 (ok) response', async () =>
    {
        // Arrange
        vi.mocked(putRequest).mockResolvedValue({ data: business } as AxiosResponse);

        // Act
        const result = await updateBusiness(7, payload);

        // Assert
        expect(putRequest).toHaveBeenCalledExactlyOnceWith('/businesses/7', payload);
        expect(result).toStrictEqual(business);
    });

    // One case per function: each must hand its own response to the check.
    it.for([
        { name: 'fetchBusiness', send: () => fetchBusiness(7), endpoint: '/businesses/7' },
        { name: 'createBusiness', send: () => createBusiness(payload), endpoint: '/businesses' },
        { name: 'updateBusiness', send: () => updateBusiness(7, payload), endpoint: '/businesses/7' },
    ])('should throw an UnexpectedResponseError naming the endpoint when the business is malformed: $name', async ({ send, endpoint }) =>
    {
        // Arrange: every request function answers with a business missing its id
        const response = { data: businessWithout('id') } as AxiosResponse;
        vi.mocked(getRequest).mockResolvedValue(response);
        vi.mocked(postRequest).mockResolvedValue(response);
        vi.mocked(putRequest).mockResolvedValue(response);

        // Act + Assert
        await expect(send()).rejects.toThrow(UnexpectedResponseError);
        await expect(send()).rejects.toThrow(`Unexpected response from ${endpoint}`);
    });
});
