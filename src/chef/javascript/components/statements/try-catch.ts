/**
 * Contains declarations for "throw" and "try...catch...finally"
 */

import { StatementTypes } from "./statement";
import { TokenReader, IRenderSettings, defaultRenderSettings, IRenderable } from "../../../helpers";
import { JSToken } from "../../javascript";
import { parseBlock, renderBlock } from "../constructs/block";
import { ValueTypes } from "../value/value";
import { Expression } from "../value/expression";
import { VariableDeclaration, VariableContext } from "../statements/variable";

export class ThrowStatement implements IRenderable {

    constructor(
        public value: ValueTypes
    ) {}

    render(settings: IRenderSettings = defaultRenderSettings): string {
        return `throw ${this.value.render(settings)}`;
    }

    static fromTokens(reader: TokenReader<JSToken>) {
        reader.expectNext(JSToken.Throw);
        const valueToThrow = Expression.fromTokens(reader);
        if (reader.current.type === JSToken.SemiColon) reader.move();
        return new ThrowStatement(valueToThrow);
    }
}

export class TryBlock implements IRenderable {

    constructor (
        public statements: Array<StatementTypes>,
        public catchBlock: CatchBlock | null = null,
        public finallyBlock: FinallyBlock | null = null,
    ) {}

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "try";
        if (!settings.minify) acc += " ";
        acc += "{";
        acc += renderBlock(this.statements, settings);
        acc += "}";
        if (!settings.minify) acc += " ";
        if (this.catchBlock) acc += this.catchBlock.render(settings);
        if (this.finallyBlock) acc += this.finallyBlock!.render(settings);
        return acc;
    }

    static fromTokens(reader: TokenReader<JSToken>) {
        reader.expectNext(JSToken.Try);
        reader.expect(JSToken.OpenCurly);
        const statements = parseBlock(reader);
        let catchBlock: CatchBlock | null = null;
        if (reader.current.type === JSToken.Catch) {
            catchBlock = CatchBlock.fromTokens(reader);
        }
        let finallyBlock: FinallyBlock | null = null;
        if (reader.current.type === JSToken.Finally) {
            finallyBlock = FinallyBlock.fromTokens(reader);
        }
        if (!catchBlock && !finallyBlock) {
            reader.throwExpect("Expected either catch or finally block after try block");
        }
        return new TryBlock(statements, catchBlock, finallyBlock);
    }   
}

export class CatchBlock implements IRenderable {

    constructor (
        public errorVariable: VariableDeclaration | null,
        public statements: Array<StatementTypes>,
    ) {
        if (errorVariable) errorVariable.context = VariableContext.Parameter;
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "catch";
        if (!settings.minify) acc += " ";
        if (this.errorVariable) {
            acc += `(${this.errorVariable.render(settings)})`
        }
        if (!settings.minify) acc += " ";
        acc += "{";
        acc += renderBlock(this.statements,settings);
        acc += "}";
        return acc;
    }

    static fromTokens(reader: TokenReader<JSToken>): CatchBlock {
        reader.expectNext(JSToken.Catch);
        let errorVariable: VariableDeclaration | null = null;
        if (reader.current.type === JSToken.OpenBracket) {
            reader.move();
            errorVariable = VariableDeclaration.fromTokens(reader, {context: VariableContext.Parameter});
            reader.expectNext(JSToken.CloseBracket);
        }
        reader.expect(JSToken.OpenCurly);
        const statements = parseBlock(reader);
        return new CatchBlock(errorVariable, statements);
    }
}

export class FinallyBlock implements IRenderable {

    constructor (
        public statements: Array<StatementTypes>,
    ) {}

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "finally";
        if (!settings.minify) acc += " ";
        acc += "{";
        acc += renderBlock(this.statements, settings);
        acc += "}";
        return acc;
    }

    static fromTokens(reader: TokenReader<JSToken>): FinallyBlock {
        reader.expectNext(JSToken.Finally);
        reader.expect(JSToken.OpenCurly);
        const statements = parseBlock(reader);
        return new FinallyBlock(statements);
    }
}