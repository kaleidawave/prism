import { TokenReader, IRenderSettings, ScriptLanguages, defaultRenderSettings } from "../../../helpers";
import { JSToken } from "../../javascript";
import { tokenAsIdent } from "../value/variable";
import { IStatement } from "../statements/statement";
import { parseFunctionParams } from "../constructs/function";
import { open } from "fs";

interface TypeWithArgs {
    name: string,
    typeArguments?: Array<TypeSignature>
}

interface FunctionSignature {
    parameters: Map<string, TypeSignature>,
    returnType: TypeSignature
}

/**
 * Represents a type declaration. Used by class to parse generics
 */
export class TypeSignature implements IStatement {
    name?: string;
    typeArguments?: Array<TypeSignature>;
    functionParameters?: Map<string, TypeSignature>;
    functionReturnType?: TypeSignature;

    // TODO not quite sure of design
    mappedTypes?: Map<string, TypeSignature>;

    constructor(options: string | TypeWithArgs | FunctionSignature | Map<string, TypeSignature>) {
        if (typeof options === "string") {
            this.name = options;
        } else if ("name" in options) {
            this.name = options.name;
            if (options.typeArguments) this.typeArguments = options.typeArguments;
        } else if (options instanceof Map) {
            this.mappedTypes = options;
        } else {
            this.functionParameters = options.parameters;
            this.functionReturnType = options.returnType;
        }
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        if (settings.scriptLanguage !== ScriptLanguages.Typescript) {
            return "";
        }
        if (this.functionParameters) {
            let acc = "(";
            let part = 1;
            for (const [paramName, paramType] of this.functionParameters) {
                acc += paramName;
                acc += ": "
                acc += paramType.render(settings);
                if (part++ < this.functionParameters.size) acc += ", "
            }
            acc += ") => ";
            acc += this.functionReturnType!.render(settings);
            return acc;
        } else if (this.mappedTypes) {
            let acc = "{";
            let part = 1;
            for (const [key, type] of this.mappedTypes) {
                acc += key;
                acc += ": "
                acc += type.render(settings);
                if (part++ < this.mappedTypes.size) acc += ", "
            }
            acc += "}";
            return acc;
        } else {
            if (this.name === "Tuple") {
                let acc = "[";
                const members = this.typeArguments!;
                for (let i = 0; i < members.length; i++) {
                    acc += members[i].render(settings);
                    if (i + 1 < members.length) {
                        acc += ", "
                    }
                }
                return acc + "]";
            } else if (this.name === "Union") {
                let acc = "";
                const members = this.typeArguments!;
                for (let i = 0; i < members.length; i++) {
                    acc += members[i].render(settings);
                    if (i + 1 < members.length) {
                        acc += " | "
                    }
                }
                return acc;
            } else {
                let acc = this.name!;
                if (this.typeArguments) {
                    acc += "<";
                    for (let i = 0; i < this.typeArguments.length; i++) {
                        acc += this.typeArguments[i].render(settings);
                        if (i + 1 < this.typeArguments.length) {
                            acc += ", "
                        }
                    }
                    acc += ">";
                }
                return acc;
            }
        }
    }

    static fromTokens(reader: TokenReader<JSToken>, skipBar = false): TypeSignature {
        let typeSignature: TypeSignature;

        // Function argument type
        if (reader.current.type === JSToken.OpenBracket) {
            const params = parseFunctionParams(reader);
            // TODO param.typeSignature can be undefined?
            const parameters = new Map(params.map(param => [param.name, param.typeSignature!]));
            reader.expectNext(JSToken.ArrowFunction);
            const returnType = TypeSignature.fromTokens(reader);
            // TODO type signature should have map
            typeSignature = new TypeSignature({ parameters, returnType });
        }

        // Array literal type
        else if (reader.current.type === JSToken.OpenSquare) {
            reader.move();
            const members: Array<TypeSignature> = [];
            while (reader.current.type as JSToken !== JSToken.CloseSquare) {
                members.push(TypeSignature.fromTokens(reader));
                if (reader.current.type as JSToken === JSToken.Comma) reader.move();
            }
            reader.expectNext(JSToken.CloseSquare);
            typeSignature = new TypeSignature({ name: "Tuple", typeArguments: members });
        }

        // Object literal type
        else if (reader.current.type === JSToken.OpenCurly) {
            reader.move();
            const members: Map<string, TypeSignature> = new Map();
            while (reader.current.type as JSToken !== JSToken.CloseCurly) {
                // TODO [Symbol.x] etc
                const key = reader.current.value || tokenAsIdent(reader.current.type);
                reader.move();
                if (reader.current.type as JSToken === JSToken.OptionalMember) {
                    reader.throwError("Not implemented - optional member in inline interface");
                }
                reader.expectNext(JSToken.Colon);
                members.set(key, TypeSignature.fromTokens(reader));
                if (reader.current.type as JSToken === JSToken.Comma) reader.move();
            }
            reader.expectNext(JSToken.CloseCurly);
            typeSignature = new TypeSignature(members);
        }

        // Name
        else {
            let name: string;
            try {
                // TODO typeSignature.value if its 0 or "thing" e.g.
                name = reader.current.value || tokenAsIdent(reader.current.type);
            } catch {
                reader.throwExpect("Expected value type signature name");
            }
            reader.move();
            typeSignature = new TypeSignature({ name });

            if (reader.current.type as JSToken === JSToken.OpenAngle) {
                const typeArguments: Array<TypeSignature> = [];
                while (reader.next().type !== JSToken.CloseAngle) {
                    typeArguments.push(TypeSignature.fromTokens(reader));
                    if (reader.current.type === JSToken.UnaryBitwiseShiftRight) {
                        reader.current.type = JSToken.BitwiseShiftRight;
                        break;
                    } else if (reader.current.type === JSToken.BitwiseShiftRight) {
                        reader.current.type = JSToken.CloseAngle;
                        break;
                    } else if (reader.current.type === JSToken.CloseAngle) {
                        reader.move();
                        break;
                    }

                    reader.expect(JSToken.Comma);
                }
                typeSignature.typeArguments = typeArguments;
            }
        }

        // Parses string[]
        if (reader.current.type as JSToken === JSToken.OpenSquare) {
            reader.move();
            reader.expectNext(JSToken.CloseSquare);
            typeSignature = new TypeSignature({ name: "Array", typeArguments: [typeSignature] });
        }

        if (reader.current.type as JSToken === JSToken.BitwiseOr && !skipBar) {
            const typeArguments = [typeSignature];
            while (reader.current.type === JSToken.BitwiseOr) {
                reader.move();
                const unionType = TypeSignature.fromTokens(reader, true);
                typeArguments.push(unionType);
            }
            typeSignature = new TypeSignature({ name: "Union", typeArguments });
        }

        return typeSignature;
    }
}