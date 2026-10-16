import type { RouteRecordRaw, RouteRecordSingleView } from 'vue-router';

// A page or a lazy import of one, as Vue Router accepts it.
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
