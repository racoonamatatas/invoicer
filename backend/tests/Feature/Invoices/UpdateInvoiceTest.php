<?php

declare(strict_types = 1);

use App\Actions\Invoice\UpdateInvoiceAction;
use App\DataTransferObjects\Input\Invoice\InvoiceData;
use App\Enums\VatTreatment;
use App\Http\IfMatch;
use App\Models\BankAccount;
use App\Models\Business;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use Illuminate\Database\Eloquent\Factories\Sequence;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * A domestic draft of the business at version 3, with two high-rate lines at positions 1 and 2. Version 3, not the
 * factory's 1, so a check against a constant can't pass by chance.
 *
 * @param  array<string, mixed>  $attributes
 */
function draftWithTwoLines(Business $business, array $attributes = []): Invoice
{
    return Invoice::factory()->for($business)
        ->has(InvoiceLine::factory()->count(2)->state(new Sequence(
            ['position' => 1, 'description' => 'Oude regel een'],
            ['position' => 2, 'description' => 'Oude regel twee'],
        )), 'lines')
        ->create(['version' => 3, ...$attributes]);
}

/**
 * The invoice's row and its lines as the database holds them, raw, so a test can show a refused save changed
 * neither.
 *
 * @return array{invoice: array<string, mixed>, lines: list<array<string, mixed>>}
 */
function storedDraft(Invoice $invoice): array
{
    return [
        'invoice' => reloaded($invoice)->getAttributes(),
        'lines' => array_values(InvoiceLine::query()->where('invoice_id', $invoice->id)->orderBy('position')->get()
            ->map(static fn (InvoiceLine $line): array => $line->getAttributes())
            ->all()),
    ];
}

