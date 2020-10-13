import { TokenReader, IRenderSettings, ScriptLanguages, defaultRenderSettings } from "../../../helpers";
import { commentTokens, JSToken } from "../../javascript";
import { TypeSignature } from "./type-signature";
import { IStatement } from "../statements/statement";
import { tokenAsIdent } from "../value/variable";

export class InterfaceDeclaration implements IStatement {

    name: TypeSignature;

    constructor(
        name: string | TypeSignature,
        public extendsType: TypeSignature | null,
        public members: Map<string, TypeSignature> = new Map(),
        public optionalProperties: Set<string> = new Set()
    ) {
        if (typeof name === "string") {
            this.name = new TypeSignature({ name });
        } else {
            this.name = name;
        }
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        if (settings.scriptLanguage !== ScriptLanguages.Typescript) {
            return "";
        }
        let acc = "interface ";
        acc += this.name.render(settings);
        if (this.extendsType) {
            acc += " extends ";
            acc += this.extendsType.render(settings);
        }
        acc += " {";
        if (this.members.size > 0) acc += "\n";
        const members = Array.from(this.members);
        for (let index = 0; index < members.length; index++) {
            const [key, value] = members[index];
            acc += " ".repeat(settings.indent);
            acc += key;
            if (this.optionalProperties.has(key)) {
                acc += "?: ";
            } else {
                acc += ": ";
            }
            acc += value.render(settings);
            if (index + 1 < members.length) {
                acc += ","
            }
            acc += "\n";
        }
        acc += "}\n";
        return acc;
    }

    static fromTokens(reader: TokenReader<JSToken>) {
        reader.expect(JSToken.Interface);
        reader.move();
        reader.expect(JSToken.Identifier);
        const name = TypeSignature.fromTokens(reader);

        let extendsType: TypeSignature | null = null;
        if (reader.current.type === JSToken.Extends) {
            reader.move();
            extendsType = TypeSignature.fromTokens(reader);
        }

        const members: Map<string, TypeSignature> = new Map();
        // Could use Map<string, {type: TypeSignature, optional: boolean}> but that seems to create to much objects
        const optionalKeys: Set<string> = new Set();
        reader.expectNext(JSToken.OpenCurly)
        while (reader.current.type !== JSToken.CloseCurly) {
            if (commentTokens.includes(reader.current.type)) {
                reader.move();
                continue;
            }

            let key: string;
            if (reader.current.type === JSToken.OpenSquare) {
                reader.throwError("Not implemented - computed interface properties");
            } else {
                try {
                    key = reader.current.value || tokenAsIdent(reader.current.type);
                    reader.move();
                } catch {
                    reader.throwExpect("Expected valid interface name")
                }
            }
            if (reader.current.type === JSToken.OptionalMember) {
                optionalKeys.add(key);
                reader.move();
            } else {
                reader.expectNext(JSToken.Colon);
            }
            const typeSig = TypeSignature.fromTokens(reader);
            members.set(key, typeSig);

            while (commentTokens.includes(reader.current.type)) {
                reader.move();
            }

            if (reader.current.type as JSToken === JSToken.CloseCurly) break;
            // Here optional skip over commas as they are not required acc to ts spec
            if (reader.current.type === JSToken.Comma || reader.current.type === JSToken.SemiColon) reader.move();
        }
        reader.move();
        return new InterfaceDeclaration(name, extendsType, members, optionalKeys);
    }
}