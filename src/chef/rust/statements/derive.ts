import { IRenderable, IRenderSettings, IRenderOptions } from "../../helpers";

export class DeriveStatement implements IRenderable {
    constructor (
        public traits: Array<string>
    ) {}

    render(settings: IRenderSettings, options?: Partial<IRenderOptions>): string {
        return `#[derive(${this.traits.join(", ")})]`;
    }
}