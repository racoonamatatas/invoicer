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
        expect($columns)->toHaveKey('email_verified_at')
            ->and($columns['email_verified_at']['nullable'])->toBeFalse();
    });
});
