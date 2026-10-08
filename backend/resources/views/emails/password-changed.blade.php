<div>
    <p>Hi {{ $user->name }},</p>

    <p>The password for your account has just been changed. If this wasn't you, reset your password now.</p>

    <p><a href="{{ $forgotPasswordUrl }}">Reset password</a></p>
</div>
