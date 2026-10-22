// The app's response to a page entering the back/forward cache. On a restore
// the browser paints the frozen page straight away, and it stays on screen
// until reloadRestoredPage's reload has loaded the fresh one: after logout,
// that's the previous user's page, visible. Hidden here, the frozen copy has
// nothing to paint. main.ts registers it for `pagehide`.
export const hideCachedPage = (event: PageTransitionEvent): void =>
{
    // `persisted` is false when the page is being thrown away, so there is no
    // copy to protect. A DOM change is allowed here; a history change, as
    // vue-router's `replaceState`, keeps Chromium from caching the page.
    if (event.persisted)
    {
        document.documentElement.hidden = true;
    }
};
