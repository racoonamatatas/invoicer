<?php

declare(strict_types = 1);

namespace Tests\PHPStan;

use PhpParser\Node\Expr\FuncCall;
use PHPStan\Analyser\Scope;
use PHPStan\Reflection\FunctionReflection;
use PHPStan\Reflection\ParameterReflection;
use PHPStan\Type\FunctionParameterClosureThisExtension;
use PHPStan\Type\ObjectType;
use PHPStan\Type\Type;
use PHPUnit\Framework\TestCase as PhpUnitTestCase;
use Tests\TestCase;

/**
 * Tells PHPStan what `$this` is inside a Pest test closure.
 *
 * Pest annotates the closure as `@param-closure-this TestCall`, but at runtime Pest binds it to the test case class
 * that tests/Pest.php picks for the file's folder. Without this, every `$this->getJson()` is an undefined method.
 *
 * The folder mapping mirrors the `pest()->extend()->in()` calls in tests/Pest.php and has to change with them.
 */
final class PestClosureThisExtension implements FunctionParameterClosureThisExtension
{
    private const array FUNCTIONS = ['test', 'it', 'beforeEach', 'afterEach'];

    // Folders, relative to tests/, whose tests run on Tests\TestCase. Everything else gets PHPUnit's TestCase.
    private const array APP_TEST_CASE_FOLDERS = ['Feature/', 'Unit/Validation/'];

    public function isFunctionSupported(FunctionReflection $functionReflection, ParameterReflection $parameter): bool
    {
        return in_array($functionReflection->getName(), self::FUNCTIONS, true) && $parameter->getName() === 'closure';
    }

    public function getClosureThisTypeFromFunctionCall(
        FunctionReflection $functionReflection,
        FuncCall $functionCall,
        ParameterReflection $parameter,
        Scope $scope,
    ): Type {
        $pathInTests = substr($scope->getFile(), strlen(dirname(__DIR__).'/'));

        foreach (self::APP_TEST_CASE_FOLDERS as $folder)
        {
            if (str_starts_with($pathInTests, $folder))
            {
                return new ObjectType(TestCase::class);
            }
        }

        return new ObjectType(PhpUnitTestCase::class);
    }
}
