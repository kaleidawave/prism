import { JSToken, stringToTokens } from "../../javascript";
import { TokenReader, IRenderSettings, ScriptLanguages, defaultRenderSettings, IRenderable } from "../../../helpers";
import { ValueTypes } from "../value/value";
import { TypeSignature } from "../types/type-signature";
import { Expression } from "../value/expression";
import type { Module } from "../module";
import { ClassDeclaration } from "../constructs/class";
import { VariableReference, tokenAsIdent } from "../value/variable";


interface IVariableSettings {
    spread: boolean,
    typeSignature?: TypeSignature,
    parent: Module | ClassDeclaration,
    isConstant: boolean,
    value: ValueTypes,
    isStatic: boolean,
    isAbstract: boolean,
    context: VariableContext,
    isOptional: boolean, // For optional class fields
}

export enum VariableContext {
    Destruction,
    Parameter,
    Statement,
    For,
    Import
}

/**
 * Class that represents a variable declaration though using const, let, var declaration or a existing in a class field
 */
export class VariableDeclaration implements IRenderable, IVariableSettings {

    name: string;
    entries?: Map<string | number, VariableDeclaration | null>;
    value: ValueTypes;
    typeSignature?: TypeSignature; // TODO will be Type eventually
    parent: Module | ClassDeclaration;
    isConstant: boolean = true;
    spread: boolean = false;
    from?: VariableReference;
    context: VariableContext = VariableContext.Statement;
    isStatic: boolean = false;
    isAbstract: boolean = false;
    isOptional: boolean = false;

    constructor(
        name: string | Map<string | number, VariableDeclaration | null>,
        settings: Partial<IVariableSettings> = {}
    ) {
        if (typeof name === "string") {
            this.name = name;
        } else if (name !== null) {
            this.entries = name;
            for (const entry of this.entries.values()) {
                if (entry) {
                    entry.context = VariableContext.Destruction;
                }
            }
        }
        if (typeof settings.context === "undefined") settings.context = VariableContext.Statement;

        // TODO temp:
        Object.assign(this, settings);
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "";
        if (this.isAbstract) {
            if (settings.scriptLanguage === ScriptLanguages.Typescript) {
                acc += "abstract ";
            } else {
                return "";
            }
        }

        if (this.isStatic) acc += "static ";
        if (
            (this.context === VariableContext.Statement
                || this.context === VariableContext.For)
            && !(this.parent instanceof ClassDeclaration)
        ) {
            if (!this.isConstant) {
                acc += "let ";
            } else {
                acc += "const ";
            }
        }
        if (this.context === VariableContext.Parameter && this.spread) {
            acc += "...";
        }

        if (this.name) {
            acc += this.name;
            if (settings.scriptLanguage === ScriptLanguages.Typescript && this.isOptional) {
                acc += "?";
            }
        } else if (this.entries) {
            // If all keys are numbers it is a array destructure
            // TODO Number.isFinite ???
            if (Array.from(this.entries.keys()).every(key => Number.isFinite(key as number))) {
                acc += "[";
                for (let i = 0; i < this.entries.size; i++) {
                    // TODO temp implementation
                    acc += this.entries.get(i)!.render(settings);
                    if (i !== this.entries.size - 1) acc += settings.minify ? "," : ", "
                }
                acc += "]";
            } else {
                acc += "{";
                let count = this.entries.size;
                for (const declaration of this.entries.values()) {
                    if (declaration) {
                        acc += declaration.render(settings);
                    }
                    if (--count > 0) acc += settings.minify ? "," : ", "
                }
                acc += "}";
            }
        }
        if (
            settings.scriptLanguage === ScriptLanguages.Typescript
            && this.context !== VariableContext.Import
            && this.context !== VariableContext.Destruction
        ) {
            if (this.typeSignature) {
                acc += ": "
                acc += this.typeSignature.render(settings);
            }
        }
        if (this.value) {
            acc += settings.minify ? "=" : " = ";
            acc += this.value.render(settings);
        }
        return acc;
    }

    /**
     * Returns a variableReference to the declared variable. TODO kinda temp
     */
    toReference(): VariableReference {
        return new VariableReference(this.name);
    }

