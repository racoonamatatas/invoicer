<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\DataTransferObjects\Input\Auth\LoginUserData;
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
     */
    public function execute(LoginUserData $data): User
    {
        // validate() then login() instead of attempt(): attempt() only answers with a bool,
        // and the controller needs the User. validate() also pads a failed login (see LoginTest).
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

        $this->guard->login($user);
        $this->session->regenerate();

        return $user;
    }
}
