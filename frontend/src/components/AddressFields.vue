<script setup lang="ts">
// Package imports
import { computed } from 'vue';

// Project imports
import type { FieldError } from '@/composables/useForm';
import type { Address, AddressField } from '@/services/address';

// The parent owns the form and its useForm: this component only renders the
// address part of it. fieldError is the parent's own; it takes every field
// of the parent's form, so it also takes these five.
const props = defineProps<{
    formName: string;
    fieldError: (field: AddressField) => FieldError | null;
}>();

// The parent's address. Never changed in place: each keystroke assigns a new
// object, which emits update:modelValue. In-place writes would only reach the
// parent when it happens to pass a reactive object, and a parent listening
// for the event (or binding a computed with a setter) would hear nothing.
const address = defineModel<Address>({ required: true });

// target is only typed as EventTarget; the check proves it's the input.
const onInput = (key: AddressField, event: Event): void =>
{
    if (!(event.target instanceof HTMLInputElement))
    {
        return;
    }

    address.value = { ...address.value, [key]: event.target.value };
};

interface Row
{
    key: AddressField;
    label: string;
    // undefined: no autocomplete token matches a split street or house number.
    autocomplete: string | undefined;
    // Mirrors AddressRules for a Dutch address, the only kind this renders
    // so far. A foreign one needs no postcode, so that would become a prop.
    required: boolean;
}

const ROWS: readonly Row[] = [
    { key: 'street', label: 'Street', autocomplete: undefined, required: true },
    { key: 'house_number', label: 'House number', autocomplete: undefined, required: true },
    { key: 'house_number_addition', label: 'Addition', autocomplete: undefined, required: false },
    { key: 'postal_code', label: 'Postcode', autocomplete: 'postal-code', required: true },
    { key: 'city', label: 'City', autocomplete: 'address-level2', required: true },
];

// One error per row, so its text and both aria attributes read from the same
// value. A computed, so it re-runs when the parent's errors change.
const rows = computed(() => ROWS.map((row) => ({ ...row, id: `${props.formName}-${row.key}`, error: props.fieldError(row.key) })));
</script>

<template>
    <!-- One block per field, written once, so no field can miss its aria wiring. -->
    <div v-for="row in rows" :key="row.key">
        <label :for="row.id">{{ row.label }}</label>
        <input
            :id="row.id"
            :value="address[row.key] ?? ''"
            type="text"
            :required="row.required"
            :autocomplete="row.autocomplete"
            :aria-invalid="row.error !== null"
            :aria-describedby="row.error?.id"
            @input="onInput(row.key, $event)"
        />
        <p v-if="row.error" :id="row.error.id">{{ row.error.message }}</p>
    </div>
</template>
