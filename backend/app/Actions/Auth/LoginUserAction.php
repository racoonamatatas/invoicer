<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\DataTransferObjects\Input\Auth\LoginUserData;
use App\Models\User;
use Illuminate\Container\Attributes\Auth;
use Illuminate\Contracts\Auth\StatefulGuard;
use Illuminate\Contracts\Session\Session;

final readonly class LoginUserAction
{
    public function __construct(
        #[Auth('web')] private StatefulGuard $guard,
        private Session $session,
    ) {}

    public function execute(LoginUserData $data): ?User
    {
        if (! $this->guard->attempt([
            'email' => $data->email,
            'password' => $data->password,
        ])) {
            return null;
        }

        $this->session->regenerate();

        /** @var User $user the web guard's provider only holds User rows */
        $user = $this->guard->user();

        return $user;
    }
}
