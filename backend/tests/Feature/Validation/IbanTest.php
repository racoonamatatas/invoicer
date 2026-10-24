<?php

declare(strict_types = 1);

use App\Validation\Iban;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Validator as ValidatorInstance;

// Runs the rule the way a FormRequest would, so the test proves the message the API will send.
function validateIban(mixed $value): ValidatorInstance
{
    return Validator::make(['iban' => $value], ['iban' => [new Iban]]);
}

describe('The Iban rule', function (): void {

    it('should accept a canonical IBAN whose mod-97 checksum holds', function (string $iban): void {
        // Act
        $validator = validateIban($iban);

        // Assert
        expect($validator->passes())->toBeTrue();
    })->with([
        'NL' => 'NL91ABNA0417164300',
        'DE' => 'DE89370400440532013000',
        'BE' => 'BE68539007547034',
        'GB' => 'GB29NWBK60161331926819',
    ]);

    it('should reject an IBAN whose checksum fails, with the message the API sends', function (string $iban): void {
        // Act
        $validator = validateIban($iban);

        // Assert
        expect($validator->fails())->toBeTrue()
            ->and($validator->errors()->first('iban'))->toBe('The iban field must be a valid IBAN.');
    })->with([
        'one digit changed' => 'NL91ABNA0417164301',
        'check digits changed' => 'NL19ABNA0417164300',
        'two neighbouring digits swapped' => 'NL91ABNA0471164300',
    ]);

    it('should reject a value that is not in canonical form, because the request normalises before any rule runs', function (string $iban): void {
        // Act
        $validator = validateIban($iban);

        // Assert
        expect($validator->fails())->toBeTrue();
    })->with([
        'spaces as on a bank card' => 'NL91 ABNA 0417 1643 00',
        'lowercase' => 'nl91abna0417164300',
        'letters in the check digits' => 'NLAAABNA0417164300',
        'too short for any country (14)' => 'NL91ABNA041716',
        'too long for any country (35)' => 'DE89370400440532013000ABCDEFGHIJKLM',
    ]);

    it('should reject a Dutch IBAN of the wrong shape even when its checksum holds', function (string $iban): void {
        // Act
        $validator = validateIban($iban);

        // Assert
        expect($validator->fails())->toBeTrue();
    })->with([
        // Check digits computed so that mod-97 is 1: only the NL shape check can catch these.
        '17 characters' => 'NL58ABNA041716430',
        '19 characters' => 'NL06ABNA04171643001',
    ]);

    it('should leave an empty string to the required rule', function (): void {
        // Act. Guards third-party code: Laravel's Validator skips a non-implicit rule for an empty value, so
        // whether an IBAN may be blank is the required rule's decision, and a request can't forget it by
        // relying on this rule.
        $validator = validateIban('');

        // Assert
        expect($validator->passes())->toBeTrue();
    });

    it('should leave a non-string to the string rule', function (): void {
        // Act: an array can't be an IBAN, but that is the string rule's message to give, not this one's.
        $validator = validateIban(['NL91ABNA0417164300']);

        // Assert
        expect($validator->passes())->toBeTrue();
    });
});
