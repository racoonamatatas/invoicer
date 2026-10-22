import { afterEach, describe, it, expect } from 'vitest';

import { hideCachedPage } from '@/domains/auth/handlers/hideCachedPage';

describe('hideCachedPage', () =>
{
    const html = document.documentElement;

    afterEach(() =>
    {
        // jsdom shares one document across the file, so a hidden <html> would
        // carry over into the next test.
        html.style.removeProperty('display');
    });

    it('should hide the page with an inline !important display: none, so neither a back/forward cache restore nor a stylesheet can show it', () =>
    {
        // Arrange
        // No inline display to start with, so one at the end is the handler's doing.
        expect(html.style.getPropertyValue('display')).toBe('');

        // Act
        hideCachedPage();

        // Assert
        // The inline style is checked, not the computed one: jsdom's cascade
        // lets the `hidden` attribute beat a stylesheet, unlike a browser, so
        // a computed `none` wouldn't prove a stylesheet can't override it.
        expect(html.style.getPropertyValue('display')).toBe('none');
        expect(html.style.getPropertyPriority('display')).toBe('important');
    });
});
