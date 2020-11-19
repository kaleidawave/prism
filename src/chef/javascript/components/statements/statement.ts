import { TokenReader, IRenderable, IRenderSettings, defaultRenderSettings } from "../../../helpers";
import { JSToken } from "../../javascript";
import { IfStatement } from "./if";
import { SwitchStatement } from "./switch";
import { Expression } from "../value/expression";
import { VariableDeclaration } from "../statements/variable";
import { ClassDeclaration } from "../constructs/class";
import { ValueTypes } from "../value/value";
import { FunctionDeclaration } from "../constructs/function";
import { ForStatement } from "./for";
import { WhileStatement, DoWhileStatement } from "./while";
import { InterfaceDeclaration } from "../types/interface";
import { EnumDeclaration } from "../types/enum";
import { TryBlock, ThrowStatement } from "./try-catch";
import { Comment } from "./comments";
import { ImportStatement, ExportStatement } from "./import-export";
import { TypeDeclaration } from "../types/statements";
import { Decorator } from "../types/decorator";

export type StatementTypes =
    VariableDeclaration
    | HashBangStatement
    | ClassDeclaration
    | FunctionDeclaration
    | ImportStatement
    | ExportStatement
    | ForStatement
    | DoWhileStatement
    | WhileStatement
    | IfStatement
    | Comment
    | InterfaceDeclaration
    | ReturnStatement
    | BreakStatement
    | ContinueStatement
    | EnumDeclaration
    | SwitchStatement
    | Decorator
    | TypeDeclaration;

export function parseStatement(reader: TokenReader<JSToken>): StatementTypes {
    switch (reader.current.type) {
        case JSToken.Const:
        case JSToken.Let:
        case JSToken.Var:
            return VariableDeclaration.fromTokens(reader);
        case JSToken.For: return ForStatement.fromTokens(reader);
        case JSToken.If: return IfStatement.fromTokens(reader);
        case JSToken.Do: return DoWhileStatement.fromTokens(reader);
        case JSToken.While: return WhileStatement.fromTokens(reader);
        case JSToken.Comment:
        case JSToken.MultilineComment:
            const comment = new Comment(reader.current.value!, reader.current.type === JSToken.MultilineComment);
            reader.move();
            return comment;
        case JSToken.Class: return ClassDeclaration.fromTokens(reader);
        case JSToken.Async:
        case JSToken.Function:
            return FunctionDeclaration.fromTokens(reader);
        case JSToken.Return: return ReturnStatement.fromTokens(reader);
        case JSToken.Abstract:
            reader.move();
            return ClassDeclaration.fromTokens(reader, { isAbstract: true });
        case JSToken.At:
            const decorators: Array<Decorator> = [];
            while (reader.current.type === JSToken.At) {
                decorators.push(Decorator.fromTokens(reader));
            }
            const parsedStatement = parseStatement(reader);
            const statement = parsedStatement instanceof ExportStatement ? parsedStatement.exported : parsedStatement;
            if (
                statement instanceof FunctionDeclaration || 
                statement instanceof ClassDeclaration || 
                statement instanceof InterfaceDeclaration
            ) {
                statement.decorators = decorators;
            } else {
                reader.throwExpect("Expected class or function to proceed decorator");
            }
            return parsedStatement;
        case JSToken.Interface: return InterfaceDeclaration.fromTokens(reader);
        case JSToken.Break: return BreakStatement.fromTokens(reader);
        case JSToken.Continue: return ContinueStatement.fromTokens(reader);
        case JSToken.Enum: return EnumDeclaration.fromTokens(reader);
        case JSToken.Try: return TryBlock.fromTokens(reader);
        case JSToken.Throw: return ThrowStatement.fromTokens(reader);
        case JSToken.Switch: return SwitchStatement.fromTokens(reader);
        case JSToken.Import:
            // Catch for dynamic import
            if (reader.peek()?.type === JSToken.OpenBracket) {
                return Expression.fromTokens(reader);
            } else {
                return ImportStatement.fromTokens(reader);
            }
        case JSToken.Type: return TypeDeclaration.fromTokens(reader);
        case JSToken.Export: return ExportStatement.fromTokens(reader);
        case JSToken.HashBang:
            const path = reader.current.value!;
            reader.move();
            return new HashBangStatement(path);
        default: return Expression.fromTokens(reader);
    }
}

const breakingCharCodes = new Set("({[!-+\"");

export class ReturnStatement implements IRenderable {
    constructor(
        public returnValue: ValueTypes
            | null = null
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "return";
        if (this.returnValue) {
            const returnValue = this.returnValue.render(settings);
            if (!breakingCharCodes.has(returnValue[0])) acc += " ";
            acc += returnValue;
        }
        return acc;
    }

    static fromTokens(reader: TokenReader<JSToken>) {
        reader.move();
        if (reader.current.type === JSToken.SemiColon) {
            reader.move();
            return new ReturnStatement();
        } else if (reader.current.type === JSToken.CloseCurly) {
            return new ReturnStatement();
        }
        return new ReturnStatement(Expression.fromTokens(reader));
    }
}

export class BreakStatement implements IRenderable {
    constructor(
        public label?: string
    ) { }

    render(): string {
        let acc = "break";
        if (typeof this.label !== "undefined") {
            acc += ` ${this.label}`;
        }
        return acc;
    }

    static fromTokens(reader: TokenReader<JSToken>) {
        reader.expectNext(JSToken.Break);
        if (reader.current.type === JSToken.Identifier) {
            const breakStatement = new BreakStatement(reader.current.value);
            reader.move();
            return breakStatement;
        }
        return new BreakStatement();
    }
}

export class ContinueStatement implements IRenderable {
    constructor(
        public label?: string
    ) { }

    render(): string {
        return `continue${this.label ? " " + this.label : ""}`
    }

    static fromTokens(reader: TokenReader<JSToken>) {
        reader.expectNext(JSToken.Continue);
        if (reader.current.type === JSToken.Identifier) {
            const continueStatement = new ContinueStatement(reader.current.value);
            reader.move();
            return continueStatement;
        }
        return new ContinueStatement();
    }
}

export class HashBangStatement implements IRenderable {
    constructor(
        public path: string
    ) { }

    render(): string {
        return `#${this.path}`;
    }
}