describe('Updating an invoice', function (): void {

    it('should return 200 (ok) with the draft as show returns it, its new lines numbered in the order sent, and the next version as the ETag', function (): void {
        // Arrange
        // The bystander has the same version, so an update that forgot the id would change it too.
        $business = Business::factory()->create();
        $invoice = draftWithTwoLines($business);
        $oldLines = $invoice->lines()->get();
        $bystander = draftWithTwoLines($business);
        $bystanderBefore = storedDraft($bystander);
        $otherAccount = BankAccount::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($invoice->client, $otherAccount, [
            'payment_term_days' => 30,
            'lines' => [
                ['description' => 'Advieswerk', 'quantity_hundredths' => 200, 'unit_price_cents' => 9000, 'vat_option' => 'high'],
                ['description' => 'Lesmateriaal', 'quantity_hundredths' => 100, 'unit_price_cents' => 4500, 'vat_option' => 'low'],
                ['description' => 'Reiskosten', 'quantity_hundredths' => 100, 'unit_price_cents' => 1500, 'vat_option' => 'zero'],
            ],
        ]), ['If-Match' => '"3"']);

        // Assert
        // 2 × €90 at 21%, 1 × €45 at 9% and 1 × €15 at 0%, worked out by hand.
        $response->assertOk()->assertHeader('ETag', '"4"')->assertExactJson([
            'id' => $invoice->id,
            'status' => 'draft',
            'vat_treatment' => 'domestic',
            'number' => null,
            'client_id' => $invoice->client_id,
            'bank_account_id' => $otherAccount->id,
            'payment_term_days' => 30,
            'lines' => [
                ['description' => 'Advieswerk', 'quantity_hundredths' => 200, 'unit_price_cents' => 9000, 'vat_option' => 'high', 'total_cents' => 18000],
                ['description' => 'Lesmateriaal', 'quantity_hundredths' => 100, 'unit_price_cents' => 4500, 'vat_option' => 'low', 'total_cents' => 4500],
                ['description' => 'Reiskosten', 'quantity_hundredths' => 100, 'unit_price_cents' => 1500, 'vat_option' => 'zero', 'total_cents' => 1500],
            ],
            'totals' => [
                'subtotal_cents' => 24000,
                'vat_groups' => [
                    ['vat_option' => 'high', 'rate_percent' => 21, 'base_cents' => 18000, 'vat_cents' => 3780],
                    ['vat_option' => 'low', 'rate_percent' => 9, 'base_cents' => 4500, 'vat_cents' => 405],
                    ['vat_option' => 'zero', 'rate_percent' => 0, 'base_cents' => 1500, 'vat_cents' => 0],
                ],
                'vat_cents' => 4185,
                'total_cents' => 28185,
            ],
        ]);
        $stored = reloaded($invoice);
        expect($stored->version)->toBe(4)
            ->and($stored->bank_account_id)->toBe($otherAccount->id)
            ->and($stored->payment_term_days)->toBe(30)
            ->and($stored->lines()->pluck('description', 'position')->all())
            ->toBe([1 => 'Advieswerk', 2 => 'Lesmateriaal', 3 => 'Reiskosten']);
        // Deleted, not renamed in place: the request carries no line ids.
        foreach ($oldLines as $oldLine)
        {
            $this->assertModelMissing($oldLine);
        }
        expect(storedDraft($bystander))->toBe($bystanderBefore);
    });

    it('should return 200 (ok), store the new lines and bump the version when only the lines change', function (): void {
        // Arrange
        // The payload repeats the stored invoice's own fields, so its row has nothing to change but the version.
        $business = Business::factory()->create();
        $invoice = draftWithTwoLines($business);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($invoice->client, $invoice->bankAccount, [
            'payment_term_days' => null,
            'lines' => [
                ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000, 'vat_option' => 'high'],
            ],
        ]), ['If-Match' => '"3"']);

        // Assert
        $response->assertOk()->assertHeader('ETag', '"4"');
        $stored = reloaded($invoice);
        expect($stored->version)->toBe(4)
            ->and($stored->lines()->pluck('description', 'position')->all())->toBe([1 => 'Advieswerk']);
    });

    it('should return 200 (ok) with no lines and zero totals, and store no lines, for an empty list of lines', function (): void {
        // Arrange
        // An empty list is a valid draft: "at least one line" is a rule for sending.
        $business = Business::factory()->create();
        $invoice = draftWithTwoLines($business);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($invoice->client, $invoice->bankAccount, [
            'lines' => [],
        ]), ['If-Match' => '"3"']);

        // Assert
        $response->assertOk()
            ->assertJsonPath('lines', [])
            ->assertJsonPath('totals.vat_groups', [])
            ->assertJsonPath('totals.total_cents', 0);
        expect(InvoiceLine::query()->where('invoice_id', $invoice->id)->count())->toBe(0);
    });

    it('should return 200 (ok) for a switch from domestic to reverse charge whose lines have no VAT option, and the next show is 200 (ok) with its totals', function (): void {
        // Arrange
        // A German client with a VAT number fits reverse charge, so only the lines decide.
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create(['country_code' => 'DE', 'vat_number' => 'DE123456789']);
        $invoice = draftWithTwoLines($business, ['client_id' => $client->id]);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($client, $invoice->bankAccount, [
            'vat_treatment' => 'reverse_charge',
            'lines' => [
                ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000, 'vat_option' => null],
            ],
        ]), ['If-Match' => '"3"']);
        $show = $this->getJson("/api/businesses/{$business->id}/invoices/{$invoice->id}");

        // Assert
        // The show is what would break if the treatment were stored without its lines: its totals refuse a
        // reverse-charge line with a VAT option.
        $response->assertOk();
        $show->assertOk()
            ->assertJsonPath('vat_treatment', 'reverse_charge')
            ->assertJsonPath('lines.0.vat_option', null)
            ->assertJsonPath('totals.vat_cents', 0)
            ->assertJsonPath('totals.total_cents', 10000);
        expect(reloaded($invoice)->vat_treatment)->toBe(VatTreatment::ReverseCharge);
    });

    it('should return 422 (unprocessable) on each line\'s vat_option for a switch to reverse charge whose lines keep one, and leave the stored draft as it was', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create(['country_code' => 'DE', 'vat_number' => 'DE123456789']);
        $invoice = draftWithTwoLines($business, ['client_id' => $client->id]);
        $before = storedDraft($invoice);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($client, $invoice->bankAccount, [
            'vat_treatment' => 'reverse_charge',
            'lines' => [
                ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000, 'vat_option' => 'high'],
                ['description' => 'Lesmateriaal', 'quantity_hundredths' => 100, 'unit_price_cents' => 2500, 'vat_option' => 'low'],
            ],
        ]), ['If-Match' => '"3"']);

        // Assert
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors(['lines.0.vat_option', 'lines.1.vat_option']);
        expect(storedDraft($invoice))->toBe($before);
    });

    it('should return 412 (precondition failed) and leave the stored draft as it was, lines included, when If-Match names an older version', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $invoice = draftWithTwoLines($business);
        $before = storedDraft($invoice);
        $this->actingAs($business->user, 'web');

        // Act
        // "2": the client read the draft before another tab saved it.
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($invoice->client, $invoice->bankAccount, [
            'payment_term_days' => 30,
        ]), ['If-Match' => '"2"']);

        // Assert
        $response->assertStatus(412)->assertExactJson([
            'message' => 'This was changed elsewhere since you opened it. Load the latest version and try again.',
        ]);
        expect(storedDraft($invoice))->toBe($before);
    });

    it('should return 428 (precondition required) and leave the stored draft as it was when If-Match is missing', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $invoice = draftWithTwoLines($business);
        $before = storedDraft($invoice);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($invoice->client, $invoice->bankAccount));

        // Assert
        $response->assertStatus(428)->assertExactJson([
            'message' => 'This request needs an If-Match header with the version it was based on.',
        ]);
        expect(storedDraft($invoice))->toBe($before);
    });

    it('should return 422 (unprocessable), not 428, for an invalid body without If-Match, and leave the stored draft as it was', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $invoice = draftWithTwoLines($business);
        $before = storedDraft($invoice);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($invoice->client, $invoice->bankAccount, [
            'payment_term_days' => 0,
        ]));

        // Assert
        // The body is checked first: the FormRequest validates before the controller reads the header. This pins that
        // order, so a change to it is a decision rather than an accident.
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors(['payment_term_days']);
        expect(storedDraft($invoice))->toBe($before);
    });

    it('should return 400 (bad request) and leave the stored draft as it was when If-Match is not one quoted version', function (string $header): void {
        // Arrange
        // Version 3, so each header names it as closely as it can: it is refused for its form, not its value. The
        // full set of malformed headers is DeleteInvoiceTest's; this shows the update reads the header the same way.
        $business = Business::factory()->create();
        $invoice = draftWithTwoLines($business);
        $before = storedDraft($invoice);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($invoice->client, $invoice->bankAccount), ['If-Match' => $header]);

        // Assert
        $response->assertStatus(400)->assertExactJson([
            'message' => 'The If-Match header must be one version in quotes, such as "3".',
        ]);
        expect(storedDraft($invoice))->toBe($before);
    })->with([
        'any version' => '*',
        'a weak tag' => 'W/"3"',
    ]);

    it('should return 422 (unprocessable) on client_id or bank_account_id for one of another business of the same user, and leave the stored draft as it was', function (string $field): void {
        // Arrange
        $business = Business::factory()->create();
        $otherBusiness = Business::factory()->for($business->user)->create();
        $invoice = draftWithTwoLines($business);
        $before = storedDraft($invoice);
        $foreignId = match ($field)
        {
            'client_id' => Client::factory()->for($otherBusiness)->create()->id,
            'bank_account_id' => BankAccount::factory()->for($otherBusiness)->create()->id,
            default => throw new LogicException("The dataset has no foreign key {$field}."),
        };
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($invoice->client, $invoice->bankAccount, [
            $field => $foreignId,
        ]), ['If-Match' => '"3"']);

        // Assert
        // A 422 on the field, not a 404: the id is in the body, not the URL.
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors([$field]);
        expect(storedDraft($invoice))->toBe($before);
    })->with(['client_id', 'bank_account_id']);

    it('should return 422 (unprocessable) on vat_treatment for reverse charge to a Dutch client, and leave the stored draft as it was', function (): void {
        // Arrange
        // One case of the treatment rule: the request is the one POST uses, and CreateInvoiceTest covers every case.
        $business = Business::factory()->create();
        $client = Client::factory()->for($business)->create(['country_code' => 'NL', 'vat_number' => 'NL123456789B01']);
        $invoice = draftWithTwoLines($business, ['client_id' => $client->id]);
        $before = storedDraft($invoice);
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($client, $invoice->bankAccount, [
            'vat_treatment' => 'reverse_charge',
            'lines' => [
                ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000, 'vat_option' => null],
            ],
        ]), ['If-Match' => '"3"']);

        // Assert
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors([
            'vat_treatment' => 'Reverse charge needs a client in an EU country other than the Netherlands.',
        ]);
        expect(storedDraft($invoice))->toBe($before);
    });

    it('should return 422 (unprocessable) on the field, and leave the stored draft as it was, when the new client or bank account is deleted after validation', function (string $field, string $table): void {
        // Arrange
        // The update switches to a new client and account, so deleting one doesn't touch the rows the stored draft
        // still points at.
        $business = Business::factory()->create();
        $invoice = draftWithTwoLines($business);
        $before = storedDraft($invoice);
        $newClient = Client::factory()->for($business)->create();
        $newAccount = BankAccount::factory()->for($business)->create();
        $deletedId = $field === 'client_id' ? $newClient->id : $newAccount->id;
        // The controller's parameters resolve in order, so the action is built after the request has validated: a
        // delete there is the race, another request deleting the row between the exists rule and the update.
        $this->app->resolving(UpdateInvoiceAction::class, static function () use ($table, $deletedId): void {
            DB::table($table)->where('id', $deletedId)->delete();
        });
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($newClient, $newAccount), ['If-Match' => '"3"']);

        // Assert
        // The same message the exists rule gives, so the user can't tell which check caught it.
        $attribute = str_replace('_', ' ', $field);
        $response->assertUnprocessable()->assertOnlyJsonValidationErrors([$field => "The selected {$attribute} is invalid."]);
        expect(storedDraft($invoice))->toBe($before);
    })->with([
        'client' => ['client_id', 'clients'],
        'bank account' => ['bank_account_id', 'bank_accounts'],
    ]);

    it('should return 500 (internal server error) and leave the stored draft as it was, old lines and version included, when a new line fails to insert', function (): void {
        // Arrange
        // The second new line fails after the row is updated, the old lines are deleted and the first new line is in,
        // so only a rollback puts the draft back.
        $business = Business::factory()->create();
        $invoice = draftWithTwoLines($business);
        $before = storedDraft($invoice);
        InvoiceLine::creating(static function (InvoiceLine $line): void {
            if ($line->position === 2)
            {
                throw new RuntimeException('A line insert fails.');
            }
        });
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($invoice->client, $invoice->bankAccount, [
            'lines' => [
                ['description' => 'Advieswerk', 'quantity_hundredths' => 100, 'unit_price_cents' => 10000, 'vat_option' => 'high'],
                ['description' => 'Lesmateriaal', 'quantity_hundredths' => 100, 'unit_price_cents' => 2500, 'vat_option' => 'low'],
            ],
        ]), ['If-Match' => '"3"']);

        // Assert
        $response->assertInternalServerError();
        expect(storedDraft($invoice))->toBe($before);
    });

    it('should return 404 (not found) for the id of an invoice under the user\'s other business, and leave it as it was', function (): void {
        // Arrange
        // Both businesses are the user's, so only the scoped binding stands between them. A matching If-Match, so the
        // header can't be what refuses it.
        $business = Business::factory()->create();
        $otherBusinessInvoice = draftWithTwoLines(Business::factory()->for($business->user)->create());
        $before = storedDraft($otherBusinessInvoice);
        $client = Client::factory()->for($business)->create();
        $account = BankAccount::factory()->for($business)->create();
        $this->actingAs($business->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$otherBusinessInvoice->id}", invoicePayload($client, $account), ['If-Match' => '"3"']);

        // Assert
        $response->assertNotFound();
        expect(storedDraft($otherBusinessInvoice))->toBe($before);
    });

    it('should return 404 (not found) for an invoice under a business of another user, and leave it as it was', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $invoice = draftWithTwoLines($business);
        $before = storedDraft($invoice);
        $this->actingAs(Business::factory()->create()->user, 'web');

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($invoice->client, $invoice->bankAccount), ['If-Match' => '"3"']);

        // Assert
        $response->assertNotFound();
        expect(storedDraft($invoice))->toBe($before);
    });

    it('should return 401 (unauthorized) for a guest, and leave the stored draft as it was', function (): void {
        // Arrange
        $business = Business::factory()->create();
        $invoice = draftWithTwoLines($business);
        $before = storedDraft($invoice);

        // Act
        $response = $this->putJson("/api/businesses/{$business->id}/invoices/{$invoice->id}", invoicePayload($invoice->client, $invoice->bankAccount), ['If-Match' => '"3"']);

        // Assert
        $response->assertUnauthorized();
        expect(storedDraft($invoice))->toBe($before);
    });
});

