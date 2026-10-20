<?php

declare(strict_types = 1);

use App\Enums\ErrorCode;
use App\Exceptions\Auth\EmailNotVerifiedException;
use App\Exceptions\Auth\InvalidCredentialsException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\JsonResponse;
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

        $exceptions->map(
            fn (InvalidCredentialsException $exception) => ValidationException::withMessages([
                'email' => __('auth.failed'),
            ]),
        );

        // render() instead of map(): ValidationException can't carry extra keys.
        // Always JSON, skipping shouldRenderJsonWhen above: only api/auth/login
        // throws this, and web.php serves nothing but the SPA shell.
        $exceptions->render(
            function (EmailNotVerifiedException $exception): JsonResponse {
                $message = __('Verify your email before logging in.');

                return response()->json([
                    'message' => $message,
                    'errors' => ['email' => [$message]],
                    'code' => ErrorCode::EmailNotVerified->value,
                ], 422);
            }
        );

        // An unverified login is an expected outcome, not an error. map() used to
        // keep it out of the log by turning it into a ValidationException; render()
        // keeps the original class, so it has to be excluded by name.
        $exceptions->dontReport(EmailNotVerifiedException::class);
    })->create();
