<?php

declare(strict_types = 1);

namespace App\DataTransferObjects\Input\Auth;

final readonly class VerifyEmailData
{
    public function __construct(
        #[\SensitiveParameter]
        public string $token,
        public string $name,
        #[\SensitiveParameter]
        public string $password,
    ) {}
}
