<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use Illuminate\Container\Attributes\Auth;
use Illuminate\Contracts\Auth\StatefulGuard;
use Illuminate\Contracts\Session\Session;

final readonly class LogoutUserAction
{
    public function __construct(
        #[Auth('web')] private StatefulGuard $guard,
        private Session $session,
    ) {}

    public function execute(): void
    {
        $this->guard->logout();
        $this->session->invalidate();
        $this->session->regenerateToken();
    }
}
