import { IFunctionDeclaration } from "../../abstract-asts";
import { IRenderSettings, IRenderOptions, IRenderable, defaultRenderSettings } from "../../helpers";
import { TypeSignature } from "../../javascript/components/types/type-signature";
import { ValueTypes } from "../values/value";
import { renderStatements, Statements } from "./block";

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
        public returnType: TypeSignature,
        public statements: Statements[],
        public isPublic: boolean = false,
    ) { }

    buildArgumentListFromArgumentsMap(argumentMap: Map<string, any>) {
        throw new Error("Method not implemented.");
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
        acc += "{\n";
        acc += renderStatements(this.statements, settings);
        acc += "}";
        return acc;
    }
}

export class ReturnStatement implements IRenderable {
    constructor (public value: ValueTypes) {}

    render(settings: IRenderSettings, options?: Partial<IRenderOptions>): string {
        return `return ${this.value.render(settings)}`;
    }
}