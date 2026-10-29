<script setup lang="ts">
// Package imports
import { computed, ref } from 'vue';

// Project imports
import AddressFields from '@/components/AddressFields.vue';
import { useForm, type FieldError } from '@/composables/useForm';
import type { AddressField, DutchAddress } from '@/services/address';
import { BUSINESS_COUNTRY_CODES, type Business, type BusinessPayload } from '@/services/businesses';

// One form for creating and editing a business, so the two can't drift apart
// on fields or labels. The page decides what saving means.
//
// save is a prop, not an emit: an emit throws away the listener's promise,
// and the form has to await it, so a 422 lands in useForm's errors and the
// button stays disabled while the request runs. What comes after a save
// (the create page's navigation) listens to `saved` instead, so its
// failure is never shown as a failed save.
const props = defineProps<{
    // null: an empty form, for a new business. Copied once, when the form
    // mounts: a caller that can change it keys the form by the business id.
    initial: Business | null;
    // The form's accessible name, e.g. "Add a business".
    label: string;
    submitLabel: string;
    // Resolves with the business as stored, which the form shows from then on.
    save: (payload: BusinessPayload) => Promise<Business>;
    // Shown in the status region once save resolves. null for a page that
    // navigates away instead.
    savedMessage: string | null;
}>();

const emit = defineEmits<{
    // After a save went through, with the business as stored.
    saved: [business: Business];
}>();

// What the form holds: the payload with its address nested, so AddressFields
// binds it as one object. A business is always NL, so the address is always
// a DutchAddress, and there is no country to ask for.
interface BusinessFormFields
{
    registered_name: string;
    kvk_number: string;
    vat_number: string;
    address: DutchAddress;
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
            address: { street: '', house_number: '', house_number_addition: '', postal_code: '', city: '', region: null, country_code: 'NL' },
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
            region: null,
            country_code: business.country_code,
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

// AddressFields asks for every address field's error, region too. A business
// payload has no region, so the backend can't name it in a 422.
const addressFieldError = (field: AddressField): FieldError | null => field === 'region' ? null : fieldError(field);

// The form's fields as the last save stored them, as JSON so a deep
// comparison is one string compare (fieldsFrom always builds the keys in the
// same order). null until a save went through, and again from the next
// submit, so "Saved." never stands next to an error from a later attempt.
const savedFields = ref<string | null>(null);

// Saved while the inputs still hold what was stored: an edit hides it, and
// undoing that edit shows it again, since then it's true again.
const isSaved = computed(() => savedFields.value !== null && JSON.stringify(form.value) === savedFields.value);

// A failure useForm doesn't show: a 403, a 404, a 500, a response of the
// wrong shape. Without it the button re-enables and nothing says why. Kept
// while the user edits, unlike "Saved.": nothing was saved, and editing
// doesn't change that. Cleared by the next submit.
const hasFailed = ref(false);

// The stored business is copied in inside the callback: submit() resolves
// the same way after a 422, so only reaching that line proves the save went
// through. Refilled from it, not left as typed, so the inputs show what the
// backend normalised ('9711lm' is stored as '9711 LM'). The address is
// copied back to the flat shape the API takes field by field, not spread:
// a spread would send the address's region, which the payload leaves out.
// An emptied payment term becomes the payload's null.
// What submit() re-throws is shown, then re-thrown again, so Vue's error
// handler still sees what went wrong.
const onSubmit = async (): Promise<void> =>
{
    savedFields.value = null;
    hasFailed.value = false;

    try
    {
        await submit(async () =>
        {
            const { address, payment_term_days: paymentTermDays, ...fields } = form.value;
            const stored = await props.save({
                ...fields,
                street: address.street,
                house_number: address.house_number,
                house_number_addition: address.house_number_addition,
                postal_code: address.postal_code,
                city: address.city,
                country_code: address.country_code,
                payment_term_days: paymentTermDays === '' ? null : paymentTermDays,
            });
            form.value = fieldsFrom(stored);
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

        <AddressFields v-model="form.address" form-name="business" :field-error="addressFieldError" :country-codes="BUSINESS_COUNTRY_CODES" />

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
