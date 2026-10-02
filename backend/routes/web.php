<?php

use Illuminate\Support\Facades\Route;

/**
 * SPA fallback: every URL that isn't an API, Sanctum or health-check route gets the
 * Blade shell, and Vue Router takes it from there.
 */
Route::view('/{any}', 'app')
    ->where('any', '^(?!api|sanctum|up).*$')
    ->name('spa.fallback');
