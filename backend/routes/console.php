<?php

declare(strict_types = 1);

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Deletes what the Prunable models (PendingRegistration) mark as expired.
Schedule::command('model:prune')->daily();
