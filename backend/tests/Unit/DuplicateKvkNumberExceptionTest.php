<?php

declare(strict_types = 1);

use App\Exceptions\Business\DuplicateKvkNumberException;
use Illuminate\Database\UniqueConstraintViolationException;

function uniqueViolationOn(string ...$columns): UniqueConstraintViolationException
{
    return new UniqueConstraintViolationException('sqlite', 'insert into businesses ...', [], new Exception('UNIQUE constraint failed'))
        ->setColumns(array_values($columns));
}

describe('DuplicateKvkNumberException', function (): void {

    it('should keep the violation as the previous exception', function (): void {
        // Arrange
        $violation = uniqueViolationOn('user_id', 'kvk_number');

        // Act
        $exception = new DuplicateKvkNumberException($violation);

        // Assert
        expect($exception->getPrevious())->toBe($violation);
    });
});

describe('DuplicateKvkNumberException::isCausedBy', function (): void {

    it('should be true for a violation on kvk_number, as SQLite reports it', function (): void {
        // Arrange
        $violation = uniqueViolationOn('user_id', 'kvk_number');

        // Act
        $isCausedBy = DuplicateKvkNumberException::isCausedBy($violation);

        // Assert
        expect($isCausedBy)->toBeTrue();
    });

    it('should be true for a violation that names only the index, as MySQL reports it', function (): void {
        // Arrange
        $violation = uniqueViolationOn()->setIndex('businesses_user_id_kvk_number_unique');

        // Act
        $isCausedBy = DuplicateKvkNumberException::isCausedBy($violation);

        // Assert
        expect($isCausedBy)->toBeTrue();
    });

    it('should be false for a violation on any other index', function (): void {
        // Arrange
        $violation = uniqueViolationOn()->setIndex('users_email_unique');

        // Act
        $isCausedBy = DuplicateKvkNumberException::isCausedBy($violation);

        // Assert
        expect($isCausedBy)->toBeFalse();
    });

    it('should be false for a violation on any other column', function (): void {
        // Arrange
        $violation = uniqueViolationOn('id');

        // Act
        $isCausedBy = DuplicateKvkNumberException::isCausedBy($violation);

        // Assert
        expect($isCausedBy)->toBeFalse();
    });
});
