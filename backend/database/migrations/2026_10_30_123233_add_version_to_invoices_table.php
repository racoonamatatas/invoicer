<?php

declare(strict_types = 1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', static function (Blueprint $table): void {
            // The optimistic lock: 1 on create, +1 on every save, sent as the ETag. An update names the version it
            // started from and only applies while that is still the stored one, so two editors can't overwrite each
            // other unseen. Not updated_at: it has one-second precision, and a save that only changes lines leaves the
            // invoice row, and so its timestamp, untouched.
            // default(1): SQLite can only add a NOT NULL column with a default, and an invoice that already exists has
            // never been saved since, so it is at version 1. The create action still sets it explicitly, so the model
            // knows its version without reading it back.
            $table->unsignedInteger('version')->default(1)->after('payment_term_days');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', static function (Blueprint $table): void {
            $table->dropColumn('version');
        });
    }
};
