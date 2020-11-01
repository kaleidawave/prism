import { StatementTypes } from "./statement";
import { TokenReader, IRenderSettings, defaultRenderSettings, IRenderable } from "../../../helpers";
import { JSToken } from "../../javascript";
import { ValueTypes } from "../value/value";
import { Expression } from "../value/expression";
import { parseBlock, renderBlock } from "../constructs/block";

export class WhileStatement implements IRenderable {

    constructor(
        public expression: ValueTypes,
        public statements: Array<StatementTypes>
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "while";
        if (!settings.minify) acc += " ";
        acc += "(";
        acc += this.expression.render(settings);
        acc += ")";
        if (!settings.minify) acc += " ";
        acc += "{";
        acc += renderBlock(this.statements, settings);
        acc += "}";
        return acc;
    }

    static fromTokens(reader: TokenReader<JSToken>): WhileStatement {
        reader.expectNext(JSToken.While);
        reader.expectNext(JSToken.OpenBracket);
        const condition = Expression.fromTokens(reader);
        reader.expectNext(JSToken.CloseBracket);
        const statements = parseBlock(reader);
        return new WhileStatement(condition, statements)
    }
}

export class DoWhileStatement implements IRenderable {

    constructor(
        public expression: ValueTypes,
        public statements: Array<StatementTypes>
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "do";
        if (!settings.minify) acc += " ";
        acc += "{";
        acc += renderBlock(this.statements, settings);
        acc += "}";
        if (!settings.minify) acc += " ";
        acc += "while"
        if (!settings.minify) acc += " ";
        acc += "(";
        acc += this.expression.render(settings);
        acc += ")";
        return acc;
    }

    static fromTokens(reader: TokenReader<JSToken>): WhileStatement {
        reader.expectNext(JSToken.Do);
        const statements = parseBlock(reader);
        reader.expectNext(JSToken.While);
        reader.expectNext(JSToken.OpenBracket)
        const condition = Expression.fromTokens(reader);
        reader.expectNext(JSToken.CloseBracket);
        return new DoWhileStatement(condition, statements)
    }
}
