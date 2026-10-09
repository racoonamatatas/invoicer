<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\DataTransferObjects\Input\Auth\ChangePasswordData;
use App\Mail\PasswordChanged;
use App\Models\User;
use Illuminate\Container\Attributes\Config;
use Illuminate\Contracts\Mail\Mailer;
use Illuminate\Contracts\Session\Session;
use Illuminate\Database\ConnectionInterface;

final readonly class ChangePasswordAction
{
    public function __construct(
        private ConnectionInterface $db,
        private Mailer $mailer,
        private Session $session,
        #[Config('session.table')]
        private string $sessionTable,
        #[Config('app.url')]
        private string $appUrl,
    ) {}

    public function execute(User $user, ChangePasswordData $data): void
    {
        $this->db->transaction(function () use ($user, $data): void {
            $user->password = $data->newPassword; // No Hash::make(): the 'hashed' cast on User does it.

            $user->save();

            // Log out every other session, so anyone on an old session loses access.
            // Keep this session: its user just proved they know the current password.
            $this->db->table($this->sessionTable)
                ->where('user_id', $user->id)
                ->where('id', '!=', $this->session->getId())
                ->delete();

            // Queued after commit, so a rolled-back change never tells the user their password changed.
            $forgotPasswordUrl = $this->appUrl.'/forgot-password';
            $this->mailer->to($user->email)->send(new PasswordChanged($user, $forgotPasswordUrl));
        });
    }
}
