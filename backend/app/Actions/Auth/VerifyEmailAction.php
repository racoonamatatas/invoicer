<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\Models\User;
use Carbon\CarbonImmutable;

final readonly class VerifyEmailAction
{
    public function __construct(
        private User $userModel,
    ) {}

    public function execute(string $token): bool
    {
        $user = $this->userModel->newQuery()
            ->where('verification_token', hash('sha256', $token))                   // matches the hashed token
            ->where('verification_token_expires_at', '>', CarbonImmutable::now())   // with stored tokens that haven't expired.
            ->first();                                                              // first(): no match is a possible outcome.

        if ($user === null)
        {
            return false;
        }

        $user->email_verified_at = CarbonImmutable::now();
        $user->verification_token = null;
        $user->verification_token_expires_at = null;
        $user->save();

        return true;
    }
}
