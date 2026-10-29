<?php

declare(strict_types = 1);

use App\Models\Business;
use App\Models\Client;

describe('Showing a client', function (): void {

    it('should return 200 (ok) with exactly the allowlisted keys of the client', function (): void {
        // Arrange. A Dutch consumer: the nullable fields come back as null, not missing.
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create([
            'name' => 'Jan Jansen',
            'email' => 'jan@jansen.example',
            'vat_number' => null,
            'street' => 'Dorpsstraat',
            'house_number' => '12',
            'house_number_addition' => null,
            'postal_code' => '1234 AB',
            'city' => 'Utrecht',
            'region' => null,
            'country_code' => 'NL',
        ]);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/clients/{$client->id}");

        // Assert. Exact: a new column on clients must not reach the browser unless it is added on purpose.
        $response->assertOk()->assertExactJson([
            'id' => $client->id,
            'name' => 'Jan Jansen',
            'email' => 'jan@jansen.example',
            'vat_number' => null,
            'street' => 'Dorpsstraat',
            'house_number' => '12',
            'house_number_addition' => null,
            'postal_code' => '1234 AB',
            'city' => 'Utrecht',
            'region' => null,
            'country_code' => 'NL',
        ]);
    });

    it('should return 404 (not found) for the id of a client record under the user\'s other business', function (): void {
        // Arrange. Both businesses are the user's, so only the scoped binding stands between them.
        $business = Business::factory()->create();
        $otherBusinessClient = Client::factory()->for(Business::factory()->for($business->user))->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/clients/{$otherBusinessClient->id}");

        // Assert
        $response->assertNotFound();
    });

    it('should return 404 (not found) for a client record under a business of another user', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/clients/{$client->id}");

        // Assert
        $response->assertNotFound();
    });

    it('should return the same 404 (not found) for an existing and an unknown client id under a business of another user', function (): void {
        // Arrange. If {client} were looked up before the owner check, the existing id would answer differently and
        // reveal that it belongs to this business.
        config(['app.debug' => false]); // production's body; debug adds a trace with this file's line numbers
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $existing = $this->getJson("/api/businesses/{$business->id}/clients/{$client->id}");
        $unknown = $this->getJson("/api/businesses/{$business->id}/clients/".($client->id + 1000));

        // Assert. The whole body too, not only the status: a different body would leak the same way.
        $existing->assertNotFound();
        $unknown->assertNotFound();
        expect($existing->json())->toBe($unknown->json());
    });

    it('should return 404 (not found) for an unknown client id', function (): void {
        // Guards third-party code: Laravel's ImplicitRouteBinding turns a missing Client into the 404, as long as
        // ClientController::show() type-hints Client.

        // Arrange
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/clients/999999");

        // Assert
        $response->assertNotFound();
    });

    it('should return 404 (not found) for a non-numeric client id without querying the database', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');

        // Act & Assert: whereNumber() on the route rejects "abc" before any binding would look it up.
        $this->expectsDatabaseQueryCount(0);
        $this->getJson("/api/businesses/{$business->id}/clients/abc")->assertNotFound();
    });

    it('should return 401 (unauthorized) for a guest', function (): void {
        // Arrange
        $client = Client::factory()->create();

        // Act
        $response = $this->getJson("/api/businesses/{$client->business_id}/clients/{$client->id}");

        // Assert
        $response->assertUnauthorized();
    });
});
