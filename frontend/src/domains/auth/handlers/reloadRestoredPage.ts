// The app's response to a back/forward cache restore. Browsers can freeze a
// page when it's left (DOM, stores, module variables) and bring it back on
// Back without asking the server. That page belongs to a session that may
// have ended since: after logout it would show the previous user's data, and
// after an expiry `endExpiredSession`'s `sessionEnded` flag would come back
// set and swallow the next 401. main.ts registers it for `pageshow`.
export const reloadRestoredPage = (event: PageTransitionEvent): void =>
{
    // `persisted` is false on a normal load, which is already a fresh
    // document. A reload, not a reset of each piece of state: it covers every
    // store and module variable, including ones added later.
    if (event.persisted)
    {
        window.location.reload();
    }
};
