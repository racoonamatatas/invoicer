<?php

declare(strict_types = 1);

use App\Models\Business;
use App\Models\Client;

describe('Creating a client', function (): void {

    it('should return 201 (created) with the client for a Dutch client, and store it', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/clients", clientPayload());

        // Assert
        $response->assertCreated();
        $client = $business->clients()->sole();
        $response->assertExactJson([
            'id' => $client->id,
            'name' => 'Jansen Advies',
            'email' => 'factuur@jansen.example',
            'vat_number' => 'NL123456789B01',
            'street' => 'Dorpsstraat',
            'house_number' => '12',
            'house_number_addition' => 'B',
            'postal_code' => '9712 CP',
            'city' => 'Groningen',
            'region' => null,
            'country_code' => 'NL',
        ]);
    });

    it('should return 201 (created) for a German client with a region and no postcode, stored in canonical form', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');

        // Act. Lowercase country, VAT number as people write it, and a house number only valid abroad.
        $response = $this->postJson("/api/businesses/{$business->id}/clients", clientPayload([
            'vat_number' => 'de 123.456.789',
            'house_number' => '12-14',
            'house_number_addition' => null,
            'postal_code' => null,
            'city' => 'München',
            'region' => 'Bayern',
            'country_code' => 'de',
        ]));

        // Assert
        $response->assertCreated();
        expect($business->clients()->sole()->only(['vat_number', 'house_number', 'postal_code', 'region', 'country_code']))
            ->toBe([
                'vat_number' => 'DE123456789',
                'house_number' => '12-14',
                'postal_code' => null,
                'region' => 'Bayern',
                'country_code' => 'DE',
            ]);
    });

    it('should store a Dutch postcode as "1234 AB" and leave a foreign one as typed', function (string $countryCode, string $sent, string $stored): void {
        // Arrange
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');

        // Act. Without a VAT number, so only the address decides.
        $this->postJson("/api/businesses/{$business->id}/clients", clientPayload([
            'vat_number' => null,
            'postal_code' => $sent,
            'country_code' => $countryCode,
        ]))->assertCreated();

        // Assert
        expect($business->clients()->sole()->postal_code)->toBe($stored);
    })->with([
        'Dutch, lowercase and without a space' => ['NL', '9712cp', '9712 CP'],
        'British' => ['GB', 'SW1A 1AA', 'SW1A 1AA'],
        // The Dutch shape on a foreign address: reformatting it would invent a format that country doesn't use.
        'Belgian, which only looks Dutch' => ['BE', '1000ab', '1000ab'],
    ]);

    it('should return 201 (created) for a VAT number that fits the client\'s country, or none at all', function (string $countryCode, ?string $vatNumber): void {
        // Arrange
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/clients", clientPayload([
            'vat_number' => $vatNumber,
            'country_code' => $countryCode,
        ]));

        // Assert
        $response->assertCreated()->assertJsonPath('vat_number', $vatNumber);
    })->with([
        'Greece, with EL' => ['GR', 'EL123456789'],
        'a Dutch consumer, without one' => ['NL', null],
        'a client outside the EU, without one' => ['US', null],
    ]);

    it('should store the client under the business in the URL, whatever business_id the body holds', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $other = Business::factory()->for($business->user)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $this->postJson("/api/businesses/{$business->id}/clients", clientPayload(['business_id' => $other->id]))
            ->assertCreated();

        // Assert
        expect($business->clients()->count())->toBe(1)
            ->and($other->clients()->count())->toBe(0);
    });

    it('should return 422 (unprocessable) on the field whose rule fails, and store nothing', function (array $changes, string $field, string $message): void {
        // Arrange
        $business = Business::factory()->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/clients", clientPayload($changes));

        // Assert
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors([$field => $message]);
        expect(Client::query()->count())->toBe(0);
    })->with([
        'name missing' => [['name' => null], 'name', 'The name field is required.'],
        'name too long' => [['name' => str_repeat('a', 256)], 'name', 'The name field must not be greater than 255 characters.'],
        'email missing' => [['email' => null], 'email', 'The email field is required.'],
        'email not an email' => [['email' => 'jansen'], 'email', 'The email field must be a valid email address.'],
        'a region on a Dutch client' => [['region' => 'Groningen'], 'region', 'The region field is prohibited.'],
        'an invalid Dutch VAT number' => [['vat_number' => 'NL123'], 'vat_number', 'The vat number field must be a valid btw-id, like NL123456789B01.'],
        'a French VAT number on a German client' => [
            ['vat_number' => 'FR123456789', 'country_code' => 'DE'], 'vat_number', 'The vat number field must be a VAT number starting with DE.',
        ],
        // Greece's ISO code is GR, its VAT prefix EL.
        'GR on a Greek client' => [
            ['vat_number' => 'GR123456789', 'country_code' => 'GR'], 'vat_number', 'The vat number field must be a VAT number starting with EL.',
        ],
        'any VAT number on a client outside the EU' => [
            ['vat_number' => 'US123456789', 'country_code' => 'US'], 'vat_number', 'A VAT number can only be given for a client in the EU.',
        ],
    ]);

    it('should return 404 (not found) for a business of another user, and store nothing', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/clients", clientPayload());

        // Assert
        $response->assertNotFound();
        expect(Client::query()->count())->toBe(0);
    });

    it('should return 401 (unauthenticated) for a guest, and store nothing', function (): void {
        // Arrange
        $business = Business::factory()->create();

        // Act
        $response = $this->postJson("/api/businesses/{$business->id}/clients", clientPayload());

        // Assert
        $response->assertUnauthorized();
        expect(Client::query()->count())->toBe(0);
    });
});
