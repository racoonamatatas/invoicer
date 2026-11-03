<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest;

use App\Http\Requests\Concerns\ReadsValidatedInput;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\ValidatedInput;
use PhpParser\Node;
use PhpParser\Node\Arg;
use PhpParser\Node\Expr;
use PhpParser\Node\Expr\ArrayDimFetch;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Expr\PropertyFetch;
use PhpParser\Node\Identifier;
use PHPStan\Analyser\Scope;
use PHPStan\Collectors\Collector;
use PHPStan\Type\ObjectType;
use PHPStan\Type\Type;

/**
 * Records every key a FormRequest reads from its validated input, in any of its methods, not only `toDto()`.
 *
 * A read is one of:
 * - an accessor on a `ValidatedInput`, the type `safe()` returns: `$safe->string('email')`, `$safe->only(['a'])`;
 * - an array or property read on one: `$safe['email']`, `$safe->email`;
 * - `$this->validated('email')`, `$this->safe(['email'])`;
 * - a `ReadsValidatedInput` helper: `$this->validatedStringOrNull('email')`.
 *
 * Each record is [the class and its parents, the keys read, how they were read, line]. A null key is one that isn't
 * known before the code runs, such as `$safe->string($field)`.
 *
 * @implements Collector<Expr, array{list<string>, non-empty-list<string|null>, string, int}>
 */
final class ValidatedKeyReadCollector implements Collector
{
    /**
     * `ValidatedInput` methods whose first argument is one key. Lower-cased, as PHP method names are case-insensitive.
     */
    private const array ONE_KEY_METHODS = [
        'input', 'file', 'exists', 'whenhas', 'whenfilled', 'whenenum', 'whenmissing', 'str', 'string', 'boolean',
        'integer', 'float', 'clamp', 'date', 'interval', 'enum', 'enums', 'array', 'collect',
    ];

    /**
     * `ValidatedInput` methods that take a list of keys, as one array or as several arguments: has() and its kin read
     * `func_get_args()`, so `has('a', 'b')` checks both. Not except(): leaving a key out reads nothing.
     */
    private const array KEY_LIST_METHODS = ['all', 'has', 'hasany', 'filled', 'isnotfilled', 'anyfilled', 'missing', 'only'];

    public function getNodeType(): string
    {
        return Expr::class;
    }

    public function processNode(Node $node, Scope $scope): ?array
    {
        $lineage = FormRequestScope::lineage($scope);

        // The helper's own body reads the key its caller passed in: the call site is the read that gets checked.
        if ($lineage === null || $scope->getTraitReflection()?->getName() === ReadsValidatedInput::class)
        {
            return null;
        }

        $read = $this->read($node, $scope);

        return $read === null ? null : [$lineage, $read[0], $read[1], $node->getStartLine()];
    }

    /**
     * The keys a node reads and a short description of how, or null when it reads no key.
     *
     * @return array{non-empty-list<string|null>, string}|null
     */
    private function read(Expr $node, Scope $scope): ?array
    {
        if ($node instanceof ArrayDimFetch && $node->dim !== null && $this->isValidatedInput($node->var, $scope))
        {
            return self::readOf(FormRequestScope::keysNamedBy($scope->getType($node->dim)), '[]');
        }

        if ($node instanceof PropertyFetch && $this->isValidatedInput($node->var, $scope))
        {
            $keys = $node->name instanceof Identifier
                ? [$node->name->name]
                : FormRequestScope::keysNamedBy($scope->getType($node->name));

            return self::readOf($keys, '->property');
        }

        if (! $node instanceof MethodCall || ! $node->name instanceof Identifier)
        {
            return null;
        }

        $name = strtolower($node->name->name);
        $keyArgs = $this->keyArguments($node, $name, $scope);

        $keys = [];

        foreach ($keyArgs as $arg)
        {
            array_push($keys, ...FormRequestScope::keysNamedBy($scope->getType($arg->value)));
        }

        return self::readOf($keys, $node->name->name.'()');
    }

    /**
     * No keys is no read: `$safe->all()`, `$this->validated()` or `$safe->only([])` leave nothing to check.
     *
     * @param  list<string|null>  $keys
     * @return array{non-empty-list<string|null>, string}|null
     */
    private static function readOf(array $keys, string $how): ?array
    {
        return $keys === [] ? null : [$keys, $how];
    }

    /**
     * The arguments that name keys, or [] when the call is not a read.
     *
     * @return list<Arg>
     */
    private function keyArguments(MethodCall $node, string $name, Scope $scope): array
    {
        $args = $node->getArgs();

        if ($this->isValidatedInput($node->var, $scope))
        {
            if (in_array($name, self::ONE_KEY_METHODS, true))
            {
                return $this->argument($args, 'key');
            }

            // Several positional arguments are several keys: `only('a', 'b')` is `only(['a', 'b'])`.
            return in_array($name, self::KEY_LIST_METHODS, true) ? array_values($args) : [];
        }

        $receiver = $scope->getType($node->var);

        if (new ObjectType(FormRequest::class)->isSuperTypeOf($receiver)->yes())
        {
            return match ($name)
            {
                'validated' => $this->argument($args, 'key'),
                'safe' => $this->argument($args, 'keys'),
                default => $this->usesReadsValidatedInput($receiver) && $name === 'validatedstringornull'
                    ? $this->argument($args, 'key')
                    : [],
            };
        }

        return [];
    }

    /**
     * The first argument, passed by position or by its name.
     *
     * @param  array<Arg>  $args
     * @return list<Arg>
     */
    private function argument(array $args, string $parameterName): array
    {
        foreach ($args as $position => $arg)
        {
            if ($arg->name?->name === $parameterName || ($arg->name === null && $position === 0))
            {
                return [$arg];
            }
        }

        return [];
    }

    private function isValidatedInput(Expr $expr, Scope $scope): bool
    {
        return new ObjectType(ValidatedInput::class)->isSuperTypeOf($scope->getType($expr))->yes();
    }

    private function usesReadsValidatedInput(Type $receiver): bool
    {
        foreach ($receiver->getObjectClassReflections() as $class)
        {
            if ($class->hasTraitUse(ReadsValidatedInput::class))
            {
                return true;
            }
        }

        return false;
    }
}
