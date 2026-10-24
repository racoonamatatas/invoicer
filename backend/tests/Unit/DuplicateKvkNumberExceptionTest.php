<?php

declare(strict_types = 1);

use App\Exceptions\Business\DuplicateKvkNumberException;
use Illuminate\Database\UniqueConstraintViolationException;

function uniqueViolationOn(string ...$columns): UniqueConstraintViolationException
{
    return new UniqueConstraintViolationException('sqlite', 'insert into businesses ...', [], new Exception('UNIQUE constraint failed'))
        ->setColumns(array_values($columns));
}

describe('DuplicateKvkNumberException::from', function (): void {

    it('should wrap a violation on kvk_number, keeping it as the previous exception', function (): void {
        // Arrange
        $violation = uniqueViolationOn('user_id', 'kvk_number');

        // Act
        $exception = DuplicateKvkNumberException::from($violation);

        // Assert
        expect($exception)->toBeInstanceOf(DuplicateKvkNumberException::class)
            ->and($exception->getPrevious())->toBe($violation);
    });

    it('should hand back a violation on any other column unchanged, so it stays a reported 500', function (): void {
        // Arrange
        $violation = uniqueViolationOn('id');

        // Act
        $exception = DuplicateKvkNumberException::from($violation);

        // Assert
        expect($exception)->toBe($violation);
    });
});
