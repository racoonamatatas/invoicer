<?php

declare(strict_types = 1);

namespace App\Http\Controllers;

use App\Actions\BankAccount\CreateBankAccountAction;
use App\Actions\BankAccount\ListBankAccountsAction;
use App\Http\Requests\StoreBankAccountRequest;
use App\Http\Resources\BankAccountResourceData;
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
}
