import { IRenderSettings, defaultRenderSettings, IRenderable, TokenReader } from "../../../helpers";
import type { TemplateLiteral } from "./template-literal";
import type { Expression, VariableReference } from "./expression";
import type { ObjectLiteral } from "./object";
import type { ArrayLiteral } from "./array";
import type { RegExpLiteral } from "./regex";
import type { Group } from "./group";
import type { FunctionDeclaration } from "../constructs/function";
import type { ClassDeclaration } from "../constructs/class";
import { JSToken } from "../../javascript";

// All constructs that can be used as values:
export type ValueTypes = Value
    | TemplateLiteral
    | Expression
    | ObjectLiteral
    | ArrayLiteral
    | RegExpLiteral
    | Group
    | FunctionDeclaration
    | ClassDeclaration
    | VariableReference;

export enum Type {
    undefined,
    boolean,
    number,
    string,
    bigint,
    symbol,
    object,
    function,
}

export const literalTypes = new Set([JSToken.NumberLiteral, JSToken.StringLiteral, JSToken.True, JSToken.False]);

/**
 * Represents string literals, number literals (inc bigint), boolean literals, "null" and "undefined"
 */
export class Value implements IRenderable {
    value: string | null; // TODO value is null if value is undefined

    constructor(
        public type: Type,
        value?: string | number | boolean,
    ) {
        if (typeof value === "number" || typeof value === "boolean") {
            this.value = value.toString();
        } else if (typeof value !== "undefined" && value !== null) {
            // Escape new line characters in string
            this.value = value!.replace(/\r?\n/g, "\\n");
        } else {
            this.value = null;
        }
    }

    static fromTokens(reader: TokenReader<JSToken>) {
        let value: Value;
        if (reader.current.type === JSToken.NumberLiteral) {
            value = new Value(Type.number, reader.current.value!);
        } else if (reader.current.type === JSToken.StringLiteral) {
            value = new Value(Type.string, reader.current.value!);
        } else if (reader.current.type === JSToken.True || reader.current.type === JSToken.False) {
            value = new Value(Type.boolean, reader.current.value! === "true");
        } else {
            throw reader.throwExpect("Expected literal value");
        }
        reader.move();
        return value;
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        switch (this.type) {
            case Type.string: return `"${this.value?.replace?.(/"/g, "\\\"") ?? ""}"`;
            case Type.number: return this.value!;
            case Type.bigint: return this.value!;
            case Type.boolean: return this.value!;
            case Type.undefined: return "undefined";
            case Type.object: return "null";
            default: throw Error(`Cannot render value of type "${Type[this.type]}"`)
        }
    }
}

export const nullValue = Object.freeze(new Value(Type.object));