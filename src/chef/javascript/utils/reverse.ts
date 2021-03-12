import { ValueTypes, Value, Type } from "../components/value/value";
import { TemplateLiteral } from "../components/value/template-literal";
import { Expression, Operation, VariableReference } from "../components/value/expression";
import { FunctionDeclaration, ArgumentList } from "../components/constructs/function";
import { ReturnStatement } from "../components/statements/statement";
import { Group } from "../components/value/group";
import { replaceVariables, cloneAST } from "./variables";
import { ObjectLiteral } from "../components/value/object";

/**
 * Attempts to build a function that given the evaluated value as the argument will return the variable
 * Used by Prism to build get bindings from non straight variables.
 * TODO Chef really needs a interpreter to do this.
 * TODO only accepts expression has one variables. Should consider other variables in the expression as arguments 
 * @param expression 
 */
export function buildReverseFunction(expression: ValueTypes, targetVariable: Array<string>): FunctionDeclaration {
    const func = new FunctionDeclaration(null, ["value"], [], { bound: false });
    const reverseExpression = reverseValue(cloneAST(expression), targetVariable);
    func.statements.push(new ReturnStatement(reverseExpression));
    return func;
}

function arraysEqual<T>(array1: Array<T>, array2: Array<T>): boolean {
    if (array1.length !== array2.length) {
        return false;
    }
    for (let i = 0; i < array1.length; i++) {
        if (array1[i] !== array2[i]) {
            return false;
        }
    }
    return true;
}

const value = new VariableReference("value");

export function reverseValue(expression: ValueTypes | ArgumentList, targetVariable: Array<string>): ValueTypes {
    if (expression instanceof VariableReference) {
        if (arraysEqual(expression.toChain(), targetVariable)) {
            return value;
        } else {
            return expression;
        }
    } else if (expression instanceof Value) {
        return expression;
    } else if (expression instanceof TemplateLiteral) {
        return reverseTemplateLiteral(expression);
    } else if (expression instanceof Expression) {
        const lhs = reverseValue(expression.lhs, targetVariable);
        const rhs = expression.rhs ? reverseValue(expression.rhs, targetVariable) : null;
        let reversedOperation: Operation;
        switch (expression.operation) {
            case Operation.Add: reversedOperation = Operation.Subtract; break; // TODO this assumes + numbers and not from string concatenation
            case Operation.Subtract: reversedOperation = Operation.Add; break;
            case Operation.Multiply: reversedOperation = Operation.Divide; break;
            case Operation.Divide: reversedOperation = Operation.Multiply; break;
            case Operation.LogNot: reversedOperation = Operation.LogNot; break; // TODO this will only work for booleans
            default: throw Error(`Cannot reverse operation ${Operation[expression.operation]}`);
        }
        return new Expression({ lhs, rhs, operation: reversedOperation });
    } else if (expression instanceof ObjectLiteral) {
        // TODO catch undefined here:
        // TODO what about nested object literals
        const firstKey = targetVariable[0];
        const matchingValue = expression.values.get(firstKey!);
        const reversedValue = reverseValue(matchingValue!, targetVariable);
        return new VariableReference(firstKey!, reversedValue);
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