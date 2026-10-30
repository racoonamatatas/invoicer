<?php

declare(strict_types = 1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One billed item on an invoice: what, how much, at what price, and at which VAT option.
        Schema::create('invoice_lines', static function (Blueprint $table): void {
            $table->id();
            // cascadeOnDelete: a line has no meaning without its invoice. Only a draft may be deleted: the delete action
            // gets that guard with sending, once an invoice can be anything but a draft. Not this key's job.
            // No ->index(): the unique index below leads with invoice_id, which serves "where invoice_id = ?".
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            // The line's place on the invoice, from 1. Stored rather than taken from the id, so the order is data the
            // request sends and doesn't depend on how a save happens to insert rows.
            $table->unsignedInteger('position');
            $table->string('description');
            // Integers, not decimals: the quantity in hundredths (1,5 hours is 150) and the price in cents, so the
            // totals are exact. Unsigned: an invoice line never goes negative, as corrections belong on credit notes.
            // SQLite drops the unsigned flag, so the request is what enforces it.
            $table->unsignedInteger('quantity_hundredths');
            $table->unsignedInteger('unit_price_cents'); // excl. BTW
            $table->unsignedTinyInteger('vat_option')->nullable(); // VatOption; null unless the treatment charges VAT
            $table->timestamps();

            // One line per position, so two lines can't claim the same place.
            $table->unique(['invoice_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_lines');
    }
};
