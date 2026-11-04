<script setup lang="ts">
// Package imports
import { computed, ref, watch } from 'vue';

// Project imports
import { useForm } from '@/composables/useForm';
import InvoiceLineFields, { type LineField } from '@/domains/invoices/components/InvoiceLineFields.vue';
import InvoiceTotalsSummary from '@/domains/invoices/components/InvoiceTotalsSummary.vue';
import { MAX_LINES, emptyRow, payloadWithRows, rowContent, rowsFrom, type LineRow } from '@/domains/invoices/lineRows';
import { suggestedVatTreatment } from '@/domains/invoices/suggestedVatTreatment';
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

// What the form starts from: nothing, or a stored draft.
export type InvoiceFormInitial =
    | { kind: 'new' }
    | { kind: 'existing'; invoice: Invoice };

// One form for creating and editing a draft, its fields and its lines, so
// the two can't drift apart. The page decides what saving means.
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

const emit = defineEmits<{
    reload: []; // "Load the latest version" after a failed save
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

// The lines, apart from the fields: each row is its own component, and the
// list is replaced, never patched, so a row's v-model can't miss a change.
const rows = ref<LineRow[]>(props.initial.kind === 'new' ? [] : rowsFrom(props.initial.invoice.lines));

const addLine = (): void =>
{
    rows.value = [...rows.value, emptyRow()];
};

// By key, not index: the index of a row can change while its button is
// being pressed, its key can't.
const removeLine = (key: number): void =>
{
    rows.value = rows.value.filter((row) => row.key !== key);
};

const replaceLine = (updated: LineRow): void =>
{
    rows.value = rows.value.map((row) => (row.key === updated.key ? updated : row));
};

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

// Whether the last switch cleared at least one picked rate, so the user hears
// about it: a client pick can switch the treatment without them touching it.
// Every switch sets it again, so it only ever describes the last one. Back
// on Dutch VAT the empty selects and the note by Save take over, and a
// save, which stores the cleared rates, ends it too.
const hasClearedRates = ref(false);

// Off Dutch VAT, no line may hold an option: the server refuses the
// combination, so the form never holds it either. Back on Dutch VAT each line
// needs a new pick, which keeps Save disabled until it has one: the old
// option is gone rather than silently restored.
watch(() => form.value.vat_treatment, (treatment) =>
{
    if (treatment === 'domestic')
    {
        hasClearedRates.value = false;

        return;
    }

    hasClearedRates.value = rows.value.some((row) => row.vat_option !== null);
    rows.value = rows.value.map((row) => ({ ...row, vat_option: null }));
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

// null while the fields are incomplete or a row can't be sent (see
// payloadWithRows).
const payload = computed((): InvoicePayload | null =>
{
    const fields = fieldsPayload.value;

    return fields === null ? null : payloadWithRows(fields, rows.value);
});

// The fields are complete, so only a line keeps Save disabled. Said next to
// the button, because a disabled button can't say why itself.
const areLinesIncomplete = computed(() => fieldsPayload.value !== null && payload.value === null);

// Each row's key, in the order the last save sent them. A 422 names a line by
// its index in that request; a row added or removed since would shift every
// later index, so a row looks up its index here, not in the list it is in
// now. A row added since has none, and so no server errors.
const sentKeys = ref<readonly number[]>([]);

// Each sent row's index, by key: a number per row, so a row's props stay
// equal between renders and a keystroke elsewhere doesn't re-render it.
const sentIndexes = computed(() => new Map(sentKeys.value.map((key, index) => [key, index])));

// Whether the row a 422 key names (`lines.2.description`) is still in the
// list. Removed since, it has nowhere to show its error.
const isSentRowShown = (key: string): boolean =>
{
    const sentKey = sentKeys.value[Number(key.split('.')[1])]; // undefined for a key without an index

    return sentKey !== undefined && rows.value.some((row) => row.key === sentKey);
};

// A line's fields as wildcards: a 422 names each line by its index. Each is
// a check, not true: an error counts as shown only while its row is on the
// page, and a VAT rate's only while the select is, so generalMessage takes
// over when neither is.
const { submit, isPending, fieldError, throttleMessage, generalMessage } = useForm<keyof InvoiceFormFields | 'lines' | `lines.*.${LineField}`>('invoice', {
    client_id: true,
    bank_account_id: true,
    vat_treatment: true,
    payment_term_days: true,
    lines: false, // the list itself, like more than 100 lines: no input of its own
    'lines.*.description': isSentRowShown,
    'lines.*.quantity_hundredths': isSentRowShown,
    'lines.*.unit_price_cents': isSentRowShown,
    'lines.*.vat_option': (key) => form.value.vat_treatment === 'domestic' && isSentRowShown(key),
});

const clientError = computed(() => fieldError('client_id'));
const bankAccountError = computed(() => fieldError('bank_account_id'));
const treatmentError = computed(() => fieldError('vat_treatment'));
// The form's own check comes first: an invalid term is never sent, so a
// backend error on it can only be about an earlier, valid one.
const termError = computed(() => (termInput.value.kind === 'invalid'
    ? { id: 'invoice-payment_term_days-format', message: 'Enter a whole number of days, like 30.' }
    : fieldError('payment_term_days')));

// What the form holds, as JSON so a deep comparison is one string compare.
// The rows by their content (see rowContent), so retyping `7,5` as `7,50`
// isn't a change.
const snapshot = (): string => JSON.stringify({
    fields: form.value,
    lines: rows.value.map(rowContent),
});

// The draft as the backend last stored it, loaded or saved, with what the
// form held right then. null on a new draft: nothing is stored yet.
const stored = ref<{ invoice: Invoice; snapshot: string } | null>(props.initial.kind === 'existing'
    ? { invoice: props.initial.invoice, snapshot: snapshot() }
    : null);

// Whether what's on screen is what's stored. Only then are the stored totals
// the totals of what the user sees; any edit makes them stale.
const isUnchanged = computed(() => stored.value !== null && snapshot() === stored.value.snapshot);

// The stored total of the row at `index`, while nothing has changed: the
// rows were then built from the stored lines, so row 3 is stored line 3.
const lineTotalCents = (index: number): number | null =>
{
    if (!isUnchanged.value || stored.value === null)
    {
        return null;
    }

    return stored.value.invoice.lines[index]?.total_cents ?? null;
};

// Set by a save that went through, cleared by the next submit. "Saved." also
// needs the form unchanged since, so editing a field hides it.
const hasJustSaved = ref(false);

const isSaved = computed(() => hasJustSaved.value && isUnchanged.value);

// A 412: saved elsewhere since this version was loaded. An answer, not a
// fault, so it isn't re-thrown; the fields keep the user's edits.
const hasConflict = ref(false);

// A failure useForm doesn't show: a 404, a 500, a response of the wrong
// shape. Cleared by the next submit.
const hasFailed = ref(false);

const onSubmit = async (): Promise<void> =>
{
    // Before anything changes: submit() would ignore this one, and the
    // state below belongs to the save still running.
    if (isPending.value)
    {
        return;
    }

    hasJustSaved.value = false;
    hasConflict.value = false;
    hasFailed.value = false;

    const sent = payload.value;

    // The button is disabled while there is no payload, so getting here
    // without one is a bug, not a user mistake.
    if (sent === null)
    {
        throw new Error('InvoiceForm submitted without a complete payload.');
    }

    sentKeys.value = rows.value.map((row) => row.key);

    try
    {
        await submit(async () =>
        {
            const saved = await props.save(sent);

            // An edit shows what the backend stored. A new draft's page
            // moves to the edit route meanwhile.
            if (props.initial.kind === 'existing')
            {
                form.value = fieldsFrom({ kind: 'existing', invoice: saved.invoice });
                rows.value = rowsFrom(saved.invoice.lines, sentKeys.value);
                stored.value = { invoice: saved.invoice, snapshot: snapshot() };
                hasJustSaved.value = true;
                hasClearedRates.value = false;
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
            <p v-else-if="hasFailed && initial.kind === 'existing'">Couldn't save. Load the latest version before you try again.</p>
            <p v-else-if="hasFailed">Couldn't save.</p>
            <!-- Only an edit can show it: a new draft's page moves away. -->
            <p v-else-if="isSaved">Saved.</p>
        </div>
        <!-- Replaces the form with the stored draft, so the user's edits go:
             their choice, after reading the message above. After any failed
             save of a stored draft, not only a 412: a 404 or an answer that
             couldn't be read leaves the version unknown, so a retry with it
             can only fail again. -->
        <button v-if="hasConflict || (hasFailed && initial.kind === 'existing')" type="button" @click="emit('reload')">Load the latest version</button>

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

        <h2>Lines</h2>
        <!-- Its own live region, always rendered: the switch that clears the
             rates happens in a select above, away from the lines. -->
        <div role="status">
            <p v-if="hasClearedRates">The lines' VAT rates were cleared, because this invoice charges no Dutch VAT.</p>
        </div>
        <p v-if="rows.length === 0">No lines yet.</p>
        <InvoiceLineFields
            v-for="(row, index) in rows"
            :key="row.key"
            :model-value="row"
            :index="index"
            form-name="invoice"
            :sent-index="sentIndexes.get(row.key) ?? null"
            :charges-vat="form.vat_treatment === 'domestic'"
            :field-error="fieldError"
            :readonly="isPending"
            :total-cents="lineTotalCents(index)"
            @update:model-value="replaceLine"
            @remove="removeLine(row.key)"
        />
        <p v-if="rows.length >= MAX_LINES" id="invoice-lines-max">An invoice holds at most {{ MAX_LINES }} lines.</p>
        <button
            type="button"
            :disabled="isPending || rows.length >= MAX_LINES"
            :aria-describedby="rows.length >= MAX_LINES ? 'invoice-lines-max' : undefined"
            @click="addLine"
        >
            Add line
        </button>

        <!-- Only what the backend computed, and only while it is the total of
             what's on screen: a stale total shown as current is worse than
             none. -->
        <h2>Totals</h2>
        <InvoiceTotalsSummary v-if="isUnchanged && stored !== null" :totals="stored.invoice.totals" />
        <p v-else-if="stored !== null">Unsaved changes. The totals update when you save.</p>
        <p v-else>The totals appear once the draft is created.</p>

        <p v-if="areLinesIncomplete" id="invoice-lines-incomplete">
            <template v-if="form.vat_treatment === 'domestic'">Every line needs a description, a quantity, a unit price and a VAT rate before you can save.</template>
            <template v-else>Every line needs a description, a quantity and a unit price before you can save.</template>
        </p>
        <button type="submit" :disabled="isPending || payload === null" :aria-describedby="areLinesIncomplete ? 'invoice-lines-incomplete' : undefined">{{ submitLabel }}</button>
    </form>
</template>
