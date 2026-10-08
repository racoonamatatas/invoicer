<?php

declare(strict_types = 1);

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

final class AccountAlreadyExists extends Mailable implements ShouldQueueAfterCommit
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        private User $user,
        private string $loginUrl,
        private string $forgotPasswordUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'You already have an account',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.account-already-exists',
            with: [
                'user' => $this->user,
                'loginUrl' => $this->loginUrl,
                'forgotPasswordUrl' => $this->forgotPasswordUrl,
            ],
        );
    }
}
