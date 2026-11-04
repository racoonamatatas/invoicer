<script setup lang="ts">
// Package imports
import { RouterLink } from 'vue-router';

// Project imports
import LogoutButton from '@/components/LogoutButton.vue';
// From the businesses domain: an invoice belongs to a business, so invoices
// may depend on businesses, never the other way round.
import { useRouteBusiness } from '@/domains/businesses/composables/useRouteBusiness';
import { useInvoiceList } from '@/domains/invoices/composables/useInvoiceList';
import { formatCents } from '@/form/amounts';
import type { InvoiceStatus } from '@/services/invoices';

const { state, retry } = useRouteBusiness();

// Invoices load once the business is found, never for an id that isn't the
// user's: the list already answered that, so a request would only be a 404.
const { state: invoices, reload } = useInvoiceList(() => (state.value.kind === 'found' ? state.value.business.id : null));

// A Record over every status, so a status added later fails to compile until
// it has a label, and someone decides then whether its number shows.
const STATUS_LABELS: Record<InvoiceStatus, string> = {
    draft: 'Draft',
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
        <!-- The registered name, so a wrong id in the URL is visible at once. -->
        <template v-else-if="state.kind === 'found'">
            <h1>Invoices · {{ state.business.registered_name }}</h1>

            <!-- The invoices' own live region, under the heading, so its
                 message sits next to its Try again. -->
            <p>
                <span id="invoices-status" role="status">
                    <template v-if="invoices.kind === 'loading'">Loading invoices...</template>
                    <template v-else-if="invoices.kind === 'failed'">Couldn't load the invoices.</template>
                </span>
                <button v-if="invoices.kind === 'failed'" type="button" @click="reload">Try again</button>
            </p>
            <template v-if="invoices.kind === 'loaded'">
                <!-- No number and no id anywhere: a draft has no number, and
                     an id next to one could be taken for it. -->
                <table v-if="invoices.rows.length > 0" aria-label="Invoices">
                    <thead>
                        <tr>
                            <th scope="col">Client</th>
                            <th scope="col">Status</th>
                            <th scope="col">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in invoices.rows" :key="row.invoice.id">
                            <!-- Only the name is the link: a screen reader
                                 reads a link's text on its own. -->
                            <td><RouterLink :to="{ name: 'editInvoice', params: { businessId: state.business.id, invoiceId: row.invoice.id } }">{{ row.clientName }}</RouterLink></td>
                            <td>{{ STATUS_LABELS[row.invoice.status] }}</td>
                            <td>{{ formatCents(row.total) }}</td>
                        </tr>
                    </tbody>
                </table>
                <p v-else>No invoices yet.</p>
            </template>

            <!-- Outside the list's states: starting an invoice works even while
                 the list is loading or failed. -->
            <p><RouterLink :to="{ name: 'newInvoice', params: { businessId: state.business.id } }">New invoice</RouterLink></p>

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
