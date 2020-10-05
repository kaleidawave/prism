import { IValue } from "./value";
import { IRenderSettings, ScriptLanguages, IConstruct, defaultRenderSettings } from "../../../helpers";
import { AsExpression } from "../types/statements";

export class Group implements IConstruct {
    constructor(
        public value: IValue
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        // If (x as Thing).doStuff ==> x.doStuff
        if (settings.scriptLanguage !== ScriptLanguages.Typescript && this.value instanceof AsExpression) {
            return this.value.value.render(settings);
        }
        return `(${this.value.render(settings)})`;
    }
}