// @vitest-environment node
// No DOM here, and the drift test reads a file: jsdom's import.meta.url is
// not a file:// URL, so fileURLToPath would throw.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { COUNTRY_CODES, isAddress, isCountryCode, type DutchAddress, type ForeignAddress } from '@/services/address';

// The backend rule the frontend list is a copy of. Read as text: the
// frontend has no PHP, and the list is plain quoted codes.
const COUNTRY_CODE_RULE = fileURLToPath(new URL('../../../../backend/app/Validation/CountryCode.php', import.meta.url));

describe('COUNTRY_CODES', () =>
{
    it('should hold the same codes in the same order as the backend\'s CountryCode rule', () =>
    {
        // Arrange: comments stripped first, so a code commented out in PHP
        // doesn't count; then only the CODES array, so a quoted two-letter
        // word elsewhere in the file can't count as a code either
        const source = readFileSync(COUNTRY_CODE_RULE, 'utf8')
            .replaceAll(/\/\*[\s\S]*?\*\//g, '')
            .replaceAll(/\/\/.*$/gm, '');
        const codesBlock = /\bCODES = \[([^\]]*)\]/.exec(source)?.[1];

        // A renamed or reformatted constant says so, instead of failing as a
        // list of 249 missing codes
        if (codesBlock === undefined)
        {
            throw new Error(`No "CODES = [...]" array in ${COUNTRY_CODE_RULE}: was the constant renamed or reformatted?`);
        }

        // Act
        const backendCodes = [...codesBlock.matchAll(/'([A-Z]{2})'/g)].map((match) => match[1]);

        // Assert: an empty match fails too, so a reformatted PHP file can't
        // pass by finding nothing
        expect(backendCodes).toEqual([...COUNTRY_CODES]);
    });
});

describe('isCountryCode', () =>
{
    it.each(['NL', 'DE'])('should accept %s', (code) =>
    {
        // Act & Assert
        expect(isCountryCode(code)).toBe(true);
    });

    it.each([
        ['UK, which is not an ISO code (GB is)', 'UK'],
        ['a lowercase code', 'nl'],
        ['a code that is not on the list', 'XX'],
        ['null', null],
        ['a number', 42],
    ])('should reject %s', (_description, value) =>
    {
        // Act & Assert
        expect(isCountryCode(value)).toBe(false);
    });
});

describe('Address', () =>
{
    // oxlint-disable-next-line vitest/expect-expect -- the assertion is the @ts-expect-error inside, checked by vue-tsc, not by vitest
    it('should fail type-check when a Dutch address has a region', () =>
    {
        // Assert: checked by npm run type-check, not by vitest. The backend
        // prohibits a region on an NL address, so the type does too.
        const address: DutchAddress = {
            street: 'Oosterstraat',
            house_number: '123',
            house_number_addition: null,
            postal_code: '9711 LM',
            city: 'Groningen',
            // @ts-expect-error a Dutch address's region is null
            region: 'Groningen',
            country_code: 'NL',
        };

        return address;
    });

    // oxlint-disable-next-line vitest/expect-expect -- the assertion is the @ts-expect-error inside, checked by vue-tsc, not by vitest
    it('should fail type-check when a Dutch address has no postcode', () =>
    {
        // Assert: checked by npm run type-check, not by vitest
        const address: DutchAddress = {
            street: 'Oosterstraat',
            house_number: '123',
            house_number_addition: null,
            // @ts-expect-error a Dutch address requires a postcode
            postal_code: null,
            city: 'Groningen',
            region: null,
            country_code: 'NL',
        };

        return address;
    });

    // oxlint-disable-next-line vitest/expect-expect -- the assertion is the @ts-expect-error inside, checked by vue-tsc, not by vitest
    it('should fail type-check when a foreign address has NL as its country', () =>
    {
        // Assert: checked by npm run type-check, not by vitest. Otherwise an
        // NL address could dodge the Dutch rules by claiming to be foreign.
        const address: ForeignAddress = {
            street: 'Oosterstraat',
            house_number: '123',
            house_number_addition: null,
            postal_code: null,
            city: 'Groningen',
            region: 'Groningen',
            // @ts-expect-error NL is the Dutch side of the union
            country_code: 'NL',
        };

        return address;
    });
});

