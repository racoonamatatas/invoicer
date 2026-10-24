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
        // A regex ending in $ matches before a final newline; the rule must end the match at the real end.
        'trailing newline' => "12345678\n",
    ]);

    it('should leave a blank value to the required rule', function (string $blank): void {
        // Act. Guards third-party code: Laravel's Validator skips a non-implicit rule when the trimmed value is
        // empty.
        $validator = validateKvkNumber($blank);

        // Assert
        expect($validator->passes())->toBeTrue();
    })->with([
        'empty' => '',
        'a space' => ' ',
        'a newline' => "\n",
    ]);

    it('should leave a non-string to the string rule', function (): void {
        // Act: an integer is the obvious wrong type here, and a leading zero would already be lost in it.
        $validator = validateKvkNumber(12345678);

        // Assert
        expect($validator->passes())->toBeTrue();
    });
});