    static fromTokens(reader: TokenReader<JSToken>, settings: Partial<IVariableSettings> = {}): VariableDeclaration {
        let isConstant = false;
        if (reader.current.type === JSToken.Const) {
            isConstant = true;
            reader.move();
        } else if (reader.current.type === JSToken.Let) {
            reader.move();
        } else if (reader.current.type === JSToken.Var) {
            reader.move();
        }

        let spread: boolean = settings.spread ?? false;
        if (settings.context === VariableContext.Parameter && reader.current.type === JSToken.Spread) {
            spread = true; // TODO local variable spread rather than modifying settings
            reader.move();
        }

        // Parse variable names
        let name: string | null = null;
        let entries: Map<string | number, VariableDeclaration | null> | null = null;
        try {
            name = reader.current.value ?? tokenAsIdent(reader.current.type);
            reader.move();
        } catch { }

        if (name === null) {
            // Array destructuring eg const [a, b]
            if (reader.current.type === JSToken.OpenSquare) {
                reader.move();
                entries = new Map();
                let index = 0;
                while (reader.current.type as JSToken !== JSToken.CloseSquare) {
                    if (reader.current.type === JSToken.OpenSquare) {
                        entries.set(index++, VariableDeclaration.fromTokens(reader, { context: VariableContext.Destruction })); // TODO signal source is from destructor and not to do type & multiple etc
                        continue;
                    } else if (reader.current.type === JSToken.Comma) {
                        entries.set(index++, null);
                        reader.move();
                        continue;
                    } else if (reader.current.type === JSToken.Spread) {
                        reader.move();
                        const variable = VariableDeclaration.fromTokens(reader, { context: VariableContext.Destruction });
                        variable.spread = true;
                        entries.set(index++, variable);
                    } else {
                        entries.set(index++, VariableDeclaration.fromTokens(reader, { context: VariableContext.Destruction }));
                    }
                    if (reader.current.type === JSToken.CloseSquare) break;
                    else reader.expectNext(JSToken.Comma);
                }
                reader.move();
            }
            // Object destructuring eg const {a, b} 
            else if (reader.current.type === JSToken.OpenCurly) {
                reader.move();
                entries = new Map();
                while (reader.current.type as JSToken !== JSToken.CloseCurly) {
                    let spread = false;
                    if (reader.current.type as JSToken === JSToken.Spread) {
                        reader.move();
                        spread = true;
                    }
                    reader.expect(JSToken.Identifier);
                    const identifer = reader.current.value!;
                    reader.move();
                    if (spread) {
                        entries.set(identifer, new VariableDeclaration(identifer, { spread: true }))
                    } else if (reader.current.type as JSToken === JSToken.Colon) {
                        reader.move();
                        reader.expect(JSToken.Identifier);
                        // TODO from
                        entries.set(identifer, VariableDeclaration.fromTokens(reader, { 
                            context: VariableContext.Destruction 
                        })); 
                    } else if (reader.current.type as JSToken === JSToken.Assign) {
                        reader.move();
                        const value = Expression.fromTokens(reader);
                        entries.set(identifer, new VariableDeclaration(identifer, {value}));
                    } else {
                        entries.set(identifer, new VariableDeclaration(identifer));
                    }
                    if (reader.current.type as JSToken === JSToken.CloseCurly) break;
                    else reader.expectNext(JSToken.Comma);
                }
                reader.move();
            } else {
                reader.throwExpect("Expected Ident, [ or {")
            }
        }

        // Type signature
        let type: TypeSignature | undefined;
        // Optionality under classes and function parameters
        let isOptional = false;
        
        if (reader.current.type === JSToken.OptionalMember && (settings.parent instanceof ClassDeclaration || settings.context === VariableContext.Parameter)) {
            isOptional = true;
            reader.move();
            type = TypeSignature.fromTokens(reader);
        }

        if (reader.current.type === JSToken.Colon) {
            reader.move();
            type = TypeSignature.fromTokens(reader);
        }

        // Assigned value
        let value: ValueTypes | undefined;
        if (reader.current.type as JSToken === JSToken.Assign) {
            reader.move();
            value = Expression.fromTokens(reader);
        }

        // TODO what?
        if (isConstant && !value && settings.context !== VariableContext.For) {
            reader.throwExpect("Expected assignment for constant variable");
        }

        if (reader.current.type as JSToken === JSToken.Comma && settings.context === VariableContext.Statement) {
            // TODO temp:
            if (!name) throw Error()

            entries = new Map();
            entries.set(name, new VariableDeclaration(name, { value }));
            while (reader.current.type as JSToken === JSToken.Comma) {
                reader.move();
                const variable = VariableDeclaration.fromTokens(reader, { context: VariableContext.Destruction });
                entries.set(variable.name, variable)
            }
        }

        const variable = new VariableDeclaration(entries ?? name!, {
            isConstant,
            spread,
            typeSignature: type,
            value,
            isOptional,
            isStatic: settings.isStatic ?? false,
            isAbstract: settings.isAbstract ?? false,
            context: settings.context,
            parent: settings.parent
        });

        if (reader.current.type as JSToken === JSToken.SemiColon) reader.move();
        return variable;
    }

    static fromString(string: string) {
        const reader = stringToTokens(string);
        const variable = VariableDeclaration.fromTokens(reader);
        reader.expect(JSToken.EOF);
        return variable;
    }
}