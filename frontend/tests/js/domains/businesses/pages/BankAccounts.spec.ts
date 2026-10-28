import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import BankAccounts from '@/domains/businesses/pages/BankAccounts.vue';
import * as bankAccountsService from '@/services/bankAccounts';
import { BankAccountNotFoundError, type BankAccount } from '@/services/bankAccounts';
import * as businessesService from '@/services/businesses';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { business, jan, logInAs } from '../../../utility/businesses';
import { createDeferred } from '../../../utility/createDeferred';
import { createTestRouter } from '../../../utility/createTestRouter';

// Every export of the three services becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');
vi.mock('@/services/businesses');
vi.mock('@/services/bankAccounts');

const bakery = business(1, 'Bakkerij de Vries');
const studio = business(2, 'Studio de Vries');

const main: BankAccount = { id: 3, iban: 'NL91ABNA0417164300', label: 'Main' };
const savings: BankAccount = { id: 4, iban: 'NL02RABO0123456789', label: 'Savings' };

// Mounts BankAccounts on /businesses/<businessId>/bank-accounts with a fresh
// Pinia, a logged-in user (the store loads nothing without one) and the app's
// real routes, so its RouterLinks resolve.
// attachTo puts the page in the document, which a focus test needs.
const mountBankAccounts = async (businessId: string, errorHandler?: (error: unknown) => void, attachTo?: HTMLElement) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    const router = createTestRouter();
    await router.push(`/businesses/${businessId}/bank-accounts`);

    const wrapper = mount(BankAccounts, { attachTo, global: { plugins: [pinia, router], config: { errorHandler } } });

    return { wrapper, router };
};

// Fills the add form the way a user types, and submits it.
const addAccount = async (wrapper: VueWrapper, iban: string, label: string): Promise<void> =>
{
    await wrapper.find('#bank-account-iban').setValue(iban);
    await wrapper.find('#bank-account-label').setValue(label);
    await wrapper.find('form[aria-label="Add a bank account"]').trigger('submit');
};

// Each listed account as "<label> <grouped IBAN>", without the row's buttons.
const listedAccounts = (wrapper: VueWrapper): string[] =>
    wrapper.findAll('ul[aria-label="Bank accounts"] li').map((row) => row.find('span').text());

const clickButton = async (wrapper: VueWrapper, name: string): Promise<void> =>
{
    await wrapper.find(`button[aria-label="${name}"]`).trigger('click');
};

const renameForm = (wrapper: VueWrapper, label: string) => wrapper.find(`form[aria-label="Rename ${label}"]`);

const deleteGroup = (wrapper: VueWrapper, label: string) => wrapper.find(`[role="group"][aria-label="Delete ${label}?"]`);

const clickIn = async (container: ReturnType<VueWrapper['find']>, text: string): Promise<void> =>
{
    await container.findAll('button').find((button) => button.text() === text)?.trigger('click');
};

const addFormStatus = (wrapper: VueWrapper): string => wrapper.find('form[aria-label="Add a bank account"] [role="status"]').text();

