<?php

declare(strict_types = 1);

use App\Validation\Country\Netherlands\BtwId;
use App\Validation\VatNumber;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Validator as ValidatorInstance;

// Runs the rule the way a FormRequest would, so the test proves the message the API will send.
function validateVatNumber(mixed $value, string $prefix): ValidatorInstance
{
    return Validator::make(['vat_number' => $value], ['vat_number' => [new VatNumber($prefix)]]);
}

describe('The VatNumber rule', function (): void {

    it('should accept the prefix followed by 2 to 12 letters or digits', function (string $value, string $prefix): void {
        // Act
        $validator = validateVatNumber($value, $prefix);

        // Assert
        expect($validator->passes())->toBeTrue();
    })->with([
        'a German number' => ['DE123456789', 'DE'],
        'a Greek number, with EL' => ['EL123456789', 'EL'],
        // Letters occur in real numbers: Irish, Cypriot and French ones carry them.
        'letters after the prefix' => ['IE1234567WA', 'IE'],
        'the shortest, 2 after the prefix' => ['AT12', 'AT'],
        'the longest, 12 after the prefix (14 in all)' => ['FR123456789012', 'FR'],
    ]);

    it('should reject anything else, with the message the API sends', function (string $value, string $prefix): void {
        // Act
        $validator = validateVatNumber($value, $prefix);

        // Assert
        expect($validator->fails())->toBeTrue()
            ->and($validator->errors()->first('vat_number'))->toBe("The vat number field must be a VAT number starting with {$prefix}.");
    })->with([
        'another country\'s prefix' => ['FR123456789', 'DE'],
        // The common mistake: Greece's ISO code is GR, its VAT prefix is EL.
        'GR for Greece' => ['GR123456789', 'EL'],
        'no prefix' => ['123456789', 'DE'],
        '1 after the prefix' => ['DE1', 'DE'],
        '13 after the prefix (15 in all)' => ['DE1234567890123', 'DE'],
        // The request uppercases first, so a lowercase letter here means the normaliser was skipped.
        'a lowercase letter' => ['IE1234567wa', 'IE'],
        'a space' => ['DE 123456789', 'DE'],
        // \z, not $: $ would also match before a trailing newline.
        'a trailing newline' => ["DE123456789\n", 'DE'],
    ]);

    it('should leave a non-string to the string rule', function (): void {
        // Act
        $validator = validateVatNumber(123456789, 'DE');

        // Assert
        expect($validator->passes())->toBeTrue();
    });
});

describe('VatNumber::forCountry()', function (): void {

    it('should give BtwId for NL, so a Dutch number gets the stricter format', function (): void {
        // Act
        $rule = VatNumber::forCountry('NL');

        // Assert
        expect($rule)->toBeInstanceOf(BtwId::class);
    });

    it('should give the default rule with the country\'s own prefix for another member state', function (string $countryCode, string $accepted, string $rejected): void {
        // Arrange
        $rules = ['vat_number' => [VatNumber::forCountry($countryCode)]];

        // Act
        $acceptedValidator = Validator::make(['vat_number' => $accepted], $rules);
        $rejectedValidator = Validator::make(['vat_number' => $rejected], $rules);

        // Assert. The class alone would not show the prefix, so the rule is run on one value of each kind.
        expect(get_class($rules['vat_number'][0]))->toBe(VatNumber::class)
            ->and($acceptedValidator->passes())->toBeTrue()
            ->and($rejectedValidator->fails())->toBeTrue();
    })->with([
        'Germany' => ['DE', 'DE123456789', 'FR123456789'],
        // The ISO code is GR, the VAT prefix EL.
        'Greece' => ['GR', 'EL123456789', 'GR123456789'],
    ]);

    it('should throw for a country outside the EU, which has no VAT number to check', function (): void {
        // Act
        $act = fn (): VatNumber => VatNumber::forCountry('US');

        // Assert
        expect($act)->toThrow(LogicException::class, 'US is not an EU member state.');
    });
});
