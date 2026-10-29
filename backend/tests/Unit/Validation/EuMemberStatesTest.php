<?php

declare(strict_types = 1);

use App\Validation\EuMemberStates;

describe('EuMemberStates', function (): void {

    it('should list exactly the 27 member states', function (): void {
        // Arrange
        // Every ISO code from A to Z: the 27 members must answer true and every other code false, so a missing or an
        // extra entry (the UK after Brexit, the EU code itself) both fail here.
        $members = [
            'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
            'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
        ];
        $allCodes = [];
        foreach (range('A', 'Z') as $first)
        {
            foreach (range('A', 'Z') as $second)
            {
                $allCodes[] = $first.$second;
            }
        }

        // Act
        $found = array_values(array_filter($allCodes, EuMemberStates::contains(...)));

        // Assert
        expect($found)->toBe($members);
    });

    it('should give the VAT prefix, which is the country code except for Greece', function (string $code, string $prefix): void {
        // Act
        $actual = EuMemberStates::vatPrefix($code);

        // Assert
        expect($actual)->toBe($prefix);
    })->with([
        'the Netherlands' => ['NL', 'NL'],
        'Germany' => ['DE', 'DE'],
        'Greece' => ['GR', 'EL'],
    ]);

    it('should throw when asked for the VAT prefix of a country outside the EU', function (): void {
        // Act
        $act = fn (): string => EuMemberStates::vatPrefix('GB');

        // Assert
        expect($act)->toThrow(LogicException::class, 'GB is not an EU member state.');
    });
});
