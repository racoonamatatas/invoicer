<?php

declare(strict_types = 1);

use App\Validation\CountryCode;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Validator as ValidatorInstance;

// Runs the rule the way a FormRequest would, so the test proves the message the API will send.
function validateCountryCode(mixed $value): ValidatorInstance
{
    return Validator::make(['country_code' => $value], ['country_code' => [new CountryCode]]);
}

describe('The CountryCode rule', function (): void {

    it('should accept an ISO 3166-1 alpha-2 code', function (string $code): void {
        // Act
        $validator = validateCountryCode($code);

        // Assert
        expect($validator->passes())->toBeTrue();
    })->with([
        'the Netherlands' => 'NL',
        'Germany' => 'DE',
        'the United Kingdom' => 'GB',
        'first on the list' => 'AD',
        'last on the list' => 'ZW',
    ]);

    it('should reject anything else, with the message the API sends', function (string $code): void {
        // Act
        $validator = validateCountryCode($code);

        // Assert
        expect($validator->fails())->toBeTrue()
            ->and($validator->errors()->first('country_code'))->toBe('The country code field must be a country code, like NL.');
    })->with([
        'lowercase' => 'nl',
        'unassigned' => 'XX',
        // The common mistake: the United Kingdom's ISO code is GB.
        'UK' => 'UK',
        // ICU knows these, ISO 3166-1 does not assign them.
        'the European Union' => 'EU',
        'Kosovo' => 'XK',
        'alpha-3' => 'NLD',
        'surrounding whitespace' => 'NL ',
    ]);

    it('should leave a non-string to the string rule', function (): void {
        // Act
        $validator = validateCountryCode(31);

        // Assert
        expect($validator->passes())->toBeTrue();
    });
});
