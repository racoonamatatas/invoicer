<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter(
        explode(',', (string) env('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://localhost:8000')),
    ),

    'allowed_origins_patterns' => array_filter(
        explode(',', (string) env('CORS_ALLOWED_ORIGINS_PATTERNS', '')),
    ),

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => (int) env('CORS_MAX_AGE', 86_400),

    'supports_credentials' => true,

];
