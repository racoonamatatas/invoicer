<?php

declare(strict_types = 1);

namespace App\Http\Controllers;

use App\Actions\Auth\LoginUserAction;
use App\Http\Requests\LoginRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

final class AuthController extends Controller
{
    public function login(
        LoginRequest $request,
        LoginUserAction $action,
    ): JsonResponse {

        $user = $action->execute($request->toDto());

        if ($user === null) {
            throw ValidationException::withMessages(['email' => __('auth.failed')]);
        }

        return new JsonResponse($user);
    }
}
