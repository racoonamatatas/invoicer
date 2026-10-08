<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\DataTransferObjects\Input\Auth\ResetPasswordData;
use App\Mail\PasswordChanged;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Container\Attributes\Config;
use Illuminate\Contracts\Auth\PasswordBroker;
use Illuminate\Contracts\Mail\Mailer;
use Illuminate\Database\ConnectionInterface;

final readonly class ResetPasswordAction
{
    public function __construct(
        private PasswordBroker $passwordBroker,
        private ConnectionInterface $db,
        private Mailer $mailer,
        #[Config('session.table')]
        private string $sessionTable,
        #[Config('app.url')]
        private string $appUrl,
    ) {}

    public function execute(ResetPasswordData $data): bool
    {
        $status = $this->db->transaction(function () use ($data): string {
            return $this->passwordBroker->reset(
                ['token' => $data->token, 'password' => $data->password, 'email' => $data->email],
                function (User $user, string $password): void {
                    $user->password = $password; // No Hash::make(): the 'hashed' cast on User does it.

                    // The reset link reached the inbox, which proves ownership as well as a verify link would.
                    if ($user->email_verified_at === null)
                    {
                        $user->email_verified_at = CarbonImmutable::now();
                        $user->verification_token = null;
                        $user->verification_token_expires_at = null;
                    }

                    $user->save();

                    // Log out every device, including anyone who knew the old password.
                    $this->db->table($this->sessionTable)
                        ->where('user_id', $user->id)
                        ->delete();

                    // Queued after commit, so a rolled-back reset never tells the user their password changed.
                    $forgotPasswordUrl = $this->appUrl.'/forgot-password';
                    $this->mailer->to($user->email)->send(new PasswordChanged($user, $forgotPasswordUrl));
                }
            );
        });

        return $status === PasswordBroker::PASSWORD_RESET;
    }
}
