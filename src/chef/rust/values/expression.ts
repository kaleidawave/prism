import { IRenderable, IRenderOptions, IRenderSettings } from "../../helpers";
import { ArgumentList } from "../statements/function";
import { ValueTypes } from "./value";

export enum Operation {
    Call,
    Borrow, // Not sure whether this is operator but...      
}

export class Expression implements IRenderable {

    constructor(
        public lhs: ValueTypes,
        public operation: Operation,
        public rhs?: ValueTypes | ArgumentList
    ) {
        if (operation === Operation.Call && !(rhs instanceof ArgumentList)) {
            this.rhs = new ArgumentList(rhs ? [rhs] : []);
        }
    }

    render(settings: IRenderSettings, options?: Partial<IRenderOptions>): string {
        switch (this.operation) {
            case Operation.Call:
                return this.lhs.render(settings) + (this.rhs?.render?.(settings) ?? "()");
            case Operation.Borrow:
                return "&" + this.lhs.render(settings);
            default:
                throw Error(`Cannot render operation "${Operation[this.operation]}"`);
        }
    }
}