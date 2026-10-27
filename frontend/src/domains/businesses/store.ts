// Package imports
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

// Project imports
import { useAuthStore } from '@/domains/auth/store';
import * as service from '@/services/businesses';

// A list as the backend sent it, and the user it was sent for.
interface OwnedList
{
    userId: number;
    businesses: service.Business[];
}

// The list request in flight, and the user it was sent for.
interface PendingList
{
    userId: number;
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

    // Not refs: nothing renders them, they only steer the requests.
    // The newest list request in flight, which load() joins instead of
    // sending another.
    let pending: PendingList | null = null;
    // Numbers every list request, so answers that arrive out of order can be
    // told apart: latestRequest is the last one sent, storedRequest the
    // newest one no answer may be older than (see reloadAfterWrite).
    let latestRequest = 0;
    let storedRequest = 0;

    const currentUserId = (): number | null => auth.user?.id ?? null;

    // null until load() has answered for the user who is logged in now. The
    // list is tied to its user rather than cleared on logout, so no logout
    // path can forget to clear it: logout(), clear() (ResetPassword, without
    // a page load) and a slow request of one user that answers after the
    // next one logged in all leave a list another user can't see.
    // The cost: the same user logging in again in the same document gets
    // the list from before without a new request. Their own data, and only
    // reachable through ResetPassword's clear(), since logout loads a page.
    const businesses = computed<readonly service.Business[] | null>(() =>
    {
        const userId = currentUserId();

        return userId !== null && loaded.value?.userId === userId ? loaded.value.businesses : null;
    });

    // Only guards against what happens in normal use: a layout and its page
    // asking at once (load() shares the request) and an older answer arriving
    // last (the counters). A failed request rejects its own caller, even when
    // a newer one may still answer: that needs two requests in the air within
    // a few hundred milliseconds, on a list that changes about once a year.
    const fetchList = (userId: number): Promise<void> =>
    {
        latestRequest += 1;
        const thisRequest = latestRequest;

        const request = service.listBusinesses()
            .then((list) =>
            {
                // Kept unless a newer answer is already stored, so a slow
                // older request can't overwrite it. Kept even when a newer
                // request is still in flight: its caller is waiting for a
                // list, and the newer answer replaces this one when it comes.
                if (thisRequest > storedRequest)
                {
                    loaded.value = { userId, businesses: list };
                    storedRequest = thisRequest;
                }
            })
            .finally(() =>
            {
                // Forgotten once settled, failed too, so the next load() asks
                // again instead of handing out the same failure. Unless a
                // newer request already took its place.
                if (pending?.request === request)
                {
                    pending = null;
                }
            });

        pending = { userId, request };

        return request;
    };

    // Asks the backend once per user: a call while the list is loaded does
    // nothing, and a call while it is loading waits for that same request.
    // Resolved, the list is loaded, unless the user changed meanwhile: a
    // request can settle without filling it, when a failed reload after a
    // write dropped its answer, and then load() asks again.
    // Logged out, there is no user to load a list for, so nothing is sent:
    // the backend would answer 401 anyway.
    const load = async (): Promise<void> =>
    {
        const userId = currentUserId();

        while (userId !== null && currentUserId() === userId && businesses.value === null)
        {
            await (pending?.userId === userId ? pending.request : fetchList(userId));
        }
    };

    // Asks the backend again, even when the list is loaded. Like load(),
    // sends nothing while logged out.
    const reload = (): Promise<void> =>
    {
        const userId = currentUserId();

        return userId === null ? Promise.resolve() : fetchList(userId);
    };

    // undefined both for an id that isn't in the list and while the list
    // isn't loaded: call load() first.
    const byId = (id: number): service.Business | undefined =>
    {
        return businesses.value?.find((business) => business.id === id);
    };

    // Asks for the whole list again instead of merging the written business
    // into it. A list request sent before the write may answer after it with
    // the list from before, but the reload is numbered newer, so its answer
    // wins. Costs one GET per write.
    const reloadAfterWrite = async (): Promise<void> =>
    {
        try
        {
            await reload();
        }
        catch
        {
            // The write landed, only the list is out of date: unknown rather
            // than stale, so the next load() asks again. No answer to a
            // request already sent may fill it either: one sent before the
            // write holds the list from before it. That also drops one sent
            // after the write, and wipes its list if already stored; both
            // need two requests in the air at once, and cost one more GET.
            // Every error is caught, an UnexpectedResponseError too: the
            // next load() asks again and throws it there.
            loaded.value = null;
            storedRequest = latestRequest;
        }
    };

    // Creates a business and returns it, so the page can go to it. A 422 is
    // thrown, not caught, for useForm.
    const create = async (payload: service.BusinessPayload): Promise<service.Business> =>
    {
        const business = await service.createBusiness(payload);
        await reloadAfterWrite();

        return business;
    };

    // Replaces a business's fields and returns the result. A 422 is thrown,
    // not caught, for useForm.
    const update = async (id: number, payload: service.BusinessPayload): Promise<service.Business> =>
    {
        const business = await service.updateBusiness(id, payload);
        await reloadAfterWrite();

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
