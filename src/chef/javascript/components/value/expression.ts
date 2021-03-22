import { JSToken, stringToTokens, tokenToKeywordMap } from "../../javascript";
import { TokenReader, IRenderSettings, makeRenderSettings, IRenderable, defaultRenderSettings } from "../../../helpers";
import { ValueTypes, Value, Type, nullValue } from "./value";
import { ArgumentList } from "../constructs/function";
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

    public lhs: ValueTypes;
    public operation: Operation;
    public rhs: ValueTypes | ArgumentList | null;

    constructor({
        lhs,
        operation,
        rhs = null
    }: { lhs: ValueTypes, operation: Operation, rhs?: ValueTypes | ArgumentList | null }) {
        this.lhs = lhs;
        this.operation = operation;
        this.rhs = rhs;

        if (
            operation === Operation.Call
            || operation === Operation.Initialize
            || operation === Operation.OptionalCall
        ) {
            if (rhs && !(rhs instanceof ArgumentList)) {
                this.rhs = new ArgumentList([rhs]);
            }
        }
    }

    render(partialSettings: Partial<IRenderSettings> = {}): string {
        const settings = makeRenderSettings(partialSettings);
        if (otherOperators.has(this.operation) || this.operation === Operation.Ternary) {
            switch (this.operation) {
                case Operation.Call:
                    return this.lhs.render(settings) + (this.rhs?.render?.(settings) ?? "()");
                case Operation.Index:
                    return `${this.lhs.render(settings)}[${this.rhs!.render(settings)}]`;
                case Operation.TypeOf:
                    return `typeof ${this.lhs.render(settings)}`;
                case Operation.Initialize:
                    return `new ${this.lhs.render(settings)}${this.rhs?.render?.(settings) ?? "()"}`;
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
                case Operation.Delete:
                    return `delete ${this.lhs.render(settings)}`;
                case Operation.Void:
                    return `void ${this.lhs.render(settings)}`;
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
                    return this.lhs.render(settings) + "?." + (this.rhs?.render?.(settings) ?? "()");
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

    static fromTokens(reader: TokenReader<JSToken>, precedence = 0): ValueTypes {
        let value: ValueTypes | null = null;
        switch (reader.current.type) {
            // Value types:
            case JSToken.NumberLiteral:
                const number = reader.current.value!;
                if (number.endsWith("n")) {
                    value = new Value(Type.bigint, number);
                } else {
                    value = new Value(Type.number, number);
                }
                reader.move();
                break;
            case JSToken.Identifier:
                if (reader.peek()?.type === JSToken.ArrowFunction) {
                    return FunctionDeclaration.fromTokens(reader);
                }
                if (reader.peek()?.type === JSToken.TemplateLiteralStart) {
                    value = TemplateLiteral.fromTokens(reader)
                } else {
                    value = new VariableReference(reader.current.value!);
                    reader.move();
                }
                break;
            case JSToken.True:
            case JSToken.False:
                value = new Value(Type.boolean, reader.current.type === JSToken.True ? "true" : "false");
                reader.move();
                break;
            case JSToken.StringLiteral:
                value = new Value(Type.string, reader.current.value!);
                reader.move();
                break;
            case JSToken.OpenSquare:
                value = ArrayLiteral.fromTokens(reader);
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
                    value = group;
                }
                break;
            case JSToken.OpenCurly:
                return ObjectLiteral.fromTokens(reader);
            case JSToken.Null:
                reader.move();
                return nullValue;
            case JSToken.Undefined:
                reader.move();
                return new Value(Type.undefined);
            case JSToken.Async:
            case JSToken.Function:
                return FunctionDeclaration.fromTokens(reader);
            case JSToken.RegexLiteral:
                value = RegExpLiteral.fromTokens(reader);
                break;
            case JSToken.TemplateLiteralStart:
                value = TemplateLiteral.fromTokens(reader);
                break;
            case JSToken.Class:
                return ClassDeclaration.fromTokens(reader, { isExpression: true });
            // Unary operators / prefixes:
            case JSToken.Increment:
            case JSToken.Decrement:
                const operationType = reader.current.type === JSToken.Increment ? Operation.PrefixIncrement : Operation.PrefixDecrement;
                reader.move();
                value = new Expression({
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
                value = new Expression({
                    lhs: Expression.fromTokens(reader, operationPrecedence.get(Operation.Yield)),
                    operation: Operation.Yield
                });
                break;
            case JSToken.DelegatedYield:
                reader.move();
                value = new Expression({
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
                value = new Expression({
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
                value = new Expression({
                    lhs: constructor_,
                    operation: Operation.Initialize,
                    rhs: args
                });
                break;
            // Other
            case JSToken.EOF:
                reader.throwExpect("Expected expression");
            default:
                try {
                    const tokenName = tokenAsIdent(reader.current.type);
                    value = new VariableReference(tokenName);
                    reader.move();
                    break;
                } catch {
                    reader.throwExpect("Expected value");
                }
        }

        while (valueThings.has(reader.current.type)) {
            switch (reader.current.type as JSToken) {
                // Chain
                case JSToken.Dot: {
                    reader.move();
                    const prop = reader.current.value || tokenAsIdent(reader.current.type);
                    value = new VariableReference(prop, value);
                    reader.move();
                    break;
                }
                // Optional Chain
                case JSToken.OptionalChain: {
                    reader.move();
                    if (reader.current.type === JSToken.OpenBracket) {
                        const args = ArgumentList.fromTokens(reader);
                        value = new Expression({
                            lhs: value,
                            operation: Operation.OptionalCall,
                            rhs: args
                        });
                    } else if (reader.current.type === JSToken.OpenSquare) {
                        reader.move();
                        const expr = Expression.fromTokens(reader);
                        reader.move();
                        value = new Expression({
                            lhs: value,
                            operation: Operation.OptionalIndex,
                            rhs: expr
                        });
                    } else {
                        const prop = reader.current.value || tokenAsIdent(reader.current.type);
                        reader.move();
                        value = new Expression({
                            lhs: value,
                            operation: Operation.OptionalChain,
                            rhs: new VariableReference(prop)
                        });
                    }
                    break;
                }
                // Call
                case JSToken.OpenBracket:
                    if (operationPrecedence.get(Operation.Call)! <= precedence) {
                        return value;
                    }
                    const args = ArgumentList.fromTokens(reader);
                    value = new Expression({ lhs: value, operation: Operation.Call, rhs: args });
                    break;
                // Index
                case JSToken.OpenSquare:
                    if (operationPrecedence.get(Operation.Call)! <= precedence) {
                        return value;
                    }
                    reader.move();
                    const indexer = Expression.fromTokens(reader);
                    reader.expectNext(JSToken.CloseSquare);
                    value = new Expression({ lhs: value, operation: Operation.Index, rhs: indexer });
                    break;
                // Postfix increment & decrement
                case JSToken.Increment:
                case JSToken.Decrement:
                    const operation = reader.current.type === JSToken.Increment ? Operation.PostfixIncrement : Operation.PostfixDecrement;
                    reader.move();
                    value = new Expression({ lhs: value, operation });
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
                reader.move();
                value = new Expression({
                    lhs: value,
                    operation: operator,
                    rhs: Expression.fromTokens(reader, newPrecedence)
                });
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
                    lhs: value,
                    operation: Operation.Ternary,
                    rhs: new ArgumentList([lhs, rhs])
                });
            } else if (reader.current.type === JSToken.As) {
                reader.move();
                const typeArg = TypeSignature.fromTokens(reader);
                // TODO does not work for `x as string + ""`. Need to incorporate into binary operators with a special case. Not sure of the precedence of the as "operator"
                return new AsExpression(value, typeArg);
            } else {
                break;
            }
        }

        return value;
    }
}

// TODO use the reverse tokens map from the tokenizer and complete list
export function tokenAsIdent(token: JSToken) {
    switch (token) {
        case JSToken.Get: return "get";
        case JSToken.Set: return "set";
        case JSToken.Void: return "void";
        case JSToken.Import: return "import";
        case JSToken.This: return "this";
        case JSToken.Super: return "super";
        case JSToken.Default: return "default";
        case JSToken.Class: return "class";
        case JSToken.As: return "as";
        case JSToken.From: return "from";
        case JSToken.Null: return "null";
        case JSToken.Type: return "type";
        case JSToken.Do: return "do";
        case JSToken.Undefined: return "undefined";
        case JSToken.Switch: return "switch";
        case JSToken.Private: return "private";
        case JSToken.True: return "true";
        case JSToken.False: return "false";
        case JSToken.Type: return "type";
        case JSToken.TypeOf: return "typeof";
        case JSToken.Try: return "try";
        case JSToken.Catch: return "catch";
        case JSToken.Delete: return "delete";
        default: throw Error(`No conversion for token ${JSToken[token]}`);
    }
}

/**
 * Class that represents a variable reference
 */
export class VariableReference implements IRenderable {

    parent?: ValueTypes;
    name: string;

    constructor(name: string, parent?: ValueTypes) {
        this.name = name;
        if (parent) this.parent = parent;
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = this.name;
        if (this.parent) {
            acc = this.parent.render(settings) + "." + acc;
        }
        return acc;
    }

    /**
     * Returns the chain of a variable
     * @example this.data.member -> ["this", "data", "member"]
     */
    toChain(): string[] {
        const series = [this.name];
        let parent = this.parent;
        while (parent) {
            if (!(parent instanceof VariableReference)) break; // TODO not sure about this
            series.unshift(parent.name);
            // Temp prevents recursion
            if (parent === parent.parent) throw Error();
            parent = parent.parent;
        }
        return series;
    }

    /**  
     * Returns whether two variable references are equal
     * @param fuzzy will return true if partial tree match, etc x.y === x.y.z
     * TODO refactor to not use .toChain()
     */
    isEqual(variable: VariableReference, fuzzy = false): boolean {
        // If references equal:
        if (this === variable) return true;

        // Else test by equating value
        let variable1chain = this.toChain(),
            variable2chain = variable.toChain();

        if (fuzzy) {
            const minLength = Math.min(variable1chain.length, variable2chain.length);
            variable1chain.length = minLength;
            variable2chain.length = minLength;
        }

        return variable1chain.length === variable2chain.length &&
            variable1chain.every((v, i) => v === variable2chain[i]);
    }

    /**
     * Returns left most parent / value variable exists under
     * Will return self if no parent
     * @example `a.b.c.d.e` -> `a`
     */
    get tail(): ValueTypes {
        let cur: ValueTypes = this;
        while (cur instanceof VariableReference && cur.parent) {
            cur = cur.parent;
        }
        return cur;
    }

    static fromTokens(reader: TokenReader<JSToken>) {
        reader.expect(JSToken.Identifier); // TODO
        let variable = new VariableReference(reader.current.value!);
        reader.move();
        while (reader.current.type === JSToken.Dot) {
            reader.expect(JSToken.Identifier)
            variable = new VariableReference(reader.current.value!, variable);
            reader.move(2);
        }
        return variable;
    }

    /**
     * Helper method for generating a reference to a nested variable
     * @param items 
     * @example ["this", "data", "member"] -> {name: "member", parent: {name: "data", parent: {...}}}
     */
    static fromChain(...items: Array<string | number | ValueTypes>): ValueTypes {
        let head: ValueTypes;
        if (typeof items[0] === "number") { 
            throw Error("First arg to VariableReference.FromChain must be string");
        } else if (typeof items[0] === "string") {
            head = new VariableReference(items[0] as string);
        } else {
            head = items[0];
        }
        // Iterator through items appending forming linked list
        for (let i = 1; i < items.length; i++) {
            const currentProp = items[i];
            if (typeof currentProp === "number") { 
                head = new Expression({
                    lhs: head,
                    operation: Operation.Index,
                    rhs: new Value(Type.number, currentProp)
                });
            } else if (typeof currentProp === "string") {
                head = new VariableReference(currentProp, head);
            } else if (currentProp instanceof VariableReference && currentProp.tail instanceof VariableReference) {
                currentProp.tail.parent = head;
                head = currentProp;
            } else {
                throw Error("Cannot use prop in fromChain");
            }
        }
        return head;
    }

    static fromString(string: string): VariableReference {
        const reader = stringToTokens(string);
        const variable = VariableReference.fromTokens(reader);
        reader.expect(JSToken.EOF);
        return variable;
    }
}