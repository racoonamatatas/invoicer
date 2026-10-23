<?php

declare(strict_types = 1);

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

// The set-password link for a pending registration. No name: nobody has given one yet, and whoever typed the
// email may be a stranger, so nothing they chose ends up in a mail to the inbox owner.
final class FinishSigningUp extends Mailable implements ShouldQueueAfterCommit
{
    use Queueable;

    public function __construct(
        private string $setPasswordUrl,
        private int $expiresInHours,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Finish signing up',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.finish-signing-up',
            with: [
                'setPasswordUrl' => $this->setPasswordUrl,
                'expiresInHours' => $this->expiresInHours,
            ],
        );
    }
}
