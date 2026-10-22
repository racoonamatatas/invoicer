// The app's response to a page being left. On a back/forward cache restore
// the browser paints the frozen page straight away, and it stays on screen
// until reloadRestoredPage's reload has loaded the fresh one: after logout,
// that's the previous user's page, visible. Hidden here, the frozen copy has
// nothing to paint. main.ts registers it for `pagehide`.
// Unconditional, unlike reloadRestoredPage: a page that isn't cached is
// being thrown away, so hiding it costs nothing, and a browser that caches
// a page without saying so (`persisted`) is covered too.
export const hideCachedPage = (): void =>
{
    // Only a DOM change. vue-router's `pagehide` listener, which changes
    // history, keeps Chromium from caching the page; nothing here should.
    document.documentElement.hidden = true;
};
