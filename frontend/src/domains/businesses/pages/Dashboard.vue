<script setup lang="ts">
// Package imports
import { RouterLink } from 'vue-router';

// Project imports
import LogoutButton from '@/components/LogoutButton.vue';
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
            <h1>{{ state.business.registered_name }}</h1>
            <p><RouterLink :to="{ name: 'editBusiness', params: { businessId: state.business.id } }">Edit details</RouterLink></p>
            <p><RouterLink :to="{ name: 'bankAccounts', params: { businessId: state.business.id } }">Bank accounts</RouterLink></p>
            <p><RouterLink :to="{ name: 'clients', params: { businessId: state.business.id } }">Clients</RouterLink></p>
        </template>
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
