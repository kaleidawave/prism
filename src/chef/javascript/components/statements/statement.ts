import { TokenReader, IConstruct, IRenderSettings, defaultRenderSettings } from "../../../helpers";
import { JSToken } from "../../javascript";
import { IfStatement } from "./if";
import { SwitchStatement } from "./switch";
import { Expression } from "../value/expression";
import { VariableDeclaration } from "../statements/variable";
import { ClassDeclaration, Decorator } from "../constructs/class";
import { IValue } from "../value/value";
import { FunctionDeclaration } from "../constructs/function";
import { ForStatement } from "./for";
import { WhileStatement, DoWhileStatement } from "./while";
import { InterfaceDeclaration } from "../types/interface";
import { EnumDeclaration } from "../types/enum";
import { TryBlock, ThrowStatement } from "./try-catch";
import { Comment } from "./comments";
import { ImportStatement, ExportStatement } from "./import-export";
import { TypeStatement } from "../types/statements";

export interface IStatement extends IConstruct { }

export function ParseStatement(reader: TokenReader<JSToken>): IStatement {
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
        case JSToken.At: return Decorator.fromTokens(reader);
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
        case JSToken.Type: return TypeStatement.fromTokens(reader);
        case JSToken.Export: return ExportStatement.fromTokens(reader);
        case JSToken.HashBang: return new HashBangStatement(reader.current.value!);
        default: return Expression.fromTokens(reader);
    }
}

export class ReturnStatement implements IStatement {
    constructor(
        public returnValue: IValue | null = null
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "return";
        if (this.returnValue) {
            acc += " " + this.returnValue.render(settings);
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

export class BreakStatement implements IStatement {
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

export class ContinueStatement implements IStatement {
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

export class HashBangStatement implements IStatement {
    constructor(
        public path: string
    ) { }

    render(): string {
        return `#${this.path}`;
    }
}