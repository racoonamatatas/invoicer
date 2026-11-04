import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import InvoiceEditor from '@/domains/invoices/pages/InvoiceEditor.vue';
import type { BankAccount } from '@/services/bankAccounts';
import * as bankAccountsService from '@/services/bankAccounts';
import * as businessesService from '@/services/businesses';
import * as clientsService from '@/services/clients';
import { AxiosError } from 'axios';

import { UnexpectedResponseError } from '@/services/http';
import * as invoicesService from '@/services/invoices';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { business, jan, logInAs } from '../../../utility/businesses';
import { dutchClient, germanClient } from '../../../utility/clients';
import { createTestRouter } from '../../../utility/createTestRouter';
import { domesticDraftWithLine, newDraft } from '../../../utility/invoices';

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

// A page left mounted keeps loading: after the create test's replace(), it
// would fetch the draft while the next test runs.
enableAutoUnmount(afterEach);

const studio = business(7, 'Studio de Vries');

const bakker = dutchClient(3, 'Fietsenmakerij Bakker');
const huber = germanClient(4, 'Brauerei Huber'); // has a VAT number

const main: BankAccount = { id: 5, iban: 'NL91ABNA0417164300', label: 'Main' };

// Mounts InvoiceEditor on `path` with a fresh Pinia, a logged-in user (the
// store loads nothing without one) and the app's real routes, so its links
// resolve and its replace() lands on a real route.
const mountInvoiceEditor = async (path: string, errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    const router = createTestRouter();
    await router.push(path);

    const wrapper = mount(InvoiceEditor, { global: { plugins: [pinia, router], config: { errorHandler } } });

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
        // Stored as domestic for a client whose suggestion is reverse charge,
        // so a form that prefilled on load would show the difference.
        vi.mocked(invoicesService.fetchInvoice).mockResolvedValue({ invoice: domesticDraftWithLine(11, huber.id, main.id), version: 3 });
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
            // The created draft is shown as it is, without a GET, and not
            // the one fetchInvoice is mocked to return (Brauerei Huber's)
            expect(wrapper.find('h1').text()).toBe('Edit draft for Fietsenmakerij Bakker');
            expect(invoicesService.fetchInvoice).not.toHaveBeenCalled();
        });

        it.for<[failure: string, error: unknown]>([
            ['a 201 (created) that can\'t be read', new UnexpectedResponseError('/businesses/7/invoices')],
            ['no answer at all', new AxiosError('Network Error', AxiosError.ERR_NETWORK)],
            ['a 504 (gateway timeout)', axiosErrorWith(504, {})],
        ])('should send the user to the invoices, not offer the form again, after %s', async ([_failure, error]) =>
        {
            // Arrange: the draft may be stored, so a second press could make
            // a second one
            vi.mocked(invoicesService.createInvoice).mockRejectedValue(error);
            const errorHandler = vi.fn<(error: unknown) => void>();
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/new', errorHandler);
            await flushPromises();
            await fillIn(wrapper, bakker.id, '');

            // Act
            await form(wrapper).trigger('submit');
            await flushPromises();

            // Assert: still reported as a fault, but with no form to retry
            expect(wrapper.text()).toContain('The draft may have been created, but no answer came back that says so.');
            const link = wrapper.findAll('a').find((candidate) => candidate.text() === 'Check the invoices');
            expect(link?.attributes('href')).toBe('/businesses/7/invoices');
            expect(form(wrapper).exists()).toBe(false);
            expect(errorHandler).toHaveBeenCalledOnce();
        });

        it('should link to the created draft, not offer the form again, when the move to its page is cancelled', async () =>
        {
            // Arrange: a guard that cancels the move, as a navigation the user
            // starts meanwhile would
            const { wrapper, router } = await mountInvoiceEditor('/businesses/7/invoices/new');
            await flushPromises();
            router.beforeEach((to) => to.name !== 'editInvoice');
            await fillIn(wrapper, bakker.id, '');

            // Act
            await form(wrapper).trigger('submit');
            await flushPromises();

            // Assert
            expect(router.currentRoute.value.fullPath).toBe('/businesses/7/invoices/new');
            expect(wrapper.text()).toContain('Draft created.');
            const link = wrapper.findAll('a').find((candidate) => candidate.text() === 'Open the draft');
            expect(link?.attributes('href')).toBe('/businesses/7/invoices/11/edit');
            expect(form(wrapper).exists()).toBe(false);
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

        it.for<[typed: string]>([
            ['30 days'],
            ['abc'],
            ['1e1'],
            ['0x1E'],
            ['30.'],
            ['0'],
        ])('should refuse the term %s with a message next to it, and send nothing', async ([typed]) =>
        {
            // Arrange
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/new');
            await flushPromises();

            // Act: no submit, because a disabled submit button blocks one in
            // the browser too, Enter in a field included
            await fillIn(wrapper, bakker.id, typed);

            // Assert: Number() would make some of these NaN, which JSON sends
            // as null, the business default; the others it reads as numbers
            const input = wrapper.find('#invoice-payment_term_days');
            expect(input.attributes('aria-invalid')).toBe('true');
            expect(wrapper.find(`#${input.attributes('aria-describedby')}`).text()).toBe('Enter a whole number of days, like 30.');
            expect(form(wrapper).find('button[type="submit"]').attributes('disabled')).toBeDefined();
            expect(invoicesService.createInvoice).not.toHaveBeenCalled();
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

        it('should show a fresh form, not the last create\'s outcome, on a later visit to the new page', async () =>
        {
            // Arrange: the first move to the draft's page is cancelled, so
            // the page shows "Draft created."
            const { wrapper, router } = await mountInvoiceEditor('/businesses/7/invoices/new');
            await flushPromises();
            let isFirstMove = true;
            router.beforeEach((to) =>
            {
                if (to.name === 'editInvoice' && isFirstMove)
                {
                    isFirstMove = false;

                    return false;
                }

                return true;
            });
            await fillIn(wrapper, bakker.id, '');
            await form(wrapper).trigger('submit');
            await flushPromises();
            expect(wrapper.text()).toContain('Draft created.');

            // Act: to the draft, then back to the new page; the same page
            // instance serves both routes
            await router.push('/businesses/7/invoices/11/edit');
            await flushPromises();
            await router.push('/businesses/7/invoices/new');
            await flushPromises();

            // Assert
            expect(form(wrapper).exists()).toBe(true);
            expect(wrapper.text()).not.toContain('Draft created.');
        });

        it('should link to the bank accounts instead of showing the form when the business has none', async () =>
        {
            // Arrange
            vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([]);

            // Act
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/new');
            await flushPromises();

            // Assert: the heading first, so the missing form isn't just a
            // page that hasn't rendered yet
            expect(wrapper.find('h1').text()).toBe('New invoice');
            const link = wrapper.findAll('a').find((candidate) => candidate.text() === 'Add a bank account first');
            expect(link?.attributes('href')).toBe('/businesses/7/bank-accounts');
            expect(form(wrapper).exists()).toBe(false);
        });

        it.for<[list: string, failing: 'clients' | 'bank accounts']>([
            ['the clients', 'clients'],
            ['the bank accounts', 'bank accounts'],
        ])('should show the form after Try again when %s fail with a 500 (server error), then get a 200 (ok)', async ([_list, failing]) =>
        {
            // Arrange
            const serverError = axiosErrorWith(500, { message: 'Server Error' });

            if (failing === 'clients')
            {
                vi.mocked(clientsService.listClients).mockRejectedValueOnce(serverError);
            }
            else
            {
                vi.mocked(bankAccountsService.listBankAccounts).mockRejectedValueOnce(serverError);
            }

            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/new', vi.fn<(error: unknown) => void>());
            await flushPromises();
            expect(wrapper.find('#invoice-editor-status').text()).toBe(`Couldn't load the ${failing}.`);
            expect(form(wrapper).exists()).toBe(false);

            // Act
            const retry = wrapper.findAll('button').find((button) => button.text() === `Try again with the ${failing}`);
            await retry?.trigger('click');
            await flushPromises();

            // Assert
            expect(form(wrapper).exists()).toBe(true);
            expect(wrapper.find('#invoice-editor-status').text()).toBe('');
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

    describe('editing a draft', () =>
    {
        const editForm = (wrapper: VueWrapper) => wrapper.find('form[aria-label="Edit draft"]');

        const formStatus = (wrapper: VueWrapper): string => editForm(wrapper).find('[role="status"]').text();

        const termValue = (wrapper: VueWrapper): string => (wrapper.find('#invoice-payment_term_days').element as HTMLInputElement).value;

        const saveButton = (wrapper: VueWrapper) => editForm(wrapper).find('button[type="submit"]');

        // The stored draft after a save of `term`, at `version`.
        const savedWithTerm = (term: number, version: number): invoicesService.VersionedInvoice => ({
            invoice: { ...domesticDraftWithLine(11, huber.id, main.id), payment_term_days: term },
            version,
        });

        it('should show the stored fields on a 200 (ok), keeping a stored treatment that differs from the client\'s suggestion', async () =>
        {
            // Act
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
            await flushPromises();

            // Assert: a draft has no number, so the heading names its client
            expect(wrapper.find('h1').text()).toBe('Edit draft for Brauerei Huber');
            expect((wrapper.find('#invoice-client_id').element as HTMLSelectElement).value).toBe(String(huber.id));
            expect((wrapper.find('#invoice-bank_account_id').element as HTMLSelectElement).value).toBe(String(main.id));
            expect(selectedTreatment(wrapper)).toBe('domestic');
            expect(termValue(wrapper)).toBe('14');
        });

        it('should send the loaded version and the stored lines, then the next version on a second save', async () =>
        {
            // Arrange
            vi.mocked(invoicesService.updateInvoice)
                .mockResolvedValueOnce(savedWithTerm(30, 4))
                .mockResolvedValueOnce(savedWithTerm(45, 5));
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
            await flushPromises();

            // Act
            await wrapper.find('#invoice-payment_term_days').setValue('30');
            await editForm(wrapper).trigger('submit');
            await flushPromises();
            await wrapper.find('#invoice-payment_term_days').setValue('45');
            await editForm(wrapper).trigger('submit');
            await flushPromises();

            // Assert: the lines go back as they were stored, without their
            // totals, so saving the fields doesn't delete them
            expect(invoicesService.updateInvoice).toHaveBeenNthCalledWith(1, 7, 11, {
                client_id: huber.id,
                bank_account_id: main.id,
                vat_treatment: 'domestic',
                payment_term_days: 30,
                lines: [{ description: 'Website redesign', quantity_hundredths: 750, unit_price_cents: 8000, vat_option: 'high' }],
            }, 3);
            expect(invoicesService.updateInvoice).toHaveBeenNthCalledWith(2, 7, 11, expect.objectContaining({ payment_term_days: 45 }), 4);
            expect(formStatus(wrapper)).toBe('Saved.');
        });

        it('should keep the edits on a 412 (precondition failed), and show the stored draft after Load the latest version', async () =>
        {
            // Arrange
            vi.mocked(invoicesService.updateInvoice).mockRejectedValue(new invoicesService.InvoiceVersionConflictError(axiosErrorWith(412, {})));
            // A spy standing in for app.config.errorHandler: a 412 is an
            // answer the form shows, not a fault to report
            const errorHandler = vi.fn<(error: unknown) => void>();
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit', errorHandler);
            await flushPromises();
            await wrapper.find('#invoice-payment_term_days').setValue('30');

            // Act
            await editForm(wrapper).trigger('submit');
            await flushPromises();

            // Assert: nothing was stored, so what the user typed stays
            expect(formStatus(wrapper)).toBe('This draft was changed elsewhere. Your edits weren\'t saved.');
            expect(termValue(wrapper)).toBe('30');
            expect(errorHandler).not.toHaveBeenCalled();

            // Act: someone else saved a 60-day term meanwhile
            vi.mocked(invoicesService.fetchInvoice).mockResolvedValue(savedWithTerm(60, 4));
            const load = wrapper.findAll('button').find((button) => button.text() === 'Load the latest version');
            await load?.trigger('click');
            await flushPromises();

            // Assert
            expect(invoicesService.fetchInvoice).toHaveBeenCalledTimes(2);
            expect(termValue(wrapper)).toBe('60');
            expect(formStatus(wrapper)).toBe('');
        });

        it('should hide Saved. once a field is edited again', async () =>
        {
            // Arrange
            vi.mocked(invoicesService.updateInvoice).mockResolvedValue(savedWithTerm(30, 4));
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
            await flushPromises();
            await wrapper.find('#invoice-payment_term_days').setValue('30');
            await editForm(wrapper).trigger('submit');
            await flushPromises();
            expect(formStatus(wrapper)).toBe('Saved.');

            // Act
            await wrapper.find('#invoice-payment_term_days').setValue('31');

            // Assert
            expect(formStatus(wrapper)).toBe('');
        });

        it('should offer the latest version when a save fails with a 500 (server error), and still report the fault', async () =>
        {
            // Arrange: the version the save used may be gone, so retrying
            // with it could only fail again
            vi.mocked(invoicesService.updateInvoice).mockRejectedValue(axiosErrorWith(500, { message: 'Server Error' }));
            const errorHandler = vi.fn<(error: unknown) => void>();
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit', errorHandler);
            await flushPromises();

            // Act
            await editForm(wrapper).trigger('submit');
            await flushPromises();

            // Assert
            expect(formStatus(wrapper)).toBe('Couldn\'t save. Load the latest version before you try again.');
            expect(wrapper.findAll('button').some((button) => button.text() === 'Load the latest version')).toBe(true);
            expect(errorHandler).toHaveBeenCalledOnce();
        });

        it('should disable Save and say why when a draft with lines switches from Dutch VAT to none', async () =>
        {
            // Arrange
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
            await flushPromises();
            expect(saveButton(wrapper).attributes('disabled')).toBeUndefined();

            // Act
            await wrapper.find('#invoice-vat_treatment').setValue('reverse_charge');

            // Assert: the note is linked to the button, for a screen reader
            expect(saveButton(wrapper).attributes('disabled')).toBeDefined();
            const describedBy = saveButton(wrapper).attributes('aria-describedby');
            expect(describedBy).toBeDefined();
            expect(wrapper.find(`#${describedBy}`).text()).toBe('This draft has lines. Switching between Dutch VAT and no VAT comes with the lines editor.');
        });

        it('should say the invoice wasn\'t found on a 404 (not found), and show no form', async () =>
        {
            // Arrange
            vi.mocked(invoicesService.fetchInvoice).mockRejectedValue(new invoicesService.InvoiceNotFoundError(axiosErrorWith(404, {})));

            // Act
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/99/edit');
            await flushPromises();

            // Assert
            expect(wrapper.find('h1').text()).toBe('Invoice not found');
            expect(wrapper.text()).toContain('It doesn\'t exist, or it isn\'t an invoice of Studio de Vries.');
            expect(editForm(wrapper).exists()).toBe(false);
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
