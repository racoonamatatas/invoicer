import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import InvoiceEditor from '@/domains/invoices/pages/InvoiceEditor.vue';
import type { BankAccount } from '@/services/bankAccounts';
import * as bankAccountsService from '@/services/bankAccounts';
import * as businessesService from '@/services/businesses';
import * as clientsService from '@/services/clients';
import * as invoicesService from '@/services/invoices';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { business, jan, logInAs } from '../../../utility/businesses';
import { dutchClient, germanClient } from '../../../utility/clients';
import { createTestRouter } from '../../../utility/createTestRouter';
import { newDraft } from '../../../utility/invoices';

// Every export of these services becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');
vi.mock('@/services/bankAccounts');
vi.mock('@/services/businesses');
vi.mock('@/services/clients');
// Only the requests are faked here. An automock empties every exported array,
// so VAT_TREATMENTS would be [] and the VAT select would have no options.
vi.mock('@/services/invoices', async (importOriginal) => ({
    ...await importOriginal<typeof invoicesService>(),
    listInvoices: vi.fn<typeof invoicesService.listInvoices>(),
    fetchInvoice: vi.fn<typeof invoicesService.fetchInvoice>(),
    createInvoice: vi.fn<typeof invoicesService.createInvoice>(),
    updateInvoice: vi.fn<typeof invoicesService.updateInvoice>(),
    deleteInvoice: vi.fn<typeof invoicesService.deleteInvoice>(),
}));

const studio = business(7, 'Studio de Vries');

const bakker = dutchClient(3, 'Fietsenmakerij Bakker');
const huber = germanClient(4, 'Brauerei Huber'); // has a VAT number

const main: BankAccount = { id: 5, iban: 'NL91ABNA0417164300', label: 'Main' };

// Mounts InvoiceEditor on `path` with a fresh Pinia, a logged-in user (the
// store loads nothing without one) and the app's real routes, so its links
// resolve and its replace() lands on a real route.
const mountInvoiceEditor = async (path: string) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    const router = createTestRouter();
    await router.push(path);

    const wrapper = mount(InvoiceEditor, { global: { plugins: [pinia, router] } });

    return { wrapper, router };
};

const form = (wrapper: VueWrapper) => wrapper.find('form[aria-label="New invoice"]');

const selectedTreatment = (wrapper: VueWrapper): string => (wrapper.find('#invoice-vat_treatment').element as HTMLSelectElement).value;

// Picks a client and the bank account, and fills the term: what a user does
// before Create draft.
const fillIn = async (wrapper: VueWrapper, clientId: number, term: string): Promise<void> =>
{
    await wrapper.find('#invoice-client_id').setValue(String(clientId));
    await wrapper.find('#invoice-bank_account_id').setValue(String(main.id));
    await wrapper.find('#invoice-payment_term_days').setValue(term);
};

