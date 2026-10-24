<?php

declare(strict_types = 1);

use App\Validation\Country\Netherlands\Postcode;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Validator as ValidatorInstance;

// Runs the rule the way a FormRequest would, so the test proves the message the API will send.
function validatePostcode(mixed $value): ValidatorInstance
{
    return Validator::make(['postal_code' => $value], ['postal_code' => [new Postcode]]);
}

describe('The Postcode rule', function (): void {

    it('should accept four digits, a space and two uppercase letters', function (string $postcode): void {
        // Act
        $validator = validatePostcode($postcode);

        // Assert
        expect($validator->passes())->toBeTrue();
    })->with([
        'typical' => '1234 AB',
        'highest digits' => '9999 ZZ',
        'S followed by an allowed letter' => '1234 SB',
    ]);

    it('should reject a value of the wrong shape, with the message the API sends', function (string $postcode): void {
        // Act
        $validator = validatePostcode($postcode);

        // Assert
        expect($validator->fails())->toBeTrue()
            ->and($validator->errors()->first('postal_code'))->toBe('The postal code field must be a Dutch postcode, like 1234 AB.');
    })->with([
        'no space' => '1234AB',
        'two spaces' => '1234  AB',
        'lowercase' => '1234 ab',
        'leading zero' => '0234 AB',
        'three digits' => '123 AB',
        'one letter' => '1234 A',
        'three letters' => '1234 ABC',
        'surrounding whitespace' => '1234 AB ',
        // A regex ending in $ matches before a final newline; the rule must end the match at the real end.
        'trailing newline' => "1234 AB\n",
    ]);

    it('should reject the letter pairs that are never issued', function (string $postcode): void {
        // Act
        $validator = validatePostcode($postcode);

        // Assert
        expect($validator->fails())->toBeTrue();
    })->with([
        'SA' => '1234 SA',
        'SD' => '1234 SD',
        'SS' => '1234 SS',
    ]);

    it('should leave a blank value to the required rule', function (string $blank): void {
        // Act. Guards third-party code: Laravel's Validator skips a non-implicit rule when the trimmed value is
        // empty, so whether a postcode may be blank is the required rule's decision, not this rule's.
        $validator = validatePostcode($blank);

        // Assert
        expect($validator->passes())->toBeTrue();
    })->with([
        'empty' => '',
        'a space' => ' ',
        'a newline' => "\n",
    ]);

    it('should leave a non-string to the string rule', function (): void {
        // Act
        $validator = validatePostcode(1234);

        // Assert
        expect($validator->passes())->toBeTrue();
    });
});
