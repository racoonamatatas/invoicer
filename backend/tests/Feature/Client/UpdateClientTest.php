<?php

declare(strict_types = 1);

use App\Models\Business;
use App\Models\Client;

describe('Updating a client', function (): void {

    it('should return 200 (ok) with the client and replace every field, clearing the ones left out', function (): void {
        // Arrange. A Dutch client with every optional field filled in.
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create([
            'vat_number' => 'NL123456789B01',
            'house_number_addition' => 'B',
        ]);
        $this->actingAs($business->user, 'web');

        // Act. Moves the client to Germany, without a VAT number, addition or postcode.
        $response = $this->putJson("/api/businesses/{$business->id}/clients/{$client->id}", [
            'name' => 'Müller GmbH',
            'email' => 'rechnung@mueller.example',
            'street' => 'Leopoldstraße',
            'house_number' => '7',
            'city' => 'München',
            'region' => 'Bayern',
            'country_code' => 'DE',
        ]);

        // Assert
        $expected = [
            'id' => $client->id,
            'name' => 'Müller GmbH',
            'email' => 'rechnung@mueller.example',
            'vat_number' => null,
            'street' => 'Leopoldstraße',
            'house_number' => '7',
            'house_number_addition' => null,
            'postal_code' => null,
            'city' => 'München',
            'region' => 'Bayern',
            'country_code' => 'DE',
        ];
        $response->assertOk()->assertExactJson($expected);
        expect(reloaded($client)->only(array_keys($expected)))->toBe($expected);
    });

    it('should store an update in canonical form, as creating does', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act. Written the way people type it: lowercase country, VAT number with spaces and dots, postcode without a space.
        $this->putJson("/api/businesses/{$business->id}/clients/{$client->id}", clientPayload([
            'vat_number' => 'nl 1234.56.789.b01',
            'postal_code' => '9712cp',
            'country_code' => 'nl',
        ]))->assertOk();

        // Assert
        expect(reloaded($client)->only(['vat_number', 'postal_code', 'country_code']))->toBe([
            'vat_number' => 'NL123456789B01',
            'postal_code' => '9712 CP',
            'country_code' => 'NL',
        ]);
    });

    it('should return 422 (unprocessable) on the field whose rule fails, and leave the client as it was', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create(['email' => 'oud@jansen.example']);
        $this->actingAs($business->user, 'web');

        // Act. One case: the rules are the ones creating uses, which CreateClientTest covers in full.
        $response = $this->putJson("/api/businesses/{$business->id}/clients/{$client->id}", clientPayload(['email' => null]));

        // Assert
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors(['email' => 'The email field is required.']);
        expect(reloaded($client)->email)->toBe('oud@jansen.example');
    });

    it('should return 404 (not found) and change nothing for a client the URL does not reach', function (Closure $target): void {
        // Arrange
        $business = Business::factory()->create();
        ['url' => $url, 'client' => $client] = $target($business);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson($url, clientPayload(['name' => 'Overwritten']));

        // Assert
        $response->assertNotFound();
        expect($client?->fresh()?->name)->not->toBe('Overwritten');
    })->with([
        'a client of another user\'s business' => [function (Business $business): array {
            $client = Client::factory()->create();

            return ['url' => "/api/businesses/{$client->business_id}/clients/{$client->id}", 'client' => $client];
        }],
        // Both businesses are the user's, so only the scoped binding stands between them.
        'a client of the user\'s other business, under this business' => [function (Business $business): array {
            $client = Client::factory()->for(Business::factory()->for($business->user))->create();

            return ['url' => "/api/businesses/{$business->id}/clients/{$client->id}", 'client' => $client];
        }],
        'an unknown client id' => [function (Business $business): array {
            $client = Client::factory()->for($business)->create();

            return ['url' => "/api/businesses/{$business->id}/clients/".($client->id + 1), 'client' => $client];
        }],
    ]);

    it('should return 401 (unauthenticated) for a guest, and change nothing', function (): void {
        // Arrange
        $client = Client::factory()->create();

        // Act
        $response = $this->putJson("/api/businesses/{$client->business_id}/clients/{$client->id}", clientPayload(['name' => 'Overwritten']));

        // Assert
        $response->assertUnauthorized();
        expect(reloaded($client)->name)->not->toBe('Overwritten');
    });
});
