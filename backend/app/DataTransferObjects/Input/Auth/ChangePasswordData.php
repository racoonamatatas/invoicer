<?php

declare(strict_types = 1);

namespace App\DataTransferObjects\Input\Auth;

final readonly class ChangePasswordData
{
    public function __construct(
        #[\SensitiveParameter]
        public string $newPassword,
    ) {}
}
