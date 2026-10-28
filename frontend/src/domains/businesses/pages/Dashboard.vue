<script setup lang="ts">
// Package imports
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

// Project imports
import LogoutButton from '@/components/LogoutButton.vue';
import { useBusinessList } from '@/domains/businesses/composables/useBusinessList';
import { useBusinessesStore } from '@/domains/businesses/store';
import type { Business } from '@/services/businesses';

const businesses = useBusinessesStore();
const route = useRoute();

// The id from the URL, or null when it can't be a business id. Only digits
// without a leading zero: Number() alone would also take '1e3', ' 7' and
// '0x1F'. Kept here until a second page under a business needs it.
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

const businessId = computed(() => parseBusinessId(route.params.businessId));

// No request for an id that can't exist: it is not-found either way.
const { state: list, retry } = useBusinessList(() => businessId.value !== null);

type DashboardState =
    | { kind: 'loading' }
    | { kind: 'failed' }
    | { kind: 'notFound' }
    | { kind: 'found'; business: Business };

// Read from the user's own list, not fetched by id: one request serves every
// page under a business. Another user's business (a 403 from the API) and an
// unknown one (a 404) both aren't in the list, so both are not-found. The
// backend still checks ownership on every request.
const state = computed<DashboardState>(() =>
{
    if (businessId.value === null)
    {
        return { kind: 'notFound' };
    }

    if (list.value.kind !== 'loaded')
    {
        return list.value;
    }

    const business = businesses.byId(businessId.value);

    return business === undefined ? { kind: 'notFound' } : { kind: 'found', business };
});
</script>

<template>
    <div>
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. -->
        <div role="status">
            <p v-if="state.kind === 'loading'">Loading...</p>
            <p v-else-if="state.kind === 'failed'">Couldn't load your businesses.</p>
        </div>

        <button v-if="state.kind === 'failed'" type="button" @click="retry">Try again</button>
        <!-- The legal name, so a wrong id in the URL is visible at once. -->
        <h1 v-else-if="state.kind === 'found'">{{ state.business.legal_name }}</h1>
        <template v-else-if="state.kind === 'notFound'">
            <h1>Business not found</h1>
            <p>It doesn't exist, or it isn't one of yours.</p>
        </template>

        <!-- In every state, so the user can always leave or log out. -->
        <p><RouterLink :to="{ name: 'businesses' }">Your businesses</RouterLink></p>
        <p><RouterLink :to="{ name: 'changePassword' }">Change password</RouterLink></p>
        <LogoutButton />
    </div>
</template>
