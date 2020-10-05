import { TokenReader, IRenderSettings, defaultRenderSettings } from "../helpers";
import { CSSToken, stringToTokens } from "./css";
import { CSSValue, parseValue, renderValue } from "./value";

/* CSS Selectors: */
interface IFullSelector {
    tagName: string,
    classes: string[],
    id: string,
    child: ISelector, // e.g. div > h1
    descendant: ISelector, // e.g. div h1
    generalSibling: ISelector,
    adjacent: ISelector,
    pseudoClasses: Array<{
        name: string, args?: CSSValue | Array<ISelector>
    }>,
    pseudoElements: Array<{
        name: string, args?: CSSValue
    }>
    attributes: Array<{
        attribute: string,
        matcher: AttributeMatcher
        value?: string,
    }>
}

export type ISelector = Partial<IFullSelector>;

export enum AttributeMatcher {
    KeyExists, ExactEqual, SomeWord, BeginsWith, Prefixed, Suffixed, Occurrence
}

const tokenToAttributeMatcher: Map<CSSToken, AttributeMatcher> = new Map([
    [CSSToken.Equal, AttributeMatcher.ExactEqual],
    [CSSToken.SomeWordEqual, AttributeMatcher.SomeWord],
    [CSSToken.BeginsWithEqual, AttributeMatcher.BeginsWith],
    [CSSToken.PrefixedEqual, AttributeMatcher.Prefixed],
    [CSSToken.SuffixedEqual, AttributeMatcher.Suffixed],
    [CSSToken.OccurrenceEqual, AttributeMatcher.Occurrence]
]);

export function parseSelectorsFromTokens(reader: TokenReader<CSSToken>): Array<ISelector> {
    const selectors: Array<ISelector> = []
    while (reader.current) {
        selectors.push(parseSelectorFromTokens(reader));
        if (reader.current.type !== CSSToken.Comma) break;
        else reader.expectNext(CSSToken.Comma);
    }
    return selectors;
}

// These tokens can appear around the selector. Whitespace in front of these tokens does not mean to go down parsing them as descendants
const specialNonSpecificPositionalSelector = [CSSToken.OpenCurly, CSSToken.Child, CSSToken.Plus];

/**
 * Parses a SINGLE selector from tokens
 * @param reader 
 * @param fromDescendant temp fix for descendants
 */
export function parseSelectorFromTokens(reader: TokenReader<CSSToken>): ISelector {
    if (reader.current.type as CSSToken === CSSToken.OpenCurly) {
        reader.throwExpect("Expected selector");
    }

    // TODO "*" and "&" be handled differently.
    let selector: ISelector = {};
    if (reader.current.type === CSSToken.Identifier) {
        selector.tagName = reader.current.value;
        reader.move();
    } else if (reader.current.type === CSSToken.Star) {
        selector.tagName = "*";
        reader.move();
    } else if (reader.current.type === CSSToken.And) {
        selector.tagName = "&";
        reader.move();
    }

    while (![CSSToken.OpenCurly, CSSToken.CloseBracket, CSSToken.Comma].includes(reader.current.type)) {
        /* 
            Deals with descendants by testing whether the token is not immediate.
            CSS has a annoying design where whitespace has an effect. e.g "h1.title" is different to "h1 .title"
        */
        if (
            reader.peek(-1)
            && Object.keys(selector).length > 0
            && !specialNonSpecificPositionalSelector.includes(reader.current.type)
            && !specialNonSpecificPositionalSelector.includes(reader.peek(-1)!.type)
            && reader.peek(-1)?.line === reader.current.line
            && reader.current.column !== reader.peek(-1)!.column + (reader.peek(-1)?.value?.length ?? 1)
        ) {
            selector.descendant = parseSelectorFromTokens(reader);
            continue;
        }

        switch (reader.current.type) {
            case CSSToken.Hash:
                if (selector.id) reader.throwError("CSS selector can only contain one id matcher");
                reader.move();
                selector.id = reader.current.value;
                reader.expectNext(CSSToken.Identifier);
                break;
            case CSSToken.Dot:
                reader.move();
                if (!selector.classes) selector.classes = [];
                selector.classes.push(reader.current.value!);
                reader.expectNext(CSSToken.Identifier);
                break;
            case CSSToken.Colon:
                reader.move();
                if (!selector.pseudoClasses) selector.pseudoClasses = [];
                const pseudoClassName = reader.current.value!;
                reader.move();
                if (reader.current.type as CSSToken === CSSToken.OpenBracket) {
                    reader.move();
                    let args: CSSValue | Array<ISelector>;
                    if (["is", "not"].includes(pseudoClassName)) {
                        args = parseSelectorsFromTokens(reader);
                    } else {
                        args = parseValue(reader); // TODO parse selector for :is() and :has() ??
                    }
                    reader.expectNext(CSSToken.CloseBracket);
                    selector.pseudoClasses.push({ name: pseudoClassName, args });
                } else {
                    selector.pseudoClasses.push({ name: pseudoClassName });
                }
                break;
            case CSSToken.DoubleColon:
                reader.move();
                if (!selector.pseudoElements) selector.pseudoElements = [];
                const pseudoElementName = reader.current.value!;
                reader.move();
                selector.pseudoElements.push({ name: pseudoElementName });
                break;
            case CSSToken.OpenSquare:
                reader.move();
                const attribute = reader.current.value!;
                reader.expectNext(CSSToken.Identifier);
                let matcher: AttributeMatcher = AttributeMatcher.KeyExists;
                let value: string | undefined;
                if (tokenToAttributeMatcher.has(reader.current.type)) {
                    matcher = tokenToAttributeMatcher.get(reader.current.type)!;
                    reader.move();
                    value = reader.current.value;
                    reader.expectNext(CSSToken.StringLiteral);
                }
                selector.attributes = [{ attribute, matcher, value }];
                reader.expectNext(CSSToken.CloseSquare);
                break;
            case CSSToken.Child:
                reader.move();
                selector.child = parseSelectorFromTokens(reader);
                break;
            case CSSToken.Plus:
                reader.move();
                selector.adjacent = parseSelectorFromTokens(reader);
                break;
            default:
                reader.throwExpect("Expected selector");
        }
    }

    return selector;
}

