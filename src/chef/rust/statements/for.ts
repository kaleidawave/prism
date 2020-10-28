import { IRenderable, IRenderOptions, IRenderSettings } from "../../helpers";
import { ValueTypes } from "../values/value";
import { renderStatements, StatementTypes } from "./block";

export class ForStatement implements IRenderable {
    constructor (
        public variable: string,
        public subject: ValueTypes,
        public statements: Array<StatementTypes>
    ) {}

    render(settings: IRenderSettings, options?: Partial<IRenderOptions>): string {
        let acc = `for ${this.variable} of ${this.subject.render(settings)} `;
        acc += `{\n${renderStatements(this.statements, settings)}}`;
        return acc;
    }
}