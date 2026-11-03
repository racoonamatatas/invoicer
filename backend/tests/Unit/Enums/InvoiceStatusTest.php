<?php

declare(strict_types = 1);

use App\Enums\InvoiceStatus;

describe('InvoiceStatus', function (): void {

    it('should back Draft with 1', function (): void {
        // Act
        $value = InvoiceStatus::Draft->value;

        // Assert
        // This integer is what invoices.status stores, so a renumbering must break this test.
        expect($value)->toBe(1);
    });

    it('should have Draft as its only case', function (): void {
        // Act
        $cases = InvoiceStatus::cases();

        // Assert
        // A tripwire. The invoice update and delete write only a row whose status is Draft, and a 0-row write is
        // answered as "gone" or "changed elsewhere". With a second status, a PUT or DELETE of a sent invoice would get
        // that untrue 412. Give a non-draft its own refusal, with its tests, before extending this list.
        expect($cases)->toBe([InvoiceStatus::Draft]);
    });

    it('should name Draft "draft" in the API', function (): void {
        // Act
        $name = InvoiceStatus::Draft->apiName();

        // Assert
        // This string is what the frontend sends and checks, so a renamed one must break this test.
        expect($name)->toBe('draft');
    });

    it('should answer apiName() for every case without an UnhandledMatchError', function (InvoiceStatus $status): void {
        // Act
        // The match in apiName() has no default arm, so a case it doesn't list throws an UnhandledMatchError.
        // The dataset is cases() itself, so a new case is in this test the moment it exists.
        $apiName = static fn (): string => $status->apiName();

        // Assert
        expect($apiName)->not->toThrow(UnhandledMatchError::class);
    })->with(InvoiceStatus::cases());

    it('should give every case a different API name', function (): void {
        // Act
        $apiNames = array_map(static fn (InvoiceStatus $status): string => $status->apiName(), InvoiceStatus::cases());

        // Assert
        // Two cases with one name would read back as the same case.
        expect(array_unique($apiNames))->toHaveCount(count(InvoiceStatus::cases()));
    });
});
