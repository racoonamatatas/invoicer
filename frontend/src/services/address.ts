// The ISO 3166-1 alpha-2 codes the backend accepts: a copy of the list in
// the backend's CountryCode rule, so a code the select offers is one the
// backend stores. A static copy, not one the backend serves: the type below
// is derived from it, and a list fetched at runtime can't give a type. The
// address spec reads the PHP file and fails when the two drift apart.
export const COUNTRY_CODES = [
    'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE',
    'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD',
    'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM',
    'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
    'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
    'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN',
    'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME',
    'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
    'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM',
    'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI',
    'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK',
    'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
    'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

// `some` with ===, not includes(): includes() on the `as const` tuple only
// accepts its own literals, and `value` could be anything at this point.
export const isCountryCode = (value: unknown): value is CountryCode =>
{
    return COUNTRY_CODES.some((code) => code === value);
};

// The address fields every addressed payload sends (the backend's
// AddressRules), so a business and a client share one shape and one
// AddressFields component. A union on country_code, mirroring the rules: a
// Dutch address needs a postcode and has no region (provinces aren't part of
// a Dutch postal address), any other may have either or neither.
export interface DutchAddress
{
    street: string;
    house_number: string;
    house_number_addition: string | null;
    postal_code: string;
    city: string;
    region: null;
    country_code: 'NL';
}

export interface ForeignAddress
{
    street: string;
    house_number: string;
    house_number_addition: string | null;
    postal_code: string | null; // null: not every country has postcodes (Hong Kong has none)
    city: string;
    region: string | null;
    country_code: Exclude<CountryCode, 'NL'>;
}

export type Address = DutchAddress | ForeignAddress;

export type AddressField = keyof Address;

export const isNullableString = (value: unknown): value is string | null =>
{
    return value === null || typeof value === 'string';
};

// The body came over the network, so it is checked at runtime: TypeScript
// trusts the `value is` claim without verifying it. The country
// decides which half of the union applies, so postal_code and region are
// checked per half: checking each loosely on its own would let a Dutch
// address with a region through. Extra keys pass, a missing key or a wrong
// type doesn't.
export const isAddress = (value: unknown): value is Address =>
{
    const hasSharedFields = typeof value === 'object'
                            && value !== null // typeof null is 'object'
                            && 'street' in value && typeof value.street === 'string'
                            && 'house_number' in value && typeof value.house_number === 'string'
                            && 'house_number_addition' in value && isNullableString(value.house_number_addition)
                            && 'city' in value && typeof value.city === 'string'
                            && 'country_code' in value && isCountryCode(value.country_code)
                            && 'postal_code' in value
                            && 'region' in value;

    if (!hasSharedFields)
    {
        return false;
    }

    if (value.country_code === 'NL')
    {
        return typeof value.postal_code === 'string' && value.region === null;
    }

    return isNullableString(value.postal_code) && isNullableString(value.region);
};
