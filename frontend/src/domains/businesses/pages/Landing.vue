<script setup lang="ts">
// Package imports
import { ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

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
//
// A redirect that doesn't happen would leave "Loading..." up for good, so the
// page offers the list instead. A guard that stops the navigation resolves
// with a failure; a page that can't load (a lost chunk) rejects, and is
// re-thrown for Vue's error handler.
const hasRedirectFailed = ref(false);

watch(state, async (current) =>
{
    if (current.kind !== 'loaded')
    {
        return;
    }

    const [only, ...others] = current.businesses;

    try
    {
        const failure = await router.replace(only !== undefined && others.length === 0
            ? { name: 'dashboard', params: { businessId: only.id } }
            : { name: 'businesses' });

        hasRedirectFailed.value = failure !== undefined;
    }
    catch (error) // unknown: anything can be thrown
    {
        hasRedirectFailed.value = true;
        throw error;
    }
}, { immediate: true });
</script>

<template>
    <div>
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. -->
        <div role="status">
            <p v-if="state.kind === 'failed'">Couldn't load your businesses.</p>
            <p v-else-if="hasRedirectFailed">Couldn't open your page.</p>
            <p v-else>Loading...</p>
        </div>
        <!-- Log out in both: they are the two states this page stays in. -->
        <template v-if="state.kind === 'failed'">
            <button type="button" @click="retry">Try again</button>
            <LogoutButton />
        </template>
        <template v-else-if="hasRedirectFailed">
            <p><RouterLink :to="{ name: 'businesses' }">Your businesses</RouterLink></p>
            <LogoutButton />
        </template>
    </div>
</template>
