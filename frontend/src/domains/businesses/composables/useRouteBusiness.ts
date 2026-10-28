// Package imports
import { computed } from 'vue';
import { useRoute } from 'vue-router';

// Project imports
import { useBusinessList } from '@/domains/businesses/composables/useBusinessList';
import { useBusinessesStore } from '@/domains/businesses/store';
import type { Business } from '@/services/businesses';

// What a page under /businesses/:businessId knows about its business.
export type RouteBusinessState =
    | { kind: 'loading' }
    | { kind: 'failed' }
    | { kind: 'notFound' }
    | { kind: 'found'; business: Business };

// The id from the URL, or null when it can't be a business id. Only digits
// without a leading zero: Number() alone would also take '1e3', ' 7' and
// '0x1F'.
const parseBusinessId = (param: string | string[] | undefined): number | null =>
{
    if (typeof param !== 'string' || !/^[1-9]\d*$/.test(param))
    {
        return null;
    }

    const id = Number(param);

    // A longer digit string would lose precision and could match the wrong id.
    return Number.isSafeInteger(id) ? id : null;
};

// The business in the URL, for every page under a business. Read from the
// user's own list, not fetched by id: one request serves every page under a
// business. Another user's business (a 403 from the API) and an unknown one
// (a 404) both aren't in the list, so both are not-found. The backend still
// checks ownership on every request.
export const useRouteBusiness = () =>
{
    const store = useBusinessesStore();
    const route = useRoute();

    const businessId = computed(() => parseBusinessId(route.params.businessId));

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

    return { state, retry };
};
