<?php

declare(strict_types = 1);

namespace App\Http\Controllers;

use App\Actions\Auth\LoginUserAction;
use App\Http\Requests\LoginRequest;
use Illuminate\Http\JsonResponse;

final class AuthController extends Controller
{
    public function login(
        LoginRequest $request,
        LoginUserAction $action,
    ): JsonResponse {
        return new JsonResponse($action->execute($request->toDto()));
    }
}
