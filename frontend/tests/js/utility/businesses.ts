import { vi } from 'vitest';

import * as auth from '@/services/auth';
import type { Business } from '@/services/businesses';
import { useAuthStore } from '@/domains/auth/store';

export const jan: auth.User = { id: 1, name: 'Jan de Vries', email: 'jan@example.nl' };

// A business as listBusinesses returns it; only the id and name differ.
export const business = (id: number, legalName: string): Business => ({
    id,
    legal_name: legalName,
    kvk_number: `1234567${id}`,
    vat_number: 'NL123456789B01',
    street: 'Keizersgracht',
    house_number: '123',
    house_number_addition: null,
    postal_code: '1015 CJ',
    city: 'Amsterdam',
    region: null,
    country_code: 'NL',
    payment_term_days: 30,
});

// Logs in through the real auth store, since its user is private to it. The
// businesses store only loads a list for a logged-in user. Needs
// vi.mock('@/services/auth') in the spec that calls it.
export const logInAs = async (user: auth.User): Promise<void> =>
{
    vi.mocked(auth.login).mockResolvedValue(user);
    await useAuthStore().login({ email: user.email, password: 'secret-password' });
};
