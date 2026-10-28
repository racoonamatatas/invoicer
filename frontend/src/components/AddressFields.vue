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

// The parent's address object. The inputs write into it directly, so typing
// changes the parent's form without an update event: the object stays the
// same, only its fields change.
const address = defineModel<Address>({ required: true });

interface Row
{
    key: AddressField;
    label: string;
    // undefined: no autocomplete token matches a split street or house number.
    autocomplete: string | undefined;
}

const ROWS: readonly Row[] = [
    { key: 'street', label: 'Street', autocomplete: undefined },
    { key: 'house_number', label: 'House number', autocomplete: undefined },
    { key: 'house_number_addition', label: 'Addition', autocomplete: undefined },
    { key: 'postal_code', label: 'Postcode', autocomplete: 'postal-code' },
    { key: 'city', label: 'City', autocomplete: 'address-level2' },
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
            v-model="address[row.key]"
            type="text"
            :autocomplete="row.autocomplete"
            :aria-invalid="row.error !== null"
            :aria-describedby="row.error?.id"
        />
        <p v-if="row.error" :id="row.error.id">{{ row.error.message }}</p>
    </div>
</template>
