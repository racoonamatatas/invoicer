<?php

declare(strict_types = 1);

use Illuminate\Contracts\Validation\UncompromisedVerifier;
use Illuminate\Validation\NotPwnedVerifier;

describe('The leak-check verifier behind Password::uncompromised()', function (): void {

    it('should leave a verifier that is not Laravel\'s alone, so a swapped binding is not undone', function (): void {
        // Arrange
        $fake = new class implements UncompromisedVerifier
        {
            /** @param array<string, mixed> $data */
            public function verify($data): bool
            {
                return true;
            }
        };
        $this->app->bind(UncompromisedVerifier::class, fn (): UncompromisedVerifier => $fake);

        // Act
        $verifier = $this->app->make(UncompromisedVerifier::class);

        // Assert
        expect($verifier)->toBe($fake);
    });

    it('should resolve Laravel\'s NotPwnedVerifier with a 3 second timeout instead of its 30 second default', function (): void {
        // Act
        $verifier = $this->app->make(UncompromisedVerifier::class);

        // Assert
        // Reflection: the timeout is a protected property with no getter, and the HTTP client fake can't observe it.
        expect($verifier)->toBeInstanceOf(NotPwnedVerifier::class)
            ->and((new ReflectionProperty(NotPwnedVerifier::class, 'timeout'))->getValue($verifier))->toBe(3);
    });
});
