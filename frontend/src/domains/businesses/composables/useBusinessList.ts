// Package imports
import { computed, onMounted, ref } from 'vue';

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

// Loads the user's businesses when the page mounts, for every page that needs
// the list: the landing page, the list page and the pages under a business.
// The store shares one request between them, so calling this from a layout
// and its page sends one GET.
export const useBusinessList = () =>
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

    // onMounted, not a call in setup: Vue hands a rejected hook to its error
    // handler, where a promise nobody awaits would only be an unhandled
    // rejection.
    onMounted(load);

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
