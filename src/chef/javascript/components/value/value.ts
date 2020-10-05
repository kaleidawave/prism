import { IRenderSettings, defaultRenderSettings, IConstruct } from "../../../helpers";
import type { TemplateLiteral } from "./template-literal";
import type { Expression } from "./expression";
import type { ObjectLiteral } from "./object";
import type { ArrayLiteral } from "./array";
import type { RegExpLiteral } from "./regex";
import type { Group } from "./group";
import type { VariableReference } from "./variable";
import type { FunctionDeclaration } from "../constructs/function";
import type { ClassDeclaration } from "../constructs/class";

// All constructs that can be used as values:
export type IValue = Value
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

/**
 * Represents string literals, number literals (inc bigint), boolean literals, "null" and "undefined"
 */
export class Value implements IConstruct {
    value: string | null; // TODO value is null if value is undefined

    constructor(
        value: string | number | boolean | null,
        public type: Type,
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

    render(settings: IRenderSettings = defaultRenderSettings): string {
        if (this.type === Type.string) {
            // Place string value + escape double quotes
            return `"${this.value?.replace(/"/g, "\\\"")}"`;
        } else if (this.type === Type.undefined) {
            return "undefined";
        } else {
            return this.value!; // TODO temp impl for null
        }
    }
}

export const nullValue = Object.freeze(new Value("null", Type.object));