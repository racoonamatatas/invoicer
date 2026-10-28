// The address fields every addressed payload sends (the backend's
// AddressRules), so a business and, later, a client share one shape and one
// AddressFields component. Only what a Dutch address needs today: clients
// will add region and country_code, and allow a null postal_code.
export interface Address
{
    street: string;
    house_number: string;
    house_number_addition: string | null;
    postal_code: string;
    city: string;
}

export type AddressField = keyof Address;
