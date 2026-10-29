import type { Address, AddressField, CountryCode, DutchAddress, ForeignAddress } from '@/services/address';

// A country's address form as data: per text field, its label, its
// autocomplete token and whether it is asked for. AddressFields builds its
// inputs from the format alone, so a country with its own rules is one entry
// in ADDRESS_FORMATS, not a branch in the component. Each entry must mirror
// AddressRules: a format stricter than the backend blocks an address the
// API would accept.

// The fields typed into a text input: all but country_code, which has the
// select. Their order on screen is this order, for every country.
export const ADDRESS_TEXT_FIELDS = ['street', 'house_number', 'house_number_addition', 'postal_code', 'city', 'region'] as const;

export type AddressTextField = (typeof ADDRESS_TEXT_FIELDS)[number];

export type Presence = 'required' | 'optional' | 'hidden';

// The presences a format may give a field, derived from the field's type, so
// a format can be stricter than its address type but never looser:
// - `null` only (a Dutch region): `hidden`, since there is nothing to ask.
// - `string | null` (a foreign postcode): any presence.
// - `string` only (a street): `required`, since it can't be left empty.
// The `[]` around both sides stops TypeScript from checking `string | null`
// one member at a time, which would give `'hidden' | 'required'` instead.
type PresenceFor<T> = [T] extends [null] ? 'hidden' : [null] extends [T] ? Presence : 'required';

export interface FieldFormat<TPresence extends Presence = Presence>
{
    label: string;
    autocomplete: string | undefined; // undefined: no token fits a split street or house number
    presence: TPresence;
}

export type AddressFormatFor<A extends Address> = { readonly [K in AddressTextField]: FieldFormat<PresenceFor<A[K]>> };

// The widest format: what AddressFields reads, whatever the country.
export type AddressFormat = AddressFormatFor<ForeignAddress>;

// Every country without its own entry. `as const` keeps each presence a
// literal, so the Dutch format below can reuse the fields it shares.
const DEFAULT_FORMAT = {
    street: { label: 'Street', autocomplete: undefined, presence: 'required' },
    house_number: { label: 'House number', autocomplete: undefined, presence: 'required' },
    house_number_addition: { label: 'Addition', autocomplete: undefined, presence: 'optional' },
    postal_code: { label: 'Postcode', autocomplete: 'postal-code', presence: 'optional' }, // Hong Kong has none
    city: { label: 'City', autocomplete: 'address-level2', presence: 'required' },
    region: { label: 'Region', autocomplete: 'address-level1', presence: 'optional' },
} as const satisfies AddressFormat;

// Typed against its own side of the union: a Dutch format that asks for a
// region, or lets the postcode go, doesn't compile. Exported with that type,
// so withCountry can build a DutchAddress from it.
export const DUTCH_FORMAT: AddressFormatFor<DutchAddress> = {
    ...DEFAULT_FORMAT,
    postal_code: { ...DEFAULT_FORMAT.postal_code, presence: 'required' },
    region: { ...DEFAULT_FORMAT.region, presence: 'hidden' },
};

// Keyed by the union's discriminant, so each entry is checked against the
// side of the union its country belongs to.
type AddressFormats = { readonly NL: AddressFormatFor<DutchAddress> }
    & { readonly [C in Exclude<CountryCode, 'NL'>]?: AddressFormatFor<ForeignAddress> };

const ADDRESS_FORMATS: AddressFormats = {
    NL: DUTCH_FORMAT,
};

export const addressFormatFor = (code: CountryCode): AddressFormat =>
{
    return ADDRESS_FORMATS[code] ?? DEFAULT_FORMAT;
};

// Keeps the two lists in step: a field added to Address but not to
// ADDRESS_TEXT_FIELDS fails here, so it can't go without an input.
type MissingTextField = Exclude<AddressField, AddressTextField | 'country_code'>;
const NO_MISSING_TEXT_FIELD: [MissingTextField] extends [never] ? true : false = true;
void NO_MISSING_TEXT_FIELD;
