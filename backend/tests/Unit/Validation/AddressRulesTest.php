<?php

declare(strict_types = 1);

use App\Validation\AddressRules;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Validator as ValidatorInstance;

/**
 * Runs the rules over a valid Dutch address with $changes on top. A null in $changes removes the field, the way a
 * request that leaves it out reaches the validator.
 *
 * @param  array<string, mixed>  $changes
 */
function validateAddress(array $changes = []): ValidatorInstance
{
    $address = array_filter([
        'street' => 'Keizersgracht',
        'house_number' => '123',
        'house_number_addition' => 'A',
        'postal_code' => '1015 CJ',
        'city' => 'Amsterdam',
        'region' => null,
        'country_code' => 'NL',
        ...$changes,
    ], static fn (mixed $value): bool => $value !== null);

    return Validator::make($address, AddressRules::forAddress());
}

/**
 * The same, over a valid German address: no region, but the loose side lets the test add one.
 *
 * @param  array<string, mixed>  $changes
 */
function validateForeignAddress(array $changes = []): ValidatorInstance
{
    return validateAddress([
        'street' => 'Unter den Linden',
        'house_number' => '77',
        'house_number_addition' => null,
        'postal_code' => '10117',
        'city' => 'Berlin',
        'country_code' => 'DE',
        ...$changes,
    ]);
}

describe('AddressRules for a Dutch address', function (): void {

    it('should accept a complete Dutch address', function (): void {
        // Act
        $validator = validateAddress();

        // Assert
        expect($validator->passes())->toBeTrue();
    });

    it('should require a postcode', function (): void {
        // Act
        $validator = validateAddress(['postal_code' => null]);

        // Assert
        expect($validator->errors()->first('postal_code'))->toBe('The postal code field is required.');
    });

    it('should check the postcode with the Dutch Postcode rule', function (): void {
        // Act. One rejected value proves the rule is applied; PostcodeTest carries the detailed cases.
        $validator = validateAddress(['postal_code' => '10117']);

        // Assert
        expect($validator->errors()->first('postal_code'))->toBe('The postal code field must be a Dutch postcode, like 1234 AB.');
    });

    it('should check the house number with the Dutch HouseNumber rule', function (): void {
        // Act. One rejected value proves the rule is applied; HouseNumberTest carries the detailed cases.
        $validator = validateAddress(['house_number' => '12a']);

        // Assert
        expect($validator->errors()->first('house_number'))->toBe('The house number field must be a Dutch house number, like 12.');
    });

    it('should reject a region, as Dutch addresses have none', function (): void {
        // Act
        $validator = validateAddress(['region' => 'Noord-Holland']);

        // Assert
        expect($validator->errors()->first('region'))->toBe('The region field is prohibited.');
    });
});

describe('AddressRules for an address outside the Netherlands', function (): void {

    it('should accept an address without a postcode, with a region and a free-text house number', function (): void {
        // Act
        $validator = validateForeignAddress([
            'postal_code' => null,
            'region' => 'Berlin',
            'house_number' => '12-14',
        ]);

        // Assert
        expect($validator->passes())->toBeTrue();
    });

    it('should accept a postcode in any shape, up to 12 characters', function (): void {
        // Act. A UK postcode, which the Dutch rule would reject.
        $validator = validateForeignAddress(['postal_code' => 'SW1A 1AA', 'country_code' => 'GB']);

        // Assert
        expect($validator->passes())->toBeTrue();
    });

    it('should reject a field over its length', function (string $field, int $length, string $message): void {
        // Act
        $validator = validateForeignAddress([$field => str_repeat('x', $length)]);

        // Assert
        expect($validator->errors()->first($field))->toBe($message);
    })->with([
        'postcode' => ['postal_code', 13, 'The postal code field must not be greater than 12 characters.'],
        'house number' => ['house_number', 11, 'The house number field must not be greater than 10 characters.'],
        'region' => ['region', 256, 'The region field must not be greater than 255 characters.'],
    ]);

    it('should take the loose side for a lowercase "nl", and reject it on country_code', function (): void {
        // Act. The request uppercases the country code before validation; here it arrives raw, so the NL
        // tightening does not apply (no postcode is fine), and CountryCode is what stops it.
        $validator = validateAddress(['country_code' => 'nl', 'postal_code' => null]);

        // Assert
        expect($validator->errors()->keys())->toBe(['country_code']);
    });
});

describe('AddressRules for any address', function (): void {

    it('should require the fields every address has', function (string $field, string $message): void {
        // Act
        $validator = validateAddress([$field => null]);

        // Assert
        expect($validator->errors()->first($field))->toBe($message);
    })->with([
        'street' => ['street', 'The street field is required.'],
        'house number' => ['house_number', 'The house number field is required.'],
        'city' => ['city', 'The city field is required.'],
        'country code' => ['country_code', 'The country code field is required.'],
    ]);

    it('should accept a missing house number addition', function (): void {
        // Act
        $validator = validateAddress(['house_number_addition' => null]);

        // Assert
        expect($validator->passes())->toBeTrue();
    });

    it('should check the country code with the CountryCode rule', function (): void {
        // Act. One rejected value proves the rule is applied; CountryCodeTest carries the detailed cases.
        $validator = validateForeignAddress(['country_code' => 'XX']);

        // Assert
        expect($validator->errors()->first('country_code'))->toBe('The country code field must be a country code, like NL.');
    });
});
