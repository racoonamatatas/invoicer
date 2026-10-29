<script setup lang="ts">
// Package imports
import { computed, ref } from 'vue';

// Project imports
import AddressFields from '@/components/AddressFields.vue';
import { useForm } from '@/composables/useForm';
import { withCountry } from '@/form/addressEdits';
import { COUNTRY_CODES, type Address, type CountryCode } from '@/services/address';
import type { Client, ClientPayload } from '@/services/clients';

// What the form starts from. A union, so only a new client can have a
// prefilled country: an edit form shows the country the client has.
export type ClientFormInitial =
    | { kind: 'new'; countryCode: CountryCode }
    | { kind: 'existing'; client: Client };

// One form for adding and editing a client, so the two can't drift apart on
// fields or labels. The page decides what saving means.
//
// save is a prop, not an emit: an emit throws away the listener's promise,
// and the form has to await it, so a 422 lands in useForm's errors and the
// button stays disabled while the request runs. What comes after a save
// (the list's reload) listens to `saved` instead, so its failure is never
// shown as a failed save.
const props = defineProps<{
    // Copied once, when the form mounts: a caller that can change it keys the
    // form, e.g. by the business id.
    initial: ClientFormInitial;
    label: string; // the form's accessible name, e.g. "Add a client"
    submitLabel: string;
    save: (payload: ClientPayload) => Promise<Client>;
    savedMessage: string; // shown in the status region until the next edit
}>();

const emit = defineEmits<{
    saved: [client: Client];
}>();

// What the form holds: the payload with its address nested, so AddressFields
// binds it as one object. An optional VAT number is '' in its input; onSubmit
// sends that as null.
interface ClientFormFields
{
    name: string;
    email: string;
    vat_number: string;
    address: Address;
}

// A new client's address is shaped by withCountry, the same function the
// country select uses, so a prefilled foreign country starts with the same
// postcode and region as one the user picked.
const emptyDutchAddress: Address = { street: '', house_number: '', house_number_addition: '', postal_code: '', city: '', region: null, country_code: 'NL' };

// Copied once: the form edits its own copy, so a list reload while the user
// types doesn't overwrite what they typed. A null becomes '' because an
// input holds text; the backend turns '' back into null.
const fieldsFrom = (initial: ClientFormInitial): ClientFormFields =>
{
    if (initial.kind === 'new')
    {
        return { name: '', email: '', vat_number: '', address: withCountry(emptyDutchAddress, initial.countryCode) };
    }

    const { id: _id, name, email, vat_number: vatNumber, ...address } = initial.client;

    return {
        name,
        email,
        vat_number: vatNumber ?? '',
        address: { ...address, house_number_addition: address.house_number_addition ?? '' },
    };
};

const form = ref<ClientFormFields>(fieldsFrom(props.initial));

// Every field true: a client has an input for each, region and country
// included, so a 422 on any of them shows next to it.
const { submit, isPending, fieldError, throttleMessage, generalMessage } = useForm<keyof ClientPayload>('client', {
    name: true,
    email: true,
    vat_number: true,
    street: true,
    house_number: true,
    house_number_addition: true,
    postal_code: true,
    city: true,
    region: true,
    country_code: true,
});

// One value per field, so the error text and both aria attributes read
// from the same source. The address fields get theirs inside AddressFields.
const nameError = computed(() => fieldError('name'));
const emailError = computed(() => fieldError('email'));
const vatNumberError = computed(() => fieldError('vat_number'));

// The form's fields right after the last save, as JSON so a deep comparison
// is one string compare (fieldsFrom always builds the keys in the same
// order). null until a save went through, and again from the next submit.
const savedFields = ref<string | null>(null);

// Saved while the inputs still hold what the save left: an edit hides it.
const isSaved = computed(() => savedFields.value !== null && JSON.stringify(form.value) === savedFields.value);

// A failure useForm doesn't show: a 404, a 500, a response of the wrong
// shape. Without it the button re-enables and nothing says why. Cleared by
// the next submit.
const hasFailed = ref(false);

// readonly, not disabled, while the request runs: a success refills the
// form and would wipe anything typed meanwhile, and disabled drops focus.
//
// The form is refilled inside the callback: submit() resolves the same way
// after a 422, which must leave what the user typed. A new client's form
// starts over, prefill included, for the next one; an existing client's
// shows what the backend stored ('9711lm' is stored as '9711 LM').
const onSubmit = async (): Promise<void> =>
{
    savedFields.value = null;
    hasFailed.value = false;

    try
    {
        await submit(async () =>
        {
            const { address, vat_number: vatNumber, ...fields } = form.value;

            const stored = await props.save({
                ...fields,
                vat_number: vatNumber === '' ? null : vatNumber,
                ...address,
            });
            form.value = fieldsFrom(props.initial.kind === 'new' ? props.initial : { kind: 'existing', client: stored });
            savedFields.value = JSON.stringify(form.value);
            // Last, and not awaited: Vue hands a failing listener to its
            // error handler, so it can't reach the catch below.
            emit('saved', stored);
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
    <!-- required repeats ClientRequest's required rules, so an empty field
         is caught by the browser instead of costing a request. The backend
         stays the judge of every format. -->
    <form :aria-label="label" @submit.prevent="onSubmit">
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. -->
        <div role="status">
            <p v-if="throttleMessage">{{ throttleMessage }}</p>
            <p v-else-if="generalMessage">{{ generalMessage }}</p>
            <p v-else-if="hasFailed">Couldn't save.</p>
            <p v-else-if="isSaved">{{ savedMessage }}</p>
        </div>

        <div>
            <label for="client-name">Name</label>
            <input
                id="client-name"
                v-model="form.name"
                :readonly="isPending"
                type="text"
                required
                autocomplete="organization"
                :aria-invalid="nameError !== null"
                :aria-describedby="nameError?.id"
            />
            <p v-if="nameError" :id="nameError.id">{{ nameError.message }}</p>
        </div>
        <div>
            <label for="client-email">Email</label>
            <input
                id="client-email"
                v-model="form.email"
                :readonly="isPending"
                type="email"
                required
                autocomplete="email"
                :aria-invalid="emailError !== null"
                :aria-describedby="emailError?.id"
            />
            <p v-if="emailError" :id="emailError.id">{{ emailError.message }}</p>
        </div>
        <div>
            <!-- Offered for every country: the backend decides which
                 countries take one, and says so next to this input. -->
            <label for="client-vat_number">VAT number (optional)</label>
            <input
                id="client-vat_number"
                v-model="form.vat_number"
                :readonly="isPending"
                type="text"
                :aria-invalid="vatNumberError !== null"
                :aria-describedby="vatNumberError?.id"
            />
            <p v-if="vatNumberError" :id="vatNumberError.id">{{ vatNumberError.message }}</p>
        </div>

        <AddressFields v-model="form.address" form-name="client" :field-error="fieldError" :country-codes="COUNTRY_CODES" :readonly="isPending" />

        <button type="submit" :disabled="isPending">{{ submitLabel }}</button>
    </form>
</template>
