<script setup lang="ts">
// Package imports
import { RouterLink } from 'vue-router';

// Project imports
import LogoutButton from '@/components/LogoutButton.vue';
// From the businesses domain: a client belongs to a business, so clients may
// depend on businesses, never the other way round.
import { useRouteBusiness } from '@/domains/businesses/composables/useRouteBusiness';
import ClientForm from '@/domains/clients/components/ClientForm.vue';
import { useClients } from '@/domains/clients/composables/useClients';
import { countryName } from '@/services/address';
import { createClient, type Client, type ClientPayload } from '@/services/clients';

const { state, retry } = useRouteBusiness();

// Clients load once the business is found, never for an id that isn't the
// user's: the list already answered that, so a request would only be a 404.
const { state: clients, reload } = useClients(() => (state.value.kind === 'found' ? state.value.business.id : null));

// Takes the id while the template has it narrowed: a closure written inline
// would read state again later, where TypeScript no longer knows it's found.
const createClientFor = (businessId: number) => (payload: ClientPayload): Promise<Client> => createClient(businessId, payload);
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

            <!-- The clients' own live region, under the heading, so its
                 message sits next to its Try again. Spans, so both share a
                 line. -->
            <p>
                <span id="clients-status" role="status">
                    <template v-if="clients.kind === 'loading'">Loading clients...</template>
                    <template v-else-if="clients.kind === 'failed'">Couldn't load the clients.</template>
                </span>
                <button v-if="clients.kind === 'failed'" type="button" @click="reload">Try again</button>
            </p>
            <template v-if="clients.kind === 'loaded'">
                <ul v-if="clients.clients.length > 0" aria-label="Clients">
                    <!-- Only the name is the link: a screen reader reads a
                         link's text on its own, and the name says where it
                         goes. -->
                    <li v-for="client in clients.clients" :key="client.id">
                        <RouterLink :to="{ name: 'editClient', params: { businessId: state.business.id, clientId: client.id } }">{{ client.name }}</RouterLink>, {{ client.city }}, {{ countryName(client.country_code) }}
                    </li>
                </ul>
                <p v-else>No clients yet.</p>
            </template>

            <!-- Outside the list's states: adding works even while the list
                 is loading or failed. Keyed by id, so another business in the
                 URL gets an empty form with its own country. The reload puts
                 the new client in the server's order. -->
            <ClientForm
                :key="state.business.id"
                :initial="{ kind: 'new', countryCode: state.business.country_code }"
                label="Add a client"
                submit-label="Add"
                saved-message="Added."
                :save="createClientFor(state.business.id)"
                @saved="reload"
            />

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
