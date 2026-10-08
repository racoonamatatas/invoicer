<?php

declare(strict_types = 1);

namespace App\Validation;

use Illuminate\Validation\Rules\Password;

final class PasswordRules
{
    /**
     * Rules for any password a user chooses (register, reset, change).
     *
     * @return list<Password|string>
     */
    public static function forNewPassword(): array
    {
        // bcrypt ignores everything past 72 bytes, so a longer password would silently match its own prefix.
        return ['required', 'string', 'max:72', 'confirmed', Password::defaults()];
    }
}
