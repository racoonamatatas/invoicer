<?php

declare(strict_types = 1);

namespace App\Validation;

use Illuminate\Validation\Rules\Password;

final class PasswordRules
{
    /**
     * Rules for any password a user chooses (set through the link, reset, change).
     *
     * @return list<MaxBytes|Password|WithoutNulBytes|string>
     */
    public static function forNewPassword(): array
    {
        // Both limits are bcrypt's, the hasher this app uses (HASH_DRIVER): it ignores everything past 72 bytes,
        // so a longer password would silently match its own prefix, and it throws on a NUL byte.
        // Bytes, not max:72: that rule counts characters, and a multibyte password can pass it with more than 72 bytes.
        return ['required', 'string', new MaxBytes(72), new WithoutNulBytes, 'confirmed', Password::defaults()];
    }
}
