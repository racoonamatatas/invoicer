<?php

declare(strict_types = 1);

use App\Actions\Invoice\DeleteInvoiceAction;
use App\Http\IfMatch;
use App\Models\Business;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use Illuminate\Database\Eloquent\Factories\Sequence;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;

describe('Deleting an invoice', function (): void {

    it('should return 204 (no content) and remove the invoice and its lines when If-Match names its version', function (): void {
        // Arrange
        // Version 3, not the factory's 1, so a check against a constant can't pass by chance. The bystander has the
        // same version, so a delete that forgot the id would take it too.
        $business = Business::factory()->create();
        $invoice = Invoice::factory()->for($business)
            ->has(InvoiceLine::factory()->count(2)->state(new Sequence(['position' => 1], ['position' => 2])), 'lines')
            ->create(['version' => 3]);
        $bystander = Invoice::factory()->for($business)
            ->has(InvoiceLine::factory()->state(['position' => 1]), 'lines')
            ->create(['version' => 3]);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->deleteJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", [], ['If-Match' => '"3"']);

        // Assert
        // The lines go by the foreign key's cascade, not by the action.
        $response->assertNoContent();
        $this->assertModelMissing($invoice);
        expect(InvoiceLine::query()->where('invoice_id', $invoice->id)->count())->toBe(0);
        $this->assertModelExists($bystander);
        expect(InvoiceLine::query()->where('invoice_id', $bystander->id)->count())->toBe(1);
    });

    it('should return 412 (precondition failed) and keep the invoice and its lines when If-Match names an older version', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $invoice = Invoice::factory()->for($business)
            ->has(InvoiceLine::factory()->count(2)->state(new Sequence(['position' => 1], ['position' => 2])), 'lines')
            ->create(['version' => 3]);
        $this->actingAs($business->user, 'web');

        // Act
        // "2": the client read the draft before another tab saved it.
        $response = $this->deleteJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", [], ['If-Match' => '"2"']);

        // Assert
        $response->assertStatus(412)->assertExactJson([
            'message' => 'This was changed elsewhere since you opened it. Load the latest version and try again.',
        ]);
        expect($invoice->fresh()?->version)->toBe(3);
        expect(InvoiceLine::query()->where('invoice_id', $invoice->id)->count())->toBe(2);
    });

    it('should return 428 (precondition required) and keep the invoice when If-Match is missing', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $invoice = Invoice::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->deleteJson("/api/businesses/{$business->id}/invoices/{$invoice->id}");

        // Assert
        $response->assertStatus(428)->assertExactJson([
            'message' => 'This request needs an If-Match header with the version it was based on.',
        ]);
        $this->assertModelExists($invoice);
    });

    it('should return 400 (bad request) and keep the invoice when If-Match is not one quoted version', function (string $header): void {
        // Arrange
        // Version 3, so every header below names it as closely as it can: each is refused for its form, not its value.
        $business = Business::factory()->create();
        $invoice = Invoice::factory()->for($business)->create(['version' => 3]);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->deleteJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", [], ['If-Match' => $header]);

        // Assert
        $response->assertStatus(400)->assertExactJson([
            'message' => 'The If-Match header must be one version in quotes, such as "3".',
        ]);
        $this->assertModelExists($invoice);
    })->with([
        'any version' => '*',
        'a weak tag' => 'W/"3"',
        'no quotes' => '3',
        'a leading zero' => '"03"',
        'empty quotes' => '""',
        'an empty header' => '',
        'past PHP_INT_MAX' => '"99999999999999999999"',
    ]);

    it('should return 404 (not found) for the id of an invoice under the user\'s other business', function (): void {
        // Arrange
        // Both businesses are the user's, so only the scoped binding stands between them. A matching If-Match, so the
        // header can't be what refuses it.
        $business = Business::factory()->create();
        $otherBusinessInvoice = Invoice::factory()->for(Business::factory()->for($business->user))->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->deleteJson("/api/businesses/{$business->id}/invoices/{$otherBusinessInvoice->id}", [], ['If-Match' => '"1"']);

        // Assert
        $response->assertNotFound();
        $this->assertModelExists($otherBusinessInvoice);
    });

    it('should return 404 (not found) for an invoice under a business of another user', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $invoice = Invoice::factory()->for($business)->create();
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $response = $this->deleteJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", [], ['If-Match' => '"1"']);

        // Assert
        $response->assertNotFound();
        $this->assertModelExists($invoice);
    });

    it('should return 401 (unauthorized) and keep the invoice for a guest', function (): void {
        // Arrange
        $invoice = Invoice::factory()->create();

        // Act
        $response = $this->deleteJson("/api/businesses/{$invoice->business_id}/invoices/{$invoice->id}", [], ['If-Match' => '"1"']);

        // Assert
        $response->assertUnauthorized();
        $this->assertModelExists($invoice);
    });
});

describe('DeleteInvoiceAction', function (): void {

    it('should throw ModelNotFoundException, a 404 (not found), when the invoice was deleted after the route found it', function (): void {
        // Arrange
        // The action is called directly: over HTTP the binding would find the row gone and answer 404 itself, so the
        // gap between the binding and the delete can only be reached here. The model is loaded, then its row deleted,
        // as a double-click's first request would.
        $invoice = Invoice::factory()->create();
        Invoice::query()->whereKey($invoice->id)->delete();
        $ifMatch = IfMatch::fromRequest(Request::create('/', 'DELETE', server: ['HTTP_IF_MATCH' => '"1"']));

        // Act
        $act = fn () => app(DeleteInvoiceAction::class)->execute($invoice, $ifMatch);

        // Assert
        // Not StaleVersionException: its "changed elsewhere, load the latest version" would send the user to a draft
        // that no longer exists.
        expect($act)->toThrow(ModelNotFoundException::class);
    });
});
