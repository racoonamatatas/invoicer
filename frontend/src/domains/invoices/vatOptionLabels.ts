// Project imports
import type { VatOption } from '@/services/invoices';

// Words, not percentages: the rates are Dutch law and live in the backend,
// which sends them with the totals. A Record over every option, so one added
// later fails to compile until it has a label.
export const VAT_OPTION_LABELS: Record<VatOption, string> = {
    high: 'High rate',
    low: 'Low rate',
    zero: 'Zero rate',
    exempt: 'Exempt from VAT',
};
