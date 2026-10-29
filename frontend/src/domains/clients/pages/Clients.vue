<script setup lang="ts">
// Package imports
import { RouterLink } from 'vue-router';

// Project imports
import LogoutButton from '@/components/LogoutButton.vue';
// From the businesses domain: a client belongs to a business, so clients may
// depend on businesses, never the other way round.
import { useRouteBusiness } from '@/domains/businesses/composables/useRouteBusiness';

const { state, retry } = useRouteBusiness();
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
        <!-- The registered name, so a wrong id in the URL is visible at once. -->
        <template v-else-if="state.kind === 'found'">
            <h1>Clients · {{ state.business.registered_name }}</h1>

            <p><RouterLink :to="{ name: 'dashboard', params: { businessId: state.business.id } }">Back to the dashboard</RouterLink></p>
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
