import { TokenReader, IRenderSettings, IRenderable, makeRenderSettings, ScriptLanguages, defaultRenderSettings } from "../../../helpers";
import { JSToken, stringToTokens } from "../../javascript";
import { IValue } from "../value/value";
import { TypeSignature } from "../types/type-signature";
import { Statements, ReturnStatement } from "../statements/statement";
import { Expression } from "../value/expression";
import { parseBlock, renderBlock } from "./block";
import { ClassDeclaration, Decorator } from "./class";
import { VariableDeclaration, VariableContext } from "../statements/variable";
import { ObjectLiteral } from "../value/object";
import { Module } from "../module";
import { IFunctionDeclaration } from "../../../abstract-asts";

export const functionPrefixes = [JSToken.Get, JSToken.Set, JSToken.Async];

// Parses a list of function parameters
export function parseFunctionParams(reader: TokenReader<JSToken>): Array<VariableDeclaration> {
    const params: Array<VariableDeclaration> = [];
    reader.expectNext(JSToken.OpenBracket);
    while (reader.current.type !== JSToken.CloseBracket) {
        if (reader.current.type === JSToken.Comment) reader.move();
        const variable = VariableDeclaration.fromTokens(reader, { context: VariableContext.Parameter });
        params.push(variable);
        if (reader.current.type === JSToken.Comment) reader.move();
        if (reader.current.type as JSToken === JSToken.CloseBracket) break;
        reader.expectNext(JSToken.Comma);
    }
    reader.move();
    return params;
}

export class ArgumentList implements IRenderable {
    constructor(public args: IValue[] = []) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        const renderedArgs = this.args.map(arg => arg.render(settings, { inline: true }));
        const totalWidth = renderedArgs.reduce((acc, cur) => acc + cur.length, 0);
        // Prettifies function arguments with long arguments
        if (totalWidth > settings.columnWidth && settings.minify === false) {
            const tabNewLine = "\n" + " ".repeat(settings.indent);
            return `(${tabNewLine}${renderedArgs.map(arg => arg.replace(/\n/g, "\n" + " ".repeat(settings.indent))).join("," + tabNewLine)}\n)`;
        } else {
            return `(${renderedArgs.join(settings.minify ? "," : ", ")})`;
        }
    }

    static fromTokens(reader: TokenReader<JSToken>): ArgumentList {
        const args: Array<IValue> = [];
        reader.expectNext(JSToken.OpenBracket);
        while (reader.current.type !== JSToken.CloseBracket) {
            const arg = Expression.fromTokens(reader);
            args.push(arg);
            if (reader.current.type as JSToken === JSToken.CloseBracket) break;
            reader.expectNext(JSToken.Comma);
        }
        reader.move();
        return new ArgumentList(args);
    }
}

export enum GetSet { Get, Set };

interface FunctionOptions {
    parent: ClassDeclaration | ObjectLiteral | Module;
    isAsync: boolean,
    getSet?: GetSet,
    bound: boolean, // If "this" refers to function scope
    isGenerator: boolean,
    isStatic: boolean,
    decorators: Set<Decorator>,
    returnType?: TypeSignature,
    isAbstract: boolean, // TODO implement on IClassMember
}

export class FunctionDeclaration implements IFunctionDeclaration, FunctionOptions {
    name?: TypeSignature; // Null signifies anonymous function 
    returnType?: TypeSignature;
    statements: Array<Statements>;
    parameters: Array<VariableDeclaration>;
    parent: ClassDeclaration | ObjectLiteral | Module;

    decorators: Set<Decorator>;

    bound: boolean = true; // If "this" returns to function context
    getSet?: GetSet;
    isAsync: boolean = false;
    isGenerator: boolean = false;
    isStatic: boolean = false;
    isAbstract: boolean = false;

    get actualName() {
        return this.name?.name ?? null;
    }

