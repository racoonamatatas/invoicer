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

    it('should accept NL, nine digits, B and two digits', function (): void {
        // Act. One case on purpose: this is a format check, so any 14-character value of this shape passes
        // today. Pinning more of them here would turn that limitation into a requirement and fight the
        // checksum when it lands.
        $validator = validateBtwId('NL123456789B01');

        // Assert
        expect($validator->passes())->toBeTrue();
    });

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
        // A regex ending in $ matches before a final newline; the rule must end the match at the real end.
        'trailing newline' => "NL123456789B01\n",
    ]);

    it('should leave a blank value to the required rule', function (string $blank): void {
        // Act. Guards third-party code: Laravel's Validator skips a non-implicit rule when the trimmed value is
        // empty.
        $validator = validateBtwId($blank);

        // Assert
        expect($validator->passes())->toBeTrue();
    })->with([
        'empty' => '',
        'a space' => ' ',
        'a newline' => "\n",
    ]);

    it('should leave a non-string to the string rule', function (): void {
        // Act
        $validator = validateBtwId(['NL123456789B01']);

        // Assert
        expect($validator->passes())->toBeTrue();
    });
});
