<script setup lang="ts">
// Package imports
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

// Project imports
import AddressFields from '@/components/AddressFields.vue';
import LogoutButton from '@/components/LogoutButton.vue';
import { useBusinessList } from '@/domains/businesses/composables/useBusinessList';
import { useBusinessesStore } from '@/domains/businesses/store';
import { useForm } from '@/composables/useForm';
import type { Address } from '@/services/address';
import type { BusinessPayload } from '@/services/businesses';

const store = useBusinessesStore();
const router = useRouter();
const { state, retry } = useBusinessList();

// What the form holds: the payload with its address nested, so AddressFields
// binds it as one object. No country_code: a business is always NL, so there
// is nothing to ask, and onSubmit adds it.
interface BusinessForm
{
    legal_name: string;
    kvk_number: string;
    vat_number: string;
    address: Address;
    // '': the input was emptied. v-model.number hands back the raw text when
    // it isn't a number, and an empty number input's text is ''.
    payment_term_days: number | '';
}

const form = ref<BusinessForm>({
    legal_name: '',
    kvk_number: '',
    vat_number: '',
    address: { street: '', house_number: '', house_number_addition: '', postal_code: '', city: '' },
    payment_term_days: 30,
});

// country_code false: the form has no input for it, so a 422 on it can only
// be shown by generalMessage. true would hide that message with nowhere else
// to show the error.
const { submit, isPending, fieldError, throttleMessage, generalMessage } = useForm<keyof BusinessPayload>('business', {
    legal_name: true,
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
const legalNameError = computed(() => fieldError('legal_name'));
const kvkNumberError = computed(() => fieldError('kvk_number'));
const vatNumberError = computed(() => fieldError('vat_number'));
const paymentTermDaysError = computed(() => fieldError('payment_term_days'));

// The form opens itself for a user with no business yet, since adding one is
// all there is to do. Otherwise it waits behind "Add a business". Never while
// loading, so it can't flash open for a user who has businesses.
//
// Opening sets isAdding rather than reading the list's length each render, so
// once open only Cancel or a create closes it. Otherwise a reload that brings
// in a business added elsewhere would unmount the form and lose what was typed.
const isAdding = ref(false);

watch(state, (current) =>
{
    if (current.kind === 'loaded' && current.businesses.length === 0)
    {
        isAdding.value = true;
    }
}, { immediate: true });

const isFormShown = computed(() => state.value.kind === 'loaded' && isAdding.value);
const hasBusinesses = computed(() => state.value.kind === 'loaded' && state.value.businesses.length > 0);

// The push sits inside the callback: submit() resolves the same way after a
// 422, so only reaching the push proves the business was created. The
// address is spread back to the flat shape the API takes, and an emptied
// payment term becomes the payload's null.
const onSubmit = () => submit(async () =>
{
    const { address, payment_term_days: paymentTermDays, ...fields } = form.value;
    const business = await store.create({
        ...fields,
        ...address,
        country_code: 'NL',
        payment_term_days: paymentTermDays === '' ? null : paymentTermDays,
    });
    await router.push({ name: 'dashboard', params: { businessId: business.id } });
});

// A business added in another tab or on another device shows up when the
// user comes back to this one. A failed refresh is ignored: the list on
// screen is still the last one that loaded, and the next return tries
// again. The cost: an unexpected response is ignored here too, and only
// shows on the next load().
const onVisibilityChange = async (): Promise<void> =>
{
    if (document.visibilityState !== 'visible')
    {
        return;
    }

    try
    {
        await store.reload();
    }
    catch
    {
        // Ignored on purpose, see above.
    }
};

// Removed on unmount, so a page the user left doesn't keep reloading.
onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange));
onUnmounted(() => document.removeEventListener('visibilitychange', onVisibilityChange));
</script>

<template>
    <div>
        <h1>Your businesses</h1>
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. -->
        <div role="status">
            <p v-if="state.kind === 'loading'">Loading...</p>
            <p v-else-if="state.kind === 'failed'">Couldn't load your businesses.</p>
            <p v-else-if="throttleMessage">{{ throttleMessage }}</p>
            <p v-else-if="generalMessage">{{ generalMessage }}</p>
        </div>

        <button v-if="state.kind === 'failed'" type="button" @click="retry">Try again</button>
        <template v-else-if="state.kind === 'loaded'">
            <ul v-if="hasBusinesses">
                <li v-for="business in state.businesses" :key="business.id">
                    <RouterLink :to="{ name: 'dashboard', params: { businessId: business.id } }">{{ business.legal_name }}</RouterLink>
                    (KvK {{ business.kvk_number }})
                </li>
            </ul>
            <p v-else>You have no businesses yet.</p>

            <button v-if="!isFormShown" type="button" @click="isAdding = true">Add a business</button>
            <!-- required repeats BusinessRequest's required rules, so an empty
                 field is caught by the browser instead of costing a request.
                 The backend stays the judge of every format. -->
            <form v-else aria-label="Add a business" @submit.prevent="onSubmit">
                <div>
                    <label for="business-legal_name">Legal name</label>
                    <input
                        id="business-legal_name"
                        v-model="form.legal_name"
                        type="text"
                        required
                        autocomplete="organization"
                        :aria-invalid="legalNameError !== null"
                        :aria-describedby="legalNameError?.id"
                    />
                    <p v-if="legalNameError" :id="legalNameError.id">{{ legalNameError.message }}</p>
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
                    <!-- An input holds text, and the backend's integer:strict
                         rejects "30". v-model already converts for
                         type="number" (vModelText in @vue/runtime-dom);
                         .number says so where it's read, and keeps converting
                         if the type ever changes. An emptied field stays "".
                         required stops that in the browser; if it gets past
                         (an old browser, a script), onSubmit sends null and
                         the backend's required message shows under this input. -->
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

                <button type="submit" :disabled="isPending">Add business</button>
                <!-- Only with a list to go back to: with none, the form is the page. -->
                <button v-if="hasBusinesses" type="button" @click="isAdding = false">Cancel</button>
            </form>
        </template>

        <!-- In every state: for a user with no business yet this is the only
             page there is, so it is the only place to log out. -->
        <p><RouterLink :to="{ name: 'changePassword' }">Change password</RouterLink></p>
        <LogoutButton />
    </div>
</template>
