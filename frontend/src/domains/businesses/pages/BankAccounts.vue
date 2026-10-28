<script setup lang="ts">
// Package imports
import { RouterLink } from 'vue-router';

// Project imports
import LogoutButton from '@/components/LogoutButton.vue';
import AddBankAccountForm from '@/domains/businesses/components/AddBankAccountForm.vue';
import { useBankAccounts } from '@/domains/businesses/composables/useBankAccounts';
import { useRouteBusiness } from '@/domains/businesses/composables/useRouteBusiness';

const { state, retry } = useRouteBusiness();

// Accounts load once the business is found, never for an id that isn't the
// user's: the list already answered that, so a request would only be a 404.
const { state: accounts, reload } = useBankAccounts(() => (state.value.kind === 'found' ? state.value.business.id : null));

// For reading only: 'NL91ABNA0417164300' shows as 'NL91 ABNA 0417 1643 00'.
// The stored value is never changed, and nothing sends this form back.
const groupIban = (iban: string): string => iban.replace(/(.{4})(?=.)/g, '$1 ');
</script>

<template>
    <div>
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. -->
        <div role="status">
            <p v-if="state.kind === 'loading'">Loading...</p>
            <p v-else-if="state.kind === 'failed'">Couldn't load your businesses.</p>
            <template v-else-if="state.kind === 'found'">
                <p v-if="accounts.kind === 'loading'">Loading bank accounts...</p>
                <p v-else-if="accounts.kind === 'failed'">Couldn't load the bank accounts.</p>
            </template>
        </div>

        <button v-if="state.kind === 'failed'" type="button" @click="retry">Try again</button>
        <!-- The registered name, so a wrong id in the URL is visible at once. -->
        <template v-else-if="state.kind === 'found'">
            <h1>Bank accounts · {{ state.business.registered_name }}</h1>

            <button v-if="accounts.kind === 'failed'" type="button" @click="reload">Try again</button>
            <template v-else-if="accounts.kind === 'loaded'">
                <ul v-if="accounts.accounts.length > 0" aria-label="Bank accounts">
                    <!-- Label and IBAN in their own span, apart from the row's
                         buttons. -->
                    <li v-for="account in accounts.accounts" :key="account.id">
                        <span>{{ account.label }} {{ groupIban(account.iban) }}</span>
                    </li>
                </ul>
                <p v-else>No bank accounts yet.</p>
            </template>

            <!-- Outside the list's states: adding works even while the list
                 is loading or failed. Keyed by id, so another business in the
                 URL gets an empty form. The reload puts the new account in
                 the server's order. -->
            <AddBankAccountForm :key="state.business.id" :business-id="state.business.id" @added="reload" />

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
