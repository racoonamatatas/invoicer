<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\DataTransferObjects\Input\Auth\RegisterUserData;

final readonly class RegisterUserAction
{
    public function __construct(
        private CreateUserAction $createUser,
        private IssueVerificationTokenAction $issueVerificationToken,
    ) {}

    public function execute(RegisterUserData $data): void
    {
        $user = $this->createUser->execute($data);

        if ($user === null)
        {
            // Email already registered; stay silent so the caller can't tell.
            return;
        }

        $this->issueVerificationToken->execute($user);
    }
}
