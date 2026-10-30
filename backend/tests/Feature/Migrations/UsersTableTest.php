<?php

declare(strict_types = 1);

use Illuminate\Support\Facades\Schema;

describe('The users table', function (): void {

    // Since INV-0044 nothing in LoginUserAction checks email_verified_at: the column being NOT NULL is what keeps an
    // unverified user out. Loosening it again must turn this red, not quietly reopen the login.
    it('should not allow a null email_verified_at', function (): void {
        // Act
        $columns = collect(Schema::getColumns('users'))->keyBy('name');

        // Assert
        // ?? null: a missing column fails the check instead of erroring. toBeFalse is strict, unlike toMatchArray.
        expect($columns->get('email_verified_at')['nullable'] ?? null)->toBeFalse();
    });
});
