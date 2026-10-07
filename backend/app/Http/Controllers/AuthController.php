<?php

declare(strict_types = 1);

namespace App\Http\Controllers;

use App\Actions\Auth\LoginUserAction;
use App\Actions\Auth\LogoutUserAction;
use App\Actions\Auth\RegisterUserAction;
use App\Actions\Auth\VerifyEmailAction;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Requests\VerifyEmailRequest;
use App\Http\Responses\NoContentResponse;
use App\Models\User;
use Illuminate\Container\Attributes\CurrentUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

final class AuthController extends Controller
{
    public function login(
        LoginRequest $request,
        LoginUserAction $action,
    ): JsonResponse {

        $user = $action->execute($request->toDto());

        return new JsonResponse($user);
    }

    public function me(#[CurrentUser] User $user): JsonResponse
    {
        return new JsonResponse($user);
    }

    public function destroy(LogoutUserAction $action): NoContentResponse
    {
        $action->execute();

        return new NoContentResponse;
    }

    public function register(RegisterRequest $request, RegisterUserAction $action): NoContentResponse
    {
        $action->execute($request->toDto());

        return new NoContentResponse;
    }

    public function verifyEmail(VerifyEmailRequest $request, VerifyEmailAction $action): NoContentResponse
    {
        if (! $action->execute($request->token()))
        {
            throw ValidationException::withMessages(['token' => __('This verification link is invalid or has expired.')]);
        }

        return new NoContentResponse;
    }
}
