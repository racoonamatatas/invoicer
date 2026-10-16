<script setup lang="ts">
// Project imports
import { useAuthStore } from '@/domains/auth/store';
import { useForm } from '@/form/useForm';

const store = useAuthStore();

// No fields, so no field errors: useForm is here for its double-click guard,
// isPending, and its re-throw of failures.
const { submit, isPending } = useForm('logout');

// The reload sits inside the callback, so a failed logout keeps the user
// here, still logged in. A full page load, not router.push: every store and
// in-flight request dies with the document, so nothing reaches the next
// session (the back/forward cache is INV-0027).
const onLogout = () => submit(async () =>
{
    await store.logout();
    window.location.assign('/login');
});
</script>

<template>
    <div>
        <h1>Dashboard</h1>
        <button type="button" :disabled="isPending" @click="onLogout">Log out</button>
    </div>
</template>
