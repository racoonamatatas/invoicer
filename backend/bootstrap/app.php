<?php

declare(strict_types = 1);

use App\Exceptions\Auth\InvalidCredentialsException;
use App\Exceptions\Business\DuplicateKvkNumberException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // map() to a ValidationException: Laravel renders it as a 422 and never reports it,
        // so a failed login is an expected outcome, not a logged stack trace.
        $exceptions->map(
            fn (InvalidCredentialsException $exception) => ValidationException::withMessages([
                'email' => __('auth.failed'),
            ]),
        );

        // The same 422 and message as the request's unique rule, so a client can't tell (and needn't care)
        // whether the rule or the index caught the duplicate.
        $exceptions->map(
            fn (DuplicateKvkNumberException $exception) => ValidationException::withMessages([
                'kvk_number' => __('validation.unique', ['attribute' => 'kvk number']),
            ]),
        );
    })->create();
