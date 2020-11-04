import { ValueTypes } from "../value/value";
import { TypeSignature } from "./type-signature";
import { IRenderSettings, defaultRenderSettings, ScriptLanguages, TokenReader, IRenderable } from "../../../helpers";
import { JSToken } from "../../javascript";

export class AsExpression implements IRenderable {
    constructor(
        public value: ValueTypes, 
        public asType: TypeSignature
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        if (settings.scriptLanguage !== ScriptLanguages.Typescript) {
            return this.value.render(settings);
        }
        let acc = this.value.render(settings);
        acc += " as ";
        acc += this.asType.render(settings);
        return acc;
    }
}

export class TypeDeclaration implements IRenderable {
    constructor(
        public name: TypeSignature,
        public value: TypeSignature,
    ) { }

    get actualName() {
        return this.name.name!;
    }

    render(settings: IRenderSettings = defaultRenderSettings) {
        if (settings.scriptLanguage !== ScriptLanguages.Typescript) return "";
        let acc = "type ";
        acc += this.name.render(settings);
        acc += " = ";
        acc += this.value.render(settings);
        acc += ";";
        return acc;
    }

    static fromTokens(reader: TokenReader<JSToken>): TypeDeclaration {
        reader.expectNext(JSToken.Type);
        // LHS can have generics so parse it as so
        const name = TypeSignature.fromTokens(reader);
        // TODO catch type x | y = 2; etc
        reader.expectNext(JSToken.Assign);
        const value = TypeSignature.fromTokens(reader);
        return new TypeDeclaration(name, value);
    }
}