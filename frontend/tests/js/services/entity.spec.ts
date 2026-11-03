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
        // @ts-expect-error a Dutch address has no region: a plain Omit merges the halves and lets this through
        const payload: ClientPayload = {
            name: 'Bakkerij Groen',
            email: 'info@bakkerijgroen.nl',
            vat_number: null,
            street: 'Vismarkt',
            house_number: '12',
            house_number_addition: null,
            postal_code: '9711 KT',
            city: 'Groningen',
            region: 'Groningen',
            country_code: 'NL',
        };

        // Assert
        expect(payload.country_code).toBe('NL');
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
});
