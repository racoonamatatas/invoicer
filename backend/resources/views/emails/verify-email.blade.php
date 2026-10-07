<div>
    <p>Hi {{ $user->name }},</p>

    <p>Please verify your email address by opening the link below.</p>

    <p><a href="{{ $verifyUrl }}">Verify email address</a></p>

    <p>This link expires in 14 days. If you did not create an account, you can ignore this email.</p>
</div>
