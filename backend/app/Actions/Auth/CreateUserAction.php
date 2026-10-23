<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\Models\User;
use Carbon\CarbonImmutable;
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
    public function execute(string $name, string $email, #[\SensitiveParameter] string $password): ?User
    {
        $user = $this->userModel->newInstance();
        $user->name = $name;
        $user->email = $email;
        $user->password = $this->hasher->make($password);
        // A user is only ever created through the link mailed to the email, which proves the inbox is theirs.
        $user->email_verified_at = CarbonImmutable::now();

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
