<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\DataTransferObjects\Input\Auth\RegisterUserData;
use App\Models\User;
use Illuminate\Contracts\Hashing\Hasher;

final readonly class RegisterUserAction
{
    public function __construct(
        private User $userModel,
        private Hasher $hasher,
    ) {}

    public function execute(RegisterUserData $data): void
    {
        $user = $this->userModel->newInstance();
        $user->name = $data->name;
        $user->email = $data->email;
        $user->password = $this->hasher->make($data->password);
        $user->save();
    }
}
