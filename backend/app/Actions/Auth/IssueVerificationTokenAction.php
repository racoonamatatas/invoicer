<?php

declare(strict_types = 1);

namespace App\Actions\Auth;

use App\Mail\VerifyEmail;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Container\Attributes\Config;
use Illuminate\Contracts\Mail\Mailer;
use Illuminate\Support\Str;

final readonly class IssueVerificationTokenAction
{
    public function __construct(
        private Mailer $mailer,
        #[Config('app.url')]
        private string $appUrl,
        #[Config('auth.verification_ttl_hours')]
        private int $ttlHours
    ) {}

    public function execute(User $user): void
    {
        $token = Str::random(36);

        // Store a hashed token on the user so a leaked database can't verify accounts.
        $user->verification_token = hash('sha256', $token);
        $user->verification_token_expires_at = CarbonImmutable::now()->addHours($this->ttlHours);
        $user->save();

        // The mail carries the raw token; the verify endpoint hashes it to find the user.
        $verifyUrl = $this->appUrl.'/verify-email?token='.$token;
        $this->mailer->to($user->email)->send(new VerifyEmail($user, $verifyUrl));
    }
}
