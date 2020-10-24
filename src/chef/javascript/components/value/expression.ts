import { JSToken, stringToTokens, tokenToKeywordMap } from "../../javascript";
import { TokenReader, IRenderSettings, makeRenderSettings, IRenderable } from "../../../helpers";
import { VariableReference, tokenAsIdent } from "./variable";
import { IValue, Value, Type, nullValue } from "./value";
import { ArgumentList } from "../constructs/function";
import { Statements } from "../statements/statement";
import { ObjectLiteral } from "./object";
import { FunctionDeclaration } from "../constructs/function";
import { ArrayLiteral } from "./array";
import { TemplateLiteral } from "./template-literal";
import { RegExpLiteral } from "./regex";
import { ClassDeclaration } from "../constructs/class";
import { TypeSignature } from "../types/type-signature";
import { AsExpression } from "../types/statements";
import { Group } from "./group";

/**
 * All operations:
 */
export enum Operation {
    Assign, Index, Group,
    Initialize, Call,

    StrictEqual, StrictNotEqual, Equal, NotEqual,
    Add, Subtract, Multiply, Divide, Modulo, Exponent,
    GreaterThan, LessThan, LessThanEqual, GreaterThanEqual,

    InstanceOf, Of, In,

    Spread,
    UnaryPlus, UnaryNegation,
    BitShiftLeft, BitShiftRight, BitUShiftRight,
    BitNot, BitAnd, BitXOr, BitOr,
    LogNot, LogAnd, LogOr,

    AddAssign, SubtractAssign, MultiplyAssign, DivideAssign, ModuloAssign, ExponentAssign,
    BitShiftLeftAssign, BitShiftRightAssign, BitUShiftRightAssign, BitAndAssign, BitXOrAssign, BitOrAssign,

    PrefixIncrement, PostfixIncrement, PostfixDecrement, PrefixDecrement,

    Await, TypeOf, Void, Delete, Yield, DelegatedYield,
    NullCoalescing, OptionalChain, OptionalCall, OptionalIndex,
    Ternary,
}

/**
 * A map of operations that take part *between* two values
 */
const binaryOperators = new Map([
    [JSToken.Plus, Operation.Add],
    [JSToken.PlusAssign, Operation.AddAssign],
    [JSToken.Minus, Operation.Subtract],
    [JSToken.SubtractAssign, Operation.SubtractAssign],
    [JSToken.Multiply, Operation.Multiply],
    [JSToken.MultiplyAssign, Operation.MultiplyAssign],
    [JSToken.Divide, Operation.Divide],
    [JSToken.DivideAssign, Operation.DivideAssign],
    [JSToken.Exponent, Operation.Exponent],
    [JSToken.ExponentAssign, Operation.ExponentAssign],
    [JSToken.Percent, Operation.Modulo],
    [JSToken.Equal, Operation.Equal],
    [JSToken.NotEqual, Operation.NotEqual],
    [JSToken.StrictEqual, Operation.StrictEqual],
    [JSToken.StrictNotEqual, Operation.StrictNotEqual],
    [JSToken.LogicalOr, Operation.LogOr],
    [JSToken.LogicalAnd, Operation.LogAnd],
    [JSToken.OpenAngle, Operation.LessThan],
    [JSToken.LessThanEqual, Operation.LessThanEqual],
    [JSToken.CloseAngle, Operation.GreaterThan],
    [JSToken.GreaterThanEqual, Operation.GreaterThanEqual],
    [JSToken.In, Operation.In],
    [JSToken.InstanceOf, Operation.InstanceOf],
    [JSToken.Assign, Operation.Assign],
    [JSToken.Exponent, Operation.Exponent],
    [JSToken.BitwiseAnd, Operation.BitAnd],
    [JSToken.BitwiseOr, Operation.BitOr],
    [JSToken.BitwiseXor, Operation.BitXOr],
    [JSToken.BitwiseShiftLeft, Operation.BitShiftLeft],
    [JSToken.BitwiseShiftRight, Operation.BitShiftRight],
    [JSToken.UnaryBitwiseShiftRight, Operation.BitUShiftRight],
    [JSToken.NullishCoalescing, Operation.NullCoalescing],
]);

// Create a map to make binary token lookup easy TODO why
const binaryOperatorToToken = new Map(Array.from(binaryOperators).map(([t, o]) => [o, t]));

// These infix operators require whitespace around when rendering to prevent clashing
const nonSymbolBinary = new Set([Operation.In, Operation.InstanceOf]);

