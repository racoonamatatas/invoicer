<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\Mail\ResetPassword;
use App\Models\User;
use Illuminate\Container\Attributes\Config;
use Illuminate\Contracts\Auth\PasswordBroker;
use Illuminate\Contracts\Mail\Mailer;

final readonly class SendPasswordResetLinkAction
{
    public function __construct(
        private PasswordBroker $passwordBroker,
        private Mailer $mailer,
        #[Config('app.url')]
        private string $appUrl,
        #[Config('auth.passwords.users.expire')]
        private int $expiresInMinutes,
    ) {}

    public function execute(string $email): void
    {
        // Status ignored: unknown and throttled stay silent so the caller can't tell them apart.
        $this->passwordBroker->sendResetLink(['email' => $email], function (User $user, string $token): void {
            $resetUrl = $this->appUrl.'/reset-password?'.http_build_query(['token' => $token, 'email' => $user->email]);
            $this->mailer->to($user->email)->send(new ResetPassword($user, $resetUrl, $this->expiresInMinutes));
        });
    }
}
