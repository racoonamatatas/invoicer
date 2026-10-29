import { describe, it, expect } from 'vitest';

import { withCountry, withText } from '@/form/addressEdits';
import type { AddressTextField } from '@/form/addressFormats';
import type { DutchAddress, ForeignAddress } from '@/services/address';

const dutchAddress = (): DutchAddress => ({
    street: 'Oosterstraat',
    house_number: '123',
    house_number_addition: 'A',
    postal_code: '9711 LM',
    city: 'Groningen',
    region: null,
    country_code: 'NL',
});

const germanAddress = (): ForeignAddress => ({
    street: 'Unter den Linden',
    house_number: '77',
    house_number_addition: null,
    postal_code: '10117',
    city: 'Berlin',
    region: 'Berlin',
    country_code: 'DE',
});

describe('withCountry', () =>
{
    it('should keep every field, the postcode included, when an NL address moves to DE', () =>
    {
        // Act
        const address = withCountry(dutchAddress(), 'DE');

        // Assert: DE hides nothing, so only the country changes
        expect(address).toStrictEqual({ ...dutchAddress(), country_code: 'DE' });
    });

    it('should keep the postcode and clear the region when a DE address moves to NL', () =>
    {
        // Act
        const address = withCountry(germanAddress(), 'NL');

        // Assert: the Dutch format hides the region, so its value goes
        expect(address).toStrictEqual({ ...germanAddress(), region: null, country_code: 'NL' });
    });

    it('should turn a null postcode into an empty one when a DE address moves to NL, since a Dutch postcode is text', () =>
    {
        // Act
        const address = withCountry({ ...germanAddress(), postal_code: null }, 'NL');

        // Assert
        expect(address.postal_code).toBe('');
    });
});

describe('withText', () =>
{
    // One row per field, so each case of the switch is checked on its own.
    it.for([
        'street',
        'house_number',
        'house_number_addition',
        'postal_code',
        'city',
        'region',
    ] satisfies AddressTextField[])('should return a new address that differs only at its key: %s', (field) =>
    {
        // Arrange: a foreign address, the only side where every field can be typed into
        const original = germanAddress();

        // Act
        const address = withText(original, field, 'typed');

        // Assert: a new object, and the original left alone
        expect(address).toStrictEqual({ ...germanAddress(), [field]: 'typed' });
        expect(original).toStrictEqual(germanAddress());
    });

    it('should return the same Dutch address when a region is typed, since a Dutch address has none', () =>
    {
        // Arrange: unreachable through AddressFields, which shows no region input for NL
        const original = dutchAddress();

        // Act
        const address = withText(original, 'region', 'Groningen');

        // Assert: the same object, so not even a re-render follows
        expect(address).toBe(original);
    });
});
