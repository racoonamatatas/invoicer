<?php

declare(strict_types = 1);

use App\Validation\Country\Netherlands\BtwId;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Validator as ValidatorInstance;

// Runs the rule the way a FormRequest would, so the test proves the message the API will send.
function validateBtwId(mixed $value): ValidatorInstance
{
    return Validator::make(['vat_number' => $value], ['vat_number' => [new BtwId]]);
}

describe('The BtwId rule', function (): void {

    it('should accept NL, nine digits, B and two digits', function (string $btwId): void {
        // Act
        $validator = validateBtwId($btwId);

        // Assert
        expect($validator->passes())->toBeTrue();
    })->with([
        'documentation example' => 'NL123456789B01',
        'zeros' => 'NL000000000B00',
    ]);

    it('should reject a value of the wrong format, with the message the API sends', function (string $btwId): void {
        // Act
        $validator = validateBtwId($btwId);

        // Assert
        expect($validator->fails())->toBeTrue()
            ->and($validator->errors()->first('vat_number'))->toBe('The vat number field must be a valid btw-id, like NL123456789B01.');
    })->with([
        'eight digits' => 'NL12345678B01',
        'ten digits' => 'NL1234567890B01',
        'one digit after the B' => 'NL123456789B1',
        'no B' => 'NL12345678901',
        'another country' => 'DE123456789B01',
        'lowercase' => 'nl123456789b01',
        'spaces' => 'NL 123456789 B01',
        'surrounding whitespace' => 'NL123456789B01 ',
    ]);

    it('should leave an empty string to the required rule', function (): void {
        // Act. Guards third-party code: Laravel's Validator skips a non-implicit rule for an empty value.
        $validator = validateBtwId('');

        // Assert
        expect($validator->passes())->toBeTrue();
    });

    it('should leave a non-string to the string rule', function (): void {
        // Act
        $validator = validateBtwId(['NL123456789B01']);

        // Assert
        expect($validator->passes())->toBeTrue();
    });
});
