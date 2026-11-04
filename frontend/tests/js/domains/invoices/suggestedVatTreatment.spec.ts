import { describe, it, expect } from 'vitest';

import { suggestedVatTreatment } from '@/domains/invoices/suggestedVatTreatment';

import { americanClient, dutchClient, germanClient } from '../../utility/clients';

describe('suggestedVatTreatment', () =>
{
    it('should suggest domestic for a client in NL, even one with a VAT number', () =>
    {
        // Arrange: NL is an EU member, so without the VAT number this would
        // pass even if the NL rule were missing
        const client = { ...dutchClient(1, 'Fietsenmakerij Bakker'), vat_number: 'NL123456789B01' };

        // Act & Assert
        expect(suggestedVatTreatment(client)).toBe('domestic');
    });

    it('should suggest outside_scope for a client outside the EU', () =>
    {
        // Act & Assert
        expect(suggestedVatTreatment(americanClient(1, 'Pine Avenue Design'))).toBe('outside_scope');
    });

    it('should suggest reverse_charge for a client in another EU country with a VAT number', () =>
    {
        // Act & Assert: germanClient carries a VAT number
        expect(suggestedVatTreatment(germanClient(1, 'Brauerei Huber'))).toBe('reverse_charge');
    });

    it('should suggest domestic for a client in another EU country without a VAT number', () =>
    {
        // Arrange: a consumer, who is charged Dutch VAT
        const consumer = { ...germanClient(1, 'Anna Schmidt'), vat_number: null };

        // Act & Assert
        expect(suggestedVatTreatment(consumer)).toBe('domestic');
    });
});
