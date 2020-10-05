import { TokenReader, IRenderSettings, defaultRenderSettings } from "../helpers";
import { CSSToken, stringToTokens } from "./css";
import { Rule } from "./rule";

/* CSS Values: */
interface IFunctionCall {
    name: string,
    arguments: CSSValue
}

interface IValue {
    value: string,
    quotationWrapped?: boolean,
    unit?: string,
}

export type CSSValue = Array<IValue | IFunctionCall | "," | "/">;

export function parseValue(reader: TokenReader<CSSToken>): CSSValue {
    // TODO "," | "/" are temp
    let values: Array<IValue | IFunctionCall | "," | "/"> = [];
    while (reader.current) {
        if (reader.peek()?.type === CSSToken.OpenBracket) {
            const name = reader.current.value!;
            reader.move(2);
            const args = parseValue(reader);
            reader.expectNext(CSSToken.CloseBracket);
            values.push({ name, arguments: args });
        } else {
            if (
                reader.current.type === CSSToken.NumberLiteral
                && reader.peek()?.type === CSSToken.Identifier
                && (reader.current.column + reader.current.value!.length) === reader.peek()?.column
            ) {
                const number = reader.current.value!;
                reader.move();
                const unit = reader.current.value!;
                values.push({ value: number, unit });
                reader.move();
            } else if (reader.current.type === CSSToken.Hash) {
                reader.move();
                values.push({ value: "#" + reader.current.value! });
                reader.move();
            } else if (
                reader.current.type === CSSToken.NumberLiteral
                || reader.current.type === CSSToken.StringLiteral
                || reader.current.type === CSSToken.Identifier
            ) {
                const quotationWrapped = reader.current.type === CSSToken.StringLiteral;
                values.push({ value: reader.current.value!, quotationWrapped });
                reader.move();
            } else {
                reader.throwExpect("Expected value");
            }
        }
        if ([CSSToken.CloseBracket, CSSToken.SemiColon, CSSToken.CloseCurly].includes(reader.current.type)) {
            break;
        }
        if (reader.current.type === CSSToken.Comma) {
            values.push(",");
            reader.move();
        } else if (reader.current.type === CSSToken.ForwardSlash) {
            values.push("/");
            reader.move();
        }
    }
    return values;
}

// [key: value]
export type Declaration = [string, CSSValue];

export function parseSingleDeclaration(reader: TokenReader<CSSToken>): Declaration {
    reader.expect(CSSToken.Identifier);
    const key = reader.current.value!;
    reader.move();
    reader.expectNext(CSSToken.Colon);
    const value = parseValue(reader);
    return [key, value];
}

/**
 * @param reader 
 * @param parseNestedRules 
 */
export function parseStylingDeclarations(reader: TokenReader<CSSToken>, parseNestedRules = true): [Array<Declaration>, Array<Rule>] {
    const declarations: Array<Declaration> = [];
    const rules: Array<Rule> = [];
    while (reader.current.type !== CSSToken.CloseCurly && reader.current.type !== CSSToken.EOF) {
        if (reader.current.type === CSSToken.Comment) {
            reader.move();
            continue;
        }
        // Test whether it is a declaration or a nested rule
        const tokensToStopAt = new Set([CSSToken.OpenCurly, CSSToken.CloseCurly, CSSToken.SemiColon, CSSToken.EOF])
        const [end] = reader.run((tokenType) => tokensToStopAt.has(tokenType));

        // Parse it as a value:
        if (end === CSSToken.SemiColon || end === CSSToken.CloseCurly || end === CSSToken.EOF || !parseNestedRules) {
            const declaration = parseSingleDeclaration(reader);
            declarations.push(declaration);
            if (reader.current.type == CSSToken.SemiColon) {
                reader.move();
            } else {
                break; // Last declaration can miss out semi colon so break
            }
        } 
        // Parse it as a sub rule
        else {
            rules.push(...Rule.fromTokens(reader));
        }
    }
    return [declarations, rules]
}

export function parseStylingDeclarationsFromString(string: string) {
    const reader = stringToTokens(string);
    const [declarations] = parseStylingDeclarations(reader, false);
    reader.expect(CSSToken.EOF);
    return declarations;
}

/**
 * Renders out a CSSValue
 * @param value 
 * @param settings 
 */
export function renderValue(
    value: CSSValue | IFunctionCall | IValue | "," | "/",
    settings: IRenderSettings = defaultRenderSettings
): string {
    if (typeof value === "string") {
        return value;
    } else if ("name" in value && "arguments" in value) {
        return `${value.name}(${renderValue(value.arguments, settings)})`;
    } else if ("value" in value) {
        if (value.quotationWrapped) return `"${value.value}"`;
        return value.value + (value.unit ?? "");
    } else {
        let acc = "";
        for (let i = 0; i < value.length; i++) {
            acc += renderValue(value[i], settings);
            if (!(value[i] === "," || value[i + 1] === ",") && value[i + 1]) {
                acc += " ";
            }
        }
        return acc;
    }
}