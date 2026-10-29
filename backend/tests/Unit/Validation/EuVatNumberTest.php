<?php

declare(strict_types = 1);

use App\Validation\EuVatNumber;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Validator as ValidatorInstance;

// Runs the rule the way a FormRequest would, so the test proves the message the API will send.
function validateEuVatNumber(mixed $value, string $prefix): ValidatorInstance
{
    return Validator::make(['vat_number' => $value], ['vat_number' => [new EuVatNumber($prefix)]]);
}

describe('The EuVatNumber rule', function (): void {

    it('should accept the prefix followed by 2 to 12 letters or digits', function (string $value, string $prefix): void {
        // Act
        $validator = validateEuVatNumber($value, $prefix);

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
        $validator = validateEuVatNumber($value, $prefix);

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

    it('should refuse to be built for NL, whose numbers BtwId checks', function (): void {
        // Act
        $act = fn (): EuVatNumber => new EuVatNumber('NL');

        // Assert
        expect($act)->toThrow(LogicException::class, 'A Dutch VAT number is checked by BtwId, not EuVatNumber.');
    });

    it('should leave a non-string to the string rule', function (): void {
        // Act
        $validator = validateEuVatNumber(123456789, 'DE');

        // Assert
        expect($validator->passes())->toBeTrue();
    });
});