    constructor(
        name: TypeSignature | string | null = null,
        parameters: string[] | VariableDeclaration[] = [],
        statements: Array<Statements> = [],
        options: Partial<FunctionOptions> = {}
    ) {
        if (name) {
            if (typeof name === "string") {
                this.name = new TypeSignature({ name });
            } else {
                this.name = name;
            }
        }
        let params: VariableDeclaration[];
        // If parameters array of string convert all there values to VariableDeclarations
        if (typeof parameters[0] === "string") {
            params = (parameters as string[]).map(param =>
                new VariableDeclaration(param, { context: VariableContext.Parameter }));
        } else {
            params = parameters as VariableDeclaration[];
            // Enforce each parameter has context of parameter
            for (const param of params) {
                param.context = VariableContext.Parameter;
            }
        }

        this.parameters = params;
        this.statements = statements;
        Object.assign(this, options); // TODO not sure about this
    }

    /**
     * Helper method for generating a argument list for calling this function. Basically implements named named parameters by generating a in order list of arguments
     * @param argumentMap 
     */
    buildArgumentListFromArgumentsMap(argumentMap: Map<string, IValue>): ArgumentList {
        const args: Array<IValue> = [];
        for (const param of this.parameters) {
            const arg = argumentMap.get(param.name);
            // TODO or optional
            if (!arg && !param.value) {
                throw Error(`No argument found for parameter "${param.name}"`)
            }
            if (arg) {
                args.push(arg);
            }
        }

        return new ArgumentList(args);
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        settings = makeRenderSettings(settings);
        let acc = "";

        if (this.isAbstract && settings.scriptLanguage !== ScriptLanguages.Typescript) return acc;

        if (this.isStatic) acc += "static ";
        if (this.isAsync) acc += "async ";

        // If not bound then it is considered an arrow function
        if (!this.bound && !this.name) {
            // If only one parameter and it is not destructuring use shorthand
            if (
                this.parameters.length === 1
                && this.parameters[0].name
                && settings.scriptLanguage === ScriptLanguages.Javascript // Cannot do shorthand with type signature
                && !this.isAsync
            ) {
                acc += this.parameters[0].render(settings);
            } else {
                acc += "(";
                for (const parameter of this.parameters) {
                    acc += parameter.render(settings);
                    if (parameter !== this.parameters[this.parameters.length - 1]) acc += settings.minify ? "," : ", ";
                }
                acc += ")";
            }
            acc += settings.minify ? "=>" : " => ";
            // If single return statement use shorthand
            if (
                this.statements.length === 1
                && this.statements[0] instanceof ReturnStatement
                && (this.statements[0] as ReturnStatement).returnValue
            ) {
                const { returnValue } = this.statements[0] as ReturnStatement;
                // Parenthesize object literals to prevent mixup with block
                if (returnValue instanceof ObjectLiteral) {
                    acc += `(${returnValue.render(settings)})`;
                } else {
                    acc += returnValue!.render(settings);
                }
            } else {
                acc += "{";
                acc += renderBlock(this.statements, settings);
                acc += "}";
            }
            return acc;
        } else {
            const asMember = this.parent instanceof ClassDeclaration || this.parent instanceof ObjectLiteral;
            if (asMember) {
                if (this.getSet === GetSet.Get) {
                    acc += "get ";
                } else if (this.getSet === GetSet.Set) {
                    acc += "set ";
                }
            } else if (this.bound) {
                acc += "function";
            }
            if (this.isGenerator) acc += "*";
            if (this.name) {
                if (!asMember) acc += " "
                if (settings.scriptLanguage === ScriptLanguages.Typescript) {
                    acc += this.name.render(settings);
                } else {
                    acc += this.name.name;
                }
            }
            acc += "(";
            for (let i = 0; i < this.parameters.length; i++) {
                // If the first parameter and name is "this" TypeScript uses it as a type annotation for "this"
                // https://www.typescriptlang.org/docs/handbook/functions.html#this-parameters
                const parameter = this.parameters[i];
                if (i === 0 && parameter.name === "this" && settings.scriptLanguage !== ScriptLanguages.Typescript) continue;
                acc += parameter.render(settings);
                if (i < this.parameters.length - 1) {
                    acc += settings.minify ? "," : ", ";
                }
            }
            acc += ")";
            if (settings.scriptLanguage === ScriptLanguages.Typescript && this.returnType) {
                acc += ": ";
                acc += this.returnType.render(settings);
            }
            if (!settings.minify) {
                acc += " ";
            }
            acc += "{";
            acc += renderBlock(this.statements, settings);
            acc += "}";
            return acc;
        }
    }

