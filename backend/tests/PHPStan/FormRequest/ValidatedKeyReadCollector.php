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
use PhpParser\Node\Expr\StaticCall;
use PhpParser\Node\Identifier;
use PhpParser\Node\Name;
use PHPStan\Analyser\Scope;
use PHPStan\Collectors\Collector;
use PHPStan\Reflection\ClassReflection;
use PHPStan\Type\ObjectType;
use PHPStan\Type\Type;
use PHPStan\Type\TypeCombinator;

/**
 * Records every key read from a FormRequest's validated input, and the request class whose rules the read runs with.
 *
 * A read is one of:
 * - an accessor on a `ValidatedInput`, the type `safe()` returns: `$safe->string('email')`, `$safe->only(['a'])`;
 * - an array or property read on one: `$safe['email']`, `$safe->email`;
 * - `validated('email')` or `safe(['email'])` on a request, or through `parent::`, `self::` or `static::`;
 * - a `ReadsValidatedInput` helper on a request, under its own name or an alias: `$this->validatedStringOrNull('email')`.
 *
 * A nullsafe call or fetch, `$safe?->string('x')`, needs no case of its own: PHPStan analyses it as the plain one too.
 * A write such as `$safe['x'] = 1` is not a read.
 *
 * A `ValidatedInput` doesn't say which request it came from, so its reads count only inside a request, for the class
 * the code is in. A call on a request counts anywhere, a controller included, for the receiver's class; a receiver
 * typed as the base `FormRequest` names no class with a `rules()`, so its reads are skipped.
 *
 * Each record is [the request classes, the keys read, how they were read, line]. A null key is one that isn't known
 * before the code runs, such as `$safe->string($field)`.
 *
 * @implements Collector<Expr, array{non-empty-list<string>, non-empty-list<string|null>, string, int}>
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
        // The helpers' own bodies read the key their caller passed in: the call site is the read that gets checked.
        if ($scope->getTraitReflection()?->getName() === ReadsValidatedInput::class)
        {
            return null;
        }

        $read = $this->read($node, $scope);

        if ($read === null)
        {
            return null;
        }

        [$readers, $keyTypes, $how] = $read;
        $keys = [];

        foreach ($keyTypes as $keyType)
        {
            array_push($keys, ...FormRequestScope::keysNamedBy($keyType));
        }

        // No keys is no read: `$safe->all()`, `$this->validated()` or `$safe->only([])` leave nothing to check.
        return $keys === [] ? null : [$readers, $keys, $how, $node->getStartLine()];
    }

    /**
     * The request classes a node reads for, the types of what names its keys, and how it reads; null when it isn't a
     * read.
     *
     * @return array{non-empty-list<string>, list<Type>, string}|null
     */
    private function read(Expr $node, Scope $scope): ?array
    {
        if ($scope->isInExpressionAssign($node))
        {
            return null;
        }

        $inRequest = FormRequestScope::requestClass($scope);

        if ($node instanceof StaticCall)
        {
            return $this->staticRead($node, $scope);
        }

        if ($node instanceof ArrayDimFetch)
        {
            return $inRequest !== null && $node->dim !== null && $this->isValidatedInput($node->var, $scope)
                ? [[$inRequest], [$scope->getType($node->dim)], '[]']
                : null;
        }

        if ($node instanceof PropertyFetch)
        {
            if ($inRequest === null || ! $this->isValidatedInput($node->var, $scope))
            {
                return null;
            }

            $keyType = $node->name instanceof Identifier
                ? $scope->getTypeFromValue($node->name->name)
                : $scope->getType($node->name);

            return [[$inRequest], [$keyType], '->property'];
        }

        if (! $node instanceof MethodCall || ! $node->name instanceof Identifier)
        {
            return null;
        }

        $name = strtolower($node->name->name);
        $how = $node->name->name.'()';
        $args = $node->getArgs();

        if (! $this->isValidatedInput($node->var, $scope))
        {
            // Only the request classes in the type: `?OtherRequest` or `OtherRequest|Foo` still names OtherRequest.
            $receiver = TypeCombinator::removeNull($scope->getType($node->var));

            return $this->readOnRequest($receiver->getObjectClassReflections(), $name, $how, $args, $scope);
        }

        if ($inRequest === null)
        {
            return null;
        }

        $keyArgs = match (true)
        {
            in_array($name, self::ONE_KEY_METHODS, true) => $this->argument($args, 'key'),
            // Several positional arguments are several keys: `only('a', 'b')` is `only(['a', 'b'])`.
            in_array($name, self::KEY_LIST_METHODS, true) => array_values($args),
            default => [],
        };

        return [[$inRequest], $this->types($keyArgs, $scope), $how];
    }

    /**
     * `parent::validated('x')`, `self::…` or `static::…` inside a request: the instance that runs it is the class the
     * code is in, whichever class declares the method.
     *
     * @return array{non-empty-list<string>, list<Type>, string}|null
     */
    private function staticRead(StaticCall $node, Scope $scope): ?array
    {
        $class = $scope->getClassReflection();

        if ($class === null
            || ! $node->class instanceof Name
            || ! in_array($node->class->toLowerString(), ['parent', 'self', 'static'], true)
            || ! $node->name instanceof Identifier)
        {
            return null;
        }

        $how = $node->class->toString().'::'.$node->name->name.'()';

        return $this->readOnRequest([$class], strtolower($node->name->name), $how, $node->getArgs(), $scope);
    }

    /**
     * `validated()`, `safe()` or a `ReadsValidatedInput` helper, called on a request.
     *
     * @param  list<ClassReflection>  $receivers
     * @param  array<Arg>  $args
     * @return array{non-empty-list<string>, list<Type>, string}|null
     */
    private function readOnRequest(array $receivers, string $name, string $how, array $args, Scope $scope): ?array
    {
        $readers = [];
        $keyArgs = [];

        foreach ($receivers as $class)
        {
            if (! $class->isSubclassOf(FormRequest::class))
            {
                continue;
            }

            $keyParameter = match ($name)
            {
                'validated' => 'key',
                'safe' => 'keys',
                default => self::helperKeyParameter($class, $name),
            };

            if ($keyParameter !== null)
            {
                $readers[] = $class->getName();
                $keyArgs = $this->argument($args, $keyParameter);
            }
        }

        return $readers === [] ? null : [$readers, $this->types($keyArgs, $scope), $how];
    }

    /**
     * The name of the parameter a `ReadsValidatedInput` method takes its key in, its first, when the class has the
     * trait, through a parent or another trait too, and the method is one of the trait's or an alias of one; otherwise
     * null.
     *
     * Found by reflection rather than listed, so a new helper in the trait is checked without changing this collector.
     */
    private static function helperKeyParameter(ClassReflection $class, string $method): ?string
    {
        foreach ([$class, ...$class->getParents()] as $classOrParent)
        {
            $trait = $classOrParent->getTraits(true)[ReadsValidatedInput::class] ?? null;

            // `use ReadsValidatedInput { validatedStringOrNull as stringOrNull; }` maps the alias to "Trait::method".
            foreach ($classOrParent->getNativeReflection()->getTraitAliases() as $alias => $original)
            {
                [$originalTrait, $originalMethod] = explode('::', $original, 2);

                if (strtolower($alias) === $method && $originalTrait === ReadsValidatedInput::class)
                {
                    $method = $originalMethod;
                }
            }

            if ($trait !== null && $trait->hasNativeMethod($method))
            {
                $parameters = $trait->getNativeMethod($method)->getOnlyVariant()->getParameters();

                return ($parameters[0] ?? null)?->getName();
            }
        }

        return null;
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

    /**
     * @param  list<Arg>  $args
     * @return list<Type>
     */
    private function types(array $args, Scope $scope): array
    {
        return array_map(static fn (Arg $arg): Type => $scope->getType($arg->value), $args);
    }

    private function isValidatedInput(Expr $expr, Scope $scope): bool
    {
        return new ObjectType(ValidatedInput::class)->isSuperTypeOf(TypeCombinator::removeNull($scope->getType($expr)))->yes();
    }
}
