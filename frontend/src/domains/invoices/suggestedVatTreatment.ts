// Project imports
import { isEuMemberState } from '@/services/address';
import type { Client } from '@/services/clients';
import type { VatTreatment } from '@/services/invoices';

// The treatment the editor fills in when a client is picked. A suggestion,
// not a verdict: the user can change it, and the backend validates the
// choice. Only the client's country and VAT number go into it, so a case
// those can't tell apart (a consumer outside the EU, who is often charged
// Dutch VAT) is left for the user to correct.
export const suggestedVatTreatment = (client: Client): VatTreatment =>
{
    if (client.country_code === 'NL')
    {
        return 'domestic';
    }

    if (!isEuMemberState(client.country_code))
    {
        return 'outside_scope';
    }

    // An EU business with a VAT number accounts for the VAT itself. Without
    // one the client counts as a consumer, who is charged Dutch VAT.
    return client.vat_number === null ? 'domestic' : 'reverse_charge';
};