/**
 * Returns single `ISelector` from a string
 * @param selector 
 */
export function parseSelectorFromString(selector: string): ISelector {
    const reader = stringToTokens(selector);
    const selector_ = parseSelectorFromTokens(reader);
    reader.expect(CSSToken.EOF);
    return selector_;
}

/**
 * Renders a `ISelector`
 * @param selector 
 * @param settings 
 */
export function renderSelector(selector: ISelector, settings: IRenderSettings = defaultRenderSettings): string {
    let acc = "";
    if (selector.tagName) {
        acc += selector.tagName;
    }

    if (selector.id) {
        acc += `#${selector.id}`;
    }

    if (selector.classes) {
        for (const cssClass of selector.classes) {
            acc += `.${cssClass}`;
        }
    }

    if (selector.pseudoClasses) {
        for (const pseudoClass of selector.pseudoClasses) {
            acc += `:${pseudoClass.name}`;
            if (pseudoClass.args) {
                acc += "(";
                // If array is an array of selectors
                if (["is", "not"].includes(pseudoClass.name)) {
                    for (let i = 0; i < pseudoClass.args.length; i++) {
                        acc += renderSelector(pseudoClass.args[i] as ISelector, settings);
                        if (i + 1 < pseudoClass.args.length) acc += settings.minify ? "," : ", ";
                    }
                } else {
                    acc += renderValue(pseudoClass.args as CSSValue, settings)
                }
                acc += ")";
            }
        }
    }

    if (selector.pseudoElements) {
        for (const pseudoElement of selector.pseudoElements) {
            acc += `::${pseudoElement.name}`;
        }
    }

    if (selector.attributes) {
        for (const { attribute, matcher, value } of selector.attributes) {
            acc += "[";
            acc += attribute;
            switch (matcher) {
                case AttributeMatcher.ExactEqual: acc += `="${value!}"`; break;
                case AttributeMatcher.SomeWord: acc += `~="${value!}"`; break;
                case AttributeMatcher.BeginsWith: acc += `|="${value!}"`; break;
                case AttributeMatcher.Prefixed: acc += `^="${value!}"`; break;
                case AttributeMatcher.Suffixed: acc += `$="${value!}"`; break;
                case AttributeMatcher.Occurrence: acc += `*="${value!}"`; break;
            }
            acc += "]";
        }
    }

    if (selector.child) {
        acc += settings.minify ? ">" : " > ";
        acc += renderSelector(selector.child, settings);
    } else if (selector.descendant) {
        acc += " ";
        acc += renderSelector(selector.descendant, settings);
    } else if (selector.adjacent) {
        acc += settings.minify ? "+" : " + ";
        acc += renderSelector(selector.adjacent, settings);
    }

    return acc;
}

const childSelectorProperties: Array<keyof ISelector> = ["descendant", "child"];

/**
 * `selector` becomes the rightmost descendant of `parentSelector`
 * Handles cloning of parent selector to prevent mutation
 * @param selector the selector to rightmost
 * @param parentSelector the selector to place `selector` under
 */
export function prefixSelector(selector: ISelector, parentSelector: ISelector): ISelector {
    // Don't prefix :root
    if (selector.pseudoClasses?.length === 1 && selector.pseudoClasses[0].name === "root") {
        return selector;
    }

    // Allows for &, :non-scoped .user
    if (selector.pseudoClasses?.length === 1 && selector.pseudoClasses[0].name === "non-scoped") {
        return selector.descendant!;
    }

    let modifier: ISelector = { ...parentSelector };
    let hook: ISelector = modifier;
    let aspect = Object
        .keys(hook)
        .filter(prop => childSelectorProperties.includes(prop as keyof ISelector))?.[0];
    // Find the bottom most descendant
    while (aspect) {
        // Clone the descendant to prevent override
        Reflect.set(hook, aspect, { ...Reflect.get(hook, aspect) });
        // Set hook to descendant
        hook = Reflect.get(hook, aspect);
        aspect = Object
            .keys(hook)
            .filter(prop => childSelectorProperties.includes(prop as keyof ISelector))?.[0];
    }
    if (selector.tagName === "&") {
        // TODO concat selector.classes and parentSelector.classes and other stuff like that
        Object.assign(hook, { ...selector, tagName: hook.tagName })
    } else {
        hook.descendant = selector;
    }
    return modifier;
}
