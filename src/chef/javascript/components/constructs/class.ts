import { TokenReader, IRenderSettings, IRenderable, makeRenderSettings, ScriptLanguages, defaultRenderSettings } from "../../../helpers";
import { commentTokens, JSToken, stringToTokens } from "../../javascript";
import { TypeSignature } from "../types/type-signature";
import { FunctionDeclaration, ArgumentList, GetSet } from "./function";
import { VariableDeclaration, VariableContext } from "../statements/variable";
import { Comment } from "../statements/comments";
import { ValueTypes } from "../value/value";

// Tokens which when prepended to a class member depict modification
const memberModifiers = new Set([
    JSToken.Public, JSToken.Private, JSToken.Protected,
    JSToken.Abstract, JSToken.Static,
    JSToken.Get, JSToken.Set
]);
    
interface ClassContextSettings {
    isAbstract?: boolean,
    isExpression?: boolean // e.g. const x = class { a() {} }
}

// TODO better place for decorators?
export class Decorator {
    private _argumentList?: ArgumentList; // Arguments sent to decorator

    constructor(
        public name: string,
        args?: Array<ValueTypes> | ArgumentList
    ) {
        if (args) {
            if (args instanceof ArgumentList) {
                this._argumentList = args;
            } else {
                this._argumentList = new ArgumentList(args);
            }
        }
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = this.name;
        if (this._argumentList) {
            acc += this._argumentList.render(settings);
        }
        return acc;
    }

    // Getting arguments parsed to decorator function without having to delve
    get args() {
        if (this._argumentList) {
            return this._argumentList.args;
        } else {
            return [];
        }
    }

    static fromTokens(reader: TokenReader<JSToken>) {
        reader.expect(JSToken.At);
        const { value: name } = reader.next();
        reader.expectNext(JSToken.Identifier);
        if (reader.current.type === JSToken.OpenBracket) {
            return new Decorator(name!, ArgumentList.fromTokens(reader));
        } else {
            return new Decorator(name!);
        }
    }
}

interface IClassSettings {
    base?: TypeSignature | string,
    decorators?: Array<Decorator>,
    isAbstract?: boolean
}

type ClassMember = VariableDeclaration | FunctionDeclaration | Comment;

export class ClassDeclaration implements IRenderable, IClassSettings {
    public name?: TypeSignature; // If null is class expression
    public isAbstract: boolean;
    public base?: TypeSignature;
    public decorators?: Array<Decorator>;

    public members: Array<ClassMember> = [];
    public staticMethods?: Map<string, FunctionDeclaration>;
    public fields?: Map<string, VariableDeclaration>;
    public staticFields?: Map<string, VariableDeclaration>;
    public methods?: Map<string, FunctionDeclaration>;
    public getters?: Map<string, FunctionDeclaration>;
    public setters?: Map<string, FunctionDeclaration>;

    constructor(
        name: TypeSignature | string | null,
        members: Array<ClassMember> = [],
        settings: Partial<IClassSettings> = {}
    ) {
        if (name) {
            if (typeof name === "string") {
                this.name = new TypeSignature({ name });
            } else {
                this.name = name;
            }
        }
        for (const member of members) {
            this.addMember(member);
        }

        const { base = null, isAbstract, decorators } = settings;
        this.isAbstract = isAbstract ?? false;
        if (decorators) this.decorators = decorators;

        if (base) {
            if (typeof base === "string") {
                this.base = new TypeSignature({ name: base });
            } else {
                this.base = base;
            }
        }
    }

    /**
     * Returns class constructor method
     */
    get classConstructor(): FunctionDeclaration | undefined {
        return this.methods?.get("constructor");
    }

    /**
     * Adds a member to a class, automatically populates static, fields, getters, setters and methods maps
     * @param member 
     */
    addMember(member: ClassMember) {
        this.members.push(member);
        if (member instanceof Comment) {
            return;
        }

        // Ensure member knows its part of a class declaration
        if (member instanceof VariableDeclaration) {
            member.context = VariableContext.Parameter;
        } else {
            member.parent = this;
        }

        if (member.isStatic && member instanceof FunctionDeclaration) {
            if (!this.staticMethods) this.staticMethods = new Map();
            this.staticMethods.set(member.actualName!, member);
        } else if (member.isStatic && member instanceof VariableDeclaration) {
            if (!this.staticFields) this.staticFields = new Map();
            this.staticFields.set(member.name!, member);
        } else if (member instanceof VariableDeclaration) {
            if (!this.fields) this.fields = new Map();
            this.fields.set(member.name, member);
        } else if (member.getSet === GetSet.Get) {
            if (!this.getters) this.getters = new Map();
            this.getters.set(member.actualName!, member);
        } else if (member.getSet === GetSet.Set) {
            if (!this.setters) this.setters = new Map();
            this.setters.set(member.actualName!, member);
        } else {
            if (!this.methods) this.methods = new Map();
            this.methods.set(member.actualName!, member);
        }
    }

