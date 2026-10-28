<?php

declare(strict_types = 1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // An account a business is paid into. An invoice names one, so a client knows where to pay.
        Schema::create('bank_accounts', static function (Blueprint $table): void {
            $table->id();
            // restrictOnDelete: invoices will point at their bank account, and invoices must be kept for the
            // Belastingdienst, so a business with accounts can't be deleted from under them.
            // No ->index(): the unique index below leads with business_id, which serves "where business_id = ?".
            $table->foreignId('business_id')->constrained()->restrictOnDelete();
            // 34 is the ISO 13616 maximum; a Dutch IBAN is 18. Stored in canonical form: uppercase, no spaces.
            // Never changed after creation: a new IBAN is a new account (see BankAccount).
            $table->string('iban', 34);
            $table->string('label')->nullable(); // the user's own name for it, e.g. "Main"
            $table->timestamps();

            // One IBAN once per business: a double submit must not add the same account twice. Not unique across
            // businesses: one user with two registrations may be paid into the same account for both.
            $table->unique(['business_id', 'iban']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_accounts');
    }
};
