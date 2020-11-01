import { defaultRenderSettings, IRenderSettings } from "../../helpers";
import { ValueTypes } from "./value";

export class VariableReference {

    constructor(
        public name: string,
        public parent?: ValueTypes,
        public scoped: boolean = false
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = this.name;
        if (this.parent) {
            acc = this.parent.render(settings) + (this.scoped ? "::" : ".") + acc;
        }
        return acc;
    }
}