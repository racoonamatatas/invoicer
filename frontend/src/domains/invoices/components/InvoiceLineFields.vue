<script setup lang="ts">
// Package imports
import { computed } from 'vue';

// Project imports
import type { FieldError } from '@/composables/useForm';
import type { LineRow } from '@/domains/invoices/lineRows';
import { VAT_OPTION_LABELS } from '@/domains/invoices/vatOptionLabels';
import { formatCents, parseCents, parseHundredths, type Cents, type ParseFailure, type ParseResult } from '@/form/amounts';
import { VAT_OPTIONS } from '@/services/invoices';

// A line's fields as the backend names them, so they are also the last part
// of a 422's key (`lines.2.unit_price_cents`).
export type LineField = 'description' | 'quantity_hundredths' | 'unit_price_cents' | 'vat_option';

// One line of InvoiceForm. The form owns the list, the save and its
// useForm; this only renders a row and says when it should go.
const props = defineProps<{
    index: number; // the row's place in the list, for its label and its inputs' ids
    chargesVat: boolean; // a domestic invoice: only then does a line pick a VAT option
    fieldError: (field: LineField) => FieldError | null; // the server's errors, already matched to this row
    // True while the form's save runs, so nothing typed then is wiped when
    // the save rebuilds the rows. Required: the parent has to decide.
    readonly: boolean;
    totalCents: number | null; // the backend's total for this line, null while it would be stale
}>();

const emit = defineEmits<{
    remove: [];
}>();

// The form's row. Never changed in place, as in AddressFields: each edit
// assigns a new object, so the parent hears every change.
const row = defineModel<LineRow>({ required: true });

type TextField = 'description' | 'quantity' | 'unit_price';

// target is only typed as EventTarget; the check proves it's the input.
const onInput = (field: TextField, event: Event): void =>
{
    if (!(event.target instanceof HTMLInputElement))
    {
        return;
    }

    row.value = { ...row.value, [field]: event.target.value };
};

// The select's value is a string; find() proves it's one of the options,
// and hands it back typed as one.
const onVatOptionChange = (event: Event): void =>
{
    // A const: narrowing on event.target doesn't reach into the callback
    // below, because a property could change before it runs.
    const select = event.target;

    if (!(select instanceof HTMLSelectElement))
    {
        return;
    }

    const picked = VAT_OPTIONS.find((option) => option === select.value);

    if (picked !== undefined)
    {
        row.value = { ...row.value, vat_option: picked };
    }
};

// What to say about input the parser refused. `empty` isn't here: an empty
// field blocks the save like an unpicked client does, without a message on a
// row the user is still filling in.
const formatMessage = (reason: Exclude<ParseFailure, 'empty'>, example: string): string =>
{
    switch (reason)
    {
        case 'not_a_number':
            return `Enter a number, like ${example}.`;
        case 'too_many_decimals':
            return 'Use at most two decimals.';
        case 'negative':
            return 'Enter 0 or more.';
        case 'too_large':
            return 'Enter a smaller number.';
    }
};

// The row's own check comes first, as for the payment term: unreadable input
// is never sent, so a server error on it can only be about an earlier value.
const amountError = <T>(parsed: ParseResult<T>, name: string, example: string, field: LineField): FieldError | null =>
{
    if (!parsed.ok && parsed.reason !== 'empty')
    {
        return { id: `invoice-lines-${props.index}-${name}-format`, message: formatMessage(parsed.reason, example) };
    }

    return props.fieldError(field);
};

const descriptionError = computed(() => props.fieldError('description'));
const quantityError = computed(() => amountError(parseHundredths(row.value.quantity), 'quantity', '7,5', 'quantity_hundredths'));
const unitPriceError = computed(() => amountError(parseCents(row.value.unit_price), 'unit_price', '80,00', 'unit_price_cents'));
const vatOptionError = computed(() => props.fieldError('vat_option'));

// The ids carry the index, not the key: the key is for Vue alone, and the
// index is what a person (and a test) reads as "line 3".
const idFor = (name: string): string => `invoice-lines-${props.index}-${name}`;
</script>

<template>
    <fieldset>
        <legend>Line {{ index + 1 }}</legend>
        <div>
            <label :for="idFor('description')">Description</label>
            <input
                :id="idFor('description')"
                :value="row.description"
                :readonly="readonly"
                type="text"
                required
                :aria-invalid="descriptionError !== null"
                :aria-describedby="descriptionError?.id"
                @input="onInput('description', $event)"
            />
            <p v-if="descriptionError" :id="descriptionError.id">{{ descriptionError.message }}</p>
        </div>
        <div>
            <label :for="idFor('quantity')">Quantity</label>
            <input
                :id="idFor('quantity')"
                :value="row.quantity"
                :readonly="readonly"
                type="text"
                inputmode="decimal"
                required
                :aria-invalid="quantityError !== null"
                :aria-describedby="quantityError?.id"
                @input="onInput('quantity', $event)"
            />
            <p v-if="quantityError" :id="quantityError.id">{{ quantityError.message }}</p>
        </div>
        <div>
            <label :for="idFor('unit_price')">Unit price in euros</label>
            <input
                :id="idFor('unit_price')"
                :value="row.unit_price"
                :readonly="readonly"
                type="text"
                inputmode="decimal"
                required
                :aria-invalid="unitPriceError !== null"
                :aria-describedby="unitPriceError?.id"
                @input="onInput('unit_price', $event)"
            />
            <p v-if="unitPriceError" :id="unitPriceError.id">{{ unitPriceError.message }}</p>
        </div>
        <!-- Only on a domestic invoice: the server refuses an option on the
             others, and the form clears them when the treatment switches. -->
        <div v-if="chargesVat">
            <label :for="idFor('vat_option')">VAT rate</label>
            <select
                :id="idFor('vat_option')"
                :value="row.vat_option ?? ''"
                :disabled="readonly"
                required
                :aria-invalid="vatOptionError !== null"
                :aria-describedby="vatOptionError?.id"
                @change="onVatOptionChange"
            >
                <option value="" disabled>Choose a VAT rate</option>
                <option v-for="option in VAT_OPTIONS" :key="option" :value="option">{{ VAT_OPTION_LABELS[option] }}</option>
            </select>
            <p v-if="vatOptionError" :id="vatOptionError.id">{{ vatOptionError.message }}</p>
        </div>
        <!-- The guard proved it an integer; the brand says it is cents. -->
        <p v-if="totalCents !== null">Line total: {{ formatCents(totalCents as Cents) }}</p>
        <button type="button" :disabled="readonly" @click="emit('remove')">Remove line {{ index + 1 }}</button>
    </fieldset>
</template>
