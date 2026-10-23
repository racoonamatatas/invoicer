<?php

declare(strict_types = 1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Dev data only. An unverified user holds a password its inbox owner may not have chosen, and from now
        // on a user row only exists once the owner has set one, so these rows must not survive the switch.
        DB::table('users')->whereNull('email_verified_at')->delete();
    }

    public function down(): void
    {
        // Deleted rows can't be brought back; the old flow can simply register them again.
    }
};
