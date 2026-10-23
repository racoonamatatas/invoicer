<?php

declare(strict_types = 1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A signup that hasn't set a password yet. Kept apart from users so nothing on users has to be nullable
        // and no account ever exists with a password its inbox owner didn't choose.
        Schema::create('pending_registrations', static function (Blueprint $table): void {
            $table->id();
            $table->string('email')->unique();
            $table->string('token', 64)->unique(); // sha256 hex of the token in the mail
            $table->timestamp('expires_at')->index(); // model:prune selects on it
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pending_registrations');
    }
};
