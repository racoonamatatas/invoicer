<?php

declare(strict_types = 1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The change first, the drops second: on a database without transactional DDL (MySQL) a NULL row fails
        // this statement before anything was dropped, so a failed run leaves the schema as it was.
        // Safe to tighten: the delete_unverified_users migration already removed every row with a null.
        Schema::table('users', static function (Blueprint $table): void {
            $table->timestamp('email_verified_at')->nullable(false)->change();
        });

        Schema::table('users', static function (Blueprint $table): void {
            // The set-password token lives in pending_registrations since INV-0042; a user only exists once it was used.
            $table->dropUnique(['verification_token']);
            $table->dropColumn([
                'verification_token',
                'verification_token_expires_at',
            ]);
        });
    }

    /**
     * Restores the shape only: the dropped token values are gone, and so are the rows delete_unverified_users removed.
     */
    public function down(): void
    {
        Schema::table('users', static function (Blueprint $table): void {
            $table->string('verification_token', 64)->nullable()->unique()->after('email_verified_at');
            $table->timestamp('verification_token_expires_at')->nullable()->after('verification_token');
        });

        Schema::table('users', static function (Blueprint $table): void {
            $table->timestamp('email_verified_at')->nullable()->change();
        });
    }
};
