import { describe, it, expect } from 'vitest';

import { formatCents, formatHundredths, parseCents, parseHundredths, type Cents, type Hundredths } from '@/form/amounts';

// The no-break space `Intl` puts between the euro sign and the amount, so the
// sign never wraps onto a line of its own. A plain space would not match.
const NBSP = '\u00A0';

describe('parseCents', () =>
{
    it.each([
        ['a comma', '10,01', 1001],
        ['a point', '10.01', 1001],
        ['a whole number', '7', 700],
        ['one decimal', '7,5', 750],
        ['zero', '0', 0],
        ['surrounding spaces', ' 10,01 ', 1001],
    ])('should accept %s: %j gives %i', (_description, input, cents) =>
    {
        // Act & Assert
        expect(parseCents(input)).toStrictEqual({ ok: true, value: cents });
    });

    it.each(['0,29', '0,57', '1,15', '0,07', '19,99'])('should parse %j exactly, where multiplying the float by 100 is off', (input) =>
    {
        // Arrange: the float route gives 28.999999999999996 for 0,29, so a
        // truncating parser would store a cent less.
        const viaFloat = Number(input.replace(',', '.')) * 100;
        const exact = Number(input.replace(',', ''));

        // Act
        const result = parseCents(input);

        // Assert: the float really is wrong, so the case proves something
        expect(viaFloat).not.toBe(exact);
        expect(result).toStrictEqual({ ok: true, value: exact });
    });

});

describe('parseHundredths', () =>
{
    it.each([
        ['a comma', '7,50', 750],
        ['a point', '7.50', 750],
        ['a whole number', '7', 700],
    ])('should accept %s: %j gives %i', (_description, input, hundredths) =>
    {
        // Act & Assert
        expect(parseHundredths(input)).toStrictEqual({ ok: true, value: hundredths });
    });

});

// Both parsers share one implementation, but each is run through every case,
// so a wrapper that drops or changes a reason fails too.
describe.each([
    ['parseCents', parseCents],
    ['parseHundredths', parseHundredths],
])('%s', (_name, parse) =>
{
    it.each([
        ['an empty string', '', 'empty'],
        ['only spaces', '   ', 'empty'],
        ['a minus sign', '-5', 'negative'],
        ['three decimals', '1,005', 'too_many_decimals'],
        ['a thousands point, read as three decimals', '1.000', 'too_many_decimals'],
        ['a thousands point with decimals', '1.000,50', 'not_a_number'],
        ['letters', '12abc', 'not_a_number'],
        ['a euro sign', '€ 10', 'not_a_number'],
        ['an exponent', '1e3', 'not_a_number'],
        ['a separator without digits after it', '10,', 'not_a_number'],
        ['a separator without digits before it', ',50', 'not_a_number'],
        ['a plus sign', '+5', 'not_a_number'],
        ['one more than the largest safe integer', '90071992547409,92', 'too_large'],
        ['a well-formed number far past it', '99999999999999999', 'too_large'],
    ])('should reject %s: %j is %s', (_description, input, reason) =>
    {
        // Act & Assert
        expect(parse(input)).toStrictEqual({ ok: false, reason });
    });

    it('should accept the largest safe integer, one below the first too_large', () =>
    {
        // Act & Assert: pins the boundary exactly, so an off-by-one cap fails
        expect(parse('90071992547409,91')).toStrictEqual({ ok: true, value: Number.MAX_SAFE_INTEGER });
    });
});

describe('formatCents', () =>
{
    it.each([
        [1001, `€${NBSP}10,01`],
        [5, `€${NBSP}0,05`],
        [0, `€${NBSP}0,00`],
        [123456, `€${NBSP}1.234,56`],
        [100000000, `€${NBSP}1.000.000,00`],
    ])('should format %i cents as %j', (cents, expected) =>
    {
        // Act & Assert
        expect(formatCents(cents as Cents)).toBe(expected);
    });

    it('should format the largest safe integer to the cent, where dividing it by 100 as a float loses the last digit', () =>
    {
        // Arrange: 9007199254740991 / 100 has no exact float; the nearest one
        // formats as ,90. Small amounts round back to the right cent, so only
        // a value this large tells a string route from a float one.
        const cents = Number.MAX_SAFE_INTEGER as Cents;

        // Act
        const formatted = formatCents(cents);

        // Assert
        expect(formatted).toBe(`€${NBSP}90.071.992.547.409,91`);
    });

    // oxlint-disable-next-line vitest/expect-expect -- the assertion is the @ts-expect-error inside, checked by vue-tsc, not by vitest
    it('should fail type-check when given hundredths', () =>
    {
        // Assert: checked by vue-tsc, not by vitest. Both are numbers at
        // runtime, so only the brand keeps a quantity out of a price.
        const quantity = 750 as Hundredths;
        // @ts-expect-error a quantity is not a price
        formatCents(quantity);
    });
});

describe('formatHundredths', () =>
{
    it.each([
        [750, '7,5'],
        [700, '7'],
        [0, '0'],
        [5, '0,05'],
        [123456, '1234,56'],
        // As in formatCents: a float would show ,9 here.
        [Number.MAX_SAFE_INTEGER, '90071992547409,91'],
    ])('should format %i hundredths as %j, with trailing zeros dropped and no grouping', (hundredths, expected) =>
    {
        // Act & Assert
        expect(formatHundredths(hundredths as Hundredths)).toBe(expected);
    });
});

// The brands are compile-time only, so a number cast from API data reaches
// the formatters unchecked. Sliced as digits, -5 would become `0.-5` and
// `Intl` would show `NaN`, so they throw instead.
describe.each([
    ['formatCents', (value: number): string => formatCents(value as Cents)],
    ['formatHundredths', (value: number): string => formatHundredths(value as Hundredths)],
])('%s', (_name, format) =>
{
    it.each([
        ['a negative amount', -5],
        ['a fractional amount', 1.5],
        ['NaN', Number.NaN],
        ['an amount past the largest safe integer', Number.MAX_SAFE_INTEGER + 1],
    ])('should throw a RangeError for %s', (_description, value) =>
    {
        // Act & Assert
        expect(() => format(value)).toThrow(RangeError);
    });
});

describe('round trip', () =>
{
    it.each(['0', '7', '7,5', '0,05', '1234,56', '10000000'])('should parse back what formatHundredths gives for %j', (input) =>
    {
        // Arrange
        const parsed = parseHundredths(input);
        if (!parsed.ok)
        {
            throw new Error(`${input} should parse`);
        }

        // Act
        const reparsed = parseHundredths(formatHundredths(parsed.value));

        // Assert: what the editor shows can be submitted as it is
        expect(reparsed).toStrictEqual(parsed);
    });

    it('should format a typed price as euros with the same digits', () =>
    {
        // Arrange
        const parsed = parseCents('1234,5');
        if (!parsed.ok)
        {
            throw new Error('1234,5 should parse');
        }

        // Act
        const formatted = formatCents(parsed.value);

        // Assert
        expect(formatted).toBe(`€${NBSP}1.234,50`);
    });
});
