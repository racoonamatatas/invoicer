// Package imports
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

// Project imports
import { useAuthStore } from '@/domains/auth/store';
import * as service from '@/services/businesses';

// A list as the backend sent it, and the user it was sent for.
interface OwnedList
{
    userId: number | null;
    businesses: service.Business[];
}

// A list request in flight, and the user it was sent for.
interface PendingList
{
    userId: number | null;
    request: Promise<void>;
}

// A store to hold the logged-in user's businesses, shared by the redirect
// after login, the list page and every page under a business.
export const useBusinessesStore = defineStore('businesses', () =>
{
    const auth = useAuthStore();

    // Private, like the auth store's user: pages read businesses, which only
    // hands the list to the user it belongs to.
    const loaded = ref<OwnedList | null>(null);

    // Not refs: nothing renders them, they only steer load().
    let pending: PendingList | null = null;
    // Numbers every list request, so only the newest one's answer is kept.
    let latestRequest = 0;

    const currentUserId = (): number | null => auth.user?.id ?? null;

    // null until load() has answered for the user who is logged in now. The
    // list is tied to its user rather than cleared on logout, so no logout
    // path can forget to clear it: logout(), clear() (ResetPassword, without
    // a page load) and a slow request of one user that answers after the
    // next one logged in all leave a list another user can't see.
    const businesses = computed<readonly service.Business[] | null>(() =>
    {
        const userId = currentUserId();

        return userId !== null && loaded.value?.userId === userId ? loaded.value.businesses : null;
    });

    const fetchList = (userId: number | null): Promise<void> =>
    {
        latestRequest += 1;
        const thisRequest = latestRequest;

        const request = (async (): Promise<void> =>
        {
            try
            {
                const list = await service.listBusinesses();

                // A newer request (a reload(), or another user's load()) has
                // been sent since; this older answer must not overwrite it.
                if (thisRequest === latestRequest)
                {
                    loaded.value = { userId, businesses: list };
                }
            }
            finally
            {
                // A failed request is forgotten too, so the next load() asks
                // again instead of handing out the same failure.
                if (thisRequest === latestRequest)
                {
                    pending = null;
                }
            }
        })();

        pending = { userId, request };

        return request;
    };

    // Asks the backend once per user: a call while the list is loaded does
    // nothing, and a call while it is loading waits for that same request.
    const load = (): Promise<void> =>
    {
        const userId = currentUserId();

        if (businesses.value !== null)
        {
            return Promise.resolve();
        }

        if (pending !== null && pending.userId === userId)
        {
            return pending.request;
        }

        return fetchList(userId);
    };

    // Asks the backend again, even when the list is loaded.
    const reload = (): Promise<void> => fetchList(currentUserId());

    // undefined both for an id that isn't in the list and while the list
    // isn't loaded: call load() first.
    const byId = (id: number): service.Business | undefined =>
    {
        return businesses.value?.find((business) => business.id === id);
    };

    // Adds the business to the list, or replaces the one with its id. Only
    // into a list of the user the request was made for, and only once it is
    // loaded: an unloaded list gets the business from the next load().
    const remember = (userId: number | null, business: service.Business): void =>
    {
        if (loaded.value === null || loaded.value.userId !== userId)
        {
            return;
        }

        const index = loaded.value.businesses.findIndex((known) => known.id === business.id);

        if (index === -1)
        {
            loaded.value.businesses.push(business);
        }
        else
        {
            loaded.value.businesses.splice(index, 1, business);
        }
    };

    // A list request in flight may answer with the list from before this
    // write and overwrite it, so the write waits for it before remembering.
    // That request's failure belongs to its own caller, not to this write.
    // remember() replaces by id, so a list that already holds the result
    // doesn't get it twice.
    const settlePendingList = async (): Promise<void> =>
    {
        await pending?.request.catch(() => undefined);
    };

    // Creates a business and returns it, so the page can go to it. A 422 is
    // thrown, not caught, for useForm.
    const create = async (payload: service.BusinessPayload): Promise<service.Business> =>
    {
        const userId = currentUserId();
        const business = await service.createBusiness(payload);
        await settlePendingList();
        remember(userId, business);

        return business;
    };

    // Replaces a business's fields and returns the result. A 422 is thrown,
    // not caught, for useForm.
    const update = async (id: number, payload: service.BusinessPayload): Promise<service.Business> =>
    {
        const userId = currentUserId();
        const business = await service.updateBusiness(id, payload);
        await settlePendingList();
        remember(userId, business);

        return business;
    };

    return {
        businesses,
        load,
        reload,
        byId,
        create,
        update,
    };
});
