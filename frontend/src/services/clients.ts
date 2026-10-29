import { isAddress, isNullableString, type Address } from '@/services/address';

// What the create and edit forms send. Keys match the request's validation
// rules, so they are also the keys of a 422's errors. Built up with `&`,
// which applies to each half of the `Address` union separately: a Dutch
// client and a foreign client stay two shapes, each with its own postcode
// and region rules.
export type ClientPayload = {
    name: string;
    email: string;
    vat_number: string | null; // only accepted for a client in the EU
} & Address;

// A client as the backend sends it: the payload plus its server-assigned id.
export type Client = { id: number } & ClientPayload;

// The body came over the network, so it is checked at runtime: TypeScript
// trusts the `value is` claim without verifying it. The address checks
// include which country goes with which postcode and region rules. Extra
// keys pass, a missing key or a wrong type doesn't.
export const isClient = (value: unknown): value is Client =>
{
    return typeof value === 'object'
           && value !== null // typeof null is 'object'
           && 'id' in value && Number.isInteger(value.id)
           && 'name' in value && typeof value.name === 'string'
           && 'email' in value && typeof value.email === 'string'
           && 'vat_number' in value && isNullableString(value.vat_number)
           && isAddress(value);
};
