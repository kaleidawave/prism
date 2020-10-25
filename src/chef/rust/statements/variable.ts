import { defaultRenderSettings, IRenderable, IRenderOptions, IRenderSettings } from "../../helpers";
import { ValueTypes } from "../values/value";

export class VariableDeclaration implements IRenderable {
    constructor(
        public name: string,
        public isMutable: boolean,
        public value?: ValueTypes,
    ) {}
    
    render(settings: IRenderSettings = defaultRenderSettings, options?: Partial<IRenderOptions>): string {
        let acc = "let ";
        if (this.isMutable) acc += "mut ";
        acc += this.name;
        if (this.value) acc += " = " + this.value.render(settings);
        return acc;
    }
}