describe('InvoiceEditor page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
        vi.mocked(businessesService.listBusinesses).mockResolvedValue([studio]);
        vi.mocked(clientsService.listClients).mockResolvedValue([bakker, huber]);
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([main]);
        vi.mocked(invoicesService.createInvoice).mockResolvedValue(newDraft(11, bakker.id, main.id));
    });

    describe('creating a draft', () =>
    {
        it('should send the picked fields with no lines, and on a 201 (created) replace the URL with the draft\'s edit page', async () =>
        {
            // Arrange
            const { wrapper, router } = await mountInvoiceEditor('/businesses/7/invoices/new');
            await flushPromises();
            await fillIn(wrapper, bakker.id, '');

            // Act
            await form(wrapper).trigger('submit');
            await flushPromises();

            // Assert
            expect(invoicesService.createInvoice).toHaveBeenCalledExactlyOnceWith(7, {
                client_id: bakker.id,
                bank_account_id: main.id,
                vat_treatment: 'domestic',
                payment_term_days: null,
                lines: [],
            });
            expect(router.currentRoute.value.fullPath).toBe('/businesses/7/invoices/11/edit');
        });

        it.for<[description: string, typed: string, sent: number | null]>([
            ['an empty term as null, the business default', '', null],
            ['blank space as null too', '   ', null],
            ['30 as the number 30', '30', 30],
        ])('should send %s', async ([_description, typed, sent]) =>
        {
            // Arrange
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/new');
            await flushPromises();
            await fillIn(wrapper, bakker.id, typed);

            // Act
            await form(wrapper).trigger('submit');
            await flushPromises();

            // Assert
            expect(invoicesService.createInvoice).toHaveBeenCalledExactlyOnceWith(7, expect.objectContaining({ payment_term_days: sent }));
        });

        it('should fill in the VAT treatment from each client picked, replacing one chosen by hand', async () =>
        {
            // Arrange
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/new');
            await flushPromises();
            await wrapper.find('#invoice-client_id').setValue(String(bakker.id));
            expect(selectedTreatment(wrapper)).toBe('domestic');

            // The user overrides the suggestion, so the next pick has to
            // replace a hand-picked value, not only an empty one
            await wrapper.find('#invoice-vat_treatment').setValue('outside_scope');

            // Act
            await wrapper.find('#invoice-client_id').setValue(String(huber.id));

            // Assert
            expect(selectedTreatment(wrapper)).toBe('reverse_charge');
        });

        it('should show a 422 (unprocessable content) on vat_treatment next to its select and stay on the new page', async () =>
        {
            // Arrange
            const message = 'Reverse charge needs a client in another EU country with a VAT number.';
            vi.mocked(invoicesService.createInvoice).mockRejectedValue(axiosErrorWith(422, {
                message,
                errors: { vat_treatment: [message] },
            }));
            const { wrapper, router } = await mountInvoiceEditor('/businesses/7/invoices/new');
            await flushPromises();
            await fillIn(wrapper, bakker.id, '');

            // Act
            await form(wrapper).trigger('submit');
            await flushPromises();

            // Assert: the message is linked to its select, for a screen reader
            const select = wrapper.find('#invoice-vat_treatment');
            expect(select.attributes('aria-invalid')).toBe('true');
            const describedBy = select.attributes('aria-describedby');
            expect(describedBy).toBeDefined();
            expect(wrapper.find(`#${describedBy}`).text()).toBe(message);
            expect(router.currentRoute.value.fullPath).toBe('/businesses/7/invoices/new');
        });

        it('should keep Create draft disabled until a client and a bank account are picked', async () =>
        {
            // Arrange
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/new');
            await flushPromises();
            const button = () => wrapper.find('form button[type="submit"]');
            expect(button().attributes('disabled')).toBeDefined();

            // Act
            await wrapper.find('#invoice-client_id').setValue(String(bakker.id));

            // Assert: one pick isn't enough, both are
            expect(button().attributes('disabled')).toBeDefined();
            await wrapper.find('#invoice-bank_account_id').setValue(String(main.id));
            expect(button().attributes('disabled')).toBeUndefined();
        });

        it('should link to the clients instead of showing the form when the business has no clients', async () =>
        {
            // Arrange
            vi.mocked(clientsService.listClients).mockResolvedValue([]);

            // Act
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/new');
            await flushPromises();

            // Assert: the heading first, so the missing form isn't just a
            // page that hasn't rendered yet
            expect(wrapper.find('h1').text()).toBe('New invoice');
            const link = wrapper.findAll('a').find((candidate) => candidate.text() === 'Add a client first');
            expect(link?.attributes('href')).toBe('/businesses/7/clients');
            expect(form(wrapper).exists()).toBe(false);
        });
    });

    it.for<[page: string, path: string]>([
        ['a new invoice', '/businesses/7/invoices/new'],
        ['an existing invoice', '/businesses/7/invoices/11/edit'],
    ])('should link back to the invoices of the business in the URL, from %s', async ([_page, path]) =>
    {
        // Act
        const { wrapper } = await mountInvoiceEditor(path);
        await flushPromises();

        // Assert: the link names no params, so this proves Vue Router fills in
        // :businessId from the current route
        const back = wrapper.findAll('a').find((link) => link.text() === 'Back to the invoices');
        expect(back?.attributes('href')).toBe('/businesses/7/invoices');
    });
});
