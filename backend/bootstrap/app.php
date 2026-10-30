<?php

declare(strict_types = 1);

use App\Exceptions\Auth\InvalidCredentialsException;
use App\Exceptions\BankAccount\BankAccountInUseException;
use App\Exceptions\BankAccount\DuplicateIbanException;
use App\Exceptions\Business\DuplicateKvkNumberException;
use App\Exceptions\Http\IfMatchMalformedException;
use App\Exceptions\Http\IfMatchMissingException;
use App\Exceptions\Invoice\InvoiceReferenceGoneException;
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
        $exceptions->map(
            fn (DuplicateIbanException $exception) => ValidationException::withMessages([
                'iban' => __('validation.unique', ['attribute' => 'iban']),
            ]),
        );

        // The same 422 the exists rule gives for an unknown id: the user named a client or account that isn't there,
        // whether the rule or the foreign key noticed first.
        $exceptions->map(
            fn (InvoiceReferenceGoneException $exception) => ValidationException::withMessages(array_combine(
                $exception->fields,
                array_map(
                    static fn (string $field): string => __('validation.exists', ['attribute' => str_replace('_', ' ', $field)]),
                    $exception->fields,
                ),
            )),
        );

        // A 409 (conflict), not a 422: the request is fine, the account's state is what refuses it. An expected
        // outcome, so it isn't reported either.
        $exceptions->dontReport(BankAccountInUseException::class);
        $exceptions->render(
            fn (BankAccountInUseException $exception) => new JsonResponse(['message' => $exception->getMessage()], JsonResponse::HTTP_CONFLICT),
        );

        // Refused before any query. A 428 (precondition required) says the header is missing, a 400 (bad request) that
        // it can't be read. Neither is reported: the response tells the caller everything there is to know.
        $exceptions->dontReport([IfMatchMissingException::class, IfMatchMalformedException::class]);
        $exceptions->render(
            fn (IfMatchMissingException $exception) => new JsonResponse(['message' => $exception->getMessage()], JsonResponse::HTTP_PRECONDITION_REQUIRED),
        );
        $exceptions->render(
            fn (IfMatchMalformedException $exception) => new JsonResponse(['message' => $exception->getMessage()], JsonResponse::HTTP_BAD_REQUEST),
        );
    })->create();
