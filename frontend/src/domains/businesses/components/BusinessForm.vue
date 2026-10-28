<script setup lang="ts">
// Package imports
import { computed, ref, watch } from 'vue';

// Project imports
import AddressFields from '@/components/AddressFields.vue';
import { useForm } from '@/composables/useForm';
import type { Address } from '@/services/address';
import type { Business, BusinessPayload } from '@/services/businesses';

// One form for creating and editing a business, so the two can't drift apart
// on fields or labels. The page decides what saving means.
//
// save is a prop, not an emit: an emit throws away the listener's promise,
// and the form has to await it, so a 422 lands in useForm's errors and the
// button stays disabled while the request runs.
const props = defineProps<{
    // null: an empty form, for a new business. Copied once, when the form
    // mounts: a caller that can change it keys the form by the business id.
    initial: Business | null;
    // The form's accessible name, e.g. "Add a business".
    label: string;
    submitLabel: string;
    save: (payload: BusinessPayload) => Promise<void>;
    // Shown in the status region once save resolves. null for a page that
    // navigates away instead.
    savedMessage: string | null;
}>();

// What the form holds: the payload with its address nested, so AddressFields
// binds it as one object. No country_code: a business is always NL, so there
// is nothing to ask, and onSubmit adds it.
interface BusinessFormFields
{
    registered_name: string;
    kvk_number: string;
    vat_number: string;
    address: Address;
    // '': the input was emptied. v-model.number hands back the raw text when
    // it isn't a number, and an empty number input's text is ''.
    payment_term_days: number | '';
}

// Copied once: the form edits its own copy, so a list reload while the user
// types doesn't overwrite what they typed. A null addition becomes '' because
// an input holds text; the backend turns '' back into null.
const fieldsFrom = (business: Business | null): BusinessFormFields =>
{
    if (business === null)
    {
        return {
            registered_name: '',
            kvk_number: '',
            vat_number: '',
            address: { street: '', house_number: '', house_number_addition: '', postal_code: '', city: '' },
            payment_term_days: 30,
        };
    }

    return {
        registered_name: business.registered_name,
        kvk_number: business.kvk_number,
        vat_number: business.vat_number,
        address: {
            street: business.street,
            house_number: business.house_number,
            house_number_addition: business.house_number_addition ?? '',
            postal_code: business.postal_code,
            city: business.city,
        },
        payment_term_days: business.payment_term_days,
    };
};

const form = ref<BusinessFormFields>(fieldsFrom(props.initial));

// country_code false: the form has no input for it, so a 422 on it can only
// be shown by generalMessage. true would hide that message with nowhere else
// to show the error.
const { submit, isPending, fieldError, throttleMessage, generalMessage } = useForm<keyof BusinessPayload>('business', {
    registered_name: true,
    kvk_number: true,
    vat_number: true,
    street: true,
    house_number: true,
    house_number_addition: true,
    postal_code: true,
    city: true,
    country_code: false,
    payment_term_days: true,
});

// One value per field, so the error text and both aria attributes read
// from the same source. The address fields get theirs inside AddressFields.
const registeredNameError = computed(() => fieldError('registered_name'));
const kvkNumberError = computed(() => fieldError('kvk_number'));
const vatNumberError = computed(() => fieldError('vat_number'));
const paymentTermDaysError = computed(() => fieldError('payment_term_days'));

// Set only after save resolves. Cleared by the next submit, so it never
// stands next to an error from a later attempt, and by the next edit, so it
// never claims values that aren't saved yet.
const isSaved = ref(false);

watch(form, () =>
{
    isSaved.value = false;
}, { deep: true });

// A failure useForm doesn't show: a 403, a 404, a 500, a response of the
// wrong shape. Without it the button re-enables and nothing says why.
const hasFailed = ref(false);

// isSaved is set inside the callback: submit() resolves the same way after a
// 422, so only reaching that line proves the save went through. The address
// is spread back to the flat shape the API takes, and an emptied payment
// term becomes the payload's null.
// What submit() re-throws is shown, then re-thrown again, so Vue's error
// handler still sees what went wrong.
const onSubmit = async (): Promise<void> =>
{
    isSaved.value = false;
    hasFailed.value = false;

    try
    {
        await submit(async () =>
        {
            const { address, payment_term_days: paymentTermDays, ...fields } = form.value;
            await props.save({
                ...fields,
                ...address,
                country_code: 'NL',
                payment_term_days: paymentTermDays === '' ? null : paymentTermDays,
            });
            isSaved.value = true;
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
    <!-- required repeats BusinessRequest's required rules, so an empty field
         is caught by the browser instead of costing a request. The backend
         stays the judge of every format. -->
    <form :aria-label="label" @submit.prevent="onSubmit">
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. -->
        <div role="status">
            <p v-if="throttleMessage">{{ throttleMessage }}</p>
            <p v-else-if="generalMessage">{{ generalMessage }}</p>
            <p v-else-if="hasFailed">Couldn't save.</p>
            <p v-else-if="isSaved && savedMessage !== null">{{ savedMessage }}</p>
        </div>

        <div>
            <label for="business-registered_name">Registered name</label>
            <input
                id="business-registered_name"
                v-model="form.registered_name"
                type="text"
                required
                autocomplete="organization"
                :aria-invalid="registeredNameError !== null"
                :aria-describedby="registeredNameError?.id"
            />
            <p v-if="registeredNameError" :id="registeredNameError.id">{{ registeredNameError.message }}</p>
        </div>
        <div>
            <label for="business-kvk_number">KvK number</label>
            <input
                id="business-kvk_number"
                v-model="form.kvk_number"
                type="text"
                required
                inputmode="numeric"
                :aria-invalid="kvkNumberError !== null"
                :aria-describedby="kvkNumberError?.id"
            />
            <p v-if="kvkNumberError" :id="kvkNumberError.id">{{ kvkNumberError.message }}</p>
        </div>
        <div>
            <label for="business-vat_number">VAT number (BTW-id)</label>
            <input
                id="business-vat_number"
                v-model="form.vat_number"
                type="text"
                required
                :aria-invalid="vatNumberError !== null"
                :aria-describedby="vatNumberError?.id"
            />
            <p v-if="vatNumberError" :id="vatNumberError.id">{{ vatNumberError.message }}</p>
        </div>

        <AddressFields v-model="form.address" form-name="business" :field-error="fieldError" />

        <div>
            <label for="business-payment_term_days">Payment term (days)</label>
            <!-- An input holds text, and the backend's integer:strict rejects
                 "30". v-model already converts for type="number"
                 (vModelText in @vue/runtime-dom); .number says so where it's
                 read, and keeps converting if the type ever changes. An
                 emptied field stays "". required stops that in the browser;
                 if it gets past (an old browser, a script), onSubmit sends
                 null and the backend's required message shows under this
                 input. -->
            <input
                id="business-payment_term_days"
                v-model.number="form.payment_term_days"
                type="number"
                required
                min="1"
                max="365"
                :aria-invalid="paymentTermDaysError !== null"
                :aria-describedby="paymentTermDaysError?.id"
            />
            <p v-if="paymentTermDaysError" :id="paymentTermDaysError.id">{{ paymentTermDaysError.message }}</p>
        </div>

        <button type="submit" :disabled="isPending">{{ submitLabel }}</button>
        <!-- For the page's own buttons, e.g. the create page's Cancel. -->
        <slot />
    </form>
</template>
