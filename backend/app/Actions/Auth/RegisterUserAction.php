<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\DataTransferObjects\Input\Auth\RegisterUserData;
use Illuminate\Database\ConnectionInterface;

final readonly class RegisterUserAction
{
    public function __construct(
        private ConnectionInterface $db,
        private CreateUserAction $createUser,
        private IssueVerificationTokenAction $issueVerificationToken,
    ) {}

    public function execute(RegisterUserData $data): void
    {
        // One transaction, so a user is never left behind without a verification token.
        $this->db->transaction(function () use ($data): void {
            $user = $this->createUser->execute($data);

            if ($user === null)
            {
                // Email already registered; stay silent so the caller can't tell.
                return;
            }

            $this->issueVerificationToken->execute($user);
        });
    }
}
