import { IRenderable, IRenderOptions, IRenderSettings } from "../../helpers";
import { ValueTypes } from "../values/value";
import { renderStatements, StatementTypes } from "./block";

export class IfStatement implements IRenderable {
    constructor(
        public condition: ValueTypes,
        public statements: Array<StatementTypes>,
        public elseStatement?: ElseStatement
    ) { }

    render(settings: IRenderSettings, options?: Partial<IRenderOptions>): string {
        let acc = `if ${this.condition.render(settings)} `;
        acc += `{${renderStatements(this.statements, settings)}}`;
        if (this.elseStatement) acc += this.elseStatement.render(settings);
        return acc;
    }
}

export class ElseStatement implements IRenderable {
    constructor(
        public condition: ValueTypes | null,
        public statements: Array<StatementTypes>,
        public elseStatement?: ElseStatement
    ) { }

    render(settings: IRenderSettings, options?: Partial<IRenderOptions>): string {
        let acc = " else ";
        if (this.condition) acc += `if ${this.condition.render(settings)} `;
        acc += `{${renderStatements(this.statements, settings)}} `;
        if (this.elseStatement) acc += this.elseStatement.render(settings);
        return acc;
    }
}