<?php

declare(strict_types = 1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', static function (Blueprint $table): void {
            $table->string('verification_token', 64)->nullable()->unique()->after('email_verified_at');
            $table->timestamp('verification_token_expires_at')->nullable()->after('verification_token');
        });
    }

    public function down(): void
    {
        Schema::table('users', static function (Blueprint $table): void {
            $table->dropUnique(['verification_token']);
            $table->dropColumn([
                'verification_token',
                'verification_token_expires_at',
            ]);
        });
    }
};
