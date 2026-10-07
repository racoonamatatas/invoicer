<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\DataTransferObjects\Input\Auth\RegisterUserData;
use App\Models\User;
use Illuminate\Contracts\Hashing\Hasher;
use Illuminate\Database\UniqueConstraintViolationException;

final readonly class CreateUserAction
{
    public function __construct(
        private User $userModel,
        private Hasher $hasher,
    ) {}

    /**
     * Returns null when the email is already registered.
     */
    public function execute(RegisterUserData $data): ?User
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
            return null;
        }

        return $user;
    }
}
