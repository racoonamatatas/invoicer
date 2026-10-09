<?php

declare(strict_types = 1);

namespace App\DataTransferObjects\Input\Auth;

final readonly class ResetPasswordData
{
    public function __construct(
        #[\SensitiveParameter]
        public string $token,
        public string $email,
        #[\SensitiveParameter]
        public string $password,
    ) {}
}
