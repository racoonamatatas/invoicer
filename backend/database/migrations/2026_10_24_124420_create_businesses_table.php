<?php

declare(strict_types = 1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A business is one KvK registration of a user. Every later table hangs under it.
        Schema::create('businesses', static function (Blueprint $table): void {
            $table->id();
            // Not unique: a user can hold several KvK registrations. restrictOnDelete: a user with a business
            // can't be deleted, because nothing cleans up what hangs under the business yet (and invoices, once
            // they exist, must be kept for the Belastingdienst anyway).
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('legal_name');
            $table->char('kvk_number', 8); // 8 digits, a leading zero included: a string, never an integer
            $table->string('vat_number', 14); // BTW-id, e.g. NL123456789B01
            // The same address shape as clients, so the rules, the form fields and the invoice snapshot are shared.
            // Here it always describes a Dutch address: house_number is digits only, region stays null.
            $table->string('street');
            $table->string('house_number', 10);
            $table->string('house_number_addition', 10)->nullable(); // BAG letter and addition, e.g. "a", "bis"
            $table->string('postal_code', 12); // canonical "1234 AB"
            $table->string('city');
            $table->string('region')->nullable();
            $table->char('country_code', 2); // ISO 3166-1 alpha-2, must be NL: a business is a KvK registration
            $table->unsignedInteger('payment_term_days'); // the default for new invoices, e.g. 30
            $table->timestamps();

            // invoice_number_pattern and invoice_number_reset are not here on purpose: the numbering design is
            // still open (INV-0049), so those columns ship with the Send epic.
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('businesses');
    }
};
