<script setup lang="ts">
// Package imports
import { computed, ref, watch } from 'vue';

// Project imports
import { useForm } from '@/composables/useForm';
import { suggestedVatTreatment } from '@/domains/invoices/suggestedVatTreatment';
import type { BankAccount } from '@/services/bankAccounts';
import type { Client } from '@/services/clients';
import { VAT_TREATMENTS, type InvoicePayload, type VatTreatment, type VersionedInvoice } from '@/services/invoices';

// What the form starts from. A union of one for now, so editing an existing
// draft can be added as a second member without changing the callers.
export type InvoiceFormInitial = { kind: 'new' };

// One form for creating and editing a draft's own fields (not its lines),
// so the two can't drift apart. The page decides what saving means.
//
// save is a prop, not an emit, for the same reason as in ClientForm: the
// form awaits it, so a 422 lands in useForm's errors.
const props = defineProps<{
    initial: InvoiceFormInitial; // copied once, when the form mounts
    clients: readonly Client[];
    bankAccounts: readonly BankAccount[];
    defaultTermDays: number; // the business's term, shown when the field is empty
    label: string; // the form's accessible name
    submitLabel: string;
    save: (payload: InvoicePayload) => Promise<VersionedInvoice>;
}>();

// What the form holds. null until picked: nothing is preselected, so an
// invoice can't go to the first client in the list by accident. The term is
// text, because an input holds text; '' means the business's default.
interface InvoiceFormFields
{
    client_id: number | null;
    bank_account_id: number | null;
    vat_treatment: VatTreatment | null;
    payment_term_days: string;
}

const form = ref<InvoiceFormFields>({ client_id: null, bank_account_id: null, vat_treatment: null, payment_term_days: '' });

// A Record over every treatment, so one added later fails to compile until
// it has a label.
const TREATMENT_LABELS: Record<VatTreatment, string> = {
    domestic: 'Dutch VAT',
    reverse_charge: 'Reverse charge (EU business)',
    outside_scope: 'Outside the EU, no VAT',
};

// Every pick of a client, the first one included, refills the treatment: one
// left over from the previous client could be wrong for this one. A watch on
// the id only, so a hand-picked treatment stays until the client changes.
watch(() => form.value.client_id, (clientId) =>
{
    const client = props.clients.find((candidate) => candidate.id === clientId);

    if (client !== undefined)
    {
        form.value.vat_treatment = suggestedVatTreatment(client);
    }
});

// Every field true: each has its own control. `lines` isn't one, so a 422 on
// a line would show in generalMessage; this form sends none yet.
const { submit, isPending, fieldError, throttleMessage, generalMessage } = useForm<keyof InvoiceFormFields>('invoice', {
    client_id: true,
    bank_account_id: true,
    vat_treatment: true,
    payment_term_days: true,
});

const clientError = computed(() => fieldError('client_id'));
const bankAccountError = computed(() => fieldError('bank_account_id'));
const treatmentError = computed(() => fieldError('vat_treatment'));
const termError = computed(() => fieldError('payment_term_days'));

// The treatment is filled in by the client pick, so two picks make a form
// that can be sent.
const canSubmit = computed(() => form.value.client_id !== null && form.value.bank_account_id !== null && form.value.vat_treatment !== null);

// A failure useForm doesn't show: a 404, a 500, a response of the wrong
// shape. Cleared by the next submit.
const hasFailed = ref(false);

const onSubmit = async (): Promise<void> =>
{
    hasFailed.value = false;

    const { client_id: clientId, bank_account_id: bankAccountId, vat_treatment: treatment, payment_term_days: term } = form.value;

    // The button is disabled until all three are picked, so getting here
    // without one is a bug, not a user mistake.
    if (clientId === null || bankAccountId === null || treatment === null)
    {
        throw new Error('InvoiceForm submitted before a client, bank account and VAT treatment were picked.');
    }

    try
    {
        await submit(async () =>
        {
            // No lines yet: they come with the lines editor, and the backend
            // accepts a draft without any. Number('1.5') is sent as it is:
            // the backend's integer rule answers it next to the field.
            await props.save({
                client_id: clientId,
                bank_account_id: bankAccountId,
                vat_treatment: treatment,
                payment_term_days: term.trim() === '' ? null : Number(term),
                lines: [],
            });
        });
    }
    catch (error) // unknown: anything can be thrown
    {
        hasFailed.value = true;
        throw error;
    }
};
</script>

<template>
    <form :aria-label="label" @submit.prevent="onSubmit">
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. -->
        <div role="status">
            <p v-if="throttleMessage">{{ throttleMessage }}</p>
            <p v-else-if="generalMessage">{{ generalMessage }}</p>
            <p v-else-if="hasFailed">Couldn't save.</p>
        </div>

        <div>
            <label for="invoice-client_id">Client</label>
            <select
                id="invoice-client_id"
                v-model="form.client_id"
                :disabled="isPending"
                required
                :aria-invalid="clientError !== null"
                :aria-describedby="clientError?.id"
            >
                <option :value="null" disabled>Choose a client</option>
                <option v-for="client in clients" :key="client.id" :value="client.id">{{ client.name }}</option>
            </select>
            <p v-if="clientError" :id="clientError.id">{{ clientError.message }}</p>
        </div>
        <div>
            <label for="invoice-vat_treatment">VAT</label>
            <!-- Disabled until a client is picked: the pick fills it in. -->
            <select
                id="invoice-vat_treatment"
                v-model="form.vat_treatment"
                :disabled="isPending || form.client_id === null"
                required
                :aria-invalid="treatmentError !== null"
                :aria-describedby="treatmentError?.id"
            >
                <option :value="null" disabled>Choose a client first</option>
                <option v-for="treatment in VAT_TREATMENTS" :key="treatment" :value="treatment">{{ TREATMENT_LABELS[treatment] }}</option>
            </select>
            <p v-if="treatmentError" :id="treatmentError.id">{{ treatmentError.message }}</p>
        </div>
        <div>
            <label for="invoice-bank_account_id">Paid into</label>
            <select
                id="invoice-bank_account_id"
                v-model="form.bank_account_id"
                :disabled="isPending"
                required
                :aria-invalid="bankAccountError !== null"
                :aria-describedby="bankAccountError?.id"
            >
                <option :value="null" disabled>Choose a bank account</option>
                <option v-for="account in bankAccounts" :key="account.id" :value="account.id">{{ account.label }} ({{ account.iban }})</option>
            </select>
            <p v-if="bankAccountError" :id="bankAccountError.id">{{ bankAccountError.message }}</p>
        </div>
        <div>
            <label for="invoice-payment_term_days">Payment term in days (optional)</label>
            <input
                id="invoice-payment_term_days"
                v-model="form.payment_term_days"
                :readonly="isPending"
                type="text"
                inputmode="numeric"
                :placeholder="`Default: ${defaultTermDays}`"
                :aria-invalid="termError !== null"
                :aria-describedby="termError?.id"
            />
            <p v-if="termError" :id="termError.id">{{ termError.message }}</p>
        </div>

        <button type="submit" :disabled="isPending || !canSubmit">{{ submitLabel }}</button>
    </form>
</template>
