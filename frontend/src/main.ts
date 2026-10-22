import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from '@/App.vue';
import router from '@/router';
import { useAuthStore } from '@/domains/auth/store';
import { endExpiredSession } from '@/domains/auth/handlers/endExpiredSession';
import { reloadRestoredPage } from '@/domains/auth/handlers/reloadRestoredPage';
import { setUnauthenticatedHandler } from '@/services/http';

// Registered here, not as a side effect of importing a module, so the
// protection can't disappear when an import is moved or removed. Before the
// `try`, so it holds even if restore() throws.
window.addEventListener('pageshow', reloadRestoredPage);

const app = createApp(App);

app.use(createPinia());

// After Pinia: the handler uses the auth store. Before restore(), so every
// request the app makes is covered; restore()'s own 401 is skipped by the
// handler's logged-in check.
setUnauthenticatedHandler(endExpiredSession);

try
{
    await useAuthStore().restore();
}
finally
{
    // Kicks off the first navigation so must wait until restore()
    // knows who's logged in.
    app.use(router);

    // app will mount even if restore() fails.
    app.mount('#app');
}

