<?php

declare(strict_types = 1);

describe('Serving the SPA shell for non-backend URLs', function (): void {

    it('should return 200 (ok) with the SPA shell for a path that only starts with an excluded word', function (string $path): void {
        // Act
        $response = $this->get($path);

        // Assert
        $response->assertOk()->assertViewIs('app');
    })->with(['/update', '/apikeys', '/sanctumish']);

    // The root is the one path the catch-all matches with an empty parameter; a `.+` instead of `.*` would drop it.
    it('should return 200 (ok) with the SPA shell for the root path', function (): void {
        // Act
        $response = $this->get('/');

        // Assert
        $response->assertOk()->assertViewIs('app');
    });

    it('should return 404 (not found) instead of the SPA shell for an unknown path under an excluded segment', function (string $path): void {
        // Act
        $response = $this->get($path);

        // Assert
        $response->assertNotFound();
    })->with(['/api', '/api/nope', '/sanctum/nope', '/up/nope']);
});
