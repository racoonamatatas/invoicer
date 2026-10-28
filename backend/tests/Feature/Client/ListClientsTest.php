<?php

declare(strict_types = 1);

use App\Models\Business;
use App\Models\Client;

describe('Listing clients', function (): void {

    it('should return 200 (ok) with only this business\'s client records, ordered by name regardless of case', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $zwart = Client::factory()->for($business)->create(['name' => 'Zwart']);
        $deVries = Client::factory()->for($business)->create(['name' => 'de Vries']); // lowercase first letter
        $bakker = Client::factory()->for($business)->create(['name' => 'Bakker']);
        // A record under the same user's other business: listed under that business's URL, not this one.
        Client::factory()->for(Business::factory()->for($business->user))->create(['name' => 'Other']);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/clients");

        // Assert
        $response->assertOk()
            ->assertJsonCount(3)
            ->assertJsonPath('0.id', $bakker->id)
            ->assertJsonPath('1.id', $deVries->id)
            ->assertJsonPath('2.id', $zwart->id);
    });

    it('should return 200 (ok) with two clients of the same name in the order they were added', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $first = Client::factory()->for($business)->create(['name' => 'Jansen']);
        $second = Client::factory()->for($business)->create(['name' => 'Jansen']);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/clients");

        // Assert
        $response->assertOk()
            ->assertJsonPath('0.id', $first->id)
            ->assertJsonPath('1.id', $second->id);
    });

    it('should return 200 (ok) with exactly the allowlisted keys of each client', function (): void {
        // Arrange. A client abroad with every nullable field filled, so each key carries a value of its own and a
        // swapped pair of fields would show.
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create([
            'name' => 'Müller GmbH',
            'email' => 'info@mueller.example',
            'vat_number' => 'DE123456789',
            'street' => 'Unter den Linden',
            'house_number' => '77',
            'house_number_addition' => 'b',
            'postal_code' => '10117',
            'city' => 'Berlin',
            'region' => 'Berlin',
            'country_code' => 'DE',
        ]);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/clients");

        // Assert. Exact: a new column on clients must not reach the browser unless it is added on purpose.
        $response->assertOk()->assertExactJson([
            [
                'id' => $client->id,
                'name' => 'Müller GmbH',
                'email' => 'info@mueller.example',
                'vat_number' => 'DE123456789',
                'street' => 'Unter den Linden',
                'house_number' => '77',
                'house_number_addition' => 'b',
                'postal_code' => '10117',
                'city' => 'Berlin',
                'region' => 'Berlin',
                'country_code' => 'DE',
            ],
        ]);
    });

    it('should return 404 (not found) for a business of another user', function (): void {
        // Arrange
        $business = Business::factory()->create();
        Client::factory()->for($business)->create();
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/clients");

        // Assert
        $response->assertNotFound();
    });

    it('should return 401 (unauthorized) for a guest', function (): void {
        // Arrange
        $business = Business::factory()->create();

        // Act
        $response = $this->getJson("/api/businesses/{$business->id}/clients");

        // Assert
        $response->assertUnauthorized();
    });
});
