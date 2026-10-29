import { describe, it, expect } from 'vitest';

import { isClient, type Client } from '@/services/clients';

// A Dutch client as the backend sends it.
const dutchClient: Client = {
    id: 3,
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

// A foreign client as the backend sends it.
const foreignClient: Client = {
    id: 4,
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