    static fromTokens(
        reader: TokenReader<JSToken>,
        parent?: ClassDeclaration | ObjectLiteral,
        modifiers?: Set<JSToken>,
        decorators?: Set<Decorator>
    ): FunctionDeclaration {
        let async = false;
        if (reader.current.type === JSToken.Async) {
            async = true;
            reader.move();
        }

        let getSet: GetSet | undefined;
        let isStatic = false
        if (modifiers) {
            for (const modifier of modifiers) {
                switch (modifier) {
                    case JSToken.Get: getSet = GetSet.Get; break;
                    case JSToken.Set: getSet = GetSet.Set; break;
                    case JSToken.Static: isStatic = true; break;
                }
            }
        }

        if (reader.current.type === JSToken.Function || parent) {
            if (reader.current.type === JSToken.Function) reader.move();

            let generator: boolean = false;
            if (reader.current.type === JSToken.Multiply) {
                generator = true;
                reader.move();
            }

            let name: TypeSignature | null = null;
            if (reader.current.type !== JSToken.OpenBracket) {
                name = TypeSignature.fromTokens(reader);
            }
            const parameters = parseFunctionParams(reader);
            let returnType: TypeSignature | undefined;
            if (reader.current.type === JSToken.Colon) {
                reader.move();
                returnType = TypeSignature.fromTokens(reader)
            };

            // Early return as abstract methods don't need bodies
            if (modifiers && modifiers.has(JSToken.Abstract)) {
                if (reader.current.type === JSToken.SemiColon) reader.move();
                return new FunctionDeclaration(name, parameters, [], {
                    parent: parent,
                    bound: true,
                    isAbstract: true,
                    isGenerator: generator,
                    isStatic,
                    isAsync: async,
                    getSet,
                    returnType,
                    decorators: new Set(decorators)
                });
            }

            reader.expect(JSToken.OpenCurly);
            const statements = parseBlock(reader);

            return new FunctionDeclaration(name, parameters, statements, {
                parent: parent,
                bound: true,
                isGenerator: generator,
                isStatic,
                isAsync: async,
                getSet,
                returnType,
                decorators: new Set(decorators)
            });
        } else {
            let params: VariableDeclaration[];
            if (reader.current.type !== JSToken.OpenBracket) {
                // TODO assert reader.current.value is not null here:
                params = [new VariableDeclaration(reader.current.value!)];
                reader.move();
            } else {
                params = parseFunctionParams(reader);
            }
            reader.expectNext(JSToken.ArrowFunction);
            let statements: Statements[];
            if (reader.current.type as JSToken !== JSToken.OpenCurly) {
                // If next token is void assume it is not meant to return
                if (reader.peek()?.type === JSToken.Void) {
                    reader.move();
                    statements = [Expression.fromTokens(reader)];
                } else {
                    statements = [new ReturnStatement(Expression.fromTokens(reader))];
                }
            } else {
                statements = parseBlock(reader);
            }
            return new FunctionDeclaration(null, params, statements, { bound: false, isAsync: async });
        }
    }

    static fromString(string: string): FunctionDeclaration {
        const reader = stringToTokens(string);
        const func = FunctionDeclaration.fromTokens(reader);
        reader.expect(JSToken.EOF);
        return func;
    }
}