    get actualName() {
        return this.name?.name;
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        settings = makeRenderSettings(settings);
        let acc = "";
        if (this.isAbstract && settings.scriptLanguage ===   ScriptLanguages.Typescript) acc += "abstract ";
        acc += "class ";
        if (this.name) {
            if (settings.scriptLanguage === ScriptLanguages.Typescript) {
                acc += this.name.render(settings);
            } else {
                acc += this.name.name;
            }
        }
        if (this.base) {
            acc += " extends "
            if (settings.scriptLanguage === ScriptLanguages.Typescript) {
                acc += this.base.render(settings);
            } else {
                acc += this.base.name;
            }
        }
        if (!settings.minify) acc += " ";
        acc += "{";
        if (!settings.minify && this.members.length > 0) acc += "\n";
        for (let i = 0; i < this.members.length; i++) {
            const member = this.members[i];
            const serializedMember = member.render(settings);
            if (serializedMember.length === 0) continue;

            if (settings.minify) {
                acc += serializedMember;
            } else {
                const indent = " ".repeat(settings.indent);
                acc += indent + serializedMember.replace(/\n/g, "\n" + indent);
            }

            // Generators start with a *. If the previous member does not close 
            // it messes up js parsers (not just this one) thinking its a multiply expression
            // so this part here makes sure there is semi colon to break the parsing.
            let next = this.members[i + 1], i2 = i + 1;
            while (settings.comments !== true && next instanceof Comment) {
                next = this.members[++i2];
            }

            if (next instanceof FunctionDeclaration && next.isGenerator) {
                acc += ";";
            } else if (settings.minify && i + 1 < this.members.length) {
                acc += ";";
            }

            // If not last member add new line
            if (i + 1 < this.members.length && !settings.minify) {
                acc += "\n";
                if (next instanceof FunctionDeclaration) {
                    acc += "\n";
                }
            }
        }

        if (!settings.minify && this.members.length > 0) acc += "\n";
        return acc + "}";
    }

    static fromTokens(
        reader: TokenReader<JSToken>,
        { isAbstract, isExpression: expression }: ClassContextSettings = { isExpression: false, isAbstract: false }
    ) {
        reader.expectNext(JSToken.Class);
        let name: TypeSignature | null = null;

        if (!expression) {
            name = TypeSignature.fromTokens(reader);
            if (!name.name) {
                reader.throwError("Invalid class name");
            }
        }

        const clsDec = new ClassDeclaration(name);
        if (reader.current.type === JSToken.Extends) {
            reader.move();
            clsDec.base = TypeSignature.fromTokens(reader);
        }

        reader.expectNext(JSToken.OpenCurly);

        const modifierAccumulator = new Set<JSToken>();
        const decoratorAccumulator = new Set<Decorator>();
        while (reader.current.type !== JSToken.CloseCurly) {
            // TODO accessibility modifiers

            if (commentTokens.includes(reader.current.type)) {
                clsDec.addMember(new Comment(reader.current.value!, reader.current.type === JSToken.MultilineComment));
                reader.move();
            } else if (reader.current.type === JSToken.At) {
                decoratorAccumulator.add(Decorator.fromTokens(reader));
            } else if (memberModifiers.has(reader.current.type)) {
                modifierAccumulator.add(reader.current.type);
                reader.move();
                continue;
            } else if (
                reader.current.type === JSToken.Async
                || reader.current.type === JSToken.Multiply
                || reader.peek()?.type === JSToken.OpenBracket
            ) {
                const func = FunctionDeclaration.fromTokens(reader, clsDec, modifierAccumulator, decoratorAccumulator);
                clsDec.addMember(func);
                modifierAccumulator.clear();
                decoratorAccumulator.clear();
            } else {
                const variable = VariableDeclaration.fromTokens(reader, {
                    isStatic: modifierAccumulator.has(JSToken.Static),
                    isAbstract: modifierAccumulator.has(JSToken.Abstract),
                    parent: clsDec
                });

                clsDec.addMember(variable);
                modifierAccumulator.clear();
            }
        }
        reader.move();
        clsDec.isAbstract = isAbstract ?? false;
        return clsDec;
    }

    static fromString(string: string) {
        const reader = stringToTokens(string);
        const cls = ClassDeclaration.fromTokens(reader);
        reader.expect(JSToken.EOF);
        return cls;
    }
}