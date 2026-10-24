<?php

declare(strict_types = 1);

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BusinessController;
use App\Models\Business;
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

// Explicit, not implicit, binding. The {business} segment of /api/businesses/7 starts out as the string "7"; binding
// is the step that swaps it for the Business with that id. Implicit binding only runs when the matched action
// type-hints Business, so a route in the group below whose action doesn't (a store() that only needs the id, say)
// would hand the policy middleware the string "7" instead of a Business, and it would deny the owner.
// Route::model() runs the binding for the parameter name alone, whatever the action's signature.
Route::model('business', Business::class);

Route::middleware('auth:sanctum')->prefix('businesses')->group(function (): void {
    Route::get('/', [BusinessController::class, 'index']);

    // Everything about one business lives in this group. Its ->can() runs BusinessPolicy::access() on the bound
    // {business} before any controller: a business of another user is a 403 here, an unknown id a 404 from the
    // binding, and a guest a 401 from auth:sanctum, which Laravel's middleware priority runs first. whereNumber()
    // makes "abc" a 404 from the router, before any query.
    Route::prefix('{business}')->whereNumber('business')->can('access', 'business')->group(function (): void {
        Route::get('/', [BusinessController::class, 'show']);
    });
});
