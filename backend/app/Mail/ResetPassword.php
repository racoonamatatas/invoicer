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

final class ResetPassword extends Mailable implements ShouldQueueAfterCommit
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        private User $user,
        private string $resetUrl,
        private int $expiresInMinutes,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Reset your password',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.reset-password',
            with: [
                'user' => $this->user,
                'resetUrl' => $this->resetUrl,
                'expiresInMinutes' => $this->expiresInMinutes,
            ],
        );
    }
}
