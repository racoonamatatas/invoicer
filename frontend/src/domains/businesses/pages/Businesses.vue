<script setup lang="ts">
// Package imports
import { onMounted, onUnmounted } from 'vue';

// Project imports
import { useBusinessList } from '@/domains/businesses/composables/useBusinessList';
import { useBusinessesStore } from '@/domains/businesses/store';

const store = useBusinessesStore();
const { state, retry } = useBusinessList();

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
            <ul v-if="state.businesses.length > 0">
                <li v-for="business in state.businesses" :key="business.id">
                    {{ business.legal_name }} (KvK {{ business.kvk_number }})
                </li>
            </ul>
            <p v-else>You have no businesses yet.</p>
        </template>
    </div>
</template>
