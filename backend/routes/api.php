<?php

declare(strict_types = 1);

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BankAccountController;
use App\Http\Controllers\BusinessController;
use App\Http\Controllers\ClientController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('register', [AuthController::class, 'register'])->middleware(['throttle:register', 'throttle:mail-per-email']);
    Route::post('verify-email', [AuthController::class, 'verifyEmail'])->middleware('throttle:verify-email');
    Route::post('forgot-password', [AuthController::class, 'forgotPassword'])->middleware(['throttle:forgot-password', 'throttle:mail-per-email']);
    Route::post('reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:reset-password');

    // Middleware for requests that require a logged in user.
    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('user', [AuthController::class, 'me']);
        Route::delete('logout', [AuthController::class, 'destroy']);
        Route::put('password', [AuthController::class, 'changePassword'])->middleware('throttle:change-password');
    });
});

// {business} is bound, and checked for ownership, in AppServiceProvider::configureRouteBindings().
Route::middleware('auth:sanctum')->prefix('businesses')->group(function (): void {
    Route::get('/', [BusinessController::class, 'index']);
    Route::post('/', [BusinessController::class, 'store']);

    // Another user's business is a 404 from the binding, a guest a 401 from auth:sanctum. whereNumber() makes "abc"
    // a 404 before any query.
    Route::prefix('{business}')->whereNumber('business')->group(function (): void {
        Route::get('/', [BusinessController::class, 'show']);
        Route::put('/', [BusinessController::class, 'update']);

        // scopeBindings(): {bankAccount} resolves through $business->bankAccounts(), so another business's account is
        // a 404. Only implicit binding scopes; an explicit Route::model('bankAccount') would skip it.
        Route::prefix('bank-accounts')->scopeBindings()->group(function (): void {
            Route::get('/', [BankAccountController::class, 'index']);
            Route::post('/', [BankAccountController::class, 'store']);
            Route::put('{bankAccount}', [BankAccountController::class, 'update'])->whereNumber('bankAccount');
            Route::delete('{bankAccount}', [BankAccountController::class, 'destroy'])->whereNumber('bankAccount');
        });

        // scopeBindings(): {client} resolves through $business->clients(), so the id of a client record under another
        // business is a 404, even when that business is the user's own.
        Route::prefix('clients')->scopeBindings()->group(function (): void {
            Route::get('/', [ClientController::class, 'index']);
            Route::get('{client}', [ClientController::class, 'show'])->whereNumber('client');
        });
    });
});
