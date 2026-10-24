<?php

declare(strict_types = 1);

use App\Validation\Normaliser;

describe('Normaliser::uppercase', function (): void {

    it('should uppercase a string', function (string $value, string $expected): void {
        // Act
        $normalised = Normaliser::uppercase($value);

        // Assert
        expect($normalised)->toBe($expected);
    })->with([
        'btw-id' => ['nl123456789b01', 'NL123456789B01'],
        'country code' => ['de', 'DE'],
        'already uppercase' => ['NL', 'NL'],
    ]);

    it('should leave non-ASCII letters alone, for the rule to reject', function (): void {
        // Act. mb_strtoupper() would turn "ß" into "SS" and could make an invalid value pass.
        $normalised = Normaliser::uppercase('ß');

        // Assert
        expect($normalised)->toBe('ß');
    });

    it('should hand back a non-string unchanged, for the string rule to reject', function (mixed $value): void {
        // Act
        $normalised = Normaliser::uppercase($value);

        // Assert
        expect($normalised)->toBe($value);
    })->with([
        'integer' => 31,
        'null' => null,
        'array' => [['nl']],
    ]);
});

describe('Normaliser::btwId', function (): void {

    it('should drop spaces and dots and uppercase the rest', function (string $value): void {
        // Act
        $normalised = Normaliser::btwId($value);

        // Assert
        expect($normalised)->toBe('NL123456789B01');
    })->with([
        'grouped with spaces and dots' => 'NL 1234.56.789.B01',
        'lowercase' => 'nl123456789b01',
        'spaces only' => 'NL 123456789 B01',
        'already canonical' => 'NL123456789B01',
    ]);

    it('should leave any other separator, for the BtwId rule to reject', function (): void {
        // Act
        $normalised = Normaliser::btwId('NL-123456789-B01');

        // Assert
        expect($normalised)->toBe('NL-123456789-B01');
    });

    it('should hand back a non-string unchanged, for the string rule to reject', function (mixed $value): void {
        // Act
        $normalised = Normaliser::btwId($value);

        // Assert
        expect($normalised)->toBe($value);
    })->with([
        'integer' => 123456789,
        'null' => null,
        'array' => [['NL 123']],
    ]);
});

describe('Normaliser::dutchPostcode', function (): void {

    it('should reshape four digits and two letters into "1234 AB"', function (string $value): void {
        // Act
        $normalised = Normaliser::dutchPostcode($value);

        // Assert
        expect($normalised)->toBe('1234 AB');
    })->with([
        'lowercase, no space' => '1234ab',
        'uppercase, no space' => '1234AB',
        'lowercase, with space' => '1234 ab',
        'mixed case' => '1234 aB',
        'two spaces' => '1234  AB',
        'already canonical' => '1234 AB',
    ]);

    it('should hand back anything else unchanged, for the Postcode rule to reject', function (string $value): void {
        // Act
        $normalised = Normaliser::dutchPostcode($value);

        // Assert
        expect($normalised)->toBe($value);
    })->with([
        'German' => '10117',
        'three letters' => '1234 abc',
        'three digits' => '123 ab',
        'a tab between' => "1234\tab",
        // A regex ending in $ matches before a final newline; the method must end the match at the real end.
        'trailing newline' => "1234ab\n",
    ]);

    it('should hand back a non-string unchanged, for the string rule to reject', function (mixed $value): void {
        // Act
        $normalised = Normaliser::dutchPostcode($value);

        // Assert
        expect($normalised)->toBe($value);
    })->with([
        'integer' => 1234,
        'null' => null,
        'array' => [['1234ab']],
    ]);
});
