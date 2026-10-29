import { addressFormatFor, DUTCH_FORMAT, type AddressTextField, type Presence } from '@/form/addressFormats';
import type { Address, CountryCode, DutchAddress, ForeignAddress } from '@/services/address';

// The edits AddressFields makes to an address, each returning a new one. In
// form/, not services/: which fields a country hides is the form's business,
// not the API's, and the formats live here.

// A field the target format hides has no input, so a value left in it would
// be sent without the user seeing it, and a 422 on it would have nowhere to
// show. PresenceFor only lets a nullable field be hidden, so null always fits.
const unlessHidden = <T>(presence: Presence, value: T): T | null =>
{
    return presence === 'hidden' ? null : value;
};

// The address in another country. Every field is listed, not spread: a field
// added to Address fails to compile here until someone decides whether a
// country change keeps it.
export const withCountry = (address: Address, code: CountryCode): Address =>
{
    if (code === 'NL')
    {
        const dutch: DutchAddress = {
            street: address.street,
            house_number: address.house_number,
            house_number_addition: unlessHidden(DUTCH_FORMAT.house_number_addition.presence, address.house_number_addition),
            postal_code: address.postal_code ?? '', // a Dutch postcode is text, never null
            city: address.city,
            region: null, // provinces aren't part of a Dutch postal address
            country_code: code,
        };

        return dutch;
    }

    const format = addressFormatFor(code);
    const foreign: ForeignAddress = {
        street: address.street,
        house_number: address.house_number,
        house_number_addition: unlessHidden(format.house_number_addition.presence, address.house_number_addition),
        postal_code: unlessHidden(format.postal_code.presence, address.postal_code),
        city: address.city,
        region: unlessHidden(format.region.presence, address.region),
        country_code: code,
    };

    return foreign;
};

// The address with one typed field changed. One spread per field, not
// `{ ...address, [key]: value }`: a computed key widens the result, so it
// would no longer be checked against either side of the union.
export const withText = (address: Address, key: AddressTextField, value: string): Address =>
{
    switch (key)
    {
        case 'street':
            return { ...address, street: value };
        case 'house_number':
            return { ...address, house_number: value };
        case 'house_number_addition':
            return { ...address, house_number_addition: value };
        case 'postal_code':
            return { ...address, postal_code: value };
        case 'city':
            return { ...address, city: value };
        case 'region':
            // Unreachable from the inputs: the Dutch format hides the region.
            // TypeScript can't tie this key to the foreign side, so the check
            // is what lets the region be text.
            if (address.country_code === 'NL')
            {
                throw new Error('A Dutch address has no region, but one was typed into it');
            }

            return { ...address, region: value };
    }
};
