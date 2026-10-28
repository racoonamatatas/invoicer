import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import BankAccounts from '@/domains/businesses/pages/BankAccounts.vue';
import * as bankAccountsService from '@/services/bankAccounts';
import type { BankAccount } from '@/services/bankAccounts';
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
const mountBankAccounts = async (businessId: string, errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    const router = createTestRouter();
    await router.push(`/businesses/${businessId}/bank-accounts`);

    const wrapper = mount(BankAccounts, { global: { plugins: [pinia, router], config: { errorHandler } } });

    return { wrapper, router };
};

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
        expect(wrapper.findAll('ul[aria-label="Bank accounts"] li').map((row) => row.text())).toStrictEqual([
            'Main NL91 ABNA 0417 1643 00',
            'Savings NL02 RABO 0123 4567 89',
        ]);
        expect(wrapper.find('[role="status"]').text()).toBe('');
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

    it('should show Loading bank accounts... in the status region while listBankAccounts is in flight', async () =>
    {
        // Arrange: listBankAccounts is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(bankAccountsService.listBankAccounts).mockReturnValue(request.promise.then(() => [main]));

        // Act
        const { wrapper } = await mountBankAccounts('1');
        await flushPromises();

        // Assert: the business is found, its accounts aren't in yet
        expect(wrapper.find('h1').text()).toBe('Bank accounts · Bakkerij de Vries');
        expect(wrapper.find('[role="status"]').text()).toBe('Loading bank accounts...');
        expect(wrapper.find('ul[aria-label="Bank accounts"]').exists()).toBe(false);

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });

    it('should show the failure with a Try again button and hand the error on when listBankAccounts fails with a 500 (server error)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(bankAccountsService.listBankAccounts).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();

        // Act
        const { wrapper } = await mountBankAccounts('1', errorHandler);
        await flushPromises();

        // Assert (outcome): the user is told, and can retry
        expect(wrapper.find('[role="status"]').text()).toBe('Couldn\'t load the bank accounts.');
        expect(wrapper.findAll('button').some((button) => button.text() === 'Try again')).toBe(true);

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
        expect(wrapper.findAll('ul[aria-label="Bank accounts"] li').map((row) => row.text())).toStrictEqual(['Main NL91 ABNA 0417 1643 00']);
        expect(wrapper.find('[role="status"]').text()).toBe('');
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
        expect(wrapper.findAll('ul[aria-label="Bank accounts"] li').map((row) => row.text())).toStrictEqual(['Savings NL02 RABO 0123 4567 89']);
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
});
