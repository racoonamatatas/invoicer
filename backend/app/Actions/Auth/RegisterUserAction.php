<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\DataTransferObjects\Input\Auth\RegisterUserData;
use App\Models\User;
use Illuminate\Contracts\Hashing\Hasher;
use Illuminate\Database\UniqueConstraintViolationException;

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

        try
        {
            $user->save();
        }
        catch (UniqueConstraintViolationException)
        {
            // Email already registered; swallow so the caller can't tell.
        }
    }
}
