<?php

declare(strict_types = 1);

namespace App\DataTransferObjects\Input\Auth;

final readonly class LoginUserData
{
    public function __construct(
        public string $email,
        public string $password,
    ) {}
}
