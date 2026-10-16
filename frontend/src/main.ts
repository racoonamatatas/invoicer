import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from '@/App.vue';
import router from '@/router';
import { useAuthStore } from '@/domains/auth/store';

const app = createApp(App);

app.use(createPinia());

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

