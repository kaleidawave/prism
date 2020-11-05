import { IRenderable, IRenderOptions, IRenderSettings } from "../../helpers";
import { DynamicStatement } from "../dynamic-statement";
import { DeriveStatement } from "./derive";

export class StructStatement implements IRenderable {
    constructor (
        public name: TypeSignature,
        public members: Map<string, TypeSignature>,
        public memberAttributes: Map<string, DeriveStatement | DynamicStatement> = new Map(),
        public isPublic: boolean = false,
        public privateMembers: Set<string> = new Set()
    ) {}

    render(settings: IRenderSettings, options?: Partial<IRenderOptions>): string {
        let acc = "";
        if (this.isPublic) acc += "pub ";
        acc += `struct ${this.name.render(settings)} {`;
        if (this.members.size > 0) acc += "\n";
        for (const [name, type] of this.members) {
            acc += " ".repeat(settings.indent);
            if (this.memberAttributes.has(name)) {
                acc += this.memberAttributes.get(name)!.render(settings);   
                acc += "\n" + " ".repeat(settings.indent);
            }
            if (!this.privateMembers.has(name)) acc += "pub ";
            acc += `${name}: ${type.render(settings)},\n`;
        }
        acc += "}";
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