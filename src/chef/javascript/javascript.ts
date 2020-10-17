import { TokenReader, Token, characterIsNumber, ITokenizationSettings, createCombineMap } from "../helpers";

export enum JSToken {
    Identifier, StringLiteral, NumberLiteral, RegexLiteral, TemplateLiteralString,
    TemplateLiteralStart, TemplateLiteralEnd, SingleQuote, DoubleQuote, HashBang,
    Backslash,
    Comma, SemiColon, Colon, Dot, At,
    Const, Var, Let,
    New, Spread, Assign, ArrowFunction,
    OpenBracket, CloseBracket, OpenCurly, CloseCurly, OpenSquare, CloseSquare, OpenAngle, CloseAngle,
    If, Else, For, While, Do, Switch,
    Case, Yield, DelegatedYield, Return, Continue, Break,
    Class, Function,
    Enum, Interface, Type,
    Import, Export, Default, From,
    In, Of,
    TypeOf, InstanceOf, Void, Delete,
    This, Super,
    Try, Catch, Finally, Throw,
    Async, Await,
    Static, Abstract,
    Get, Set,
    Extends, Implements,
    MultilineComment, Comment,
    True, False,
    Plus, Minus, Multiply, Divide,
    QuestionMark, Percent, Exponent, Remainder,
    PlusAssign, SubtractAssign, MultiplyAssign, DivideAssign, ExponentAssign, RemainderAssign,
    Increment, Decrement,
    BitwiseShiftLeft, BitwiseShiftRight, UnaryBitwiseShiftRight,
    BitwiseNot, BitwiseOr, BitwiseXor, BitwiseAnd,
    LogicalOr, LogicalAnd, LogicalNot,
    BitwiseOrAssign, BitwiseAndAssign, BitwiseXorAssign,
    LeftShift, RightShift,
    LeftShiftAssign, RightShiftAssign,
    Equal, NotEqual, StrictEqual, StrictNotEqual,
    GreaterThanEqual, LessThanEqual,
    Private, Public, Protected,
    Null, Undefined,
    OptionalChain, NullishCoalescing, OptionalMember,
    HashTag,
    As,
    EOF,
}

export const commentTokens = [JSToken.Comment, JSToken.MultilineComment];

// All symbols in Javascript. If encountered during tokenization it will cut accumulation
const symbols: Array<[string, JSToken]> = [
    ["{", JSToken.OpenCurly],
    ["}", JSToken.CloseCurly],
    ["[", JSToken.OpenSquare],
    ["]", JSToken.CloseSquare],
    ["<", JSToken.OpenAngle],
    [">", JSToken.CloseAngle],
    ["(", JSToken.OpenBracket],
    [")", JSToken.CloseBracket],
    [":", JSToken.Colon],
    [",", JSToken.Comma],
    [".", JSToken.Dot],
    ["@", JSToken.At],
    [";", JSToken.SemiColon],
    ["+", JSToken.Plus],
    ["-", JSToken.Minus],
    ["*", JSToken.Multiply],
    ["&", JSToken.BitwiseAnd],
    ["^", JSToken.BitwiseXor],
    ["=", JSToken.Assign],
    ["'", JSToken.SingleQuote],
    ["\"", JSToken.DoubleQuote],
    ["|", JSToken.BitwiseOr],
    ["?", JSToken.QuestionMark],
    ["#", JSToken.HashTag],
    ["%", JSToken.Percent],
    ["!", JSToken.LogicalNot],
    ["~", JSToken.BitwiseNot],
    ["`", JSToken.TemplateLiteralStart],
    ["/", JSToken.Divide],
    ["\\", JSToken.Backslash],
];

// Maps symbols to a JSToken
const symbolsMap: Map<string, JSToken> = new Map(symbols);

