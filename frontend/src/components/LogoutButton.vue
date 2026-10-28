<script setup lang="ts">
// Project imports
import { useAuthStore } from '@/domains/auth/store';
import { useForm } from '@/composables/useForm';

const auth = useAuthStore();

// No fields, so no field errors: useForm is here for its double-click guard,
// isPending, and its re-throw of failures.
const { submit, isPending } = useForm('logout', {});

// The reload sits inside the callback, so a failed logout keeps the user
// here, still logged in. A full page load, not router.push: every store and
// in-flight request dies with the document, so nothing reaches the next
// session. Back can't revive it from the back/forward cache either:
// reloadRestoredPage reloads any restored page.
const onLogout = () => submit(async () =>
{
    await auth.logout();
    window.location.assign('/login');
});
</script>

<template>
    <button type="button" :disabled="isPending" @click="onLogout">Log out</button>
</template>
