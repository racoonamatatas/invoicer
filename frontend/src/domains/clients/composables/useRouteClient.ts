// Package imports
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

// Project imports
import { parseRouteId } from '@/router/parseRouteId';
import { ClientNotFoundError, fetchClient, updateClient, type Client, type ClientPayload } from '@/services/clients';
import { SessionEndedError } from '@/services/http';

// What a page under /businesses/:businessId/clients/:clientId knows about its
// client. A union, so the page can't show a form while it also thinks the
// client wasn't found.
export type RouteClientState =
    | { kind: 'loading' }
    | { kind: 'failed' }
    | { kind: 'notFound' }
    | { kind: 'found'; client: Client };

// The client in the URL, fetched by id: unlike a business, no list of
// clients is loaded already. businessId is null while there is no business to
// load for (still loading, or not found); no request then. An unknown id and
// another business's client are the same 404, so both are not-found.
export const useRouteClient = (businessId: () => number | null) =>
{
    const route = useRoute();

    const clientId = computed(() => parseRouteId(route.params.clientId));

    const state = ref<RouteClientState>({ kind: 'loading' });

    // Counts requests, so only the latest may write state. Back/forward to
    // another client while one is in flight would otherwise let the old
    // client land under the new one's URL.
    let latest = 0;

    // A failure is re-thrown so Vue's error handler still sees it. A
    // SessionEndedError is swallowed: /login is already loading. A
    // ClientNotFoundError too: it is an answer the page shows, not a fault.
    const load = async (business: number, client: number): Promise<void> =>
    {
        const request = ++latest;
        state.value = { kind: 'loading' };

        try
        {
            const found = await fetchClient(business, client);

            if (request === latest)
            {
                state.value = { kind: 'found', client: found };
            }
        }
        catch (error) // unknown: anything can be thrown
        {
            // A stale failure belongs to a client the page has left.
            if (request !== latest || error instanceof SessionEndedError)
            {
                return;
            }

            if (error instanceof ClientNotFoundError)
            {
                state.value = { kind: 'notFound' };

                return;
            }

            state.value = { kind: 'failed' };
            throw error;
        }
    };

    // Loads the client for the current ids, or settles without a request.
    const loadCurrent = (): Promise<void> | undefined =>
    {
        const business = businessId();
        const client = clientId.value;

        // ++latest drops whatever was in flight, so it can't overwrite this.
        ++latest;

        // No request for an id that can't exist: it is not-found either way.
        if (client === null)
        {
            state.value = { kind: 'notFound' };

            return undefined;
        }

        if (business === null)
        {
            state.value = { kind: 'loading' };

            return undefined;
        }

        return load(business, client);
    };

    // A watcher, not a bare call in setup: Vue hands a rejected watch callback
    // to its error handler.
    watch(() => [businessId(), clientId.value] as const, loadCurrent, { immediate: true });

    // For the page's "Try again".
    const retry = (): Promise<void> => loadCurrent() ?? Promise.resolve();

    // For the page's form. Writes state too, so what the page shows outside
    // the form (its heading) matches what the backend stored. Nothing is
    // caught: a 422 must reach the form's useForm, and any other failure the
    // form's "Couldn't save.".
    const save = async (payload: ClientPayload): Promise<Client> =>
    {
        const business = businessId();

        // The page only renders its form for a found client, so this is a bug,
        // not a path a user can take.
        if (state.value.kind !== 'found' || business === null)
        {
            throw new Error('useRouteClient: save() called without a found client');
        }

        // Read before the await: the URL can change while the request runs,
        // and the save goes to the client the form was showing. latest is
        // noted, not incremented: a save isn't a load and mustn't cancel one.
        const request = latest;
        const stored = await updateClient(business, state.value.client.id, payload);

        // Another client's page by now: this one's values don't belong there.
        if (request === latest)
        {
            state.value = { kind: 'found', client: stored };
        }

        return stored;
    };

    return { clientId, state, retry, save };
};
