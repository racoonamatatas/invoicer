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
import { createDeferred } from '../../../utility/createDeferred';
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

// Fills the line at `index` the way a user types it: Dutch decimals.
const fillLine = async (wrapper: VueWrapper, index: number, line: { description: string; quantity: string; unitPrice: string; vatOption: string }): Promise<void> =>
{
    await wrapper.find(`#invoice-lines-${index}-description`).setValue(line.description);
    await wrapper.find(`#invoice-lines-${index}-quantity`).setValue(line.quantity);
    await wrapper.find(`#invoice-lines-${index}-unit_price`).setValue(line.unitPrice);
    await wrapper.find(`#invoice-lines-${index}-vat_option`).setValue(line.vatOption);
};

const hosting = { description: 'Hosting', quantity: '7,50', unitPrice: '12,50', vatOption: 'low' };

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

        it('should create a draft with its typed line, and clear the line\'s VAT rate when a client without Dutch VAT is picked', async () =>
        {
            // Arrange: a line for a Dutch client first, with its rate picked
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/new');
            await flushPromises();
            await fillIn(wrapper, bakker.id, '');
            await form(wrapper).findAll('button').find((button) => button.text() === 'Add line')?.trigger('click');
            await fillLine(wrapper, 0, hosting);

            // Act: a German business is reverse charge, so the pick switches the treatment
            await wrapper.find('#invoice-client_id').setValue(String(huber.id));

            // Assert: the user is told, and the rate is gone, not only hidden
            expect(form(wrapper).text()).toContain('The lines\' VAT rates were cleared, because this invoice charges no Dutch VAT.');
            expect(wrapper.find('#invoice-lines-0-vat_option').exists()).toBe(false);

            // Act
            await form(wrapper).trigger('submit');
            await flushPromises();

            // Assert
            expect(invoicesService.createInvoice).toHaveBeenCalledExactlyOnceWith(7, {
                client_id: huber.id,
                bank_account_id: main.id,
                vat_treatment: 'reverse_charge',
                payment_term_days: null,
                lines: [{ description: 'Hosting', quantity_hundredths: 750, unit_price_cents: 1250, vat_option: null }],
            });
        });

        it('should say the totals appear once the draft is created, instead of showing any', async () =>
        {
            // Act
            const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/new');
            await flushPromises();
            await fillIn(wrapper, bakker.id, '');

            // Assert: nothing is stored yet, so there is no total to show
            expect(form(wrapper).text()).toContain('The totals appear once the draft is created.');
            expect(wrapper.find('dl').exists()).toBe(false);
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

        describe('its lines', () =>
        {
            const buttonNamed = (wrapper: VueWrapper, name: string) =>
            {
                const button = editForm(wrapper).findAll('button').find((candidate) => candidate.text() === name);
                if (button === undefined)
                {
                    throw new Error(`No button named ${name}`);
                }

                return button;
            };

            const saveButton = (wrapper: VueWrapper) => editForm(wrapper).find('button[type="submit"]');

            // The stored line, as the payload sends it back.
            const websiteRedesign = { description: 'Website redesign', quantity_hundredths: 750, unit_price_cents: 8000, vat_option: 'high' } as const;

            it('should add an empty line, and remove the line whose button was pressed', async () =>
            {
                // Arrange
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();

                // Act
                await buttonNamed(wrapper, 'Add line').trigger('click');

                // Assert
                expect(editForm(wrapper).findAll('legend').map((legend) => legend.text())).toStrictEqual(['Line 1', 'Line 2']);

                // Act: remove the stored line, not the new one
                await buttonNamed(wrapper, 'Remove line 1').trigger('click');

                // Assert: the new, empty line is left, and is line 1 now
                expect(editForm(wrapper).findAll('legend').map((legend) => legend.text())).toStrictEqual(['Line 1']);
                expect((wrapper.find('#invoice-lines-0-description').element as HTMLInputElement).value).toBe('');
            });

            it('should send a typed "7,50" as 750 hundredths and "12,50" as 1250 cents, after the stored line', async () =>
            {
                // Arrange
                vi.mocked(invoicesService.updateInvoice).mockResolvedValue({ invoice: domesticDraftWithLine(11, huber.id, main.id), version: 4 });
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();
                await buttonNamed(wrapper, 'Add line').trigger('click');
                await fillLine(wrapper, 1, hosting);

                // Act
                await editForm(wrapper).trigger('submit');
                await flushPromises();

                // Assert: the order on screen is the order sent, which is the
                // order stored
                expect(invoicesService.updateInvoice).toHaveBeenCalledExactlyOnceWith(7, 11, expect.objectContaining({
                    lines: [
                        websiteRedesign,
                        { description: 'Hosting', quantity_hundredths: 750, unit_price_cents: 1250, vat_option: 'low' },
                    ],
                }), 3);
            });

            it('should show an unreadable price next to its input and keep Save disabled', async () =>
            {
                // Arrange
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();
                expect(saveButton(wrapper).attributes('disabled')).toBeUndefined();

                // Act
                await wrapper.find('#invoice-lines-0-unit_price').setValue('80,005');

                // Assert: the message is linked to its input, for a screen reader
                const input = wrapper.find('#invoice-lines-0-unit_price');
                expect(input.attributes('aria-invalid')).toBe('true');
                expect(wrapper.find(`#${input.attributes('aria-describedby')}`).text()).toBe('Use at most two decimals.');
                expect(saveButton(wrapper).attributes('disabled')).toBeDefined();
            });

            it('should clear every line\'s VAT rate on a switch to reverse charge, so a switch back needs a new pick', async () =>
            {
                // Arrange
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();
                expect((wrapper.find('#invoice-lines-0-vat_option').element as HTMLSelectElement).value).toBe('high');

                // Act
                await wrapper.find('#invoice-vat_treatment').setValue('reverse_charge');

                // Assert: no line on a reverse-charge invoice has a rate to pick,
                // and the draft can be saved without one
                expect(wrapper.find('#invoice-lines-0-vat_option').exists()).toBe(false);
                expect(saveButton(wrapper).attributes('disabled')).toBeUndefined();

                // Act
                await wrapper.find('#invoice-vat_treatment').setValue('domestic');

                // Assert: cleared, not hidden, so the old rate doesn't come back unseen
                expect((wrapper.find('#invoice-lines-0-vat_option').element as HTMLSelectElement).value).toBe('');
                expect(saveButton(wrapper).attributes('disabled')).toBeDefined();
            });

            it('should show the totals from a save\'s 200 (ok) response, not ones worked out in the browser', async () =>
            {
                // Arrange: totals no browser arithmetic on the line would give,
                // so seeing them proves they were read from the response
                vi.mocked(invoicesService.updateInvoice).mockResolvedValue({
                    invoice: {
                        ...domesticDraftWithLine(11, huber.id, main.id),
                        // Said again: the helper returns any Invoice, so without
                        // it the lines could belong to a reverse-charge one
                        vat_treatment: 'domestic',
                        lines: [{ ...websiteRedesign, total_cents: 11111 }],
                        totals: {
                            subtotal_cents: 11111,
                            vat_groups: [{ vat_option: 'high', rate_percent: 21, base_cents: 11111, vat_cents: 2333 }],
                            vat_cents: 2333,
                            total_cents: 13444,
                        },
                    },
                    version: 4,
                });
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();

                // Act
                await editForm(wrapper).trigger('submit');
                await flushPromises();

                // Assert: \u00a0 is the no-break space Intl puts after the euro sign
                expect(wrapper.find('dl').text()).toContain('VAT high rate (21%) on €\u00a0111,11');
                expect(wrapper.find('dl').text()).toContain('€\u00a0134,44');
                expect(editForm(wrapper).text()).toContain('Line total: €\u00a0111,11');
            });

            it('should replace the totals with an unsaved-changes note once a line is edited', async () =>
            {
                // Arrange
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();
                expect(wrapper.find('dl').text()).toContain('€\u00a0726,00');

                // Act
                await wrapper.find('#invoice-lines-0-quantity').setValue('8');

                // Assert: the stored totals are for 7,5 hours, so showing them now would be wrong
                expect(wrapper.find('dl').exists()).toBe(false);
                expect(editForm(wrapper).text()).not.toContain('Line total');
                expect(editForm(wrapper).text()).toContain('Unsaved changes. The totals update when you save.');
            });

            it('should show a 422 (unprocessable content) on lines.1.unit_price_cents next to line 2\'s price, and keep it there when line 1 is removed', async () =>
            {
                // Arrange
                const message = 'The unit price may not be greater than 100000000.';
                vi.mocked(invoicesService.updateInvoice).mockRejectedValue(axiosErrorWith(422, {
                    message,
                    errors: { 'lines.1.unit_price_cents': [message] },
                }));
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();
                await buttonNamed(wrapper, 'Add line').trigger('click');
                await fillLine(wrapper, 1, hosting);

                // Act
                await editForm(wrapper).trigger('submit');
                await flushPromises();

                // Assert: on line 2 only, and not repeated in the form's status
                const price = wrapper.find('#invoice-lines-1-unit_price');
                expect(price.attributes('aria-invalid')).toBe('true');
                expect(wrapper.find(`#${price.attributes('aria-describedby')}`).text()).toBe(message);
                expect(wrapper.find('#invoice-lines-0-unit_price').attributes('aria-invalid')).toBe('false');
                expect(formStatus(wrapper)).toBe('');

                // Act: line 2 moves up to line 1
                await buttonNamed(wrapper, 'Remove line 1').trigger('click');

                // Assert: the error went with its line, by the index it was sent at
                const moved = wrapper.find('#invoice-lines-0-unit_price');
                expect((moved.element as HTMLInputElement).value).toBe('12,50');
                expect(wrapper.find(`#${moved.attributes('aria-describedby')}`).text()).toBe(message);
            });

            it('should say Saved. and show the line totals after a line edit is saved, and hide both on the next edit', async () =>
            {
                // Arrange
                vi.mocked(invoicesService.updateInvoice).mockResolvedValue({ invoice: domesticDraftWithLine(11, huber.id, main.id), version: 4 });
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();
                await wrapper.find('#invoice-lines-0-description').setValue('Website redesign, phase 2');

                // Act
                await editForm(wrapper).trigger('submit');
                await flushPromises();

                // Assert: the response's line is shown, with its total
                expect(formStatus(wrapper)).toBe('Saved.');
                expect(editForm(wrapper).text()).toContain('Line total: €\u00a0600,00');

                // Act
                await wrapper.find('#invoice-lines-0-description').setValue('Website redesign, phase 3');

                // Assert
                expect(formStatus(wrapper)).toBe('');
                expect(editForm(wrapper).text()).not.toContain('Line total');
            });

            it('should keep a line\'s inputs after a save, so the focus stays where it was', async () =>
            {
                // Arrange
                vi.mocked(invoicesService.updateInvoice).mockResolvedValue({ invoice: domesticDraftWithLine(11, huber.id, main.id), version: 4 });
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();
                const before = wrapper.find('#invoice-lines-0-description').element;

                // Act
                await editForm(wrapper).trigger('submit');
                await flushPromises();

                // Assert: the same element, not a new one in its place
                expect(wrapper.find('#invoice-lines-0-description').element).toBe(before);
            });

            it('should keep showing the totals when an amount is retyped another way', async () =>
            {
                // Arrange
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();

                // Act: the stored line shows 7,5 and 80,00
                await wrapper.find('#invoice-lines-0-quantity').setValue('7,50');
                await wrapper.find('#invoice-lines-0-unit_price').setValue('80');

                // Assert: the same line, so its totals are still the totals
                expect(wrapper.find('dl').text()).toContain('€\u00a0726,00');
                expect(editForm(wrapper).text()).not.toContain('Unsaved changes');
            });

            it('should say why Save is disabled while a line has no quantity, price or VAT rate', async () =>
            {
                // Arrange
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();
                expect(saveButton(wrapper).attributes('aria-describedby')).toBeUndefined();

                // Act
                await buttonNamed(wrapper, 'Add line').trigger('click');

                // Assert: linked to the button, for a screen reader
                expect(saveButton(wrapper).attributes('disabled')).toBeDefined();
                expect(wrapper.find(`#${saveButton(wrapper).attributes('aria-describedby')}`).text())
                    .toBe('Every line needs a quantity, a unit price and a VAT rate before you can save.');
            });

            it('should drop the cleared-rates note once the invoice is back on Dutch VAT', async () =>
            {
                // Arrange
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();
                await wrapper.find('#invoice-vat_treatment').setValue('reverse_charge');
                expect(editForm(wrapper).text()).toContain('VAT rates were cleared');

                // Act
                await wrapper.find('#invoice-vat_treatment').setValue('domestic');

                // Assert: the empty selects and the note by Save say what to do now
                expect(editForm(wrapper).text()).not.toContain('VAT rates were cleared');
            });

            it('should disable Add line at 100 lines, the backend\'s limit', async () =>
            {
                // Arrange: the stored line and 98 more
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();
                for (let added = 0; added < 98; added += 1)
                {
                    await buttonNamed(wrapper, 'Add line').trigger('click');
                }
                expect(buttonNamed(wrapper, 'Add line').attributes('disabled')).toBeUndefined();

                // Act
                await buttonNamed(wrapper, 'Add line').trigger('click');

                // Assert
                expect(editForm(wrapper).findAll('fieldset')).toHaveLength(100);
                expect(buttonNamed(wrapper, 'Add line').attributes('disabled')).toBeDefined();
            });

            it('should keep the lines read-only while a save is in flight', async () =>
            {
                // Arrange: anything typed now would be wiped when the save rebuilds the rows
                const request = createDeferred();
                vi.mocked(invoicesService.updateInvoice).mockImplementation(async () =>
                {
                    await request.promise;

                    return { invoice: domesticDraftWithLine(11, huber.id, main.id), version: 4 };
                });
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();

                // Act
                await editForm(wrapper).trigger('submit');

                // Assert
                expect(wrapper.find('#invoice-lines-0-description').attributes('readonly')).toBeDefined();
                expect(wrapper.find('#invoice-lines-0-quantity').attributes('readonly')).toBeDefined();
                expect(wrapper.find('#invoice-lines-0-unit_price').attributes('readonly')).toBeDefined();
                expect(wrapper.find('#invoice-lines-0-vat_option').attributes('disabled')).toBeDefined();
                expect(buttonNamed(wrapper, 'Remove line 1').attributes('disabled')).toBeDefined();
                expect(buttonNamed(wrapper, 'Add line').attributes('disabled')).toBeDefined();

                // Act: the save answers
                request.resolve();
                await flushPromises();

                // Assert
                expect(wrapper.find('#invoice-lines-0-description').attributes('readonly')).toBeUndefined();
            });

            // A 422 whose message only says what is wrong with one line, as
            // Laravel words it.
            const rejectWithLineError = (key: string, message: string): void =>
            {
                vi.mocked(invoicesService.updateInvoice).mockRejectedValue(axiosErrorWith(422, { message, errors: { [key]: [message] } }));
            };

            it('should show a 422 (unprocessable content) in the form\'s status once the line it names is removed', async () =>
            {
                // Arrange
                const message = 'The unit price may not be greater than 100000000.';
                rejectWithLineError('lines.1.unit_price_cents', message);
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();
                await buttonNamed(wrapper, 'Add line').trigger('click');
                await fillLine(wrapper, 1, hosting);
                await editForm(wrapper).trigger('submit');
                await flushPromises();
                expect(formStatus(wrapper)).toBe('');

                // Act
                await buttonNamed(wrapper, 'Remove line 2').trigger('click');

                // Assert: the line can't show it any more, so the form does
                expect(formStatus(wrapper)).toBe(message);
            });

            it('should show a 422 (unprocessable content) on a VAT rate in the form\'s status once the switch to reverse charge hides the select', async () =>
            {
                // Arrange
                const message = 'The selected lines.0.vat_option is invalid.';
                rejectWithLineError('lines.0.vat_option', message);
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();
                await editForm(wrapper).trigger('submit');
                await flushPromises();
                expect(formStatus(wrapper)).toBe('');

                // Act
                await wrapper.find('#invoice-vat_treatment').setValue('reverse_charge');

                // Assert
                expect(formStatus(wrapper)).toBe(message);
            });

            it('should show a 422 (unprocessable content) on the list itself in the form\'s status', async () =>
            {
                // Arrange: no line has an input for `lines`, so the form must
                // mark it as not displayed
                const message = 'The lines field must not have more than 100 items.';
                rejectWithLineError('lines', message);
                const { wrapper } = await mountInvoiceEditor('/businesses/7/invoices/11/edit');
                await flushPromises();

                // Act
                await editForm(wrapper).trigger('submit');
                await flushPromises();

                // Assert
                expect(formStatus(wrapper)).toBe(message);
            });
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
