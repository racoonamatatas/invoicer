// Package imports
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

// Project imports
import * as auth from '@/services/auth';

// A store to hold a shared logged in state of a user.
export const useAuthStore = defineStore('auth', () =>
{
    // Private on purpose: pages read user, a computed over this ref. The cost:
    // Pinia doesn't see this as state, so $patch, $subscribe and Devtools
    // editing don't reach it. Tests log in through login() instead.
    const user = ref<auth.User | null>(null);

    const currentUser = computed<auth.User | null>(() => user.value);

    // user contains a value when a User is logged in, and is otherwise null.
    // isLoggedIn is true when a value exists, and otherwise false.
    const isLoggedIn = computed<boolean>(() => user.value !== null);

    const login = async (credentials: auth.LoginCredentials): Promise<void> =>
    {
        user.value = await auth.login(credentials);
    };

    return {
        user: currentUser,
        isLoggedIn,
        login,
    };
});
