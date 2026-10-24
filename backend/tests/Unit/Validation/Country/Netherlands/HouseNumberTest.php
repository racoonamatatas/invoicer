<?php

declare(strict_types = 1);

use App\Validation\Country\Netherlands\HouseNumber;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Validator as ValidatorInstance;

// Runs the rule the way a FormRequest would, so the test proves the message the API will send.
function validateHouseNumber(mixed $value): ValidatorInstance
{
    return Validator::make(['house_number' => $value], ['house_number' => [new HouseNumber]]);
}

describe('The HouseNumber rule', function (): void {

    it('should accept a number from 1 to 99999', function (string $houseNumber): void {
        // Act
        $validator = validateHouseNumber($houseNumber);

        // Assert
        expect($validator->passes())->toBeTrue();
    })->with([
        'lowest' => '1',
        'typical' => '123',
        'highest' => '99999',
    ]);

    it('should reject anything else, with the message the API sends', function (string $houseNumber): void {
        // Act
        $validator = validateHouseNumber($houseNumber);

        // Assert
        expect($validator->fails())->toBeTrue()
            ->and($validator->errors()->first('house_number'))->toBe('The house number field must be a Dutch house number, like 12.');
    })->with([
        // The letter belongs in house_number_addition, so "12a" and "12" + "a" can't both be stored.
        'with a letter' => '12a',
        'with an addition' => '12-2',
        'a range' => '12-14',
        'zero' => '0',
        'leading zero' => '012',
        'six digits' => '100000',
        'negative' => '-1',
        'surrounding whitespace' => '12 ',
        // A regex ending in $ matches before a final newline; the rule must end the match at the real end.
        'trailing newline' => "12\n",
    ]);

    it('should leave a blank value to the required rule', function (string $blank): void {
        // Act. Guards third-party code: Laravel's Validator skips a non-implicit rule when the trimmed value is
        // empty, so whether a house number may be blank is the required rule's decision, not this rule's.
        $validator = validateHouseNumber($blank);

        // Assert
        expect($validator->passes())->toBeTrue();
    })->with([
        'empty' => '',
        'a space' => ' ',
    ]);

    it('should leave a non-string to the string rule', function (): void {
        // Act
        $validator = validateHouseNumber(12);

        // Assert
        expect($validator->passes())->toBeTrue();
    });
});
