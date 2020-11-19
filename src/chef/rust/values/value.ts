import { defaultRenderSettings, IRenderable, IRenderOptions, IRenderSettings } from "../../helpers";
import { ClosureExpression } from "../statements/function";
import { Expression } from "./expression";
import { VariableReference } from "./variable";

export type ValueTypes = Expression | VariableReference | Value | ClosureExpression;

export enum Type {
    boolean,
    number,
    string,
}

export class Value implements IRenderable {
    constructor(public type: Type, public value: string) { 
        if (type === Type.string) this.value = this.value.replace(/\r?\n/g, "\\n");
    }

    render(settings: IRenderSettings = defaultRenderSettings, options?: Partial<IRenderOptions>): string {
        switch (this.type) {
            case Type.boolean: return this.value;
            case Type.number: return this.value;
            case Type.string: return `"${this.value.replace(/"/g, "\\\"")}"`;
        }
    }
}