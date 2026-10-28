<script setup lang="ts">
// Package imports
import { watch } from 'vue';
import { useRouter } from 'vue-router';

// Project imports
import LogoutButton from '@/components/LogoutButton.vue';
import { useBusinessList } from '@/domains/businesses/composables/useBusinessList';

const router = useRouter();
const { state, retry } = useBusinessList();

// Decides where a logged-in user starts: straight into their business when
// they have exactly one, otherwise the list, which opens its create form
// itself when the list is empty. replace, not push: this page is only a
// fork in the road, so Back skips it instead of bouncing through it.
// immediate: a list the store already holds redirects without waiting.
watch(state, async (current) =>
{
    if (current.kind !== 'loaded')
    {
        return;
    }

    const [only, ...others] = current.businesses;

    await router.replace(only !== undefined && others.length === 0
        ? { name: 'dashboard', params: { businessId: only.id } }
        : { name: 'businesses' });
}, { immediate: true });
</script>

<template>
    <div>
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. -->
        <div role="status">
            <p v-if="state.kind === 'failed'">Couldn't load your businesses.</p>
            <p v-else>Loading...</p>
        </div>
        <!-- Log out too: a failed load is the one state this page stays in. -->
        <template v-if="state.kind === 'failed'">
            <button type="button" @click="retry">Try again</button>
            <LogoutButton />
        </template>
    </div>
</template>
