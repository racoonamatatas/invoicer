<?php

declare(strict_types = 1);

use App\Validation\Country\Netherlands\KvkNumber;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Validator as ValidatorInstance;

// Runs the rule the way a FormRequest would, so the test proves the message the API will send.
function validateKvkNumber(mixed $value): ValidatorInstance
{
    return Validator::make(['kvk_number' => $value], ['kvk_number' => [new KvkNumber]]);
}

describe('The KvkNumber rule', function (): void {

    it('should accept exactly eight digits', function (string $kvkNumber): void {
        // Act
        $validator = validateKvkNumber($kvkNumber);

        // Assert
        expect($validator->passes())->toBeTrue();
    })->with([
        'plain' => '12345678',
        'leading zero' => '01234567',
    ]);

    it('should reject anything but eight digits, with the message the API sends', function (string $kvkNumber): void {
        // Act
        $validator = validateKvkNumber($kvkNumber);

        // Assert
        expect($validator->fails())->toBeTrue()
            ->and($validator->errors()->first('kvk_number'))->toBe('The kvk number field must be a KvK number of 8 digits.');
    })->with([
        'seven digits' => '1234567',
        'nine digits' => '123456789',
        'a letter' => '1234567A',
        'a space inside' => '1234 5678',
        'surrounding whitespace' => ' 12345678',
    ]);

    it('should leave an empty string to the required rule', function (): void {
        // Act. Guards third-party code: Laravel's Validator skips a non-implicit rule for an empty value.
        $validator = validateKvkNumber('');

        // Assert
        expect($validator->passes())->toBeTrue();
    });

    it('should leave a non-string to the string rule', function (): void {
        // Act: an integer is the obvious wrong type here, and a leading zero would already be lost in it.
        $validator = validateKvkNumber(12345678);

        // Assert
        expect($validator->passes())->toBeTrue();
    });
});
