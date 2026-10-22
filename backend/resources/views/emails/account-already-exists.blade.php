<div>
    <p>Hi {{ $user->name }},</p>

    <p>Someone tried to create an account with this email address, but you already have one.</p>

    <p><a href="{{ $loginUrl }}">Log in</a></p>

    <p>Forgot your password, or never finished signing up? <a href="{{ $forgotPasswordUrl }}">Reset password</a> to set a new one and activate your account.</p>

    <p>If this wasn't you, you can ignore this email; nothing was changed.</p>
</div>