// These are operations that can be chained
const valueThings = new Set([JSToken.OpenBracket, JSToken.OpenSquare, JSToken.Dot, JSToken.Increment, JSToken.Decrement, JSToken.OptionalChain]);

const operators = new Map([
    [JSToken.Yield, Operation.Yield],
    [JSToken.DelegatedYield, Operation.DelegatedYield],
    [JSToken.OpenBracket, Operation.Call],
    [JSToken.OpenSquare, Operation.Index],
    [JSToken.Spread, Operation.Spread],
    [JSToken.New, Operation.Initialize],
    [JSToken.TypeOf, Operation.TypeOf],
    [JSToken.LogicalNot, Operation.LogNot],
    [JSToken.BitwiseNot, Operation.BitNot],
    [JSToken.Await, Operation.Await],
    [JSToken.Void, Operation.Void],
    [JSToken.Delete, Operation.Delete],
    [JSToken.Plus, Operation.UnaryPlus],
    [JSToken.Minus, Operation.UnaryNegation],
    [JSToken.OptionalChain, Operation.OptionalChain],
]);

const otherOperators = new Set(operators.values());

// TODO temp Added for rendering
otherOperators.add(Operation.OptionalChain);
otherOperators.add(Operation.OptionalCall);
otherOperators.add(Operation.OptionalIndex);
otherOperators.add(Operation.PrefixIncrement);
otherOperators.add(Operation.PrefixDecrement);
otherOperators.add(Operation.PostfixIncrement);
otherOperators.add(Operation.PostfixDecrement);

/*
    From: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence
    left out: Dot, constructor without (), comma 
*/
const operationPrecedence = new Map([
    [Operation.Group, 21],
    [Operation.Index, 20],
    [Operation.Initialize, 20],
    [Operation.Call, 20],
    [Operation.PostfixIncrement, 18],
    [Operation.PostfixDecrement, 18],
    [Operation.LogNot, 17],
    [Operation.BitNot, 17],
    [Operation.UnaryPlus, 17],
    [Operation.UnaryNegation, 17],
    [Operation.PrefixIncrement, 17],
    [Operation.PrefixDecrement, 17],
    [Operation.TypeOf, 17],
    [Operation.Await, 17],
    [Operation.Delete, 17],
    [Operation.Void, 17],
    [Operation.Exponent, 16],
    [Operation.Multiply, 15],
    [Operation.Divide, 15],
    [Operation.Modulo, 15],
    [Operation.Add, 14],
    [Operation.Subtract, 14],
    [Operation.BitShiftLeft, 13],
    [Operation.BitShiftRight, 13],
    [Operation.BitUShiftRight, 13],
    [Operation.LessThan, 12],
    [Operation.LessThanEqual, 12],
    [Operation.GreaterThan, 12],
    [Operation.GreaterThanEqual, 12],
    [Operation.In, 12],
    [Operation.InstanceOf, 12],
    [Operation.Equal, 11],
    [Operation.NotEqual, 11],
    [Operation.StrictEqual, 11],
    [Operation.StrictNotEqual, 11],
    [Operation.BitAnd, 10],
    [Operation.BitXOr, 9],
    [Operation.BitOr, 8],
    [Operation.NullCoalescing, 7],
    [Operation.LogAnd, 6],
    [Operation.LogOr, 5],
    [Operation.Ternary, 4],
    [Operation.Assign, 3],
    [Operation.AddAssign, 3],
    [Operation.SubtractAssign, 3],
    [Operation.ExponentAssign, 3],
    [Operation.MultiplyAssign, 3],
    [Operation.DivideAssign, 3],
    [Operation.ModuloAssign, 3],
    [Operation.BitShiftLeftAssign, 3],
    [Operation.BitShiftRightAssign, 3],
    [Operation.BitUShiftRightAssign, 3],
    [Operation.BitAndAssign, 3],
    [Operation.BitXOrAssign, 3],
    [Operation.BitOrAssign, 3],
    [Operation.Yield, 2],
    [Operation.DelegatedYield, 2],
]);

/**
 * Represents a expression with a LHS, operation (and a possible RHS)
 * Note than the LHS is not always left hand side visually. E.g for `!x` -> lhs = x
 */
export class Expression implements IRenderable {

    public lhs: IValue;
    public operation: Operation;
    public rhs: IValue | ArgumentList | null;

