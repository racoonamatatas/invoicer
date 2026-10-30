<?php

declare(strict_types = 1);

use App\Exceptions\BankAccount\BankAccountInUseException;
use Illuminate\Database\QueryException;

/**
 * A QueryException as a driver would throw it. PDOException takes no string code or errorInfo in its constructor, so
 * a subclass sets the two properties QueryException copies from it.
 *
 * @param  array{0: string, 1: int, 2: string}  $errorInfo
 */
function queryExceptionFrom(string $message, string $sqlState, array $errorInfo): QueryException
{
    $pdoException = new class($message, $sqlState, $errorInfo) extends PDOException
    {
        /**
         * @param  array{0: string, 1: int, 2: string}  $errorInfo
         */
        public function __construct(string $message, string $sqlState, array $errorInfo)
        {
            parent::__construct($message);
            $this->code = $sqlState;
            $this->errorInfo = $errorInfo;
        }
    };

    return new QueryException('testing', 'delete from "bank_accounts" where "id" = ?', [1], $pdoException);
}

describe('BankAccountInUseException::isCausedBy', function (): void {

    it('should be true for a foreign key violation, as each driver reports it', function (QueryException $exception): void {
        // Act
        $isCausedBy = BankAccountInUseException::isCausedBy($exception);

        // Assert
        expect($isCausedBy)->toBeTrue();
    })->with([
        // SQLite's SQLSTATE is the generic 23000, so only the message marks it.
        'SQLite' => fn () => queryExceptionFrom('SQLSTATE[23000]: Integrity constraint violation: 19 FOREIGN KEY constraint failed', '23000', ['23000', 19, 'FOREIGN KEY constraint failed']),
        'MySQL' => fn () => queryExceptionFrom('SQLSTATE[23000]: Integrity constraint violation: 1451 Cannot delete or update a parent row', '23000', ['23000', 1451, 'Cannot delete or update a parent row']),
        'PostgreSQL' => fn () => queryExceptionFrom('SQLSTATE[23503]: Foreign key violation', '23503', ['23503', 7, 'update or delete on table "bank_accounts" violates foreign key constraint']),
    ]);

    it('should be false for another integrity violation that shares SQLSTATE 23000', function (QueryException $exception): void {
        // Act
        $isCausedBy = BankAccountInUseException::isCausedBy($exception);

        // Assert
        // These must stay a 500: they are real errors, not an account in use.
        expect($isCausedBy)->toBeFalse();
    })->with([
        'SQLite unique' => fn () => queryExceptionFrom('SQLSTATE[23000]: Integrity constraint violation: 19 UNIQUE constraint failed: bank_accounts.iban', '23000', ['23000', 19, 'UNIQUE constraint failed: bank_accounts.iban']),
        'SQLite NOT NULL' => fn () => queryExceptionFrom('SQLSTATE[23000]: Integrity constraint violation: 19 NOT NULL constraint failed: bank_accounts.label', '23000', ['23000', 19, 'NOT NULL constraint failed: bank_accounts.label']),
        'MySQL duplicate' => fn () => queryExceptionFrom('SQLSTATE[23000]: Integrity constraint violation: 1062 Duplicate entry', '23000', ['23000', 1062, 'Duplicate entry']),
    ]);
});
