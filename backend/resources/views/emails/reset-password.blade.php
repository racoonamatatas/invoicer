<div>
    <p>Hi {{ $user->name }},</p>

    <p>Someone asked to reset the password for your account. Open the link below to choose a new one.</p>

    <p><a href="{{ $resetUrl }}">Reset password</a></p>

    <p>This link expires in {{ $expiresInMinutes }} minutes. If you did not ask for this, you can ignore this email; your password stays the same.</p>
</div>