const keywords: Array<[string, JSToken]> = [
    ["const", JSToken.Const],
    ["var", JSToken.Var],
    ["let", JSToken.Let],
    ["new", JSToken.New],
    ["if", JSToken.If],
    ["else", JSToken.Else],
    ["for", JSToken.For],
    ["while", JSToken.While],
    ["do", JSToken.Do],
    ["switch", JSToken.Switch],
    ["case", JSToken.Case],
    ["yield", JSToken.Yield],
    ["return", JSToken.Return],
    ["continue", JSToken.Continue],
    ["break", JSToken.Break],
    ["class", JSToken.Class],
    ["enum", JSToken.Enum],
    ["interface", JSToken.Interface],
    ["function", JSToken.Function],
    ["import", JSToken.Import],
    ["export", JSToken.Export],
    ["default", JSToken.Default],
    ["from", JSToken.From],
    ["in", JSToken.In],
    ["of", JSToken.Of],
    ["typeof", JSToken.TypeOf],
    ["instanceof", JSToken.InstanceOf],
    ["void", JSToken.Void],
    ["delete", JSToken.Delete],
    ["this", JSToken.This],
    ["super", JSToken.Super],
    ["try", JSToken.Try],
    ["catch", JSToken.Catch],
    ["finally", JSToken.Finally],
    ["throw", JSToken.Throw],
    ["async", JSToken.Async],
    ["await", JSToken.Await],
    ["static", JSToken.Static],
    ["abstract", JSToken.Abstract],
    ["get", JSToken.Get],
    ["set", JSToken.Set],
    ["extends", JSToken.Extends],
    ["implements", JSToken.Implements],
    ["true", JSToken.True],
    ["false", JSToken.False],
    ["public", JSToken.Public],
    ["private", JSToken.Private],
    ["protected", JSToken.Protected],
    ["null", JSToken.Null],
    ["undefined", JSToken.Undefined],
    ["as", JSToken.As],
    ["type", JSToken.Type],
];

// Maps keywords to tokens
const keywordMap: Map<string, JSToken> = new Map(keywords);

// A series of sequences which when match the head of token reader matches will be collapsed into to the token on rhs
// TODO more assignments
const combine: Array<[Array<JSToken>, JSToken]> = [
    [[JSToken.Plus, JSToken.Assign], JSToken.PlusAssign], // +=
    [[JSToken.Dot, JSToken.Dot, JSToken.Dot], JSToken.Spread], // ...
    [[JSToken.Minus, JSToken.Assign], JSToken.SubtractAssign], // -=
    [[JSToken.Multiply, JSToken.Assign], JSToken.MultiplyAssign], // *=
    [[JSToken.Divide, JSToken.Assign], JSToken.DivideAssign], // /=
    [[JSToken.Plus, JSToken.Plus], JSToken.Increment], // ++
    [[JSToken.Minus, JSToken.Minus], JSToken.Decrement], // --
    [[JSToken.Assign, JSToken.CloseAngle], JSToken.ArrowFunction], // =>
    [[JSToken.OpenAngle, JSToken.Assign], JSToken.LessThanEqual], // <=
    [[JSToken.CloseAngle, JSToken.Assign], JSToken.GreaterThanEqual], // >=
    [[JSToken.Multiply, JSToken.Multiply], JSToken.Exponent], // **
    [[JSToken.Remainder, JSToken.Assign], JSToken.RemainderAssign], // %=
    [[JSToken.Divide, JSToken.Divide], JSToken.Comment], // //
    [[JSToken.Divide, JSToken.Multiply], JSToken.MultilineComment], // /* */
    [[JSToken.Assign, JSToken.Assign], JSToken.Equal], // ==
    [[JSToken.Equal, JSToken.Assign], JSToken.StrictEqual], // ===
    [[JSToken.LogicalNot, JSToken.Assign], JSToken.NotEqual], // !=
    [[JSToken.NotEqual, JSToken.Assign], JSToken.StrictNotEqual], // !==
    [[JSToken.OpenAngle, JSToken.OpenAngle], JSToken.BitwiseShiftLeft], // <<
    [[JSToken.CloseAngle, JSToken.CloseAngle], JSToken.BitwiseShiftRight], // >>
    [[JSToken.BitwiseShiftRight, JSToken.CloseAngle], JSToken.UnaryBitwiseShiftRight], // >>>
    [[JSToken.BitwiseOr, JSToken.BitwiseOr], JSToken.LogicalOr], // ||
    [[JSToken.BitwiseAnd, JSToken.BitwiseAnd], JSToken.LogicalAnd], // &&
    [[JSToken.QuestionMark, JSToken.Dot], JSToken.OptionalChain], // ?.
    [[JSToken.QuestionMark, JSToken.QuestionMark], JSToken.NullishCoalescing], // ??
    [[JSToken.Yield, JSToken.Multiply], JSToken.DelegatedYield], // yield*
    [[JSToken.QuestionMark, JSToken.Colon], JSToken.OptionalMember], // ?:
];

