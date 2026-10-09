<?php

declare(strict_types = 1);

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

abstract class TestCase extends BaseTestCase
{
    /**
     * Passwords the fake haveibeenpwned API reports as leaked. Empty by default: every password is safe.
     *
     * @var list<string>
     */
    protected array $leakedPasswords = [];

    protected function setUp(): void
    {
        parent::setUp();

        // Any real outgoing HTTP call fails the test, so the suite never depends on the internet.
        Http::preventStrayRequests();

        // A tiny in-memory haveibeenpwned: answers the range lookup the way the real API does.
        Http::fake([
            'api.pwnedpasswords.com/range/*' => fn (Request $request) => Http::response($this->pwnedRange($request)),
        ]);
    }

    /**
     * The real API receives the first 5 characters of the password's SHA-1 and returns every
     * leaked hash with that prefix, one per line, as "<remaining 35 characters>:<times seen>".
     */
    private function pwnedRange(Request $request): string
    {
        $prefix = basename($request->url());

        $lines = [];
        foreach ($this->leakedPasswords as $password)
        {
            $hash = strtoupper(sha1($password));
            if (str_starts_with($hash, $prefix))
            {
                $lines[] = substr($hash, 5).':1';
            }
        }

        return implode("\n", $lines);
    }
}
