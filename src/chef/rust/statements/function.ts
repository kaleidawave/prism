import { IFunctionDeclaration } from "../../abstract-asts";
import { IRenderSettings, IRenderOptions, IRenderable, defaultRenderSettings } from "../../helpers";
import { ValueTypes } from "../values/value";
import { renderStatements, StatementTypes } from "./block";
import { TypeSignature } from "./struct";

export class ArgumentList implements IRenderable {
    constructor (
        public args: Array<ValueTypes>
    ) {}

    render(settings: IRenderSettings = defaultRenderSettings, options?: Partial<IRenderOptions>): string {
        return "(" + this.args.map(arg => arg.render(settings)).join(", ") + ")";
    }
}

export class FunctionDeclaration implements IFunctionDeclaration {
    constructor(
        public actualName: string,
        public parameters: Array<[string, TypeSignature]>,
        public returnType: TypeSignature | null,
        public statements: StatementTypes[],
        public isPublic: boolean = false,
    ) { }

    buildArgumentListFromArgumentsMap(argumentMap: Map<string, ValueTypes>): ArgumentList {
        const args = this.parameters.map(([paramName]) => {
            if (!argumentMap.has(paramName)) throw Error(`Missing argument for parameter "${paramName}"`);
            return argumentMap.get(paramName)!;
        });
        return new ArgumentList(args);
    }

    render(settings: IRenderSettings = defaultRenderSettings, options?: Partial<IRenderOptions>): string {
        let acc = "";
        if (this.isPublic) {
            acc += "pub "
        }
        acc += "fn " + this.actualName + "(";
        acc += this.parameters.map(([name, typeSig]) => `${name}: ${typeSig.render(settings)}`).join(", ");
        acc += ") ";
        if (this.returnType) {
            acc += `-> ${this.returnType.render(settings)} `;
        }
        acc += "{";
        acc += renderStatements(this.statements, settings);
        acc += "}";
        return acc;
    }
}

export class ClosureExpression implements IRenderable {
    constructor (
        public parameters: Array<[string, TypeSignature | null]>,
        public statements: Array<StatementTypes>,
        public captureEnv: boolean = false,
    ) {}

    render(settings: IRenderSettings, options?: Partial<IRenderOptions>): string {
        let acc = "";
        if (this.captureEnv) acc += "move ";
        acc += "|" + this.parameters.map(([name, type]) => `${name}${type ? ": " + type.render(settings) : ""}`).join(", ") + "| ";
        if (this.statements.length === 1 && this.statements[0] instanceof ReturnStatement) {
            acc += this.statements[0].value.render(settings);
        } else {
            acc += "{";
            acc += renderStatements(this.statements, settings);
            acc += "}";
        }
        return acc;
    }
}

export class ReturnStatement implements IRenderable {
    constructor (public value: ValueTypes) {}

    render(settings: IRenderSettings, options?: Partial<IRenderOptions>): string {
        return `return ${this.value.render(settings)}`;
    }
}