import { IRenderable, IRenderOptions, IRenderSettings } from "../../helpers";

export class StructStatement implements IRenderable {
    constructor (
        public name: TypeSignature,
        public members: Map<string, TypeSignature>,
        public isPublic: boolean = false
    ) {}

    render(settings: IRenderSettings, options?: Partial<IRenderOptions>): string {
        let acc = "";
        if (this.isPublic) acc += "pub ";
        acc += `struct ${this.name.render(settings)} {\n`;
        for (const [name, type] of this.members) {
            acc += " ".repeat(settings.indent);
            acc += `${name}: ${type.render(settings)},\n`;
        }
        acc += "}\n";
        return acc;
    }
}

interface TypeSignatureOptions {
    typeArguments?: Array<TypeSignature>;
    lifeTime?: boolean;
    borrowed?: boolean;
}

export class TypeSignature implements IRenderable, TypeSignatureOptions {
    typeArguments?: Array<TypeSignature>;
    lifeTime?: boolean;
    borrowed?: boolean;

    constructor (
        public name: string,
        options?: TypeSignatureOptions
    ) {
        for (const key in options) Reflect.set(this, key, options[key]);
    }

    render(settings: IRenderSettings, options?: Partial<IRenderOptions>): string {
        let acc = this.name;
        if (this.typeArguments) {
            acc += "<" + this.typeArguments.map(typeArg => typeArg.render(settings)).join(", ") + ">";
        }
        return acc;
    }
}