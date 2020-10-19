import { ISelector, renderSelector, parseSelectorsFromTokens, prefixSelector } from "./selectors";
import { CSSValue, renderValue, parseStylingDeclarations } from "./value";
import { IRenderSettings, defaultRenderSettings, TokenReader } from "../helpers";
import { CSSToken } from "./css";

/**
 * Polyfill for .flatMap
 * @param arr 
 * @param func 
 */
function flatMap<T>(arr: Array<T>, func: (v: T) => any) {
    if (typeof arr.flatMap === "function") {
        return arr.flatMap(func);
    } else {
        return arr.map(func).reduce((acc, val) => acc.concat(val), []);
    }
}

export class Rule {

    constructor(
        public selectors: Array<ISelector> = [],
        public declarations: Map<string, CSSValue> = new Map(),
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        // Early return if no declarations
        if (this.declarations.size === 0 && settings.minify) return "";

        let acc = "";
        // Render selectors:
        acc += this.selectors
            .map(selector => renderSelector(selector, settings))
            .join(settings.minify ? "," : ", ");

        if (!settings.minify) acc += " ";
        acc += "{";
        if (!settings.minify && this.declarations.size > 0) acc += "\n";
        let renderedDeclarations = 0;
        for (const [key, value] of this.declarations) {
            // Indent:
            if (!settings.minify) acc += " ".repeat(4);
            acc += key;
            acc += ":";
            if (!settings.minify) acc += " ";
            acc += renderValue(value, settings);
            // Last declaration can skip semi colon under minification
            if (!settings.minify || ++renderedDeclarations < this.declarations.size) acc += ";";
            if (!settings.minify) acc += "\n";
        }
        acc += "}";
        return acc;
    }

    /**
     *  Will flatten out nested rules at parse time
     */
    static fromTokens(reader: TokenReader<CSSToken>): Array<Rule> {
        // Parsing selector
        const selectors: Array<ISelector> = parseSelectorsFromTokens(reader);
        reader.expectNext(CSSToken.OpenCurly);
        // Parsing rules
        const [declarations, nestedRules] = parseStylingDeclarations(reader);
        reader.expectNext(CSSToken.CloseCurly);
        const allRules: Array<Rule> = [];
        // Will not add the rule if it used as a wrapper for nesting rules
        if (!(nestedRules.length > 0 && declarations.length === 0)) {
            allRules.push(new Rule(selectors, new Map(declarations)));
        }
        for (const nestedRule of nestedRules) {
            if (nestedRule.declarations.size === 0) continue;

            // Modify the nestedRule selectors to be prefixed under the main rule
            nestedRule.selectors = 
                flatMap(nestedRule.selectors, selector1 => selectors.map(selector2 => prefixSelector(selector1, selector2)));

            allRules.push(nestedRule);
        }
        return allRules;
    }
}