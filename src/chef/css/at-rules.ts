import { TokenReader, IRenderSettings, defaultRenderSettings } from "../helpers";
import { CSSToken } from "./css";
import { Declaration, CSSValue, parseSingleDeclaration, parseStylingDeclarations, parseValue, renderValue } from "./value";
import { Rule } from "./rule";

export type AtRule = MediaRule | ImportRule | FontFaceRule | SupportsRule | KeyFrameRule;

export function AtRuleFromTokens(reader: TokenReader<CSSToken>): AtRule {
    reader.expect(CSSToken.At);
    switch (reader.peek()!.value) {
        case "media": return MediaRule.fromTokens(reader);
        case "import": return ImportRule.fromTokens(reader);
        case "font-face": return FontFaceRule.fromTokens(reader);
        case "supports": return SupportsRule.fromTokens(reader);
        case "keyframes": return KeyFrameRule.fromTokens(reader);
        default: reader.throwError(`Unknown or unsupported at-rule: "@${reader.peek()!.value}"`);
    }
}

/**
 * "@media" rules:
 */
export class MediaRule {
    constructor(
        public values: Array<CSSValue | Declaration>,
        public nestedRules: Array<Rule>,
    ) { }

    static fromTokens(reader: TokenReader<CSSToken>): MediaRule {
        reader.expectNext(CSSToken.At);
        if (reader.current.value !== "media") reader.throwExpect(`Expected "media"`);
        reader.move();
        const values: Array<CSSValue | Declaration> = [];
        // Parse rules:
        while (reader.current.type !== CSSToken.OpenCurly) {
            if (reader.current.type === CSSToken.OpenBracket) {
                reader.move();
                values.push(parseSingleDeclaration(reader));
                reader.expectNext(CSSToken.CloseBracket);
            } else {
                values.push([{ value: reader.current.value! }]);
                reader.move();
            }
            if (reader.current.type as CSSToken === CSSToken.OpenCurly) {
                break;
            }
        }
        reader.move();
        // Parse nested rules
        const nestedRules: Array<Rule> = [];
        while (reader.current.type !== CSSToken.CloseCurly) {
            if (reader.current.type === CSSToken.Comment) { reader.move(); continue; }
            nestedRules.push(...Rule.fromTokens(reader));
        }
        reader.move();
        return new MediaRule(values, nestedRules);
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "@media ";
        for (let i = 0; i < this.values.length; i++) {
            const arg = this.values[i];
            // If length === 2 then it is declaration
            if (arg.length === 2) {
                acc += "(" + arg[0] + ":" + renderValue(arg[1], settings) + ")"
            } else {
                acc += renderValue(arg as CSSValue, settings);
            }
            acc += " ";
        }
        acc += " {";
        for (const nestedRule of this.nestedRules!) {
            const rule = nestedRule.render(settings);
            if (settings.minify) {
                acc += rule;
            } else {
                acc += ("\n" + rule).replace(/\n/g, "\n" + " ".repeat(settings.indent));
            }
        }
        if (!settings.minify) acc += "\n";
        acc += "}";
        return acc;
    }
}

export class KeyFrameRule {
    constructor(
        public name: string, // Name of keyframes
        public declarations: Map<"to" | "from" | number, Map<string, CSSValue>> // TODO does not take into account that the multiple times can be mapped to the same declarations
    ) { }

    static fromTokens(reader: TokenReader<CSSToken>): KeyFrameRule {
        reader.expectNext(CSSToken.At);
        if (reader.current.value !== "keyframes") reader.throwExpect(`Expected "keyframes"`);
        reader.expectNext(CSSToken.Identifier);
        const name = reader.current.value!;
        reader.expectNext(CSSToken.Identifier);
        reader.expectNext(CSSToken.OpenCurly);
        const declarations: Map<"to" | "from" | number, Map<string, CSSValue>> = new Map();
        while (reader.current.type !== CSSToken.CloseCurly) {
            let state: "to" | "from" | number;
            if (reader.current.type === CSSToken.NumberLiteral) {
                state = parseInt(reader.current.value);
                if (reader.next().value !== "%") reader.throwExpect(`Expected "%"`);
                reader.move();
            } else {
                if (!reader.current.value || !["to", "from"].includes(reader.current.value)) {
                    reader.throwExpect(`Expected "to" or "from"`);
                }
                state = reader.current.value as "to" | "from";
                reader.expectNext(CSSToken.Identifier);
            }
            reader.expectNext(CSSToken.OpenCurly);
            const [properties] = parseStylingDeclarations(reader, false);
            reader.expectNext(CSSToken.CloseCurly);
            declarations.set(state, new Map(properties));
        }
        reader.move();
        return new KeyFrameRule(name, declarations);
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "@keyframes ";
        acc += this.name;
        if (!settings.minify) acc += " ";
        acc += "{";
        if (!settings.minify) acc += "\n";
        for (const [state, declarations] of this.declarations) {
            if (!settings.minify) acc += " ".repeat(settings.indent);
            acc += state;
            if (typeof state === "number") acc += "%";
            if (!settings.minify) acc += " ";
            acc += "{";
            if (!settings.minify) acc += "\n";
            let renderedDeclarations = 0;
            for (const [key, value] of declarations) {
                if (!settings.minify) acc += " ".repeat(settings.indent * 2);
                acc += key;
                acc += ":";
                if (!settings.minify) acc += " ";
                acc += renderValue(value, settings);
                // Last declaration can skip semi colon under minification
                if (!settings.minify || ++renderedDeclarations < declarations.size) acc += ";";
                if (!settings.minify) acc += "\n";
            }
            if (!settings.minify) acc += " ".repeat(settings.indent);
            acc += "}";
            if (!settings.minify) acc += "\n";
        }
        acc += "}";
        return acc;
    }
}

export class ImportRule {
    constructor(
        public value: CSSValue
    ) { }

    static fromTokens(reader: TokenReader<CSSToken>): ImportRule {
        reader.expectNext(CSSToken.At);
        if (reader.current.value !== "import") reader.throwExpect(`Expected "import"`);
        reader.move();
        const imported = parseValue(reader);
        reader.expectNext(CSSToken.SemiColon);
        return new ImportRule(imported);
    }

    render(settings: IRenderSettings = defaultRenderSettings) {
        return `@import ${renderValue(this.value, settings)};`;
    }
}

export class FontFaceRule {
    constructor(
        public declarations: Array<Declaration>
    ) { }

    static fromTokens(reader: TokenReader<CSSToken>): FontFaceRule {
        reader.expectNext(CSSToken.At);
        if (reader.current.value !== "font-face") reader.throwExpect(`Expected "font-face"`);
        reader.move();
        reader.expectNext(CSSToken.OpenCurly);
        const [declarations] = parseStylingDeclarations(reader, false);
        reader.expectNext(CSSToken.CloseCurly);
        return new FontFaceRule(declarations);
    }

    render(settings: IRenderSettings = defaultRenderSettings) {
        let acc = "@font-face {";
        for (const [key, value] of this.declarations) {
            if (!settings.minify) acc += " ".repeat(settings.indent);
            acc += key;
            acc += ":";
            if (!settings.minify) acc += " ";
            acc += renderValue(value, settings);
            acc += ";";
            acc += "\n";
        }
        acc += "}";
        return acc;
    }
}

export class SupportsRule {
    static fromTokens(reader: TokenReader<CSSToken>): SupportsRule {
        throw Error("Not implemented");
    }

    render(settings: IRenderSettings = defaultRenderSettings) {
        throw Error("Not implemented");
    }
}