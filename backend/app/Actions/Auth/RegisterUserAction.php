<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\Mail\AccountAlreadyExists;
use App\Models\User;
use Illuminate\Container\Attributes\Config;
use Illuminate\Contracts\Mail\Mailer;
use Illuminate\Database\ConnectionInterface;

final readonly class RegisterUserAction
{
    public function __construct(
        private ConnectionInterface $db,
        private IssueSetPasswordTokenAction $issueSetPasswordTokenAction,
        private User $userModel,
        private Mailer $mailer,
        #[Config('app.url')]
        private string $appUrl,
    ) {}

    public function execute(string $email): void
    {
        // One transaction, so a mail that fails to queue rolls the pending registration back. The mail is queued
        // after commit, so a queue that is down at that moment still leaves a row behind: the owner can then ask
        // for a new link through forgot-password.
        $this->db->transaction(function () use ($email): void {
            // first(): a new email is the normal outcome.
            $existingUser = $this->userModel->newQuery()
                ->where('email', $email)
                ->first();

            // Email already registered: the response stays the same, only the inbox owner hears about it.
            if ($existingUser !== null)
            {
                $this->notifyExistingUser($existingUser);

                return;
            }

            $this->issueSetPasswordTokenAction->execute($email);
        });
    }

    private function notifyExistingUser(User $existingUser): void
    {
        $loginUrl = $this->appUrl.'/login';
        $forgotPasswordUrl = $this->appUrl.'/forgot-password';
        $this->mailer->to($existingUser->email)->send(new AccountAlreadyExists($existingUser, $loginUrl, $forgotPasswordUrl));
    }
}
