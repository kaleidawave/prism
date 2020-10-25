import { ValueTypes } from "./value";
import { IRenderSettings, ScriptLanguages, IRenderable, defaultRenderSettings } from "../../../helpers";
import { AsExpression } from "../types/statements";

export class Group implements IRenderable {
    constructor(
        public value: ValueTypes
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        // If (x as Thing).doStuff ==> x.doStuff
        if (settings.scriptLanguage !== ScriptLanguages.Typescript && this.value instanceof AsExpression) {
            return this.value.value.render(settings);
        }
        return `(${this.value.render(settings)})`;
    }
}