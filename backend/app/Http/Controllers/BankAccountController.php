<?php

declare(strict_types = 1);

namespace App\Http\Controllers;

use App\Actions\BankAccount\CreateBankAccountAction;
use App\Actions\BankAccount\DeleteBankAccountAction;
use App\Actions\BankAccount\ListBankAccountsAction;
use App\Actions\BankAccount\UpdateBankAccountAction;
use App\Http\Requests\StoreBankAccountRequest;
use App\Http\Requests\UpdateBankAccountRequest;
use App\Http\Resources\BankAccountResourceData;
use App\Http\Responses\NoContentResponse;
use App\Models\BankAccount;
use App\Models\Business;
use Illuminate\Http\JsonResponse;

/**
 * Every action runs inside the {business} route group, whose ->can('access', 'business') has already proven the
 * business is the user's. Every query starts from that business, so another business's accounts can't appear.
 */
final class BankAccountController extends Controller
{
    public function index(Business $business, ListBankAccountsAction $action): JsonResponse
    {
        $bankAccounts = $action->execute($business)
            ->map(BankAccountResourceData::from(...))
            ->all();

        return new JsonResponse($bankAccounts);
    }

    /**
     * A new bank account for the business, as 201 with the account as the index lists it.
     */
    public function store(StoreBankAccountRequest $request, CreateBankAccountAction $action, Business $business): JsonResponse
    {
        $bankAccount = $action->execute($business, $request->toDto());

        return new JsonResponse(BankAccountResourceData::from($bankAccount), JsonResponse::HTTP_CREATED);
    }

    /**
     * Renames the account. $bankAccount comes from the scoped binding, so it is one of this business's accounts:
     * an id of another business's account was a 404 before this method ran.
     *
     * $business is unused but must be here: Laravel hands route parameters to a controller by position, not by
     * name, so without it the bound Business would land in $bankAccount and the call would be a TypeError.
     */
    public function update(UpdateBankAccountRequest $request, UpdateBankAccountAction $action, Business $business, BankAccount $bankAccount): BankAccountResourceData
    {
        return BankAccountResourceData::from($action->execute($bankAccount, $request->label()));
    }

    /**
     * The type-hint is what makes the scoped binding run: implicit binding only resolves parameters the action
     * names, so without it {bankAccount} would stay the string "7" and nothing would check its business. $business
     * is unused, for the same positional reason as on update().
     */
    public function destroy(DeleteBankAccountAction $action, Business $business, BankAccount $bankAccount): NoContentResponse
    {
        $action->execute($bankAccount);

        return new NoContentResponse;
    }
}
