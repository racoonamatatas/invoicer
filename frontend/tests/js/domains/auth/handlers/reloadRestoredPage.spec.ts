import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { reloadRestoredPage } from '@/domains/auth/handlers/reloadRestoredPage';

describe('reloadRestoredPage', () =>
{
    // reload is a spy (and a stub: it does nothing). jsdom can't do a real page
    // load, and won't let vi.spyOn redefine location.reload, so the whole
    // location is swapped for a copy with a spy in its place.
    const reload = vi.fn<() => void>();

    beforeEach(() =>
    {
        vi.resetAllMocks();
        vi.stubGlobal('location', { ...window.location, reload });
    });

    afterEach(() =>
    {
        vi.unstubAllGlobals();
    });

    it('should reload the page when pageshow reports a back/forward cache restore', () =>
    {
        // Arrange
        const event = new PageTransitionEvent('pageshow', { persisted: true });

        // Act
        reloadRestoredPage(event);

        // Assert
        expect(reload).toHaveBeenCalledOnce();
    });

    it('should not reload the page on a normal load', () =>
    {
        // Arrange
        // pageshow fires on every load. A reload here would fire it again, and
        // the page would reload forever.
        const event = new PageTransitionEvent('pageshow', { persisted: false });

        // Act
        reloadRestoredPage(event);

        // Assert
        expect(reload).not.toHaveBeenCalled();
    });
});
