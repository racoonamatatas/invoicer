<?php

declare(strict_types = 1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // An invoice a business bills a client with. Its amounts live on its lines; a draft stores no totals.
        Schema::create('invoices', static function (Blueprint $table): void {
            $table->id();
            // restrictOnDelete on all three: invoices must be kept for the Belastingdienst, so nothing an invoice
            // points at can be deleted from under it.
            // No ->index() on business_id: the unique index below leads with it, which serves "where business_id = ?".
            $table->foreignId('business_id')->constrained()->restrictOnDelete();
            // The foreign keys only check that the client and the account exist, not that they belong to this
            // invoice's business: the request validates that.
            $table->foreignId('client_id')->constrained()->restrictOnDelete();
            $table->foreignId('bank_account_id')->constrained()->restrictOnDelete();
            // No defaults on status and vat_treatment: whoever creates an invoice sets both, so a forgotten one is a
            // constraint error rather than a silent "draft, domestic".
            $table->unsignedTinyInteger('status'); // InvoiceStatus
            $table->unsignedTinyInteger('vat_treatment'); // VatTreatment
            $table->string('number')->nullable(); // given on send; null while draft
            $table->unsignedInteger('payment_term_days')->nullable(); // null: the business's default applies
            $table->timestamps();

            // One number once per business. Drafts don't collide: SQL treats every NULL as distinct, so any number of
            // drafts can share a business.
            $table->unique(['business_id', 'number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
