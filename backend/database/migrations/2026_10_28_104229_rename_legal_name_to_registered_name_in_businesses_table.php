<?php

declare(strict_types = 1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Same field, better name: it holds the name the business is registered under at the KvK, which for an
        // eenmanszaak is a trade name rather than a statutory "legal" name. The values stay as they are.
        Schema::table('businesses', static function (Blueprint $table): void {
            $table->renameColumn('legal_name', 'registered_name');
        });
    }

    public function down(): void
    {
        Schema::table('businesses', static function (Blueprint $table): void {
            $table->renameColumn('registered_name', 'legal_name');
        });
    }
};
