<script setup lang="ts">
// Package imports
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

// Project imports
import LogoutButton from '@/components/LogoutButton.vue';
import BusinessForm from '@/domains/businesses/components/BusinessForm.vue';
import { useBusinessList } from '@/domains/businesses/composables/useBusinessList';
import { useBusinessesStore } from '@/domains/businesses/store';
import type { Business, BusinessPayload } from '@/services/businesses';

const store = useBusinessesStore();
const router = useRouter();
const { state, retry } = useBusinessList();

// The form opens itself for a user with no business yet, since adding one is
// all there is to do. Otherwise it waits behind "Add a business". Never while
// loading, so it can't flash open for a user who has businesses.
//
// Opening sets isAdding, and the form renders on isAdding alone, not on the
// list's state: once open, only Cancel or a create closes it. Otherwise a
// reload that brings in a business added elsewhere, or a list emptied while it
// loads again, would unmount the form and lose what was typed.
const isAdding = ref(false);

watch(state, (current) =>
{
    if (current.kind === 'loaded' && current.businesses.length === 0)
    {
        isAdding.value = true;
    }
}, { immediate: true });

const hasBusinesses = computed(() => state.value.kind === 'loaded' && state.value.businesses.length > 0);

// A 422 is thrown by store.create() and caught by the form.
const save = (payload: BusinessPayload): Promise<Business> => store.create(payload);

// Creating ends on the new business's dashboard, so there is no saved
// message to show. On the form's saved event, not inside save: a failed
// navigation isn't a failed save, and the business exists by now.
const onSaved = async (business: Business): Promise<void> =>
{
    await router.push({ name: 'dashboard', params: { businessId: business.id } });
};

// A business added in another tab or on another device shows up when the
// user comes back to this one. A failed refresh is ignored: the list on
// screen is still the last one that loaded, and the next return tries
// again. The cost: an unexpected response is ignored here too, and only
// shows on the next load().
const onVisibilityChange = async (): Promise<void> =>
{
    if (document.visibilityState !== 'visible')
    {
        return;
    }

    try
    {
        await store.reload();
    }
    catch
    {
        // Ignored on purpose, see above.
    }
};

// Removed on unmount, so a page the user left doesn't keep reloading.
onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange));
onUnmounted(() => document.removeEventListener('visibilitychange', onVisibilityChange));
</script>

<template>
    <div>
        <h1>Your businesses</h1>
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. -->
        <div role="status">
            <p v-if="state.kind === 'loading'">Loading...</p>
            <p v-else-if="state.kind === 'failed'">Couldn't load your businesses.</p>
        </div>

        <button v-if="state.kind === 'failed'" type="button" @click="retry">Try again</button>
        <template v-else-if="state.kind === 'loaded'">
            <ul v-if="hasBusinesses">
                <li v-for="business in state.businesses" :key="business.id">
                    <RouterLink :to="{ name: 'dashboard', params: { businessId: business.id } }">{{ business.registered_name }}</RouterLink>
                    (KvK {{ business.kvk_number }})
                </li>
            </ul>
            <p v-else>You have no businesses yet.</p>

            <button v-if="!isAdding" type="button" @click="isAdding = true">Add a business</button>
        </template>

        <!-- Outside the loaded branch, so the list leaving it doesn't unmount
             the form. -->
        <BusinessForm
            v-if="isAdding"
            :initial="null"
            label="Add a business"
            submit-label="Add business"
            :save="save"
            :saved-message="null"
            @saved="onSaved"
        >
            <!-- Only with a list to go back to: with none, the form is the page. -->
            <button v-if="hasBusinesses" type="button" @click="isAdding = false">Cancel</button>
        </BusinessForm>

        <!-- In every state: for a user with no business yet this is the only
             page there is, so it is the only place to log out. -->
        <p><RouterLink :to="{ name: 'changePassword' }">Change password</RouterLink></p>
        <LogoutButton />
    </div>
</template>
