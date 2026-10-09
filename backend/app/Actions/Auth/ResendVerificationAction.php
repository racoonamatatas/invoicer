<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\Models\User;

final readonly class ResendVerificationAction
{
    public function __construct(
        private User $userModel,
        private IssueVerificationTokenAction $issueVerificationTokenAction,
    ) {}

    public function execute(string $email): void
    {
        $user = $this->userModel->newQuery()
            ->where('email', $email)
            ->whereNull('email_verified_at')
            ->first();

        // Unknown or already verified: stay silent so the caller can't tell which.
        if ($user !== null)
        {
            $this->issueVerificationTokenAction->execute($user);
        }
    }
}