    constructor({
        lhs,
        operation,
        rhs = null
    }: { lhs: IValue, operation: Operation, rhs?: IValue | ArgumentList | null }) {
        this.lhs = lhs;
        this.operation = operation;
        this.rhs = rhs;

        if (
            operation === Operation.Call
            || operation === Operation.Initialize
            || operation === Operation.OptionalCall
        ) {
            if (!rhs) {
                this.rhs = new ArgumentList();
            } else if (!(rhs instanceof ArgumentList)) {
                this.rhs = new ArgumentList([rhs]);
            }
        }
    }

    render(partialSettings: Partial<IRenderSettings> = {}): string {
        const settings = makeRenderSettings(partialSettings);
        if (otherOperators.has(this.operation) || this.operation === Operation.Ternary) {
            switch (this.operation) {
                case Operation.Call:
                    return this.lhs.render(settings) + this.rhs!.render(settings);
                case Operation.Index:
                    return `${this.lhs.render(settings)}[${this.rhs!.render(settings)}]`;
                case Operation.TypeOf:
                    return `typeof ${this.lhs.render(settings)}`;
                case Operation.Initialize:
                    return `new ${this.lhs.render(settings)}${this.rhs!.render(settings)}`;
                case Operation.Ternary:
                    let acc = this.lhs.render(settings);
                    if (!settings.minify) acc += " ";
                    acc += "?"
                    const lhs = (this.rhs as ArgumentList).args[0].render(settings);
                    acc += settings.minify ? `${lhs}:` : ` ${lhs} : `;
                    acc += (this.rhs as ArgumentList).args[1].render(settings);
                    return acc;
                case Operation.Await:
                    return `await ${this.lhs.render(settings)}`;
                case Operation.LogNot:
                    return "!" + this.lhs.render(settings);
                case Operation.PrefixIncrement:
                    return "++" + this.lhs.render(settings);
                case Operation.PrefixDecrement:
                    return "--" + this.lhs.render(settings);
                case Operation.PostfixIncrement:
                    return this.lhs.render(settings) + "++";
                case Operation.PostfixDecrement:
                    return this.lhs.render(settings) + "--";
                case Operation.UnaryPlus:
                    return "+" + this.lhs.render(settings);
                case Operation.UnaryNegation:
                    return "-" + this.lhs.render(settings);
                case Operation.Spread:
                    return "..." + this.lhs.render(settings);
                case Operation.OptionalChain:
                case Operation.OptionalCall:
                    return this.lhs.render(settings) + "?." + this.rhs!.render(settings);
                case Operation.OptionalIndex:
                    return `${this.lhs.render(settings)}?.[${this.rhs!.render(settings)}]`;
                case Operation.Yield:
                    return `yield ${this.lhs.render(settings)}`;
                case Operation.DelegatedYield:
                    return `yield* ${this.lhs.render(settings)}`;
                default:
                    throw Error(`Cannot render operation: ${Operation[this.operation]}`);
            }
        } else if (binaryOperatorToToken.has(this.operation)) {
            const token = binaryOperatorToToken.get(this.operation);
            const value = tokenToKeywordMap.get(token!);

            if (nonSymbolBinary.has(this.operation) || !settings.minify) {
                return `${this.lhs.render(settings)} ${value} ${this.rhs!.render(settings)}`;
            } else {
                return `${this.lhs.render(settings)}${value}${this.rhs!.render(settings)}`;
            }
        } else {
            throw Error(`Cannot render operation: ${Operation[this.operation]}`);
        }
    }

    static fromString(string: string) {
        const reader = stringToTokens(string);
        const expression = Expression.fromTokens(reader);
        reader.expect(JSToken.EOF);
        return expression;
    }

