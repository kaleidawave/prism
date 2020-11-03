import { ValueTypes, Value, Type } from "../components/value/value";
import { TemplateLiteral } from "../components/value/template-literal";
import { Expression, Operation } from "../components/value/expression";
import { FunctionDeclaration, ArgumentList } from "../components/constructs/function";
import { VariableReference } from "../components/value/variable";
import { ReturnStatement } from "../components/statements/statement";
import { Group } from "../components/value/group";
import { replaceVariables, cloneAST } from "./variables";

/**
 * Attempts to build a function that given the evaluated value as the argument will return the variable
 * Used by Prism to build get bindings from non straight variables.
 * TODO Chef really needs a interpreter to do this.
 * TODO only accepts expression has one variables. Should consider other variables in the expression as arguments 
 * @param expression 
 */
export function buildReverseFunction(expression: ValueTypes): FunctionDeclaration {
    const func = new FunctionDeclaration(null, ["value"], [], { bound: false });
    const reverseExpression = reverseValue(cloneAST(expression));
    func.statements.push(new ReturnStatement(reverseExpression));
    return func;
}

const value = new VariableReference("value");

export function reverseValue(expression: ValueTypes | ArgumentList): ValueTypes {

    if (expression instanceof VariableReference) {
        return value;
    } else if (expression instanceof Value) {
        return expression;
    }

    if (expression instanceof TemplateLiteral) {
        return reverseTemplateLiteral(expression);
    } else if (expression instanceof Expression) {
        if (!expression.rhs) throw Error("Cannot reverse expression")
        const lhs = reverseValue(expression.lhs);
        const rhs = reverseValue(expression.rhs);
        let reversedOperation: Operation;
        switch (expression.operation) {
            case Operation.Add: reversedOperation = Operation.Subtract; break; // TODO this assumes + numbers and not from string concatenation
            case Operation.Subtract: reversedOperation = Operation.Add; break;
            case Operation.Multiply: reversedOperation = Operation.Divide; break;
            case Operation.Divide: reversedOperation = Operation.Multiply; break;
            default: throw Error(`Cannot reverse operation ${Operation[expression.operation]}`);
        }
        return new Expression({ lhs, rhs, operation: reversedOperation });
    } else {
        throw Error(`Cannot reverse expression of construct "${expression.constructor.name}"`);
    }
}

/**
 * Attempts to create a slice expression given a template literal implementation
 * Will fail on expressions with more than one value interpolated
 */
export function reverseTemplateLiteral(templateLiteral: TemplateLiteral): Expression {
    if (templateLiteral.entries.filter(entry => typeof entry !== "string").length !== 1) {
        throw Error("Cannot reverse value as has two or more interpolation points");
    } else {
        let startIndex: number = 0;
        // string ${x} ...
        if (typeof templateLiteral.entries[0] === "string") {
            startIndex = templateLiteral.entries[0].length;
        }
        let endLength: number | undefined;
        // `${x} string`
        if (startIndex === 0 && typeof templateLiteral.entries[1] === "string") {
            endLength = templateLiteral.entries[1].length;
        }
        // `... ${x} string`
        else if (typeof templateLiteral.entries[2] === "string") {
            endLength = templateLiteral[2].length;
        }

        const sliceArguments = [startIndex];
        if (typeof endLength !== "undefined") sliceArguments.push(endLength * -1);

        // Returns a slice expression 
        // Slice: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/slice
        return new Expression({
            lhs: VariableReference.fromChain("value", "slice"),
            operation: Operation.Call,
            rhs: new ArgumentList(sliceArguments.map(value => new Value(Type.number, value)))
        });
    }
}

// TODO better place for these:
export function isIIFE(value: ValueTypes) {
    return value instanceof Expression &&
        value.operation === Operation.Call &&
        value.lhs instanceof Group &&
        value.lhs.value instanceof FunctionDeclaration;
}

/**
 * "Flattens" a "iife"
 * @example ((t) => t * 2)(8) -> 8 * 2
 * @param iife a IIFE 
 */
export function compileIIFE(iife: Expression): ValueTypes {
    const func: FunctionDeclaration = (iife.lhs as Group).value as FunctionDeclaration;
    if (func.statements.length !== 1) {
        throw Error("Cannot compile IIFE");
    }
    let statement: ValueTypes | null = cloneAST((func.statements[0] as ReturnStatement).returnValue!);
    if (!statement) throw Error("IIFE must have return value to be compiled");
    for (const [index, value] of (iife.rhs as ArgumentList).args.entries()) {
        const targetArgument = func.parameters[index];
        replaceVariables(statement, value, [targetArgument.toReference()]);
    }
    return statement;
}