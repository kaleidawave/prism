import { TokenReader, ITokenizationSettings, createCombineMap, characterIsNumber } from "../helpers";

export enum CSSToken {
    Identifier, Comment, StringLiteral, NumberLiteral,

    OpenCurly, CloseCurly,
    OpenBracket, CloseBracket,
    OpenSquare, CloseSquare,

    Dot, Hash, Colon, DoubleColon, SemiColon, At,
    And, Plus, Tilde, Bar, Dollar, Hat,
    Child, Comma, Star, ForwardSlash,

    Equal, SomeWordEqual, BeginsWithEqual, PrefixedEqual, SuffixedEqual, OccurrenceEqual,

    EOF
}

const symbols: Array<[string, CSSToken]> = [
    ["{", CSSToken.OpenCurly],
    ["}", CSSToken.CloseCurly],
    ["(", CSSToken.OpenBracket],
    [")", CSSToken.CloseBracket],
    ["[", CSSToken.OpenSquare],
    ["]", CSSToken.CloseSquare],
    [".", CSSToken.Dot],
    ["#", CSSToken.Hash],
    [">", CSSToken.Child],
    [",", CSSToken.Comma],
    [":", CSSToken.Colon],
    ["\"", CSSToken.StringLiteral],
    ["'", CSSToken.StringLiteral],
    [";", CSSToken.SemiColon],
    ["*", CSSToken.Star],
    ["/", CSSToken.ForwardSlash],
    ["@", CSSToken.At],
    ["&", CSSToken.And],
    ["+", CSSToken.Plus],
    ["=", CSSToken.Equal],
    ["~", CSSToken.Tilde],
    ["|", CSSToken.Bar],
    ["$", CSSToken.Dollar],
    ["^", CSSToken.Hat],
];

const symbolsMap: Map<string, CSSToken> = new Map(symbols);

const combinations: Array<[Array<CSSToken>, CSSToken]> = [
    [[CSSToken.ForwardSlash, CSSToken.Star], CSSToken.Comment], // /*
    [[CSSToken.Colon, CSSToken.Colon], CSSToken.DoubleColon], // ::
    // Used in attribute selectors:
    [[CSSToken.Tilde, CSSToken.Equal], CSSToken.SomeWordEqual], // ~=
    [[CSSToken.Bar, CSSToken.Equal], CSSToken.BeginsWithEqual], // |=
    [[CSSToken.Hat, CSSToken.Equal], CSSToken.PrefixedEqual], // ^=
    [[CSSToken.Dollar, CSSToken.Equal], CSSToken.SuffixedEqual], // $=
    [[CSSToken.Star, CSSToken.Equal], CSSToken.OccurrenceEqual], // *=
];

export const tokenToKeywordMap: Map<CSSToken, string> = new Map(symbols.map(([str, token]) => [token, str]) as any);
// Reverse tokens formed from collapsation into the token-to-keyword map
combinations.forEach(([group, token]) => {
    tokenToKeywordMap.set(token, group.map(t => tokenToKeywordMap.get(t)).join(""))
});

tokenToKeywordMap.set(CSSToken.Identifier, "Ident");
tokenToKeywordMap.set(CSSToken.EOF, "End of file");
tokenToKeywordMap.set(CSSToken.StringLiteral, "String");
tokenToKeywordMap.set(CSSToken.NumberLiteral, "Number");

const combineMap = createCombineMap(combinations);

enum Literals {
    SingleQuoteString, DoubleQuoteString, Number, Comment
}

export function stringToTokens(css: string, settings: ITokenizationSettings = {}): TokenReader<CSSToken> {
    const reader = new TokenReader<CSSToken>({
        combinations: combineMap,
        reverse: tokenToKeywordMap,
        file: settings.file ?? null
    });

    let index = 0;
    let acc = "";
    let escaped = false; // Used in string literals to escape quotation marks etc, e.g: "\""
    let line = settings.lineOffset || 1;
    let column = settings.columnOffset || 0;
    let currentLiteral: Literals | null = null;

    while (index < css.length) {
        // Updates line and character token position:
        if (css[index] === "\n") {
            line++;
            column = 0;
        } else {
            column++;
        }

        if (currentLiteral !== null) {
            switch (currentLiteral) {
                case Literals.Comment:
                    if (css.startsWith("*/", index)) {
                        reader.top.value = reader.top.value!.trim();
                        index++; column++;
                        currentLiteral = null;
                    } else {
                        reader.top.value += css[index];
                    }
                    break;
                case Literals.Number:
                    if (characterIsNumber(css[index]) || css[index] === ".") {
                        reader.top.value += css[index];
                    } else {
                        currentLiteral = null;
                        index--; column--;
                    }
                    break;
                case Literals.SingleQuoteString:
                    if (css[index] === "'" && !escaped) {
                        currentLiteral = null;
                    } else if (css[index] === "\n") {
                        reader.throwError(`New line in string ${line}:${column}`)
                    } else {
                        escaped = css[index] === "\\";
                        reader.top.value += css[index];
                    }
                    break;
                case Literals.DoubleQuoteString:
                    if (css[index] === "\"" && !escaped) {
                        currentLiteral = null;
                    } else if (css[index] === "\n") {
                        reader.throwError(`New line in string ${line}:${column}`)
                    } else {
                        escaped = css[index] === "\\";
                        reader.top.value += css[index];
                    }
                    break;
            }
        } else if (symbolsMap.has(css[index])) {
            // TODO temp && acc !== EOL
            if (acc.length > 0) {
                reader.add({ type: CSSToken.Identifier, value: acc, column: column - acc.length, line });
                acc = "";
            }
            const type = symbolsMap.get(css[index])!;
            reader.add({ type, column, line });

            const topType = reader.top.type;
            if (topType === CSSToken.Comment) {
                currentLiteral = Literals.Comment;
            } else if (topType === CSSToken.StringLiteral) {
                reader.top.value = "";
                currentLiteral = css[index] === "'" ? Literals.SingleQuoteString : Literals.DoubleQuoteString;
            } else if (topType === CSSToken.Dot) {
                if (characterIsNumber(css[index + 1])) {
                    reader.pop();
                    reader.add({ type: CSSToken.NumberLiteral, value: ".", column, line });
                    currentLiteral = Literals.Number;
                }
            }
        } else if (
            acc.length === 0
            && characterIsNumber(css[index])
            && reader.top?.type !== CSSToken.Hash
            || css[index] === "+"
            || (
                css[index] === "-"
                && characterIsNumber(css[index + 1])
            )
        ) {
            if (acc.length > 0) {
                reader.add({ type: CSSToken.Identifier, value: acc, column: column - acc.length, line });
                acc = "";
            }
            reader.add({ type: CSSToken.NumberLiteral, column, line, value: css[index] });
            currentLiteral = Literals.Number;
        } else if (css[index] === " ") {
            if (acc.length > 0) {
                reader.add({ type: CSSToken.Identifier, value: acc, column: column - acc.length, line });
                acc = "";
            }
        } else {
            if (css[index] !== "\n" && css[index] !== "\r") {
                acc += css[index];
            }
        }
        index++;
    }
    if (currentLiteral !== null) throw Error("End finish"); // TODO better error message

    if (acc.length > 0) {
        reader.add({ type: CSSToken.Identifier, value: acc, column: column - acc.length, line });
    }
    reader.add({ type: CSSToken.EOF, column, line });
    return reader;
}