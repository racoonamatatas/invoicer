<script setup lang="ts">
// Package imports
import { computed } from 'vue';

// Project imports
import type { FieldError } from '@/composables/useForm';
import { withCountry, withText } from '@/form/addressEdits';
import { ADDRESS_TEXT_FIELDS, addressFormatFor, type AddressTextField } from '@/form/addressFormats';
import { countryName, isCountryCode, type Address, type AddressField, type CountryCode } from '@/services/address';

// The parent owns the form and its useForm: this component only renders the
// address part of it. fieldError is the parent's own; it takes every field
// of the parent's form, so it also takes these seven.
const props = defineProps<{
    formName: string;
    fieldError: (field: AddressField) => FieldError | null;
    countryCodes: readonly CountryCode[]; // one code hides the select, as for a business (always NL)
}>();

// The parent's address. Never changed in place: each keystroke assigns a new
// object, which emits update:modelValue. In-place writes would only reach the
// parent when it happens to pass a reactive object, and a parent listening
// for the event (or binding a computed with a setter) would hear nothing.
const address = defineModel<Address>({ required: true });

// target is only typed as EventTarget; the check proves it's the input.
const onInput = (key: AddressTextField, event: Event): void =>
{
    if (!(event.target instanceof HTMLInputElement))
    {
        return;
    }

    address.value = withText(address.value, key, event.target.value);
};

// The select's value is a string; the guard proves it's one of the codes.
const onCountryChange = (event: Event): void =>
{
    if (!(event.target instanceof HTMLSelectElement))
    {
        return;
    }

    // Put back by hand: Vue patches :value only when the address changes, and
    // a rejected value changes nothing, so the select would keep showing it.
    if (!isCountryCode(event.target.value))
    {
        event.target.value = address.value.country_code;

        return;
    }

    address.value = withCountry(address.value, event.target.value);
};

// Sorted by name, not code: people look for "Germany", not "DE".
const countryOption = (code: CountryCode): { code: CountryCode; name: string } =>
{
    return { code, name: countryName(code) };
};

const byName = (first: { name: string }, second: { name: string }): number => first.name.localeCompare(second.name, 'en');

// Reads only the prop, so typing in an address input, which makes a new
// address object each time, doesn't rebuild and re-sort ~249 options.
// sort() is safe here: map() made a new array.
const offeredCountries = computed(() => props.countryCodes.map(countryOption).sort(byName));

// The address's own country is always offered, even when the parent's list
// leaves it out: a select whose value has no option shows the first option,
// while the address would still send the code nobody sees. The same array
// while the country is on the list, so a keystroke leaves the options alone.
const countries = computed(() =>
{
    const code = address.value.country_code;

    return offeredCountries.value.some((country) => country.code === code)
        ? offeredCountries.value
        : [...offeredCountries.value, countryOption(code)].sort(byName);
});

const countryId = computed(() => `${props.formName}-country_code`);
const countryError = computed(() => props.fieldError('country_code'));

// The country's format decides which inputs there are and which are
// required; this component knows no country's rules itself.
const format = computed(() => addressFormatFor(address.value.country_code));

// One error per row, so its text and both aria attributes read from the same
// value. A computed, so it re-runs when the parent's errors or the country
// change.
const rows = computed(() => ADDRESS_TEXT_FIELDS
    .map((key) => ({ key, ...format.value[key] }))
    .filter((row) => row.presence !== 'hidden')
    .map((row) => ({
        ...row,
        id: `${props.formName}-${row.key}`,
        isRequired: row.presence === 'required',
        error: props.fieldError(row.key),
    })));
</script>

<template>
    <!-- First: the country decides which fields follow and which are required. -->
    <div v-if="countries.length > 1">
        <label :for="countryId">Country</label>
        <select
            :id="countryId"
            :value="address.country_code"
            required
            autocomplete="country"
            :aria-invalid="countryError !== null"
            :aria-describedby="countryError?.id"
            @change="onCountryChange"
        >
            <option v-for="country in countries" :key="country.code" :value="country.code">{{ country.name }}</option>
        </select>
        <p v-if="countryError" :id="countryError.id">{{ countryError.message }}</p>
    </div>

    <!-- One block per field, written once, so no field can miss its aria wiring. -->
    <div v-for="row in rows" :key="row.key">
        <label :for="row.id">{{ row.label }}</label>
        <input
            :id="row.id"
            :value="address[row.key] ?? ''"
            type="text"
            :required="row.isRequired"
            :autocomplete="row.autocomplete"
            :aria-invalid="row.error !== null"
            :aria-describedby="row.error?.id"
            @input="onInput(row.key, $event)"
        />
        <p v-if="row.error" :id="row.error.id">{{ row.error.message }}</p>
    </div>
</template>
