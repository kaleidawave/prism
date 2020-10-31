import { IRenderable, IRenderOptions, IRenderSettings } from "../helpers";

/**
 * Represents unstructured rust code as parsing will not be implemented. 
 */
export class DynamicStatement implements IRenderable {
    constructor (
        public rawCode: string
    ) {}

    render(settings: IRenderSettings, options?: Partial<IRenderOptions>): string {
        return this.rawCode;
    }
}