<script setup lang="ts">
// Package imports
import { computed, ref, watch } from 'vue';

// Project imports
import { useForm } from '@/composables/useForm';
import { suggestedVatTreatment } from '@/domains/invoices/suggestedVatTreatment';
import { withStoredLines } from '@/domains/invoices/withStoredLines';
import type { BankAccount } from '@/services/bankAccounts';
import type { Client } from '@/services/clients';
import {
    InvoiceVersionConflictError,
    VAT_TREATMENTS,
    type Invoice,
    type InvoiceFieldsPayload,
    type InvoicePayload,
    type VatTreatment,
    type VersionedInvoice,
} from '@/services/invoices';

// What the form starts from: nothing, or a stored draft whose lines go back
// unchanged on every save.
export type InvoiceFormInitial =
    | { kind: 'new' }
    | { kind: 'existing'; invoice: Invoice };

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
    savedMessage: string; // shown in the status region until the next edit
    save: (payload: InvoicePayload) => Promise<VersionedInvoice>;
}>();

const emit = defineEmits<{
    reload: []; // "Load the latest version" after a 412
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

const fieldsFrom = (initial: InvoiceFormInitial): InvoiceFormFields =>
{
    if (initial.kind === 'new')
    {
        return { client_id: null, bank_account_id: null, vat_treatment: null, payment_term_days: '' };
    }

    const { invoice } = initial;

    return {
        client_id: invoice.client_id,
        bank_account_id: invoice.bank_account_id,
        vat_treatment: invoice.vat_treatment,
        payment_term_days: invoice.payment_term_days === null ? '' : String(invoice.payment_term_days),
    };
};

const form = ref<InvoiceFormFields>(fieldsFrom(props.initial));

// A Record over every treatment, so one added later fails to compile until
// it has a label.
const TREATMENT_LABELS: Record<VatTreatment, string> = {
    domestic: 'Dutch VAT',
    reverse_charge: 'Reverse charge (EU business)',
    outside_scope: 'Outside the EU, no VAT',
};

// Every pick of a client refills the treatment: one left over from the
// previous client could be wrong for this one. Not immediate, so opening a
// stored draft keeps the treatment it was saved with. A watch on the id
// only, so a hand-picked treatment stays until the client changes.
watch(() => form.value.client_id, (clientId) =>
{
    const client = props.clients.find((candidate) => candidate.id === clientId);

    if (client !== undefined)
    {
        form.value.vat_treatment = suggestedVatTreatment(client);
    }
});

// What the term field holds. Checked here, not left to the backend: Number()
// turns 'abc' into NaN, which JSON sends as null, and null means the
// business's default. So '30 days' would save as the default and say
// "Saved.". Digits only, like parseRouteId: Number() also takes '1e1',
// '0x1E' and '30.'. The range (1 to 365) stays the backend's to judge.
type TermInput =
    | { kind: 'default' }
    | { kind: 'days'; days: number }
    | { kind: 'invalid' };

const termInput = computed((): TermInput =>
{
    const term = form.value.payment_term_days.trim();

    if (term === '')
    {
        return { kind: 'default' };
    }

    // A long digit string would lose precision, so it is invalid too.
    const days = Number(term);

    return /^[1-9]\d*$/.test(term) && Number.isSafeInteger(days) ? { kind: 'days', days } : { kind: 'invalid' };
});

// The fields as the backend takes them, or null while a pick is missing or
// the term isn't a whole number.
const fieldsPayload = computed((): InvoiceFieldsPayload | null =>
{
    const { client_id: clientId, bank_account_id: bankAccountId, vat_treatment: treatment } = form.value;
    const term = termInput.value;

    if (clientId === null || bankAccountId === null || treatment === null || term.kind === 'invalid')
    {
        return null;
    }

    return {
        client_id: clientId,
        bank_account_id: bankAccountId,
        vat_treatment: treatment,
        payment_term_days: term.kind === 'default' ? null : term.days,
    };
});

// A new draft has no lines yet; a stored one sends its own back. null while
// the fields are incomplete, or when the stored lines can't follow the
// treatment (see withStoredLines).
const payload = computed((): InvoicePayload | null =>
{
    const fields = fieldsPayload.value;

    if (fields === null)
    {
        return null;
    }

    return props.initial.kind === 'new' ? { ...fields, lines: [] } : withStoredLines(fields, props.initial.invoice);
});

// Complete fields that still can't be sent: only a treatment switch on a
// draft with lines does that.
const isSwitchBlocked = computed(() => fieldsPayload.value !== null && payload.value === null);

// Every field true: each has its own control. `lines` isn't one, so a 422 on
// a line shows in generalMessage.
const { submit, isPending, fieldError, throttleMessage, generalMessage } = useForm<keyof InvoiceFormFields>('invoice', {
    client_id: true,
    bank_account_id: true,
    vat_treatment: true,
    payment_term_days: true,
});

const clientError = computed(() => fieldError('client_id'));
const bankAccountError = computed(() => fieldError('bank_account_id'));
const treatmentError = computed(() => fieldError('vat_treatment'));
// The form's own check comes first: an invalid term is never sent, so a
// backend error on it can only be about an earlier, valid one.
const termError = computed(() => (termInput.value.kind === 'invalid'
    ? { id: 'invoice-payment_term_days-format', message: 'Enter a whole number of days, like 30.' }
    : fieldError('payment_term_days')));

// The form's fields right after the last save, as JSON so a deep comparison
// is one string compare. null until a save went through.
const savedFields = ref<string | null>(null);

const isSaved = computed(() => savedFields.value !== null && JSON.stringify(form.value) === savedFields.value);

// A 412: saved elsewhere since this version was loaded. An answer, not a
// fault, so it isn't re-thrown; the fields keep the user's edits.
const hasConflict = ref(false);

// A failure useForm doesn't show: a 404, a 500, a response of the wrong
// shape. Cleared by the next submit.
const hasFailed = ref(false);

const onSubmit = async (): Promise<void> =>
{
    savedFields.value = null;
    hasConflict.value = false;
    hasFailed.value = false;

    const sent = payload.value;

    // The button is disabled while there is no payload, so getting here
    // without one is a bug, not a user mistake.
    if (sent === null)
    {
        throw new Error('InvoiceForm submitted without a complete payload.');
    }

    try
    {
        await submit(async () =>
        {
            const stored = await props.save(sent);

            // An edit shows what the backend stored. A new draft's page
            // moves to the edit route meanwhile.
            if (props.initial.kind === 'existing')
            {
                form.value = fieldsFrom({ kind: 'existing', invoice: stored.invoice });
                savedFields.value = JSON.stringify(form.value);
            }
        });
    }
    catch (error) // unknown: anything can be thrown
    {
        if (error instanceof InvoiceVersionConflictError)
        {
            hasConflict.value = true;

            return;
        }

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
            <p v-else-if="hasConflict">This draft was changed elsewhere. Your edits weren't saved.</p>
            <p v-else-if="hasFailed">Couldn't save.</p>
            <p v-else-if="isSaved">{{ savedMessage }}</p>
        </div>
        <!-- Replaces the form with the stored draft, so the user's edits go:
             their choice, after reading the message above. -->
        <button v-if="hasConflict" type="button" @click="emit('reload')">Load the latest version</button>

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

        <p v-if="isSwitchBlocked" id="invoice-switch-blocked">
            This draft has lines. Switching between Dutch VAT and no VAT comes with the lines editor.
        </p>
        <button type="submit" :disabled="isPending || payload === null" :aria-describedby="isSwitchBlocked ? 'invoice-switch-blocked' : undefined">{{ submitLabel }}</button>
    </form>
</template>
