<?php

declare(strict_types = 1);

use App\DataTransferObjects\Input\Invoice\InvoiceData;
use App\Enums\VatTreatment;
use App\Exceptions\Invoice\InvoiceReferenceGoneException;
use App\Models\BankAccount;
use App\Models\Business;
use App\Models\Client;
use Illuminate\Database\QueryException;

/**
 * A QueryException as SQLite's driver throws it, with the driver's message.
 */
function sqliteQueryException(string $driverMessage): QueryException
{
    return new QueryException('sqlite', 'update "invoices" set "client_id" = ? where "id" = ?', [1, 1], new PDOException($driverMessage));
}

/**
 * Invoice data that names the given client and bank account ids, without lines.
 */
function invoiceDataNaming(int $clientId, int $bankAccountId): InvoiceData
{
    return new InvoiceData(
        clientId: $clientId,
        bankAccountId: $bankAccountId,
        vatTreatment: VatTreatment::Domestic,
        paymentTermDays: null,
        lines: [],
    );
}

describe('InvoiceReferenceGoneException::throwForFailedWrite', function (): void {

    it('should rethrow a failure that isn\'t a foreign key violation as it came, even when the client is gone', function (): void {
        // Arrange
        // The client is gone, so if the foreign-key check were skipped, the lookup would find it missing and throw a
        // 422 for what is really a 500.
        $business = Business::factory()->create();
        $account = BankAccount::factory()->for($business)->create();
        $goneClientId = Client::factory()->for($business)->create()->id;
        Client::query()->whereKey($goneClientId)->delete();
        $failure = sqliteQueryException('SQLSTATE[HY000]: General error: 1 no such table: invoices');

        // Act
        $thrown = null;
        try
        {
            InvoiceReferenceGoneException::throwForFailedWrite($failure, $business, invoiceDataNaming($goneClientId, $account->id));
        }
        catch (QueryException $caught)
        {
            $thrown = $caught;
        }

        // Assert
        // The same object, not an equal one: rethrown as it came. An InvoiceReferenceGoneException isn't caught
        // above, so it fails the test on its own.
        expect($thrown)->toBe($failure);
    });

    it('should rethrow a foreign key violation as it came when the client and the bank account both still exist', function (): void {
        // Arrange
        // Both rows are there, so the violation came from some other key, and calling it a gone reference would hide
        // the real error.
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $account = BankAccount::factory()->for($business)->create();
        $violation = sqliteQueryException('SQLSTATE[23000]: Integrity constraint violation: 19 FOREIGN KEY constraint failed');

        // Act
        $thrown = null;
        try
        {
            InvoiceReferenceGoneException::throwForFailedWrite($violation, $business, invoiceDataNaming($client->id, $account->id));
        }
        catch (QueryException $caught)
        {
            $thrown = $caught;
        }

        // Assert
        // The same object, not an equal one: rethrown as it came. An InvoiceReferenceGoneException isn't caught
        // above, so it fails the test on its own.
        expect($thrown)->toBe($violation);
    });
});
