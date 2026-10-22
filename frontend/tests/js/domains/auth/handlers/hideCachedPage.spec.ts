import { afterEach, describe, it, expect } from 'vitest';

import { hideCachedPage } from '@/domains/auth/handlers/hideCachedPage';

describe('hideCachedPage', () =>
{
    afterEach(() =>
    {
        // jsdom shares one document across the file, so a hidden <html> would
        // carry over into the next test.
        document.documentElement.hidden = false;
    });

    it('should hide the page when it is left, so a back/forward cache restore has nothing to paint', () =>
    {
        // Arrange
        // Visible to start with, so a hidden page at the end is the handler's doing.
        expect(document.documentElement.hidden).toBe(false);

        // Act
        hideCachedPage();

        // Assert
        expect(document.documentElement.hidden).toBe(true);
    });
});
