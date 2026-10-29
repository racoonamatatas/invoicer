import type { Client } from '@/services/clients';

// A Dutch client as listClients returns it; only the id and name differ.
export const dutchClient = (id: number, name: string): Client => ({
    id,
    name,
    email: `client${id}@example.nl`,
    vat_number: null,
    street: 'Oosterstraat',
    house_number: '123',
    house_number_addition: null,
    postal_code: '9711 LM',
    city: 'Groningen',
    region: null,
    country_code: 'NL',
});

// A client abroad: its own builder, not overrides on the Dutch one, because
// a spread of loose fields could pair NL with a region the `Address` union
// forbids.
export const germanClient = (id: number, name: string): Client => ({
    id,
    name,
    email: `client${id}@example.de`,
    vat_number: 'DE123456789',
    street: 'Leopoldstraße',
    house_number: '12',
    house_number_addition: null,
    postal_code: '80802',
    city: 'München',
    region: 'Bayern',
    country_code: 'DE',
});
