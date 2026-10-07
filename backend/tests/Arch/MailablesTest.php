<?php

declare(strict_types = 1);

use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;

/*
|--------------------------------------------------------------------------
| Mailable Architecture Tests
|--------------------------------------------------------------------------
|
| Mail is queued so a slow mail server never slows a request, and so new
| and taken emails take the same time to register. After commit, so a
| rolled-back transaction never leaves a mail behind.
|
 */

arch('mailables are queued after commit')
    ->expect('App\Mail')
    ->toImplement(ShouldQueueAfterCommit::class);

arch('mailables are final')
    ->expect('App\Mail')
    ->toBeFinal();

arch('mailables use strict types')
    ->expect('App\Mail')
    ->toUseStrictTypes();
