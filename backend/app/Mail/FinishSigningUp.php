<?php

declare(strict_types = 1);

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

// Sent when someone registers over an unverified account. No User: its name was typed by the first registrant,
// who may be a stranger, so nothing they chose ends up in a mail to the inbox owner.
final class FinishSigningUp extends Mailable implements ShouldQueueAfterCommit
{
    use Queueable;

    public function __construct(
        private string $forgotPasswordUrl,
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
                'forgotPasswordUrl' => $this->forgotPasswordUrl,
            ],
        );
    }
}
