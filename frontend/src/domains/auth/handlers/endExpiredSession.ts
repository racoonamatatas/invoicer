// Project imports
import { useAuthStore } from '@/domains/auth/store';

// Set once this handler has ended the session. Module-level, so it lives
// exactly as long as the document: the page load to /login resets it.
let sessionEnded = false;

// The app's response to a 401 (unauthenticated): the backend ended the
// session (it expired, or a password change elsewhere logged this browser
// out), so the frontend logs out too. main.ts registers it with
// setUnauthenticatedHandler().
// Returns whether it ended a session. The http layer uses that to decide
// whether the 401 has been handled (SessionEndedError) or not (passed on).
export const endExpiredSession = (): boolean =>
{
    // A second 401 from the same expiry (another request that was in flight)
    // arrives after clear(), so isLoggedIn is already false. It belongs to the
    // session ended here, so it is handled too, and /login isn't loaded twice.
    if (sessionEnded)
    {
        return true;
    }

    // Looked up on each call, not when this module loads: main.ts imports it
    // before app.use(createPinia()) runs, and there is no active Pinia yet.
    const store = useAuthStore();

    // A 401 while logged out isn't an expiry: restore() gets one at boot when
    // there is no session, and handles it itself.
    if (!store.isLoggedIn)
    {
        return false;
    }

    sessionEnded = true;
    store.clear();

    // A full page load, not router.push, for the same reason as logout in
    // Dashboard.vue: every store and in-flight request dies with the
    // document, so nothing reaches the next session.
    window.location.assign('/login');

    return true;
};
