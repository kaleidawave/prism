import { IRenderable, IRenderOptions, IRenderSettings } from "../../helpers";

export class ModStatement implements IRenderable {
    constructor (
        public name: string,
        public isPublicCrate: boolean = false
    ) {}

    render(settings: IRenderSettings, options?: Partial<IRenderOptions>): string {
        let acc = "";
        if (this.isPublicCrate) acc += "pub(crate) ";
        return acc + "mod " + this.name;
    }
}