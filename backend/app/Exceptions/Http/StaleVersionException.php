<?php

declare(strict_types = 1);

namespace App\Exceptions\Http;

use Exception;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use LogicException;

/**
 * The row was saved or deleted by someone else after the client read it, so its If-Match names a version that is no
 * longer current. Nothing was written.
 */
final class StaleVersionException extends Exception
{
    public function __construct()
    {
        parent::__construct('This was changed elsewhere since you opened it. Load the latest version and try again.');
    }

    /**
     * Says why a write guarded by WHERE version = ? changed 0 rows. That has two causes, told apart only once the write
     * has failed, so the check and the write stay one statement. Gone: a double-click or a second tab deleted the row
     * first, and "changed elsewhere, load the latest version" would send the user to a row that no longer exists, so
     * it is the same 404 as an unknown id in the URL. Still there: its version moved on, a 412.
     *
     * @throws ModelNotFoundException when the row no longer exists
     * @throws self when it exists under another version
     */
    public static function throwForMissedWrite(Model $model): never
    {
        // getKey() is typed mixed for any model; a row the write was aimed at always has an int or string key.
        $key = $model->getKey();
        if (! is_int($key) && ! is_string($key))
        {
            throw new LogicException('A versioned write was aimed at a model without a key.');
        }

        if (! $model->newQuery()->whereKey($key)->exists())
        {
            throw (new ModelNotFoundException)->setModel($model::class, [$key]);
        }

        throw new self;
    }
}
