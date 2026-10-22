<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\DataTransferObjects\Input\Auth\RegisterUserData;
use App\Mail\AccountAlreadyExists;
use App\Mail\FinishSigningUp;
use App\Models\User;
use Illuminate\Container\Attributes\Config;
use Illuminate\Contracts\Mail\Mailer;
use Illuminate\Database\ConnectionInterface;

final readonly class RegisterUserAction
{
    public function __construct(
        private ConnectionInterface $db,
        private CreateUserAction $createUserAction,
        private IssueVerificationTokenAction $issueVerificationTokenAction,
        private User $userModel,
        private Mailer $mailer,
        #[Config('app.url')]
        private string $appUrl,
    ) {}

    public function execute(RegisterUserData $data): void
    {
        // One transaction, so a user is never left behind without a verification token.
        $this->db->transaction(function () use ($data): void {
            $user = $this->createUserAction->execute($data);

            if ($user === null)
            {
                // Email already registered: the response stays the same, only the inbox owner hears about it.
                $this->notifyExistingUser($data->email);

                return;
            }

            $this->issueVerificationTokenAction->execute($user);
        });
    }

    private function notifyExistingUser(string $email): void
    {
        // sole(): the unique violation just proved exactly one user has this email.
        $existingUser = $this->userModel->newQuery()
            ->where('email', $email)
            ->sole();

        $forgotPasswordUrl = $this->appUrl.'/forgot-password';

        // No verify link: verifying would activate whatever password the first registrant chose, which may not
        // be the inbox owner's. A reset sets a password only the owner knows. A related path is a known gap,
        // planned to be fixed.
        if ($existingUser->email_verified_at === null)
        {
            $this->mailer->to($existingUser->email)->send(new FinishSigningUp($forgotPasswordUrl));

            return;
        }

        $loginUrl = $this->appUrl.'/login';
        $this->mailer->to($existingUser->email)->send(new AccountAlreadyExists($existingUser, $loginUrl, $forgotPasswordUrl));
    }
}
