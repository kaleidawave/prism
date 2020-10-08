import { JSToken, stringToTokens } from "../../javascript";
import { IValue, Type, Value } from "./value";
import { IRenderSettings, TokenReader, IConstruct, defaultRenderSettings } from "../../../helpers";
import { Expression, Operation } from "./expression";

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
        default: throw Error(`No conversion for token ${JSToken[token]}`);
    }
}

/**
 * Class that represents a variable reference
 */
export class VariableReference implements IConstruct {

    parent?: IValue;
    name: string;

    constructor(name: string, parent?: IValue) {
        this.name = name;
        if (parent) this.parent = parent;
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = this.name;
        if (this.parent) {
            acc = this.parent.render(settings) + '.' + acc;
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
    get tail(): IValue {
        let cur: IValue = this;
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
    static fromChain(...items: Array<string | number | IValue>): IValue {
        let head: IValue;
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
                    rhs: new Value(currentProp, Type.number)
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