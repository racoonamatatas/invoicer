// Package imports
import { ref, watch } from 'vue';

// Project imports
import { listBankAccounts, type BankAccount } from '@/services/bankAccounts';
import { SessionEndedError } from '@/services/http';

// What the bank accounts page knows about one business's accounts. A union,
// so the page can't show a list while it also thinks the load failed.
export type BankAccountListState =
    | { kind: 'loading' }
    | { kind: 'failed' }
    | { kind: 'loaded'; accounts: readonly BankAccount[] };

// The accounts of the business in businessId, loaded with the page. Not a
// store: only this page shows them. businessId is null while there is no
// business to load for (still loading, or not found); no request then.
export const useBankAccounts = (businessId: () => number | null) =>
{
    const state = ref<BankAccountListState>({ kind: 'loading' });

    // Counts requests, so only the latest may write state. Back/forward to
    // another business while a list is in flight would otherwise let the old
    // business's accounts land under the new one's URL.
    let latest = 0;

    // Like useBusinessList: the page shows a failure and offers retry(), and
    // the error is re-thrown so Vue's error handler still sees it. A
    // SessionEndedError is swallowed: /login is already loading.
    const load = async (id: number): Promise<void> =>
    {
        const request = ++latest;

        // A reload keeps the list on screen until the new one arrives, so
        // rows don't vanish and come back after every write. Only a retry
        // after a failure shows Loading... again.
        if (state.value.kind === 'failed')
        {
            state.value = { kind: 'loading' };
        }

        try
        {
            const accounts = await listBankAccounts(id);

            if (request === latest)
            {
                state.value = { kind: 'loaded', accounts };
            }
        }
        catch (error) // unknown: anything can be thrown
        {
            // A stale failure belongs to a business the page has left.
            if (request !== latest || error instanceof SessionEndedError)
            {
                return;
            }

            state.value = { kind: 'failed' };
            throw error;
        }
    };

    // A watcher, not a bare call in setup: Vue hands a rejected watch callback
    // to its error handler. Another business starts from Loading..., and
    // ++latest drops whatever was in flight for the old one.
    watch(businessId, (id) =>
    {
        ++latest;
        state.value = { kind: 'loading' };

        return id === null ? undefined : load(id);
    }, { immediate: true });

    // After a write, and for the page's "Try again".
    const reload = (): Promise<void> =>
    {
        const id = businessId();

        return id === null ? Promise.resolve() : load(id);
    };

    return { state, reload };
};
