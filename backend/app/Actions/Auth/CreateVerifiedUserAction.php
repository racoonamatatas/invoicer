<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Hashing\Hasher;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\UniqueConstraintViolationException;

/**
 * Verified in the name: every user this creates has proven its inbox, because the only caller is the
 * set-password link. A seeder or admin path that needs an unverified user must not reach for this.
 */
final readonly class CreateVerifiedUserAction
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
