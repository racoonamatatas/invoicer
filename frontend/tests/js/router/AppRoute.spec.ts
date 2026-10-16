import { describe, it, expect } from 'vitest';

import { AppRoute } from '@/router/AppRoute';

// Never rendered: the route only passes it through to its record.
const page = {};

describe('AppRoute', () =>
{
    it('should give a record with meta.public false when public() was not called', () =>
    {
        // Arrange
        const route = new AppRoute('/', 'dashboard', page);

        // Act
        const record = route.toRecord();

        // Assert: the whole record, so a missing or extra field fails too
        expect(record).toStrictEqual({ path: '/', name: 'dashboard', component: page, meta: { public: false } });
    });
});
