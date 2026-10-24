<?php

declare(strict_types = 1);

namespace App\Http\Controllers;

use App\Actions\Business\CreateBusinessAction;
use App\Actions\Business\ListBusinessesAction;
use App\Actions\Business\UpdateBusinessAction;
use App\Http\Requests\StoreBusinessRequest;
use App\Http\Requests\UpdateBusinessRequest;
use App\Http\Resources\BusinessResourceData;
use App\Models\Business;
use App\Models\User;
use Illuminate\Container\Attributes\CurrentUser;
use Illuminate\Http\JsonResponse;

final class BusinessController extends Controller
{
    /**
     * The user's own businesses. The action's query starts from the user, so another user's business can't appear.
     */
    public function index(#[CurrentUser] User $user, ListBusinessesAction $action): JsonResponse
    {
        $businesses = $action->execute($user)
            ->map(BusinessResourceData::from(...))
            ->all();

        return new JsonResponse($businesses);
    }

    /**
     * A new business for the logged-in user, as 201 with the business as GET /api/businesses/{business} returns it.
     */
    public function store(StoreBusinessRequest $request, CreateBusinessAction $action, #[CurrentUser] User $user): JsonResponse
    {
        $business = $action->execute($user, $request->toDto());

        return new JsonResponse(BusinessResourceData::from($business), JsonResponse::HTTP_CREATED);
    }

    /**
     * The route's ->can('access', 'business') has already proven the business is the user's; the controller only
     * ever reads from the bound model.
     */
    public function show(Business $business): BusinessResourceData
    {
        return BusinessResourceData::from($business);
    }

    /**
     * Replaces the whole business. The route's ->can() has run before UpdateBusinessRequest validates, so another
     * user's business is a 403 whatever the body holds.
     */
    public function update(UpdateBusinessRequest $request, UpdateBusinessAction $action, Business $business): BusinessResourceData
    {
        return BusinessResourceData::from($action->execute($business, $request->toDto()));
    }
}
