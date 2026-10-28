<?php

declare(strict_types = 1);

use App\Models\Business;
use App\Models\User;
use Illuminate\Support\Facades\Route;

describe('Showing a business', function (): void {

    it('should return 200 (ok) with exactly the allowlisted keys of the user\'s own business', function (): void {
        // Arrange
        $user = User::factory()->create();
        $business = Business::factory()->for($user)->create(['house_number_addition' => 'a']);
        $this->actingAs($user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}");

        // Assert
        $response->assertOk();
        // Exact: a new column on businesses must not reach the browser unless it is added on purpose.
        $response->assertExactJson([
            'id' => $business->id,
            'registered_name' => $business->registered_name,
            'kvk_number' => $business->kvk_number,
            'vat_number' => $business->vat_number,
            'street' => $business->street,
            'house_number' => $business->house_number,
            'house_number_addition' => 'a',
            'postal_code' => $business->postal_code,
            'city' => $business->city,
            'region' => null,
            'country_code' => 'NL',
            'payment_term_days' => $business->payment_term_days,
        ]);
    });

    it('should return 403 (forbidden) for a business of another user', function (): void {
        // Arrange
        $user = User::factory()->create();
        $business = Business::factory()->create(); // its own user
        $this->actingAs($user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}");

        // Assert
        $response->assertForbidden();
    });

    it('should return 404 (not found) for an unknown id', function (): void {
        // Arrange
        $user = User::factory()->create();
        $this->actingAs($user, 'web');

        // Act
        $response = $this->getJson('/api/businesses/999999');

        // Assert
        $response->assertNotFound();
    });

    it('should return 404 (not found) for a non-numeric id without querying the database', function (): void {
        // Arrange
        $user = User::factory()->create();
        $this->actingAs($user, 'web');

        // Act & Assert: whereNumber() on the route rejects "abc" before the binding would look it up.
        $this->expectsDatabaseQueryCount(0);
        $this->getJson('/api/businesses/abc')->assertNotFound();
    });

    it('should return 200 (ok) for the owner and 403 (forbidden) for another user on a {business} route whose action does not type-hint Business', function (): void {
        // Guards third-party code: Laravel's ImplicitRouteBinding reads the model type from the action's signature,
        // so without the explicit Route::model() in AppServiceProvider this route would hand the policy a string
        // and deny the owner. The route is registered here because no real route has that shape yet.

        // Arrange: the same group shape as routes/api.php, plus the api middleware group that file gets for free
        // (it holds SubstituteBindings, which does the binding). A group, not ->get() on the chain: the
        // registrar only turns ->can() into middleware when it opens a group.
        Route::middleware(['api', 'auth:sanctum'])->prefix('api/businesses/{business}')->whereNumber('business')->can('access', 'business')->group(function (): void {
            Route::get('probe', static fn (): string => 'ok');
        });
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $business = Business::factory()->for($owner)->create();

        // Act & Assert
        $this->actingAs($owner, 'web')->getJson("/api/businesses/{$business->id}/probe")->assertOk();
        // Sanctum's RequestGuard remembers the user it resolved for the first request; forget it so the
        // second request is really the stranger's.
        auth()->forgetGuards();
        $this->actingAs($stranger, 'web')->getJson("/api/businesses/{$business->id}/probe")->assertForbidden();
    });

    it('should return 401 (unauthorized) for a guest, even for an unknown id', function (): void {
        // Guards third-party code: Laravel's middleware priority runs Authenticate before SubstituteBindings, so a
        // guest can't learn from a 404 whether an id exists.

        // Act
        $response = $this->getJson('/api/businesses/999999');

        // Assert
        $response->assertUnauthorized();
    });
});
