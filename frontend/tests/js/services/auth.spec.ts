import type { AxiosResponse } from 'axios';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import { login, register } from '@/services/auth';
import { postRequest } from '@/services/http';

// Every export of the http module becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/http');

const user = { id: 1, name: 'Jan de Vries', email: 'jan@example.nl' };

describe('auth service', () =>
{
    // Each test programs its own responses; none leak into the next.
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should post the credentials to /auth/login and return the user from the 200 (ok) response', async () =>
    {
        // Arrange: only data matters to login, so the rest of the axios response is left out
        const credentials = { email: 'jan@example.nl', password: 'secret-password' };
        vi.mocked(postRequest).mockResolvedValue({ data: user } as AxiosResponse);

        // Act
        const result = await login(credentials);

        // Assert: one request to the right route, and the user itself comes back, not the response
        expect(postRequest).toHaveBeenCalledExactlyOnceWith('/auth/login', credentials);
        expect(result).toBe(user);
    });

    it('should post the registration to /auth/register and return nothing from the 204 (no content) response', async () =>
    {
        // Arrange: axios gives an empty string as the data of a 204
        const registration = { name: 'Jan de Vries', email: 'jan@example.nl', password: 'secret-password' };
        vi.mocked(postRequest).mockResolvedValue({ data: '' } as AxiosResponse);

        // Act
        const result = await register(registration);

        // Assert: one request to the right route, and nothing leaks out to the page
        expect(postRequest).toHaveBeenCalledExactlyOnceWith('/auth/register', registration);
        expect(result).toBeUndefined();
    });
});
