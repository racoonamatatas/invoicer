<script setup lang="ts">
// Package imports
import { RouterLink } from 'vue-router';

// Project imports
import LogoutButton from '@/components/LogoutButton.vue';
// From the businesses domain: a client belongs to a business, so clients may
// depend on businesses, never the other way round.
import { useRouteBusiness } from '@/domains/businesses/composables/useRouteBusiness';
import ClientForm from '@/domains/clients/components/ClientForm.vue';
import { useRouteClient } from '@/domains/clients/composables/useRouteClient';

const { state, retry } = useRouteBusiness();

// The client loads once the business is found, never for an id that isn't
// the user's: the list already answered that, so a request would only be a
// 404.
const { state: client, retry: retryClient, save } = useRouteClient(() => (state.value.kind === 'found' ? state.value.business.id : null));
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
        <template v-else-if="state.kind === 'found'">
            <!-- The client's own live region, so its message sits next to its
                 Try again. Spans, so both share a line. -->
            <p>
                <span id="client-status" role="status">
                    <template v-if="client.kind === 'loading'">Loading client...</template>
                    <template v-else-if="client.kind === 'failed'">Couldn't load the client.</template>
                </span>
                <button v-if="client.kind === 'failed'" type="button" @click="retryClient">Try again</button>
            </p>

            <!-- Keyed by id: ClientForm copies its initial client once, so
                 another client in the URL needs a new form. A save replaces
                 the client with one of the same id, so the form stays, and
                 so does its "Saved.". The heading reads the replaced client,
                 so a rename shows there too. -->
            <template v-if="client.kind === 'found'">
                <h1>Edit {{ client.client.name }}</h1>
                <ClientForm
                    :key="client.client.id"
                    :initial="{ kind: 'existing', client: client.client }"
                    label="Client details"
                    submit-label="Save"
                    saved-message="Saved."
                    :save="save"
                />
            </template>
            <!-- Names the business, not the user: a client id from the
                 user's other business lands here too, and for that one "isn't
                 yours" would be wrong. True for every 404, so it says nothing
                 about other accounts. -->
            <template v-else-if="client.kind === 'notFound'">
                <h1>Client not found</h1>
                <p>It doesn't exist, or it isn't a client of {{ state.business.registered_name }}.</p>
            </template>

            <p><RouterLink :to="{ name: 'clients', params: { businessId: state.business.id } }">Back to the clients</RouterLink></p>
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
