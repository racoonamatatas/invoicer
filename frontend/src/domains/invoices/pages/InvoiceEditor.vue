<script setup lang="ts">
// Package imports
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

// Project imports
import LogoutButton from '@/components/LogoutButton.vue';
// From the businesses and clients domains: an invoice belongs to a business
// and goes to a client, so invoices may depend on both, never the other way
// round.
import { useBankAccounts } from '@/domains/businesses/composables/useBankAccounts';
import { useRouteBusiness } from '@/domains/businesses/composables/useRouteBusiness';
import { useClients } from '@/domains/clients/composables/useClients';
import InvoiceForm from '@/domains/invoices/components/InvoiceForm.vue';
import { createInvoice, type InvoicePayload, type VersionedInvoice } from '@/services/invoices';

const route = useRoute();
const router = useRouter();

const { state, retry } = useRouteBusiness();

const businessId = (): number | null => (state.value.kind === 'found' ? state.value.business.id : null);

// Both pickers load once the business is found, never for an id that isn't
// the user's: the list already answered that.
const { state: clients, reload: reloadClients } = useClients(businessId);
const { state: bankAccounts, reload: reloadBankAccounts } = useBankAccounts(businessId);

// One route name per page mode. Editing an existing draft is known and
// planned; until then its route only says so.
const isNew = computed(() => route.name === 'newInvoice');

// Loaded lists only, with at least one entry each: an empty picker would make
// a form that can't be sent.
const pickers = computed(() =>
{
    if (clients.value.kind !== 'loaded' || bankAccounts.value.kind !== 'loaded')
    {
        return null;
    }

    return { clients: clients.value.clients, bankAccounts: bankAccounts.value.accounts };
});

// replace, not push: Back after a save goes to the invoices, not to an empty
// "new" form that would make a second draft.
const create = async (payload: InvoicePayload): Promise<VersionedInvoice> =>
{
    const id = businessId();

    if (id === null)
    {
        throw new Error('InvoiceEditor saved before its business was found.');
    }

    const created = await createInvoice(id, payload);
    await router.replace({ name: 'editInvoice', params: { invoiceId: created.invoice.id } });

    return created;
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
        <template v-else-if="state.kind === 'found'">
            <template v-if="isNew">
                <h1>New invoice</h1>

                <!-- The pickers' own live region, so each message sits next
                     to its Try again. -->
                <div id="invoice-pickers-status" role="status">
                    <p v-if="clients.kind === 'loading' || bankAccounts.kind === 'loading'">Loading clients and bank accounts...</p>
                    <p v-if="clients.kind === 'failed'">Couldn't load the clients.</p>
                    <p v-if="bankAccounts.kind === 'failed'">Couldn't load the bank accounts.</p>
                </div>
                <button v-if="clients.kind === 'failed'" type="button" @click="reloadClients">Try again with the clients</button>
                <button v-if="bankAccounts.kind === 'failed'" type="button" @click="reloadBankAccounts">Try again with the bank accounts</button>

                <template v-if="pickers !== null">
                    <p v-if="pickers.clients.length === 0">
                        An invoice needs a client. <RouterLink :to="{ name: 'clients' }">Add a client first</RouterLink>.
                    </p>
                    <p v-if="pickers.bankAccounts.length === 0">
                        An invoice needs a bank account to be paid into. <RouterLink :to="{ name: 'bankAccounts' }">Add a bank account first</RouterLink>.
                    </p>
                    <InvoiceForm
                        v-if="pickers.clients.length > 0 && pickers.bankAccounts.length > 0"
                        :initial="{ kind: 'new' }"
                        :clients="pickers.clients"
                        :bank-accounts="pickers.bankAccounts"
                        :default-term-days="state.business.payment_term_days"
                        label="New invoice"
                        submit-label="Create draft"
                        :save="create"
                    />
                </template>
            </template>
            <template v-else>
                <h1>Edit invoice</h1>
                <p>Editing a draft isn't built yet.</p>
            </template>

            <!-- No params: Vue Router reuses the current :businessId. -->
            <p><RouterLink :to="{ name: 'invoices' }">Back to the invoices</RouterLink></p>
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
