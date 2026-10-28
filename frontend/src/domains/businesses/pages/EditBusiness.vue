<script setup lang="ts">
// Package imports
import { ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

// Project imports
import LogoutButton from '@/components/LogoutButton.vue';
import BusinessForm from '@/domains/businesses/components/BusinessForm.vue';
import { useRouteBusiness } from '@/domains/businesses/composables/useRouteBusiness';
import { useBusinessesStore } from '@/domains/businesses/store';
import type { Business, BusinessPayload } from '@/services/businesses';

const store = useBusinessesStore();
const { state, retry } = useRouteBusiness();

// The business the form edits: the last one found, kept while the list loads
// again or fails. A failed reload after a save empties the store's list, and
// rendering on state alone would unmount the form and lose what was typed,
// along with the "Saved." that says the write went through. Cleared only
// when the URL points at no business of the user's.
const shown = ref<Business | null>(null);

watch(state, (current) =>
{
    if (current.kind === 'found')
    {
        shown.value = current.business;
    }
    else if (current.kind === 'notFound')
    {
        shown.value = null;
    }
}, { immediate: true });

// Through the store, so the list and every page's heading show the new
// values without a page load. Stays on this page: the form shows its saved
// message. A 422 is thrown by store.update() and caught by the form.
const saveTo = (id: number) => async (payload: BusinessPayload): Promise<void> =>
{
    await store.update(id, payload);
};
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
        <!-- Only once a business was found, so the inputs never show empty
             and then fill. Not v-else: the form stays next to a failure.
             Keyed by id: BusinessForm copies its initial business once, so
             another business in the URL needs a new form. -->
        <template v-if="shown !== null">
            <h1>Edit {{ shown.registered_name }}</h1>
            <BusinessForm
                :key="shown.id"
                :initial="shown"
                label="Business details"
                submit-label="Save"
                :save="saveTo(shown.id)"
                saved-message="Saved."
            />
            <p><RouterLink :to="{ name: 'dashboard', params: { businessId: shown.id } }">Back to the dashboard</RouterLink></p>
        </template>
        <template v-else-if="state.kind === 'notFound'">
            <h1>Business not found</h1>
            <p>It doesn't exist, or it isn't one of yours.</p>
        </template>

        <!-- In every state, so the user can always leave or log out. -->
        <p><RouterLink :to="{ name: 'businesses' }">Your businesses</RouterLink></p>
        <LogoutButton />
    </div>
</template>