// A map that reverses tokens to there original form
const tokenToKeyword = keywords.concat(symbols).map(([string, token]) => [token, string]);
export const tokenToKeywordMap: Map<JSToken, string> = new Map(tokenToKeyword as any);
// Reverse tokens formed from collapsation into the token-to-keyword map
combine.forEach(([group, token]) => {
    tokenToKeywordMap.set(token, group.map(t => tokenToKeywordMap.get(t)).join(""))
});

// Setup reverses for tokens with no identifer
tokenToKeywordMap.set(JSToken.Identifier, "Identifier");
tokenToKeywordMap.set(JSToken.NumberLiteral, "Number");
tokenToKeywordMap.set(JSToken.StringLiteral, "String");
tokenToKeywordMap.set(JSToken.RegexLiteral, "RegularExpression");
tokenToKeywordMap.set(JSToken.TemplateLiteralString, "Template literal");
tokenToKeywordMap.set(JSToken.TemplateLiteralStart, "Template literal start");
tokenToKeywordMap.set(JSToken.TemplateLiteralEnd, "Template literal end");
tokenToKeywordMap.set(JSToken.EOF, "End of script");
tokenToKeywordMap.set(JSToken.Comment, "Comment");
tokenToKeywordMap.set(JSToken.MultilineComment, "Multiline comment");

function addIdent(string: string, column: number, line: number): Token<JSToken> {
    if (keywordMap.has(string)) {
        return { type: keywordMap.get(string)!, column: column - string.length, line };
    } else {
        return { type: JSToken.Identifier, value: string, column: column - string.length, line };
    }
}

enum Literals {
    Regex, Number, SingleQuoteString, DoubleQuoteString, Template, Comment, MultilineComment, Ident, HashBang
}

const combineMap = createCombineMap(combine);