describe('UpdateInvoiceAction', function (): void {

    it('should throw LogicException, and leave the stored draft as it was, for an invoice of another business than the one given', function (): void {
        // Arrange
        // Called directly: over HTTP the scoped binding can't produce this pair. Both businesses are one user's, so
        // only the business check stands between them.
        $business = Business::factory()->create();
        $invoice = draftWithTwoLines(Business::factory()->for($business->user)->create());
        $before = storedDraft($invoice);
        $data = new InvoiceData(
            clientId: $invoice->client_id,
            bankAccountId: $invoice->bank_account_id,
            vatTreatment: VatTreatment::Domestic,
            paymentTermDays: 30,
            lines: [],
        );
        $ifMatch = IfMatch::fromRequest(Request::create('/', 'PUT', server: ['HTTP_IF_MATCH' => '"3"']));

        // Act
        $act = fn () => app(UpdateInvoiceAction::class)->execute($business, $invoice, $data, $ifMatch);

        // Assert
        expect($act)->toThrow(LogicException::class, "Invoice {$invoice->id} does not belong to business {$business->id}.");
        expect(storedDraft($invoice))->toBe($before);
    });

    it('should throw ModelNotFoundException, a 404 (not found), when the invoice was deleted after the route found it', function (): void {
        // Arrange
        // The action is called directly: over HTTP the binding would find the row gone and answer 404 itself, so the
        // gap between the binding and the update can only be reached here. The model is loaded, then its row deleted,
        // as a delete in another tab would.
        $invoice = Invoice::factory()->create();
        $data = new InvoiceData(
            clientId: $invoice->client_id,
            bankAccountId: $invoice->bank_account_id,
            vatTreatment: VatTreatment::Domestic,
            paymentTermDays: null,
            lines: [],
        );
        Invoice::query()->whereKey($invoice->id)->delete();
        $ifMatch = IfMatch::fromRequest(Request::create('/', 'PUT', server: ['HTTP_IF_MATCH' => '"1"']));

        // Act
        $act = fn () => app(UpdateInvoiceAction::class)->execute($invoice->business, $invoice, $data, $ifMatch);

        // Assert
        // Not StaleVersionException: its "changed elsewhere, load the latest version" would send the user to a draft
        // that no longer exists.
        expect($act)->toThrow(ModelNotFoundException::class);
    });
});
