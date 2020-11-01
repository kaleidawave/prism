import { IRenderable, IRenderOptions, IRenderSettings } from "../../helpers";

export class UseStatement implements IRenderable {
    constructor (
        public path: Array<string | Array<string>>
    ) {}

    render(settings: IRenderSettings, options?: Partial<IRenderOptions>): string {
        return "use " + this.path.map(part => Array.isArray(part) ? `{${part.join(", ")}}` : part).join("::");
    }
}