describe('isAddress', () =>
{
    const dutchAddress: DutchAddress = {
        street: 'Oosterstraat',
        house_number: '123',
        house_number_addition: 'A',
        postal_code: '9711 LM',
        city: 'Groningen',
        region: null,
        country_code: 'NL',
    };

    const foreignAddress: ForeignAddress = {
        street: 'Leopoldstraße',
        house_number: '12',
        house_number_addition: null,
        postal_code: '80802',
        city: 'München',
        region: 'Bayern',
        country_code: 'DE',
    };

    // A copy of an address without one key.
    const without = (address: DutchAddress | ForeignAddress, key: keyof DutchAddress): Record<string, unknown> =>
    {
        const copy: Record<string, unknown> = { ...address };
        delete copy[key];

        return copy;
    };

    it.for([
        { name: 'a Dutch address', value: dutchAddress },
        { name: 'a Dutch address without a house number addition', value: { ...dutchAddress, house_number_addition: null } },
        { name: 'a foreign address with a postcode and a region', value: foreignAddress },
        // Hong Kong has no postcodes
        { name: 'a foreign address with a region but no postcode', value: { ...foreignAddress, postal_code: null, region: 'Kowloon', country_code: 'HK' } },
        { name: 'a foreign address with neither a postcode nor a region', value: { ...foreignAddress, postal_code: null, region: null } },
        // A field added to the response mustn't break the SPA before it uses it
        { name: 'an extra key', value: { ...dutchAddress, created_at: '2026-10-29' } },
    ])('should accept $name', ({ value }) =>
    {
        // Act + Assert
        expect(isAddress(value)).toBe(true);
    });

    it.for(Object.keys(dutchAddress).map((key) => ({ name: key, value: without(dutchAddress, key as keyof DutchAddress) })))(
        'should reject a Dutch address without a key: $name',
        ({ value }) =>
        {
            // Act + Assert
            expect(isAddress(value)).toBe(false);
        },
    );

    // null is a valid postal_code and region abroad, but a missing key is not
    it.for([
        { name: 'postal_code', value: without(foreignAddress, 'postal_code') },
        { name: 'region', value: without(foreignAddress, 'region') },
    ])('should reject a foreign address without a key: $name', ({ value }) =>
    {
        // Act + Assert
        expect(isAddress(value)).toBe(false);
    });

    it.for([
        { name: 'street as null', value: { ...dutchAddress, street: null } },
        { name: 'house_number as a number', value: { ...dutchAddress, house_number: 123 } },
        { name: 'house_number_addition as a number', value: { ...dutchAddress, house_number_addition: 1 } },
        { name: 'city as null', value: { ...dutchAddress, city: null } },
        { name: 'a foreign postal_code as a number', value: { ...foreignAddress, postal_code: 80802 } },
        { name: 'a foreign region as a number', value: { ...foreignAddress, region: 1 } },
    ])('should reject an address with a value of the wrong type: $name', ({ value }) =>
    {
        // Act + Assert
        expect(isAddress(value)).toBe(false);
    });

    it('should reject a Dutch address with a region, since a Dutch postal address has none', () =>
    {
        // Act + Assert: a region is valid abroad, so only the country decides this
        expect(isAddress({ ...dutchAddress, region: 'Groningen' })).toBe(false);
    });

    it('should reject a Dutch address without a postcode, since every Dutch address has one', () =>
    {
        // Act + Assert: a null postcode is valid abroad, so only the country decides this
        expect(isAddress({ ...dutchAddress, postal_code: null })).toBe(false);
    });

    it.for([
        { name: 'a code that is not on the list', countryCode: 'XX' },
        // The backend stores the canonical, uppercase form; anything else means the contract changed
        { name: 'a lowercase code', countryCode: 'nl' },
        { name: 'null', countryCode: null },
    ])('should reject an address whose country_code is $name', ({ countryCode }) =>
    {
        // Act + Assert
        expect(isAddress({ ...foreignAddress, country_code: countryCode })).toBe(false);
    });

    it.for([
        { name: 'null', value: null },
        { name: 'a string', value: 'Oosterstraat 123A, 9711 LM Groningen' },
        { name: 'an array', value: [] },
    ])('should reject $name', ({ value }) =>
    {
        // Act + Assert
        expect(isAddress(value)).toBe(false);
    });
});