const lengthMap = new Map();
for (const [str, token] of symbols.concat(keywords)) {
    lengthMap.set(token, str.length);

}
export function stringToTokens(javascript: string, settings: ITokenizationSettings = {}): TokenReader<JSToken> {
    const reader = new TokenReader<JSToken>({
        combinations: combineMap,
        reverse: tokenToKeywordMap,
        file: settings.file || null,
        tokenLengths: lengthMap
    });

    let index = 0;
    let acc = "";
    let escaped = false; // Used in string literals to escape quotation marks etc, e.g: "\""
    let line = settings.lineOffset || 1;
    let column = settings.columnOffset || 0;
    let currentLiteral: Literals | null = null;
    let templateLiteralDepth = 0;
    let curlyCount: Array<number> = []; // little workaround for templateLiterals

    while (index < javascript.length) {
        // Updates line and character token position:
        if (javascript[index] === "\n") {
            line++;
            column = 0;
        } else {
            column++;
        }

        // If currently tokenizing literal
        if (currentLiteral !== null) {
            switch (currentLiteral) {
                case Literals.Number:
                    if (characterIsNumber(javascript[index])) {
                        reader.top.value += javascript[index];
                    } else if (javascript[index] === "." && !reader.top.value?.includes(".")) {
                        reader.top.value += javascript[index];
                    }
                    // Numerical separators
                    else if (!reader.top.value?.endsWith("_") && javascript[index] === "_") {
                        reader.top.value += javascript[index];
                    }
                    // Hex, binary and octal literals
                    else if (reader.top.value === "0" && "xbo".includes(javascript[index])) {
                        reader.top.value += javascript[index];
                    }
                    // Big int 
                    else if (javascript[index] === "n") {
                        reader.top.value += javascript[index];
                        currentLiteral = null;
                    }
                    // Exponential syntax 
                    else if (javascript[index] === "e" && !reader.top.value?.includes("e")) {
                        reader.top.value += javascript[index];
                    }
                    // Hex syntax
                    else if (reader.top.value?.[1] === "x" && "abcdef".includes(javascript[index].toLowerCase())) {
                        reader.top.value += javascript[index];
                    } else {
                        currentLiteral = null;
                        column--; index--;
                    }
                    break;
                case Literals.Comment:
                    if (javascript[index] === "\n") {
                        reader.top.value = reader.top.value!.trim();
                        currentLiteral = null;
                    } else {
                        reader.top.value += javascript[index];
                    }
                    break;
                case Literals.HashBang:
                    if (javascript[index] === "\n") {
                        reader.top.value = reader.top.value!.trim();
                        currentLiteral = null;
                    } else {
                        reader.top.value += javascript[index];
                    }
                    break;
                case Literals.MultilineComment:
                    if (javascript.startsWith("*/", index)) {
                        reader.top.value = reader.top.value!.trim();
                        index++; column++;
                        currentLiteral = null;
                    } else {
                        reader.top.value += javascript[index];
                    }
                    break;
                case Literals.SingleQuoteString:
                    if (javascript[index] === "'" && !escaped) {
                        currentLiteral = null;
                    } else if (javascript[index] === "\n") {
                        reader.throwError(`New line in string ${line}:${column}`)
                    } else {
                        escaped = javascript[index] === "\\";
                        reader.top.value += javascript[index];
                    }
                    break;
                case Literals.DoubleQuoteString:
                    if (javascript[index] === "\"" && !escaped) {
                        currentLiteral = null;
                    } else if (javascript[index] === "\n") {
                        reader.throwError(`New line in string ${line}:${column}`)
                    } else {
                        escaped = javascript[index] === "\\";
                        reader.top.value += javascript[index];
                    }
                    break;
                case Literals.Regex:
                    if (javascript[index] === "/" && !escaped) {
                        currentLiteral = null;
                    } else {
                        escaped = javascript[index] === "\\";
                        reader.top.value += javascript[index];
                    }
                    break;
                case Literals.Template:
                    if (javascript[index] === "`" && !escaped) {
                        currentLiteral = null;
                        templateLiteralDepth--;
                        reader.add({ type: JSToken.TemplateLiteralEnd, line, column });
                    } else if (javascript.startsWith("${", index) && !escaped) {
                        index++; column++;
                        curlyCount.push(1);
                        currentLiteral = null;
                    } else {
                        if (javascript[index] === "\\") escaped = true;
                        else escaped = false;
                        reader.top.value += javascript[index];
                    }
                    break;
                // Deals with unicode variables names eg: \u{00ab} \\u\{([0-9a-fA-F]{1,})\}
                case Literals.Ident:
                    if (reader.top.value === "\\") {
                        if (javascript[index] !== "u") reader.throwExpect(`"u" in unicode variable identifier`);
                        reader.top.value += "u";
                    } else if (reader.top.value?.length === 2 && javascript[index] === "{") {
                        reader.top.value += "{";
                    } else if (javascript[index] === "}") {
                        reader.top.value += "}";
                        currentLiteral = null;
                    } else if (reader.top.value!.length > 2) {
                        const charCode = javascript.charCodeAt(index);
                        if (
                            47 < charCode && charCode < 58 ||
                            64 < charCode && charCode < 71 ||
                            96 < charCode && charCode < 103
                        ) {
                            reader.top.value += javascript[index];
                        } else {
                            currentLiteral = null;
                            column--; index--;
                        }
                    } else {
                        currentLiteral = null;
                        column--; index--;
                    }
                    break;
            }
        }
        // If meets a symbol 
        else if (symbolsMap.has(javascript[index])) {
            if (acc.length > 0) {
                reader.add(addIdent(acc, column, line));
                acc = "";
            }

            const tokenType = symbolsMap.get(javascript[index])!;

            if (templateLiteralDepth > 0) {
                if (tokenType === JSToken.OpenCurly) {
                    curlyCount[templateLiteralDepth - 1]++;
                } else if (tokenType === JSToken.CloseCurly) {
                    curlyCount[templateLiteralDepth - 1]--;
                    if (curlyCount[templateLiteralDepth - 1] === 0) {
                        curlyCount.pop();
                        reader.add({ type: JSToken.TemplateLiteralString, value: "", line, column });
                        currentLiteral = Literals.Template;
                    }
                }
            }

            if (currentLiteral === Literals.Template) { }
            else if (javascript.startsWith("//", index)) {
                index++; column++;
                reader.add({ type: JSToken.Comment, value: "", column, line });
                currentLiteral = Literals.Comment;
            } else if (javascript.startsWith("/*", index)) {
                index++; column++;
                reader.add({ type: JSToken.MultilineComment, value: "", column, line });
                currentLiteral = Literals.MultilineComment;
            } else if (tokenType === JSToken.SingleQuote || tokenType === JSToken.DoubleQuote) {
                reader.add({ type: JSToken.StringLiteral, value: "", line, column })
                currentLiteral = javascript[index] === "\"" ? Literals.DoubleQuoteString : Literals.SingleQuoteString;
            }
            // Divide can also match regex literal 
            else if (tokenType === JSToken.Divide) {
                // TODO expand, explain and extract this list
                const tokensBeforeRegex = [JSToken.Identifier, JSToken.NumberLiteral, JSToken.CloseBracket];
                if (
                    (
                        reader.length === 1 || 
                        (tokensBeforeRegex.includes(reader.peekFromTop(1).type) === false)
                    ) && 
                    "*/".includes(javascript[index + 1]) === false
                ) {
                    reader.add({ type: JSToken.RegexLiteral, value: "", column, line });
                    currentLiteral = Literals.Regex;
                } else {
                    reader.add({ type: tokenType, column, line });
                }
            }
            // For template literals 
            else if (tokenType === JSToken.TemplateLiteralStart) {
                currentLiteral = Literals.Template;
                templateLiteralDepth++;
                reader.add({ type: JSToken.TemplateLiteralStart, column, line });
                reader.add({ type: JSToken.TemplateLiteralString, value: "", column, line });
            }
            // For decimals without number in front e.g  .5
            else if (tokenType === JSToken.Dot && characterIsNumber(javascript[index + 1])) {
                reader.add({ type: JSToken.NumberLiteral, value: ".", column, line });
                currentLiteral = Literals.Number;
            }
            // For unicode variable names 
            else if (tokenType === JSToken.Backslash && javascript[index + 1] === "u") {
                reader.add({ type: JSToken.Identifier, value: "\\", column, line });
                currentLiteral = Literals.Ident;
            }
            // HashBang for nodejs scripts
            else if (tokenType === JSToken.HashTag && reader.length === 0) {
                reader.add({ type: JSToken.HashBang, value: "", column, line });
                currentLiteral = Literals.HashBang;
            } else {
                reader.add({ type: tokenType, column, line });
            }
        }
        // If start of number (#!/usr/bin/env node)
        else if (characterIsNumber(javascript[index]) && acc.length === 0) {
            if (acc.length > 0) {
                reader.add(addIdent(acc, column - 1, line));
                acc = "";
            }
            reader.add({ type: JSToken.NumberLiteral, value: javascript[index], column, line });
            currentLiteral = Literals.Number;
        }
        // If break add the acc as a identifer
        else if (javascript[index] === " " || javascript[index] === "\n" || javascript[index] === "\r") {
            if (acc.length > 0) {
                reader.add(addIdent(acc, column - 1, line));
                acc = "";
            }
        }
        // Else append the accumulator
        else if (javascript[index] !== "\n" && javascript[index] !== "\r") {
            acc += javascript[index];
        }
        index++;
    }

    if (curlyCount.length > 1) {
        reader.throwError("Could not find end to template literal");
    }

    if (currentLiteral === Literals.Comment) {
        reader.top.value = reader.top.value!.trim();
        acc = "";
    } else if (currentLiteral !== null && currentLiteral !== Literals.Number && currentLiteral !== Literals.Ident) {
        reader.throwError(`Could not find end to ${Literals[currentLiteral]}`);
    }

    if (acc.length > 0) {
        reader.add(addIdent(acc, column, line));
    }

    reader.add({ type: JSToken.EOF, column: column + 1, line });

    return reader;
}