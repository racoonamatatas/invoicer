<script setup lang="ts">
// Package imports
import { computed, ref } from 'vue';

// Project imports
import { register, type Registration } from '@/services/auth';
import { useForm } from '@/composables/useForm';

// Only an email: the name and password are asked for on the page the mailed
// link opens, so nobody can store a password for an inbox they don't own.
const form = ref<Registration>({ email: '' });
const { submit, isPending, fieldError, throttleMessage, generalMessage } = useForm<keyof Registration>('register', { email: true });

// One value for the field, so the error text and both aria attributes read
// from the same source.
const emailError = computed(() => fieldError('email'));

const isRegistered = ref(false);

// The flag is set inside the callback: submit() resolves the same way after
// a 422, so only reaching that line proves the register succeeded.
const onSubmit = () => submit(async () =>
{
    await register(form.value);
    isRegistered.value = true;
});

</script>


<template>
    <div>
        <h1>Create an account</h1>
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. The same text for a new and an
             existing email, so the page reveals nothing about which accounts exist. -->
        <div role="status">
            <p v-if="isRegistered">Check your inbox at {{ form.email }}. We've sent you an email with the next step.</p>
            <p v-else-if="throttleMessage">{{ throttleMessage }}</p>
            <p v-else-if="generalMessage">{{ generalMessage }}</p>
        </div>
        <form v-if="!isRegistered" aria-label="Create an account" @submit.prevent="onSubmit">
            <div>
                <label for="register-email">Email</label>
                <input
                    id="register-email"
                    v-model="form.email"
                    type="email"
                    autocomplete="email"
                    :aria-invalid="emailError !== null"
                    :aria-describedby="emailError?.id"
                />
                <p v-if="emailError" :id="emailError.id">{{ emailError.message }}</p>
            </div>
            <button type="submit" :disabled="isPending">Create account</button>
        </form>
    </div>
</template>
