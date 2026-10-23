<?php

declare(strict_types = 1);

namespace App\Validation;

use Illuminate\Validation\Rules\Password;

final class PasswordRules
{
    /**
     * Rules for any password a user chooses (set through the link, reset, change).
     *
     * @return list<MaxBytes|Password|string>
     */
    public static function forNewPassword(): array
    {
        // bcrypt ignores everything past 72 bytes, so a longer password would silently match its own prefix.
        // Bytes, not max:72: that rule counts characters, and a multibyte password can pass it with more than 72 bytes.
        return ['required', 'string', new MaxBytes(72), 'confirmed', Password::defaults()];
    }
}
