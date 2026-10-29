// Package imports
import { computed } from 'vue';
import { useRoute } from 'vue-router';

// Project imports
import { useBusinessList } from '@/domains/businesses/composables/useBusinessList';
import { useBusinessesStore } from '@/domains/businesses/store';
import { parseRouteId } from '@/router/parseRouteId';
import type { Business } from '@/services/businesses';

// What a page under /businesses/:businessId knows about its business.
export type RouteBusinessState =
    | { kind: 'loading' }
    | { kind: 'failed' }
    | { kind: 'notFound' }
    | { kind: 'found'; business: Business };

// The business in the URL, for every page under a business. Read from the
// user's own list, not fetched by id: one request serves every page under a
// business. Another user's business and an unknown one are both a 404 from
// the API, and neither is in the list, so both are not-found. The backend still
// checks ownership on every request.
export const useRouteBusiness = () =>
{
    const store = useBusinessesStore();
    const route = useRoute();

    const businessId = computed(() => parseRouteId(route.params.businessId));

    // No request for an id that can't exist: it is not-found either way.
    const { state: list, retry } = useBusinessList(() => businessId.value !== null);

    const state = computed<RouteBusinessState>(() =>
    {
        if (businessId.value === null)
        {
            return { kind: 'notFound' };
        }

        if (list.value.kind !== 'loaded')
        {
            return list.value;
        }

        const business = store.byId(businessId.value);

        return business === undefined ? { kind: 'notFound' } : { kind: 'found', business };
    });

    // businessId too, for a page that keeps a business across reloads: it
    // must check that it is still the one in the URL.
    return { businessId, state, retry };
};
