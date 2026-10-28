<?php

declare(strict_types = 1);

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BankAccountController;
use App\Http\Controllers\BusinessController;
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

// {business} is bound explicitly in AppServiceProvider::configureRouteBindings(), not implicitly from an action's
// type-hint, so every route in the group below gets a Business whatever its action's signature.
Route::middleware('auth:sanctum')->prefix('businesses')->group(function (): void {
    Route::get('/', [BusinessController::class, 'index']);
    Route::post('/', [BusinessController::class, 'store']);

    // Everything about one business lives in this group. Its ->can() runs BusinessPolicy::access() on the bound
    // {business} before any controller: a business of another user is a 403 here, an unknown id a 404 from the
    // binding, and a guest a 401 from auth:sanctum, which Laravel's middleware priority runs first. whereNumber()
    // makes "abc" a 404 from the router, before any query.
    Route::prefix('{business}')->whereNumber('business')->can('access', 'business')->group(function (): void {
        Route::get('/', [BusinessController::class, 'show']);
        Route::put('/', [BusinessController::class, 'update']);

        // scopeBindings(): {bankAccount} will resolve through $business->bankAccounts(), so an account of another
        // business is a 404 even under the user's own business. That only works through implicit binding: an
        // explicit Route::model('bankAccount') would look the id up on its own and skip the scope.
        Route::prefix('bank-accounts')->scopeBindings()->group(function (): void {
            Route::get('/', [BankAccountController::class, 'index']);
            Route::post('/', [BankAccountController::class, 'store']);
        });
    });
});
