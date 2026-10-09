<?php

declare(strict_types = 1);

use App\Http\Controllers\AuthController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('register', [AuthController::class, 'register'])->middleware(['throttle:register', 'throttle:mail-per-email']);
    Route::post('verify-email', [AuthController::class, 'verifyEmail'])->middleware('throttle:verify-email');
    Route::post('resend-verification', [AuthController::class, 'resendVerification'])->middleware(['throttle:resend-verification', 'throttle:mail-per-email']);
    Route::post('forgot-password', [AuthController::class, 'forgotPassword'])->middleware(['throttle:forgot-password', 'throttle:mail-per-email']);
    Route::post('reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:reset-password');

    // Middleware for requests that require a logged in user.
    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('user', [AuthController::class, 'me']);
        Route::delete('logout', [AuthController::class, 'destroy']);
        Route::put('password', [AuthController::class, 'changePassword'])->middleware('throttle:change-password');
    });
});