describe('BankAccounts page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
        vi.mocked(businessesService.listBusinesses).mockResolvedValue([bakery, studio]);
    });

    it('should list each account\'s label and IBAN, grouped in fours, when listBankAccounts gets a 200 (ok)', async () =>
    {
        // Arrange
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([main, savings]);

        // Act
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();

        // Assert
        expect(bankAccountsService.listBankAccounts).toHaveBeenCalledExactlyOnceWith(1);
        expect(wrapper.find('h1').text()).toBe('Bank accounts · Bakkerij de Vries');
        expect(listedAccounts(wrapper)).toStrictEqual([
            'Main NL91 ABNA 0417 1643 00',
            'Savings NL02 RABO 0123 4567 89',
        ]);
        expect(wrapper.find('[role="status"]').text()).toBe('');
        expect(wrapper.find('#bank-accounts-status').text()).toBe('');
    });

    it('should say there are no bank accounts yet when listBankAccounts gets a 200 (ok) with an empty list', async () =>
    {
        // Arrange
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([]);

        // Act
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();

        // Assert
        expect(wrapper.text()).toContain('No bank accounts yet.');
        expect(wrapper.find('ul[aria-label="Bank accounts"]').exists()).toBe(false);
    });

    it('should show Loading bank accounts... in the accounts\' status region while listBankAccounts is in flight', async () =>
    {
        // Arrange: listBankAccounts is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(bankAccountsService.listBankAccounts).mockReturnValue(request.promise.then(() => [main]));

        // Act
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();

        // Assert: the business is found, its accounts aren't in yet
        expect(wrapper.find('h1').text()).toBe('Bank accounts · Bakkerij de Vries');
        expect(wrapper.find('#bank-accounts-status').text()).toBe('Loading bank accounts...');
        expect(wrapper.find('ul[aria-label="Bank accounts"]').exists()).toBe(false);

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });

    it('should show the failure with a Try again button beside it and hand the error on when listBankAccounts fails with a 500 (server error)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(bankAccountsService.listBankAccounts).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();

        // Act
        const { wrapper } = await mountBankAccounts('1', errorHandler);
        await flushPromises();

        // Assert (outcome): the user is told, and can retry from right there: the button shares the message's line
        const status = wrapper.find('#bank-accounts-status');
        expect(status.text()).toBe('Couldn\'t load the bank accounts.');
        const retry = wrapper.findAll('button').find((button) => button.text() === 'Try again');
        expect(retry?.element.parentElement).toBe(status.element.parentElement);

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledExactlyOnceWith(error, expect.anything(), expect.anything());
    });

    it('should show the list after Try again when listBankAccounts first fails with a 500 (server error) and then gets a 200 (ok)', async () =>
    {
        // Arrange
        vi.mocked(bankAccountsService.listBankAccounts)
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }))
            .mockResolvedValueOnce([main]);
        const { wrapper } = await mountBankAccounts('1', () => undefined);
        await flushPromises();

        // Act
        const retry = wrapper.findAll('button').find((button) => button.text() === 'Try again');
        await retry?.trigger('click');
        await flushPromises();

        // Assert
        expect(bankAccountsService.listBankAccounts).toHaveBeenCalledTimes(2);
        expect(listedAccounts(wrapper)).toStrictEqual(['Main NL91 ABNA 0417 1643 00']);
        expect(wrapper.find('#bank-accounts-status').text()).toBe('');
    });

    it('should show not found without calling listBankAccounts when listBusinesses gets a 200 (ok) without the id in the URL', async () =>
    {
        // Act
        const { wrapper } = await mountBankAccounts('99');
        await flushPromises();

        // Assert: the business list was answered, and no account request followed it
        expect(businessesService.listBusinesses).toHaveBeenCalledOnce();
        expect(wrapper.find('h1').text()).toBe('Business not found');
        expect(bankAccountsService.listBankAccounts).not.toHaveBeenCalled();
    });

    it('should show only the new business\'s accounts when the URL changes while the old business\'s list is still in flight', async () =>
    {
        // Arrange: business 1's request is held, business 2's answers at once
        const bakeryRequest = createDeferred();
        vi.mocked(bankAccountsService.listBankAccounts).mockImplementation((businessId) =>
            (businessId === 1 ? bakeryRequest.promise.then(() => [main]) : Promise.resolve([savings])));
        const { wrapper, router } = await mountBankAccounts('1');
        await flushPromises();

        // Act: the page stays mounted while only the param changes, then the old answer arrives last
        await router.push('/businesses/2/bank-accounts');
        await flushPromises();
        bakeryRequest.resolve();
        await flushPromises();

        // Assert
        expect(wrapper.find('h1').text()).toBe('Bank accounts · Studio de Vries');
        expect(listedAccounts(wrapper)).toStrictEqual(['Savings NL02 RABO 0123 4567 89']);
    });

    it('should link back to its dashboard and to /businesses when the business is found', async () =>
    {
        // Arrange
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([]);

        // Act
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();

        // Assert: found by their text the way a user finds them
        const hrefOf = (text: string) => wrapper.findAll('a').find((anchor) => anchor.text() === text)?.attributes('href');
        expect(hrefOf('Back to the dashboard')).toBe('/businesses/1');
        expect(hrefOf('Your businesses')).toBe('/businesses');
    });

    it('should send the IBAN as typed, show the reloaded list, clear the form and say Added. when createBankAccount gets a 201 (created)', async () =>
    {
        // Arrange: the first list is empty, the reload after the add has the account
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValueOnce([]).mockResolvedValueOnce([main]);
        vi.mocked(bankAccountsService.createBankAccount).mockResolvedValue(main);
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();

        // Act
        await addAccount(wrapper, 'nl91 abna 0417 1643 00', 'Main');
        await flushPromises();

        // Assert: spaces and lowercase are the backend's to normalise
        expect(bankAccountsService.createBankAccount).toHaveBeenCalledExactlyOnceWith(1, { iban: 'nl91 abna 0417 1643 00', label: 'Main' });
        expect(listedAccounts(wrapper)).toStrictEqual(['Main NL91 ABNA 0417 1643 00']);
        expect((wrapper.find('#bank-account-iban').element as HTMLInputElement).value).toBe('');
        expect((wrapper.find('#bank-account-label').element as HTMLInputElement).value).toBe('');
        expect(addFormStatus(wrapper)).toBe('Added.');
    });

    it('should show a 422 (unprocessable content) on iban next to the IBAN input, keep what was typed and not reload the list', async () =>
    {
        // Arrange
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([main]);
        vi.mocked(bankAccountsService.createBankAccount).mockRejectedValue(axiosErrorWith(422, {
            message: 'The iban has already been taken.',
            errors: { iban: ['The iban has already been taken.'] },
        }));
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();

        // Act
        await addAccount(wrapper, 'NL91ABNA0417164300', 'Second');
        await flushPromises();

        // Assert: the message is linked to its input, for a screen reader
        const input = wrapper.find('#bank-account-iban');
        expect(input.attributes('aria-invalid')).toBe('true');
        const describedBy = input.attributes('aria-describedby');
        expect(describedBy).toBeDefined();
        expect(wrapper.find(`#${describedBy}`).text()).toBe('The iban has already been taken.');

        expect((input.element as HTMLInputElement).value).toBe('NL91ABNA0417164300');
        expect((wrapper.find('#bank-account-label').element as HTMLInputElement).value).toBe('Second');
        expect(bankAccountsService.listBankAccounts).toHaveBeenCalledOnce();
        expect(addFormStatus(wrapper)).toBe('');
    });

    it('should say Couldn\'t add. and hand the error on when createBankAccount fails with a 500 (server error)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([]);
        vi.mocked(bankAccountsService.createBankAccount).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const { wrapper } = await mountBankAccounts('1', errorHandler);
        await flushPromises();

        // Act
        await addAccount(wrapper, 'NL91ABNA0417164300', 'Main');
        await flushPromises();

        // Assert
        expect(addFormStatus(wrapper)).toBe('Couldn\'t add.');
        expect(errorHandler).toHaveBeenCalledExactlyOnceWith(error, expect.anything(), expect.anything());
    });

    it('should disable Add and make both inputs read-only while createBankAccount is in flight', async () =>
    {
        // Arrange: createBankAccount is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([]);
        vi.mocked(bankAccountsService.createBankAccount).mockReturnValue(request.promise.then(() => main));
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();
        const add = wrapper.findAll('button').find((button) => button.text() === 'Add');

        // Act
        await addAccount(wrapper, 'NL91ABNA0417164300', 'Main');

        // Assert: typing now would be wiped when the success clears the form
        expect(add?.attributes('disabled')).toBeDefined();
        expect(wrapper.find('#bank-account-iban').attributes('readonly')).toBeDefined();
        expect(wrapper.find('#bank-account-label').attributes('readonly')).toBeDefined();

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
        expect(add?.attributes('disabled')).toBeUndefined();
    });

    it('should empty the add form when the URL changes to another business', async () =>
    {
        // Arrange
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([]);
        const { wrapper, router } = await mountBankAccounts('1');
        await flushPromises();
        await wrapper.find('#bank-account-iban').setValue('NL91ABNA0417164300');

        // Act: the page stays mounted while only the param changes
        await router.push('/businesses/2/bank-accounts');
        await flushPromises();

        // Assert: the switch rendered, and what was typed for business 1 is gone
        expect(wrapper.find('h1').text()).toBe('Bank accounts · Studio de Vries');
        expect((wrapper.find('#bank-account-iban').element as HTMLInputElement).value).toBe('');
    });

    it('should open a rename form holding the current label, with the input focused, when Rename is clicked', async () =>
    {
        // Arrange: attached to the document, where focus exists
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([main, savings]);
        const { wrapper } = await mountBankAccounts('1', undefined, document.body);
        await flushPromises();

        // Act
        await clickButton(wrapper, 'Rename Main');

        // Assert
        const input = renameForm(wrapper, 'Main').find('input');
        expect((input.element as HTMLInputElement).value).toBe('Main');
        expect(document.activeElement).toBe(input.element);

        wrapper.unmount();
    });

    it('should send the new label, close the form and show the reloaded list when updateBankAccountLabel gets a 200 (ok)', async () =>
    {
        // Arrange: the reload after the save has the new label
        const renamed = { ...main, label: 'Business' };
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValueOnce([main]).mockResolvedValueOnce([renamed]);
        vi.mocked(bankAccountsService.updateBankAccountLabel).mockResolvedValue(renamed);
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();
        await clickButton(wrapper, 'Rename Main');

        // Act
        await renameForm(wrapper, 'Main').find('input').setValue('Business');
        await renameForm(wrapper, 'Main').trigger('submit');
        await flushPromises();

        // Assert
        expect(bankAccountsService.updateBankAccountLabel).toHaveBeenCalledExactlyOnceWith(1, 3, { label: 'Business' });
        expect(wrapper.find('form[aria-label^="Rename"]').exists()).toBe(false);
        expect(listedAccounts(wrapper)).toStrictEqual(['Business NL91 ABNA 0417 1643 00']);
    });

    it('should show a 422 (unprocessable content) on label under the rename input, apart from an add form error on label, and keep the form open', async () =>
    {
        // Arrange: both forms answer with an error on label, so both show one at once
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([main, savings]);
        vi.mocked(bankAccountsService.createBankAccount).mockRejectedValue(axiosErrorWith(422, {
            message: 'The label field is required.',
            errors: { label: ['The label field is required.'] },
        }));
        vi.mocked(bankAccountsService.updateBankAccountLabel).mockRejectedValue(axiosErrorWith(422, {
            message: 'The label has already been taken.',
            errors: { label: ['The label has already been taken.'] },
        }));
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();
        await addAccount(wrapper, 'NL91ABNA0417164300', ' ');
        await flushPromises();
        await clickButton(wrapper, 'Rename Main');

        // Act
        await renameForm(wrapper, 'Main').find('input').setValue('Savings');
        await renameForm(wrapper, 'Main').trigger('submit');
        await flushPromises();

        // Assert: each input points at its own message; a shared id would point both at the first
        const describedBy = renameForm(wrapper, 'Main').find('input').attributes('aria-describedby');
        expect(describedBy).toBeDefined();
        expect(wrapper.findAll(`#${describedBy}`).map((element) => element.text())).toStrictEqual(['The label has already been taken.']);
        const addDescribedBy = wrapper.find('#bank-account-label').attributes('aria-describedby');
        expect(wrapper.findAll(`#${addDescribedBy}`).map((element) => element.text())).toStrictEqual(['The label field is required.']);
        expect((renameForm(wrapper, 'Main').find('input').element as HTMLInputElement).value).toBe('Savings');
    });

    it('should say Couldn\'t save. and hand the error on when updateBankAccountLabel fails with a 500 (server error)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([main]);
        vi.mocked(bankAccountsService.updateBankAccountLabel).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const { wrapper } = await mountBankAccounts('1', errorHandler);
        await flushPromises();
        await clickButton(wrapper, 'Rename Main');

        // Act
        await renameForm(wrapper, 'Main').trigger('submit');
        await flushPromises();

        // Assert
        expect(renameForm(wrapper, 'Main').find('[role="status"]').text()).toBe('Couldn\'t save.');
        expect(errorHandler).toHaveBeenCalledExactlyOnceWith(error, expect.anything(), expect.anything());
    });

    it('should close the rename form without a request and show the label again when Cancel is clicked', async () =>
    {
        // Arrange
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([main]);
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();
        await clickButton(wrapper, 'Rename Main');
        await renameForm(wrapper, 'Main').find('input').setValue('Business');

        // Act
        await renameForm(wrapper, 'Main').findAll('button').find((button) => button.text() === 'Cancel')?.trigger('click');

        // Assert
        expect(renameForm(wrapper, 'Main').exists()).toBe(false);
        expect(listedAccounts(wrapper)).toStrictEqual(['Main NL91 ABNA 0417 1643 00']);
        expect(bankAccountsService.updateBankAccountLabel).not.toHaveBeenCalled();
    });

    it('should keep one rename form open at a time: Rename on another row closes the first', async () =>
    {
        // Arrange
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([main, savings]);
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();
        await clickButton(wrapper, 'Rename Main');

        // Act
        await clickButton(wrapper, 'Rename Savings');

        // Assert
        expect(wrapper.findAll('form[aria-label^="Rename"]').map((form) => form.attributes('aria-label'))).toStrictEqual(['Rename Savings']);
    });

    it('should ask before deleting: Delete opens a confirm with Cancel focused and sends nothing yet', async () =>
    {
        // Arrange: attached to the document, where focus exists
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([main, savings]);
        const { wrapper } = await mountBankAccounts('1', undefined, document.body);
        await flushPromises();

        // Act: flushed, so a request sent on this click would have been made
        await clickButton(wrapper, 'Delete Main');
        await flushPromises();

        // Assert
        const group = deleteGroup(wrapper, 'Main');
        expect(group.text()).toContain('Delete "Main"?');
        expect(document.activeElement).toBe(group.findAll('button').find((button) => button.text() === 'Cancel')?.element);
        expect(bankAccountsService.deleteBankAccount).not.toHaveBeenCalled();

        wrapper.unmount();
    });

    it('should delete the account and show the reloaded list without it when deleteBankAccount succeeds', async () =>
    {
        // Arrange: the reload after the delete no longer has Main
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValueOnce([main, savings]).mockResolvedValueOnce([savings]);
        vi.mocked(bankAccountsService.deleteBankAccount).mockResolvedValue();
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();
        await clickButton(wrapper, 'Delete Main');

        // Act
        await clickIn(deleteGroup(wrapper, 'Main'), 'Delete for good');
        await flushPromises();

        // Assert
        expect(bankAccountsService.deleteBankAccount).toHaveBeenCalledExactlyOnceWith(1, 3);
        expect(listedAccounts(wrapper)).toStrictEqual(['Savings NL02 RABO 0123 4567 89']);
        expect(wrapper.find('[role="group"]').exists()).toBe(false);
    });

    it('should close the confirm without a request and show Rename and Delete again when Cancel is clicked', async () =>
    {
        // Arrange
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([main]);
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();
        await clickButton(wrapper, 'Delete Main');

        // Act
        await clickIn(deleteGroup(wrapper, 'Main'), 'Cancel');

        // Assert
        expect(deleteGroup(wrapper, 'Main').exists()).toBe(false);
        expect(wrapper.find('button[aria-label="Rename Main"]').exists()).toBe(true);
        expect(wrapper.find('button[aria-label="Delete Main"]').exists()).toBe(true);
        expect(bankAccountsService.deleteBankAccount).not.toHaveBeenCalled();
    });

    it('should say Couldn\'t delete., keep the confirm open and hand the error on when deleteBankAccount fails with a 500 (server error)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([main]);
        vi.mocked(bankAccountsService.deleteBankAccount).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const { wrapper } = await mountBankAccounts('1', errorHandler);
        await flushPromises();
        await clickButton(wrapper, 'Delete Main');

        // Act
        await clickIn(deleteGroup(wrapper, 'Main'), 'Delete for good');
        await flushPromises();

        // Assert
        expect(deleteGroup(wrapper, 'Main').find('[role="status"]').text()).toBe('Couldn\'t delete.');
        expect(listedAccounts(wrapper)).toStrictEqual(['Main NL91 ABNA 0417 1643 00']);
        expect(errorHandler).toHaveBeenCalledExactlyOnceWith(error, expect.anything(), expect.anything());
    });

    it('should disable Delete for good while deleteBankAccount is in flight', async () =>
    {
        // Arrange: deleteBankAccount is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([main]);
        vi.mocked(bankAccountsService.deleteBankAccount).mockReturnValue(request.promise.then(() => undefined));
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();
        await clickButton(wrapper, 'Delete Main');
        const confirm = deleteGroup(wrapper, 'Main').findAll('button').find((button) => button.text() === 'Delete for good');

        // Act
        await confirm?.trigger('click');

        // Assert
        expect(confirm?.attributes('disabled')).toBeDefined();

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });

    it('should close an open delete confirm when Rename is clicked on another row', async () =>
    {
        // Arrange
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValue([main, savings]);
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();
        await clickButton(wrapper, 'Delete Main');

        // Act
        await clickButton(wrapper, 'Rename Savings');

        // Assert
        expect(renameForm(wrapper, 'Savings').exists()).toBe(true);
        expect(wrapper.find('[role="group"]').exists()).toBe(false);
    });

    it('should close the rename form, show the reloaded list and say the account no longer exists when updateBankAccountLabel gets a 404 (not found)', async () =>
    {
        // Arrange: another tab deleted Main, so the reload no longer has it
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValueOnce([main, savings]).mockResolvedValueOnce([savings]);
        vi.mocked(bankAccountsService.updateBankAccountLabel).mockRejectedValue(new BankAccountNotFoundError(axiosErrorWith(404, {})));
        const errorHandler = vi.fn<(error: unknown) => void>();
        const { wrapper } = await mountBankAccounts('1', errorHandler);
        await flushPromises();
        await clickButton(wrapper, 'Rename Main');

        // Act
        await renameForm(wrapper, 'Main').trigger('submit');
        await flushPromises();

        // Assert: an expected outcome, explained, not a fault
        expect(renameForm(wrapper, 'Main').exists()).toBe(false);
        expect(listedAccounts(wrapper)).toStrictEqual(['Savings NL02 RABO 0123 4567 89']);
        expect(wrapper.find('#bank-accounts-status').text()).toBe('That account no longer exists.');
        expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should clear the no-longer-exists notice when another row is opened', async () =>
    {
        // Arrange
        vi.mocked(bankAccountsService.listBankAccounts).mockResolvedValueOnce([main, savings]).mockResolvedValueOnce([savings]);
        vi.mocked(bankAccountsService.updateBankAccountLabel).mockRejectedValue(new BankAccountNotFoundError(axiosErrorWith(404, {})));
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();
        await clickButton(wrapper, 'Rename Main');
        await renameForm(wrapper, 'Main').trigger('submit');
        await flushPromises();
        expect(wrapper.find('#bank-accounts-status').text()).toBe('That account no longer exists.');

        // Act
        await clickButton(wrapper, 'Rename Savings');

        // Assert
        expect(wrapper.find('#bank-accounts-status').text()).toBe('');
    });
});
