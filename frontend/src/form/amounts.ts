// The backend only knows integers: `unit_price_cents` and
// `quantity_hundredths`. These functions convert at the edge, between what a
// user types and those integers, working on the digit strings so no value
// ever passes through a float (`0.29 * 100` is `28.999999999999996`).

// A compile-time tag only: `declare` emits nothing, so at runtime both types
// are plain numbers, but a quantity can't be passed where a price is expected.
declare const brand: unique symbol;

export type Cents = number & { readonly [brand]: 'Cents' };
export type Hundredths = number & { readonly [brand]: 'Hundredths' };

export type ParseFailure = 'empty' | 'not_a_number' | 'too_many_decimals' | 'negative';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: ParseFailure };

// Either separator, at most once. No thousands separators: `1.000` could be a
// Dutch thousand or an English one, so it is refused as three decimals.
const DECIMAL = /^(\d+)(?:[.,](\d+))?$/;

// Cents and hundredths are both the typed value times 100, so one parser
// serves both.
const parseTimesHundred = (input: string): ParseResult<number> =>
{
    const trimmed = input.trim();
    if (trimmed === '')
    {
        return { ok: false, reason: 'empty' };
    }

    // Before the pattern, so `-5` gets its own reason, not `not_a_number`.
    if (trimmed.startsWith('-'))
    {
        return { ok: false, reason: 'negative' };
    }

    const match = DECIMAL.exec(trimmed);
    const whole = match?.[1];
    if (match === null || whole === undefined)
    {
        return { ok: false, reason: 'not_a_number' };
    }

    const decimals = match[2] ?? '';
    if (decimals.length > 2)
    {
        return { ok: false, reason: 'too_many_decimals' };
    }

    // `0,29` becomes the digit string `029`, so the number is built exactly,
    // without multiplying by 100.
    const value = Number(whole + decimals.padEnd(2, '0'));

    // A longer digit string would lose precision and store a different amount.
    return Number.isSafeInteger(value) ? { ok: true, value } : { ok: false, reason: 'not_a_number' };
};

export const parseCents = (input: string): ParseResult<Cents> =>
{
    const result = parseTimesHundred(input);

    // The one place a number becomes `Cents`.
    return result.ok ? { ok: true, value: result.value as Cents } : result;
};

export const parseHundredths = (input: string): ParseResult<Hundredths> =>
{
    const result = parseTimesHundred(input);

    // The one place a number becomes `Hundredths`.
    return result.ok ? { ok: true, value: result.value as Hundredths } : result;
};

// 1001 becomes the decimal string `10.01` by moving the point two digits in,
// so `Intl` gets the exact value instead of the float `1001 / 100`.
const toDecimalString = (timesHundred: number): `${number}` =>
{
    const digits = String(timesHundred).padStart(3, '0');

    return `${digits.slice(0, -2)}.${digits.slice(-2)}` as `${number}`;
};

// Dutch style: `€ 1.234,56`, the space after the sign a no-break space (U+00A0).
const EUROS = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });

// Trailing zeros dropped (`7,5`, `7`), and no grouping, so a formatted
// quantity can be typed back as it is: the parser refuses `1.000`.
const QUANTITY = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2, useGrouping: false });

export const formatCents = (cents: Cents): string => EUROS.format(toDecimalString(cents));

export const formatHundredths = (hundredths: Hundredths): string => QUANTITY.format(toDecimalString(hundredths));
