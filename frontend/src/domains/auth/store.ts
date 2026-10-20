// Package imports
import { isAxiosError } from 'axios';
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

    // Clears user only after the backend confirms. If the request fails, the
    // session still exists, so the frontend keeps showing the user as logged in.
    const logout = async (): Promise<void> =>
    {
        await auth.logout();
        user.value = null;
    };

    // Forgets the user without asking the backend, for when the backend has
    // already ended the session itself: a password reset deletes every
    // session of the account. No request, so nothing here can fail.
    const clear = (): void =>
    {
        user.value = null;
    };

    const restore = async (): Promise<void> =>
    {
        try
        {
            user.value = await auth.fetchUser();
        }
        catch (error)
        {
            // Only a 401 (unauthenticated) proves there is no session.
            // Any other error says nothing about the session, so it is
            // rethrown instead of logging out the user.
            if (isAxiosError(error) && error.response?.status === 401)
            {
                user.value = null;
                return;
            }

            throw error;
        }
    };

    return {
        user: currentUser,
        isLoggedIn,
        login,
        logout,
        clear,
        restore,
    };
});
