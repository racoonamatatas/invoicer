<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\Mail\ResetPassword;
use App\Models\PendingRegistration;
use App\Models\User;
use Illuminate\Container\Attributes\Config;
use Illuminate\Contracts\Auth\PasswordBroker;
use Illuminate\Contracts\Mail\Mailer;

final readonly class SendPasswordResetLinkAction
{
    public function __construct(
        private PasswordBroker $passwordBroker,
        private PendingRegistration $pendingRegistrationModel,
        private IssueSetPasswordTokenAction $issueSetPasswordTokenAction,
        private Mailer $mailer,
        #[Config('app.url')]
        private string $appUrl,
        #[Config('auth.passwords.users.expire')]
        private int $expiresInMinutes,
    ) {}

    public function execute(string $email): void
    {
        // Status mostly ignored: unknown and throttled stay silent so the caller can't tell them apart.
        $status = $this->passwordBroker->sendResetLink(['email' => $email], function (User $user, string $token): void {
            $resetUrl = $this->appUrl.'/reset-password?'.http_build_query(['token' => $token, 'email' => $user->email]);
            $this->mailer->to($user->email)->send(new ResetPassword($user, $resetUrl, $this->expiresInMinutes));
        });

        // No user, but a signup waiting for its password: a reset can't help, a fresh set-password link can. The
        // owner lands here when they lost the first mail. Still silent: a 204 either way.
        if ($status === PasswordBroker::INVALID_USER && $this->hasPendingRegistration($email))
        {
            $this->issueSetPasswordTokenAction->execute($email);
        }
    }

    private function hasPendingRegistration(string $email): bool
    {
        return $this->pendingRegistrationModel->newQuery()
            ->where('email', $email)
            ->exists();
    }
}
