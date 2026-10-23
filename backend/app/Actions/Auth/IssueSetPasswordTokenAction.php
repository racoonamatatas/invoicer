<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\Mail\FinishSigningUp;
use App\Models\PendingRegistration;
use Carbon\CarbonImmutable;
use Illuminate\Container\Attributes\Config;
use Illuminate\Contracts\Mail\Mailer;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Str;

/**
 * Stores a pending registration for the email with a fresh token and mails the set-password link.
 */
final readonly class IssueSetPasswordTokenAction
{
    public function __construct(
        private ConnectionInterface $db,
        private PendingRegistration $pendingRegistrationModel,
        private Mailer $mailer,
        #[Config('app.url')]
        private string $appUrl,
        #[Config('auth.verification_ttl_hours')]
        private int $ttlHours,
    ) {}

    public function execute(string $email): void
    {
        // The transaction lives here, so register and forgot-password get the same guarantee. What it buys: a
        // send() that throws on the spot (no mailer, a view that won't render) rolls the new token back, so the
        // owner's earlier link keeps working. What it doesn't: the mail is queued after commit, so a queue that
        // is down at that moment leaves the row with a token nobody was mailed. The owner then asks for a new
        // link through forgot-password.
        $this->db->transaction(function () use ($email): void {
            $this->rotateTokenAndMail($email);
        });
    }

    private function rotateTokenAndMail(string $email): void
    {
        $token = Str::random(36);

        // upsert(): one statement that inserts or, when the email already has a pending registration, replaces
        // its token. Atomic, so two registrations for the same email can't both insert. The older link stops
        // working, so a stranger who registered the email first can't finish the signup once the owner has.
        // The reverse holds too: anyone can kill the owner's live link by registering the email again, which is a
        // known gap, bounded by the mail-per-email limit. Only the hash is stored, so a leaked database can't
        // set anyone's password.
        $this->pendingRegistrationModel->newQuery()->upsert(
            [[
                'email' => $email,
                'token' => hash('sha256', $token),
                'expires_at' => CarbonImmutable::now()->addHours($this->ttlHours),
            ]],
            uniqueBy: ['email'],
            update: ['token', 'expires_at'], // updated_at is added by Eloquent for a timestamped model.
        );

        // The mail carries the raw token; the verify endpoint hashes it to find the pending registration.
        $setPasswordUrl = $this->appUrl.'/verify-email?token='.$token;
        $this->mailer->to($email)->send(new FinishSigningUp($setPasswordUrl, $this->ttlHours));
    }
}
