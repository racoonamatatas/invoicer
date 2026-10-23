<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\DataTransferObjects\Input\Auth\VerifyEmailData;
use App\Models\PendingRegistration;
use Carbon\CarbonImmutable;
use Illuminate\Database\ConnectionInterface;

final readonly class VerifyEmailAction
{
    public function __construct(
        private ConnectionInterface $db,
        private PendingRegistration $pendingRegistrationModel,
        private CreateUserAction $createUserAction,
    ) {}

    /**
     * Creates the user the pending registration was for. Returns false when the link is unusable.
     */
    public function execute(VerifyEmailData $data): bool
    {
        // One transaction, so the user and the deletion of the pending registration land together or not at all.
        return $this->db->transaction(function () use ($data): bool {
            $pendingRegistration = $this->pendingRegistrationModel->newQuery()
                ->where('token', hash('sha256', $data->token))             // matches the hashed token
                ->where('expires_at', '>', CarbonImmutable::now())          // with stored tokens that haven't expired.
                ->lockForUpdate()                                           // so a double click on the link waits for the first request.
                ->first();                                                  // first(): no match is a possible outcome.

            if ($pendingRegistration === null)
            {
                return false;
            }

            $user = $this->createUserAction->execute($data->name, $pendingRegistration->email, $data->password);

            // Used up either way: a link is for one signup, and once the email has a user there is nothing left to finish.
            $pendingRegistration->delete();

            // null: the email got a user after the registration was stored (a race). The link is dead, the user untouched.
            return $user !== null;
        });
    }
}
