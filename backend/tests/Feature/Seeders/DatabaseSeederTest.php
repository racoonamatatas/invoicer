<?php

declare(strict_types = 1);

use App\Enums\InvoiceStatus;
use App\Models\Business;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;

describe('The database seeder', function (): void {

    it('should return 200 (ok) on a login with the email and password the README names', function (): void {
        // Arrange
        $this->seed(DatabaseSeeder::class);

        // Act
        $response = $this->postJson('/api/auth/login', [
            'email' => 'test@example.com',
            'password' => 'invoicer-local-dev',
        ]);

        // Assert
        $response->assertOk();
    });

    it('should give the seeded user one business in Groningen with a bank account, three clients one of them abroad, and a draft invoice with lines', function (): void {
        // Arrange
        $this->seed(DatabaseSeeder::class);

        // Act
        $user = User::query()->where('email', 'test@example.com')->sole();
        // sole(): exactly one business, so a seeder that makes a stray second one fails here.
        $business = Business::query()->whereBelongsTo($user)->sole();

        // Assert
        // Exact counts: the invoice factory makes its own client and bank account unless given ids, and those
        // extras would land on this business too.
        expect($business->city)->toBe('Groningen')
            ->and($business->bankAccounts()->count())->toBe(1)
            ->and($business->clients()->count())->toBe(3)
            ->and($business->clients()->where('country_code', '!=', 'NL')->count())->toBe(1);

        $invoice = $business->invoices()->sole();

        // A domestic invoice must go to a Dutch client; the Belgian one would need reverse charge.
        expect($invoice->status)->toBe(InvoiceStatus::Draft)
            ->and($invoice->client->country_code)->toBe('NL')
            ->and($invoice->bank_account_id)->toBe($business->bankAccounts()->sole()->id)
            ->and($invoice->lines()->orderBy('position')->pluck('position')->all())->toBe([1, 2, 3]);
    });

    it('should throw and create no user when the app runs in production', function (): void {
        // Arrange
        // The demo password is public in the README, so a production database must never get this account.
        app()->detectEnvironment(static fn (): string => 'production');

        // Act
        // run() directly, not $this->seed(): that goes through db:seed, which in production first asks "Are you sure?".
        // The guard is for when that prompt is skipped with --force.
        $seed = static fn () => (new DatabaseSeeder)->run();

        // Assert
        expect($seed)->toThrow(RuntimeException::class, 'The demo seeder creates a login whose password is public, so it does not run in production.')
            ->and(User::query()->count())->toBe(0);
    });
});
