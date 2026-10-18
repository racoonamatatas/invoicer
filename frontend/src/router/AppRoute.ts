import type { RouteRecordRaw, RouteRecordSingleView } from 'vue-router';

// A page or a lazy import of one, as Vue Router accepts it.
// Routes pass a lazy import, () => import('./pages/X.vue'): each page becomes
// its own chunk, downloaded on first visit, so heavy pages (invoice editor,
// PDF, charts) never slow down the login page. The pages are small today,
// but switching later would touch every route. The cost: a chunk can fail
// to download after a deploy (INV-0026), and tests must wait for it.
type RouteComponent = RouteRecordSingleView['component'];

// A route that is protected unless it says otherwise (fail closed): only
// .public() lets a logged-out visitor in. The router only accepts AppRoutes,
// and the private field makes a plain route object a type error, so no route
// can skip the default.
export class AppRoute
{
    #isPublic = false;

    constructor(
        readonly path: string,
        readonly name: string,
        readonly component: RouteComponent,
    )
    {}

    // Lets logged-out visitors open this route. Returns the route, so it can be
    // chained onto `new AppRoute(...)`.
    public(): this
    {
        this.#isPublic = true;

        return this;
    }

    // The plain object Vue Router expects; authGuard reads meta.public.
    toRecord(): RouteRecordRaw
    {
        return {
            path: this.path,
            name: this.name,
            component: this.component,
            meta: { public: this.#isPublic },
        };
    }
}
