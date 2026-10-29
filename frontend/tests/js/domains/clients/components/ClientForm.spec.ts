import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';

import ClientForm from '@/domains/clients/components/ClientForm.vue';
import type { Client, ClientPayload } from '@/services/clients';

// Mounted on its own, not through the clients page: a business can only be
// Dutch today, so the page can't start a form with another country.
const mountNewClientForm = () =>
{
    return mount(ClientForm, {
        props: {
            initial: { kind: 'new', countryCode: 'DE' },
            label: 'Add a client',
            submitLabel: 'Add',
            save: vi.fn<(payload: ClientPayload) => Promise<Client>>(),
            savedMessage: 'Added.',
        },
    });
};

describe('ClientForm', () =>
{
    it('should start a new client with the country it is given selected, and that country\'s fields shown', () =>
    {
        // Act
        const wrapper = mountNewClientForm();

        // Assert: DE, not the NL the empty address starts from, and Region,
        // which a Dutch address hides
        expect(wrapper.find<HTMLSelectElement>('#client-country_code').element.value).toBe('DE');
        expect(wrapper.find('#client-region').exists()).toBe(true);
    });
});
