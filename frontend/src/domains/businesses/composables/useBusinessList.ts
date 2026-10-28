// Package imports
import { computed, ref, watch } from 'vue';

// Project imports
import { useBusinessesStore } from '@/domains/businesses/store';
import { SessionEndedError } from '@/services/http';
import type { Business } from '@/services/businesses';

// What a page knows about the user's businesses. A union, so a page can't
// show a list while it also thinks the load failed.
export type BusinessListState =
    | { kind: 'loading' }
    | { kind: 'failed' }
    | { kind: 'loaded'; businesses: readonly Business[] };

// Loads the user's businesses for every page that needs the list: the landing
// page, the list page and the pages under a business. The store shares one
// request between them, so calling this from a layout and its page sends one
// GET. isNeeded lets a page skip the request, e.g. for a URL whose business
// id can't exist; it loads as soon as isNeeded turns true.
export const useBusinessList = (isNeeded: () => boolean = () => true) =>
{
    const store = useBusinessesStore();
    const hasFailed = ref(false);

    // The page shows the failure itself, and offers retry(). Re-thrown after
    // that, so Vue's error handler still sees what went wrong. A
    // SessionEndedError is swallowed instead: the session is already ended
    // and /login is loading, like useForm does.
    const load = async (): Promise<void> =>
    {
        hasFailed.value = false;

        try
        {
            await store.load();
        }
        catch (error) // unknown: anything can be thrown
        {
            if (error instanceof SessionEndedError)
            {
                return;
            }

            hasFailed.value = true;
            throw error;
        }
    };

    // A watcher, not a bare call in setup: Vue hands a rejected watch callback
    // to its error handler, where a promise nobody awaits would only be an
    // unhandled rejection. Created in setup, so it stops with the page.
    // immediate: the first check runs now, not on the first change.
    watch(isNeeded, (needed) => (needed ? load() : undefined), { immediate: true });

    // A loaded list wins over a failure: after a failed retry the store can
    // still hold the list it had.
    const state = computed<BusinessListState>(() =>
    {
        if (store.businesses !== null)
        {
            return { kind: 'loaded', businesses: store.businesses };
        }

        return hasFailed.value ? { kind: 'failed' } : { kind: 'loading' };
    });

    return { state, retry: load };
};
