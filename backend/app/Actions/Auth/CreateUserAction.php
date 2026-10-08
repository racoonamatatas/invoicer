<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\DataTransferObjects\Input\Auth\RegisterUserData;
use App\Models\User;
use Illuminate\Contracts\Hashing\Hasher;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\UniqueConstraintViolationException;

final readonly class CreateUserAction
{
    public function __construct(
        private ConnectionInterface $db,
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
            // Savepoint, for portability: on PostgreSQL a failed insert breaks the caller's whole transaction;
            // rolling back only this savepoint leaves it usable on every database.
            $this->db->transaction(fn (): bool => $user->save());
        }
        catch (UniqueConstraintViolationException)
        {
            return null;
        }

        return $user;
    }
}
