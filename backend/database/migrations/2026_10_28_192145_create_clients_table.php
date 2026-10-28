<?php

declare(strict_types = 1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Someone a business invoices. Kept once and picked on every invoice, so its details are typed only once.
        Schema::create('clients', static function (Blueprint $table): void {
            $table->id();
            // restrictOnDelete: invoices will point at their client, and invoices must be kept for the
            // Belastingdienst, so a business with clients can't be deleted from under them.
            // ->index(): no unique index here leads with business_id (two clients called Jansen are normal), and
            // SQLite doesn't index a foreign key by itself, so every list would scan the table.
            $table->foreignId('business_id')->index()->constrained()->restrictOnDelete();
            $table->string('name');
            $table->string('email')->nullable(); // optional: an invoice can be sent by other means
            // EU VAT id, e.g. DE123456789: required on a reverse-charge invoice (INV-0058). 14 is the longest any
            // member state issues, prefix included. Null for a consumer or a client outside the EU.
            $table->string('vat_number', 14)->nullable();
            // The same address shape as businesses, but in any country: the rules only tighten for NL, so
            // postal_code and region are nullable here, where a business has a postcode and never a region.
            $table->string('street');
            $table->string('house_number', 10);
            $table->string('house_number_addition', 10)->nullable();
            $table->string('postal_code', 12)->nullable(); // canonical "1234 AB" for NL; free text elsewhere
            $table->string('city');
            $table->string('region')->nullable();
            $table->char('country_code', 2); // ISO 3166-1 alpha-2
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clients');
    }
};
