import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';

import InvoiceTotalsSummary from '@/domains/invoices/components/InvoiceTotalsSummary.vue';

describe('InvoiceTotalsSummary', () =>
{
    it('should show an exempt group by its label and base, without a rate, next to a rated one', () =>
    {
        // Act: the backend sends exempt with rate_percent null
        const wrapper = mount(InvoiceTotalsSummary, {
            props: {
                totals: {
                    subtotal_cents: 70000,
                    vat_groups: [
                        { vat_option: 'high', rate_percent: 21, base_cents: 60000, vat_cents: 12600 },
                        { vat_option: 'exempt', rate_percent: null, base_cents: 10000, vat_cents: 0 },
                    ],
                    vat_cents: 12600,
                    total_cents: 82600,
                },
            },
        });

        // Assert: one term per group, in the order sent
        const terms = wrapper.findAll('dt').map((term) => term.text());
        expect(terms).toStrictEqual([
            'Subtotal',
            'VAT high rate (21%) on € 600,00',
            'Exempt from VAT on € 100,00',
            'Total',
        ]);
    });
});
