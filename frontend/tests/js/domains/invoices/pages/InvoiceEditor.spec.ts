import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';

import InvoiceEditor from '@/domains/invoices/pages/InvoiceEditor.vue';
import { createTestRouter } from '../../../utility/createTestRouter';

// Mounts the placeholder on `path` with the app's real routes, so its link
// resolves the way it does in the app.
const mountInvoiceEditor = async (path: string) =>
{
    const router = createTestRouter();
    await router.push(path);

    return mount(InvoiceEditor, { global: { plugins: [router] } });
};

describe('InvoiceEditor placeholder', () =>
{
    it.each([
        ['a new invoice', '/businesses/7/invoices/new'],
        ['an existing invoice', '/businesses/7/invoices/11/edit'],
    ])('should link back to the invoices of the business in the URL, from %s', async (_page, path) =>
    {
        // Act
        const wrapper = await mountInvoiceEditor(path);

        // Assert: the link names no params, so this proves Vue Router fills in
        // :businessId from the current route
        const back = wrapper.findAll('a').find((link) => link.text() === 'Back to the invoices');
        expect(back?.attributes('href')).toBe('/businesses/7/invoices');
    });
});
