import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import Invoices from '@/domains/invoices/pages/Invoices.vue';
import * as businessesService from '@/services/businesses';
import * as clientsService from '@/services/clients';
import * as invoicesService from '@/services/invoices';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { business, jan, logInAs } from '../../../utility/businesses';
import { dutchClient, germanClient } from '../../../utility/clients';
import { createDeferred } from '../../../utility/createDeferred';
import { createTestRouter } from '../../../utility/createTestRouter';
import { draftListItem } from '../../../utility/invoices';

// Every export of these services becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');
vi.mock('@/services/businesses');
vi.mock('@/services/clients');
vi.mock('@/services/invoices');

const studio = business(7, 'Studio de Vries');

const bakker = dutchClient(3, 'Fietsenmakerij Bakker');
const huber = germanClient(4, 'Brauerei Huber');

// Mounts Invoices on /businesses/<businessId>/invoices with a fresh Pinia, a
// logged-in user (the store loads nothing without one) and the app's real
// routes, so its RouterLinks resolve.
const mountInvoices = async (businessId: string, errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    const router = createTestRouter();
    await router.push(`/businesses/${businessId}/invoices`);

    const wrapper = mount(Invoices, { global: { plugins: [pinia, router], config: { errorHandler } } });

    return { wrapper, router };
};

// Each row's cells, as a user reads them.
const listedInvoices = (wrapper: VueWrapper): string[][] =>
    wrapper.findAll('table[aria-label="Invoices"] tbody tr').map((row) => row.findAll('td').map((cell) => cell.text()));

const invoicesStatus = (wrapper: VueWrapper): string => wrapper.find('#invoices-status').text();

const linkTo = (wrapper: VueWrapper, text: string): string | undefined =>
    wrapper.findAll('a').find((link) => link.text() === text)?.attributes('href');

describe('Invoices page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
        vi.mocked(businessesService.listBusinesses).mockResolvedValue([studio]);
        vi.mocked(clientsService.listClients).mockResolvedValue([bakker, huber]);
        // An empty list by default, so a test about one state needn't set up rows.
        vi.mocked(invoicesService.listInvoices).mockResolvedValue([]);
    });

    it('should list each draft with its client, Draft and its total in euros when both lists get a 200 (ok)', async () =>
    {
        // Arrange
        vi.mocked(invoicesService.listInvoices).mockResolvedValue([draftListItem(11, 4, 3634), draftListItem(10, 3, 12100)]);

        // Act
        const { wrapper } = await mountInvoices('7');
        await flushPromises();

        // Assert: the euro sign is followed by a no-break space (U+00A0)
        expect(wrapper.find('h1').text()).toBe('Invoices · Studio de Vries');
        expect(listedInvoices(wrapper)).toEqual([
            ['Brauerei Huber', 'Draft', '€ 36,34'],
            ['Fietsenmakerij Bakker', 'Draft', '€ 121,00'],
        ]);
        expect(invoicesStatus(wrapper)).toBe('');
    });

    it('should link each client name to that invoice\'s editor', async () =>
    {
        // Arrange
        vi.mocked(invoicesService.listInvoices).mockResolvedValue([draftListItem(11, 4, 3634)]);

        // Act
        const { wrapper } = await mountInvoices('7');
        await flushPromises();

        // Assert
        expect(linkTo(wrapper, 'Brauerei Huber')).toBe('/businesses/7/invoices/11/edit');
    });

    it('should show neither a number nor an id for a draft', async () =>
    {
        // Arrange: ids no other value on the page contains, and a number the
        // backend would never send for a draft, so the test catches a template
        // that shows `number` without checking the status
        vi.mocked(invoicesService.listInvoices).mockResolvedValue([{ ...draftListItem(9876, 4, 3634), number: '2026-0042' }]);

        // Act
        const { wrapper } = await mountInvoices('7');
        await flushPromises();

        // Assert: the row rendered, so the absence below means something
        expect(listedInvoices(wrapper)).toHaveLength(1);
        expect(wrapper.text()).not.toContain('2026-0042');
        expect(wrapper.text()).not.toContain('9876');
    });

    it('should show Loading invoices... while listInvoices is in flight', async () =>
    {
        // Arrange: listInvoices is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(invoicesService.listInvoices).mockReturnValue(request.promise.then(() => []));

        // Act
        const { wrapper } = await mountInvoices('7');
        await flushPromises();

        // Assert
        expect(invoicesStatus(wrapper)).toBe('Loading invoices...');
        expect(wrapper.find('table').exists()).toBe(false);

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });

    it('should show No invoices yet. when listInvoices gets a 200 (ok) with an empty list', async () =>
    {
        // Act
        const { wrapper } = await mountInvoices('7');
        await flushPromises();

        // Assert
        expect(wrapper.text()).toContain('No invoices yet.');
        expect(wrapper.find('table').exists()).toBe(false);
    });

    it('should show the failure, hand the error on, and list the invoices after Try again, when listInvoices first fails with a 500 (server error)', async () =>
    {
        // Arrange
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(invoicesService.listInvoices).mockRejectedValueOnce(error).mockResolvedValue([draftListItem(10, 3, 12100)]);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const { wrapper } = await mountInvoices('7', errorHandler);
        await flushPromises();

        // Assert (before): the user is told, and the error isn't swallowed
        expect(invoicesStatus(wrapper)).toBe('Couldn\'t load the invoices.');
        expect(errorHandler).toHaveBeenCalledExactlyOnceWith(error, expect.anything(), expect.anything());

        // Act
        const tryAgain = wrapper.findAll('button').find((button) => button.text() === 'Try again');
        await tryAgain?.trigger('click');
        await flushPromises();

        // Assert
        expect(invoicesStatus(wrapper)).toBe('');
        expect(listedInvoices(wrapper)).toEqual([['Fietsenmakerij Bakker', 'Draft', '€ 121,00']]);
    });

    it('should link to a new invoice and back to the dashboard while the invoices are still loading', async () =>
    {
        // Arrange: the list never answers in this test's time
        const request = createDeferred();
        vi.mocked(invoicesService.listInvoices).mockReturnValue(request.promise.then(() => []));

        // Act
        const { wrapper } = await mountInvoices('7');
        await flushPromises();

        // Assert
        expect(invoicesStatus(wrapper)).toBe('Loading invoices...');
        expect(linkTo(wrapper, 'New invoice')).toBe('/businesses/7/invoices/new');
        expect(linkTo(wrapper, 'Back to the dashboard')).toBe('/businesses/7');

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });

    it('should show Business not found and request no invoices when the business in the URL isn\'t the user\'s', async () =>
    {
        // Act
        const { wrapper } = await mountInvoices('99');
        await flushPromises();

        // Assert
        expect(wrapper.find('h1').text()).toBe('Business not found');
        expect(invoicesService.listInvoices).not.toHaveBeenCalled();
    });
});