    static fromTokens(reader: TokenReader<JSToken>, precedence = 0): IValue {
        //@ts-ignore TODO expression requires parameters
        const expression = new Expression({ lhs: null, operation: null });
        switch (reader.current.type) {
            // Value types:
            case JSToken.NumberLiteral:
                const number = reader.current.value!;
                if (number.endsWith("n")) {
                    expression.lhs = new Value(number, Type.bigint);
                } else {
                    expression.lhs = new Value(number, Type.number);
                }
                reader.move();
                break;
            case JSToken.Identifier:
                if (reader.peek()?.type === JSToken.ArrowFunction) {
                    return FunctionDeclaration.fromTokens(reader);
                }
                if (reader.peek()?.type === JSToken.TemplateLiteralStart) {
                    expression.lhs = TemplateLiteral.fromTokens(reader)
                } else {
                    expression.lhs = new VariableReference(reader.current.value!);
                    reader.move();
                }
                break;
            case JSToken.True:
            case JSToken.False:
                expression.lhs = new Value(reader.current.type === JSToken.True ? "true" : "false", Type.boolean);
                reader.move();
                break;
            case JSToken.StringLiteral:
                expression.lhs = new Value(reader.current.value!, Type.string);
                reader.move();
                break;
            case JSToken.OpenSquare:
                expression.lhs = ArrayLiteral.fromTokens(reader);
                break;
            case JSToken.OpenBracket:
                // Tests for what is after closing bracket () * <-
                let bracketCount = 0;
                let isArrowFunction: boolean = false;
                try {
                    const afterBrackets = reader.run((tokenType) => {
                        if (tokenType === JSToken.OpenBracket) bracketCount++;
                        else if (tokenType === JSToken.CloseBracket) bracketCount--;
                        if (bracketCount === 0) return true;
                        else return false;
                    }, true);
                    isArrowFunction = afterBrackets[0] === JSToken.ArrowFunction;
                } catch (error) {
                    // TODO temp ???
                    reader.throwError("Unmatched closing brackets");
                }
                if (isArrowFunction) {
                    return FunctionDeclaration.fromTokens(reader);
                } else {
                    reader.move();
                    const group = new Group(Expression.fromTokens(reader));
                    reader.expect(JSToken.CloseBracket);
                    reader.move();
                    expression.lhs = group;
                }
                break;
            case JSToken.OpenCurly:
                return ObjectLiteral.fromTokens(reader);
            case JSToken.Null:
                reader.move();
                return nullValue;
            case JSToken.Undefined:
                reader.move();
                return new Value(null, Type.undefined); // TODO return undefinedValue ?
            case JSToken.Async:
            case JSToken.Function:
                return FunctionDeclaration.fromTokens(reader);
            case JSToken.RegexLiteral:
                expression.lhs = RegExpLiteral.fromTokens(reader);
                break;
            case JSToken.TemplateLiteralStart:
                expression.lhs = TemplateLiteral.fromTokens(reader);
                break;
            case JSToken.Class:
                return ClassDeclaration.fromTokens(reader, { isExpression: true });
            // Unary operators / prefixes:
            case JSToken.Increment:
            case JSToken.Decrement:
                const operationType = reader.current.type === JSToken.Increment ? Operation.PrefixIncrement : Operation.PrefixDecrement;
                reader.move();
                expression.lhs = new Expression({
                    lhs: Expression.fromTokens(reader, operationPrecedence.get(operationType)),
                    operation: operationType
                });
                break;
            case JSToken.Spread:
                reader.move();
                return new Expression({
                    lhs: Expression.fromTokens(reader),
                    operation: Operation.Spread
                });
            case JSToken.Yield:
                reader.move();
                expression.lhs = new Expression({
                    lhs: Expression.fromTokens(reader, operationPrecedence.get(Operation.Yield)),
                    operation: Operation.Yield
                });
                break;
            case JSToken.DelegatedYield:
                reader.move();
                expression.lhs = new Expression({
                    lhs: Expression.fromTokens(reader, operationPrecedence.get(Operation.DelegatedYield)),
                    operation: Operation.DelegatedYield
                });
                break;
            case JSToken.Await:
                reader.move();
                return new Expression({
                    lhs: Expression.fromTokens(reader, operationPrecedence.get(Operation.Await)),
                    operation: Operation.Await
                });
            case JSToken.LogicalNot:
            case JSToken.BitwiseNot:
            case JSToken.Plus:
            case JSToken.Minus:
            case JSToken.Await:
            case JSToken.Void:
            case JSToken.Delete:
            case JSToken.TypeOf:
                const operator = operators.get(reader.current.type)!;
                reader.move();
                expression.lhs = new Expression({
                    lhs: Expression.fromTokens(reader, operationPrecedence.get(operator)),
                    operation: operator
                });
                break;
            case JSToken.New:
                reader.move();
                const constructor_ = Expression.fromTokens(reader, operationPrecedence.get(Operation.Initialize));
                let args: ArgumentList;
                if (reader.current.type as JSToken === JSToken.OpenBracket) {
                    args = ArgumentList.fromTokens(reader);
                } else {
                    args = new ArgumentList;
                }
                expression.lhs = new Expression({
                    lhs: constructor_,
                    operation: Operation.Initialize,
                    rhs: args
                });
                break;
            // Other
            case JSToken.EOF:
                return expression;
            default:
                try {
                    const tokenName = tokenAsIdent(reader.current.type);
                    expression.lhs = new VariableReference(tokenName);
                    reader.move();
                    break;
                } catch {
                    reader.throwExpect("Expected value");
                }
        }

        // Postfix operators that don't quite fit into binary and can be chained
        while (valueThings.has(reader.current.type)) {
            switch (reader.current.type as JSToken) {
                // Chain
                case JSToken.Dot: {
                    reader.move();
                    const prop = reader.current.value || tokenAsIdent(reader.current.type);
                    expression.lhs = new VariableReference(prop, expression.lhs);
                    reader.move();
                    break;
                }
                // Optional Chain
                case JSToken.OptionalChain: {
                    reader.move();
                    if (reader.current.type === JSToken.OpenBracket) {
                        const args = ArgumentList.fromTokens(reader);
                        expression.lhs = new Expression({
                            lhs: expression.lhs,
                            operation: Operation.OptionalCall,
                            rhs: args
                        });
                    } else if (reader.current.type === JSToken.OpenSquare) {
                        reader.move();
                        const expr = Expression.fromTokens(reader);
                        reader.move();
                        expression.lhs = new Expression({
                            lhs: expression.lhs,
                            operation: Operation.OptionalIndex,
                            rhs: expr
                        });
                    } else {
                        const prop = reader.current.value || tokenAsIdent(reader.current.type);
                        reader.move();
                        expression.lhs = new Expression({
                            lhs: expression.lhs,
                            operation: Operation.OptionalChain,
                            rhs: new VariableReference(prop)
                        });
                    }
                    break;
                }
                // Call
                case JSToken.OpenBracket:
                    if (operationPrecedence.get(Operation.Call)! <= precedence) {
                        return expression.lhs;
                    }
                    const args = ArgumentList.fromTokens(reader);
                    expression.lhs = new Expression({ lhs: expression.lhs, operation: Operation.Call, rhs: args });
                    break;
                // Index
                case JSToken.OpenSquare:
                    if (operationPrecedence.get(Operation.Call)! <= precedence) {
                        return expression.lhs;
                    }
                    reader.move();
                    const indexer = Expression.fromTokens(reader);
                    reader.expectNext(JSToken.CloseSquare);
                    expression.lhs = new Expression({ lhs: expression.lhs, operation: Operation.Index, rhs: indexer });
                    break;
                // Postfix increment & decrement
                case JSToken.Increment:
                case JSToken.Decrement:
                    const operation = reader.current.type === JSToken.Increment ? Operation.PostfixIncrement : Operation.PostfixDecrement;
                    reader.move();
                    expression.lhs = new Expression({ lhs: expression.lhs, operation });
                    break;
            }
        }

        while (reader.current) {
            if (binaryOperators.has(reader.current.type)) {
                const operator = binaryOperators.get(reader.current.type)!;
                const newPrecedence = operationPrecedence.get(operator)!;
                if (newPrecedence <= precedence) {
                    break;
                }
                if (expression.operation !== null) {
                    expression.lhs = new Expression({
                        lhs: expression.lhs,
                        operation: expression.operation,
                        rhs: expression.rhs
                    });
                }
                expression.operation = operator;
                reader.move();
                expression.rhs = Expression.fromTokens(reader, newPrecedence);
                // @ts-ignore
            } else if (reader.current.type === JSToken.QuestionMark) {
                if (operationPrecedence.get(Operation.Ternary)! < precedence) {
                    break;
                }
                reader.move();
                const lhs = Expression.fromTokens(reader);
                reader.expectNext(JSToken.Colon);
                const rhs = Expression.fromTokens(reader);
                return new Expression({
                    lhs: expression.operation !== null ? expression : expression.lhs,
                    operation: Operation.Ternary,
                    rhs: new ArgumentList([lhs, rhs])
                });
            } else if (reader.current.type === JSToken.As) {
                reader.move();
                const typeArg = TypeSignature.fromTokens(reader);
                // TODO does not work for `x as string + ""`. Need to incorporate into binary operators with a special case. Not sure of the precedence of the as "operator"
                return new AsExpression(expression.operation !== null ? expression : expression.lhs, typeArg);
            } else {
                break;
            }
        }

        return expression.operation === null ? expression.lhs : expression;
    }
}