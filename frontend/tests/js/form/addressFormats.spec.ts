import { describe, it, expect } from 'vitest';

import { addressFormatFor, type AddressFormatFor, type FieldFormat } from '@/form/addressFormats';
import type { DutchAddress } from '@/services/address';

const street: FieldFormat<'required'> = { label: 'Street', autocomplete: undefined, presence: 'required' };

describe('addressFormatFor', () =>
{
    it('should require a postcode and hide the region for NL, as AddressRules does for a Dutch address', () =>
    {
        // Act
        const format = addressFormatFor('NL');

        // Assert
        expect(format.postal_code.presence).toBe('required');
        expect(format.region.presence).toBe('hidden');
    });

    it('should fall back to the default format for a country without its own, with an optional postcode and region', () =>
    {
        // Act
        const format = addressFormatFor('DE');

        // Assert
        expect(format.postal_code.presence).toBe('optional');
        expect(format.region.presence).toBe('optional');
        expect(format.street.presence).toBe('required');
    });
});

describe('AddressFormatFor', () =>
{
    // oxlint-disable-next-line vitest/expect-expect -- the assertion is the @ts-expect-error inside, checked by vue-tsc, not by vitest
    it('should fail type-check when a Dutch format asks for a region', () =>
    {
        // Assert: checked by npm run type-check, not by vitest. A Dutch
        // address's region is null, so the only presence it allows is hidden.
        const format: Pick<AddressFormatFor<DutchAddress>, 'region'> = {
            // @ts-expect-error a Dutch region can only be hidden
            region: { label: 'Region', autocomplete: undefined, presence: 'optional' },
        };

        return format;
    });

    // oxlint-disable-next-line vitest/expect-expect -- the assertion is the @ts-expect-error inside, checked by vue-tsc, not by vitest
    it('should fail type-check when a Dutch format makes the postcode optional', () =>
    {
        // Assert: checked by npm run type-check, not by vitest
        const format: Pick<AddressFormatFor<DutchAddress>, 'postal_code'> = {
            // @ts-expect-error a Dutch postcode is never null, so it is required
            postal_code: { label: 'Postcode', autocomplete: undefined, presence: 'optional' },
        };

        return format;
    });

    // oxlint-disable-next-line vitest/expect-expect -- the assertion is the @ts-expect-error inside, checked by vue-tsc, not by vitest
    it('should fail type-check when a format hides a field every address has', () =>
    {
        // Assert: checked by npm run type-check, not by vitest. street is
        // never null on either side of the union.
        const format: Pick<AddressFormatFor<DutchAddress>, 'street'> = {
            // @ts-expect-error a street is always required
            street: { ...street, presence: 'hidden' },
        };

        return format;
    });
});
