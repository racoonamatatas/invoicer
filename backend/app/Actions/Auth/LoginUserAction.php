<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\DataTransferObjects\Input\Auth\LoginUserData;
use App\Exceptions\Auth\EmailNotVerifiedException;
use App\Exceptions\Auth\InvalidCredentialsException;
use App\Models\User;
use Illuminate\Container\Attributes\Auth;
use Illuminate\Contracts\Auth\StatefulGuard;
use Illuminate\Contracts\Session\Session;

final readonly class LoginUserAction
{
    public function __construct(
        #[Auth('web')]
        private StatefulGuard $guard,
        private Session $session,
        private User $userModel,
    ) {}

    /**
     * @throws InvalidCredentialsException
     * @throws EmailNotVerifiedException
     */
    public function execute(LoginUserData $data): User
    {
        // validate() instead of attempt(): attempt() logs in before we can check verification.
        if (! $this->guard->validate([
            'email' => $data->email,
            'password' => $data->password,
        ]))
        {
            throw new InvalidCredentialsException;
        }

        // sole(): the password just matched, so exactly one user has this email.
        $user = $this->userModel->newQuery()
            ->where('email', $data->email)
            ->sole();

        if ($user->email_verified_at === null)
        {
            throw new EmailNotVerifiedException;
        }

        $this->guard->login($user);
        $this->session->regenerate();

        return $user;
    }
}
