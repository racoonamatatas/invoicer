import { describe, it, expect } from 'vitest';

import type { ClientPayload } from '@/services/clients';
import type { New } from '@/services/entity';

// These are type-level tests: vue-tsc checks this file, and an
// `@ts-expect-error` with no error under it fails the build. The runtime
// assertions only give Vitest a test to run.
describe('New<T>', () =>
{
    it('should reject a Dutch client payload that has a region, keeping the halves of the Address union apart', () =>
    {
        // Arrange
        // `as const` keeps `country_code` the literal `'NL'` instead of
        // `string`, and leaving the object unannotated lets that literal
        // reach the spread below instead of widening to either half of the
        // union.
        const dutchFields = {
            name: 'Bakkerij Groen',
            email: 'info@bakkerijgroen.nl',
            vat_number: null,
            street: 'Vismarkt',
            house_number: '12',
            house_number_addition: null,
            postal_code: '9711 KT',
            city: 'Groningen',
            region: null,
            country_code: 'NL' as const,
        };

        // Act
        // The two differ only in `region`, so the directive can't be
        // satisfied by some other error: a renamed or new field fails the
        // first line too.
        const payload: ClientPayload = dutchFields;
        // @ts-expect-error a Dutch address has no region: a plain Omit merges the halves and lets this through
        const withRegion: ClientPayload = { ...dutchFields, region: 'Groningen' };

        // Assert
        expect(payload.region).toBeNull();
        expect(withRegion.region).toBe('Groningen');
    });

    it('should keep a key that only one member of the union has', () =>
    {
        // Arrange
        // Declared here because no service has such a union yet. A plain
        // Omit keeps only the keys both members share (`kind`), so
        // `hours_hundredths` would be rejected as an unknown property.
        type Line = { id: number; kind: 'hourly'; hours_hundredths: number } | { id: number; kind: 'fixed'; amount_cents: number };

        // Act
        const line: New<Line> = { kind: 'hourly', hours_hundredths: 750 };

        // Assert
        expect(line).toEqual({ kind: 'hourly', hours_hundredths: 750 });
    });

    it('should refuse a type without the server-assigned fields', () =>
    {
        // Arrange
        // A payload has no id, so `New` of one has nothing to strip: without
        // the constraint it would return the type unchanged.
        type NotAnEntity = { label: string };

        // Act
        // @ts-expect-error `NotAnEntity` has no `id`, so it doesn't satisfy `Identified`
        const value: New<NotAnEntity> = { label: 'Zakelijk' };

        // Assert
        expect(value).toEqual({ label: 'Zakelijk' });
    });
});
