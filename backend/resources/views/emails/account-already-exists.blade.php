<div>
    <p>Hi {{ $user->name }},</p>

    <p>Someone tried to create an account with this email address, but you already have one.</p>

    <p><a href="{{ $loginUrl }}">Log in</a></p>

    <p>Forgot your password? <a href="{{ $forgotPasswordUrl }}">Reset password</a></p>

    <p>If this wasn't you, you can ignore this email; nothing was changed.</p>
</div>
