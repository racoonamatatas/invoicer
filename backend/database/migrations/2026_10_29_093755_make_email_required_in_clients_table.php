<?php

declare(strict_types = 1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Every invoice is mailed to its client, so a client needs an email. Tightened before the app holds any client
     * data, so there is no row without an email to deal with.
     */
    public function up(): void
    {
        Schema::table('clients', static function (Blueprint $table): void {
            $table->string('email')->nullable(false)->change();
        });
    }

    public function down(): void
    {
        Schema::table('clients', static function (Blueprint $table): void {
            $table->string('email')->nullable()->change();
        });
    }
};
