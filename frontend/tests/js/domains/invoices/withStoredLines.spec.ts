import { describe, it, expect } from 'vitest';

import { withStoredLines } from '@/domains/invoices/withStoredLines';
import type { Invoice } from '@/services/invoices';

import { domesticDraftWithLine, newDraft, reverseChargeDraftWithLine } from '../../utility/invoices';

const fields = { client_id: 3, bank_account_id: 5, payment_term_days: null } as const;

describe('withStoredLines', () =>
{
    it('should send a domestic draft\'s lines back with their VAT options and without their totals', () =>
    {
        // Act
        const payload = withStoredLines({ ...fields, vat_treatment: 'domestic' }, domesticDraftWithLine(11, 3, 5));

        // Assert: total_cents is computed by the backend, never sent
        expect(payload).toStrictEqual({
            ...fields,
            vat_treatment: 'domestic',
            lines: [{ description: 'Website redesign', quantity_hundredths: 750, unit_price_cents: 8000, vat_option: 'high' }],
        });
    });

    it('should send the lines back on a switch between the two treatments without VAT', () =>
    {
        // Act
        const payload = withStoredLines({ ...fields, vat_treatment: 'outside_scope' }, reverseChargeDraftWithLine(11, 4, 5));

        // Assert
        expect(payload).toStrictEqual({
            ...fields,
            vat_treatment: 'outside_scope',
            lines: [{ description: 'Website redesign', quantity_hundredths: 750, unit_price_cents: 8000, vat_option: null }],
        });
    });

    it('should allow a switch from Dutch VAT to none on a draft without lines', () =>
    {
        // Act
        const payload = withStoredLines({ ...fields, vat_treatment: 'reverse_charge' }, newDraft(11, 3, 5).invoice);

        // Assert
        expect(payload).toStrictEqual({ ...fields, vat_treatment: 'reverse_charge', lines: [] });
    });

    it.for<[from: string, treatment: 'domestic' | 'reverse_charge', draft: Invoice]>([
        ['Dutch VAT to none', 'reverse_charge', domesticDraftWithLine(11, 3, 5)],
        ['none to Dutch VAT', 'domestic', reverseChargeDraftWithLine(11, 4, 5)],
    ])('should refuse a switch from %s on a draft with lines', ([_from, treatment, draft]) =>
    {
        // Act & Assert: each line would need its VAT option added or removed,
        // which is the lines editor's job
        expect(withStoredLines({ ...fields, vat_treatment: treatment }, draft)).toBeNull();
    });
});
