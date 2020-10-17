import { TokenReader, ITokenizationSettings, IRenderSettings, getSettings, defaultRenderSettings, IConstruct, IRenderOptions, IPosition, IParseSettings, defaultParseSettings } from "../helpers";
import { Module } from "../javascript/components/module";
import { Stylesheet } from "../css/stylesheet";
import { readFile, writeFile } from "../filesystem";

export abstract class Node implements IConstruct {
    abstract parent: HTMLElement | HTMLDocument | null;
    abstract render(settings: IRenderSettings): string;

    /** Returns next adjacent sibling */
    get next() {
        if (!this.parent) throw Error("next() requires parent element");
        const myIndex = this.parent.children.indexOf(this)
        return this.parent.children[myIndex + 1];
    }

    /** Returns previous adjacent sibling */
    get previous() {
        if (!this.parent) throw Error("previous() requires parent element");
        const myIndex = this.parent.children.indexOf(this)
        return this.parent.children[myIndex - 1];
    }

    /**
     * Returns the HTMLDocument the node exists under
     */
    get document(): HTMLDocument {
        let parent = this.parent;
        while (parent && !(parent instanceof HTMLDocument)) {
            parent = parent.parent;
        }
        if (!parent) throw Error("Element not descendant of a HTMLDocument");
        return parent as HTMLDocument;
    }

    /**
     * Returns the depth of the component from the document
     */
    get depth(): number {
        let depth = 1;
        let parent = this.parent;
        while (parent && !(parent instanceof HTMLDocument)) {
            parent = parent.parent;
            depth++;
        }
        return depth;
    }
}

export class TextNode extends Node implements IConstruct {
    constructor(
        public text = '',
        public parent: HTMLElement | null = null,
        public position: IPosition | null = null
    ) {
        super();
    }

    render(settings: IRenderSettings = defaultRenderSettings) {
        if (this.text.length > 80 && !settings.minify) {
            return `\n${this.text}`;
        } else {
            return this.text.replace(/\n/g, "<br>");
        }
    }
}

export class HTMLElement extends Node implements IConstruct {
    // Tags that don't require </...>
    static selfClosingTags = new Set(["area", "base", "br", "embed", "hr", "iframe", "img", "input", "link", "meta", "param", "source", "track", "!DOCTYPE"]);

    // Attributes which are always true if there is a value
    static booleanAttributes = new Set(["hidden", "readonly", "checked", "disabled", "loop", "controls"]);

    // Tags which don't parse children as tags
    static contentTags = ["script", "styles"];

    tagName: string;
    attributes: Map<string, string | null> | null;
    children: Array<Node> = [];

    module?: Module; // Only present if tagName === "script"
    stylesheet?: Stylesheet; // Only present if tagName === "style"

    constructor(
        tagName: string,
        attributes: Map<string, string | null> | null = null,
        children: Array<Node> = [],
        public parent: HTMLElement | HTMLDocument | null = null,
        public position: IPosition | null = null,
        public closesSelf: boolean = false, // if />
    ) {
        super();
        this.tagName = tagName;
        this.attributes = attributes;
        for (const child of children) {
            child.parent = this;
        }
        this.children = children;
    }

    static fromTokens(reader: TokenReader<HTMLToken>, settings: IParseSettings = defaultParseSettings, parent: HTMLElement | HTMLDocument | null = null): HTMLElement {
        reader.expectNext(HTMLToken.TagStart);
        const position: IPosition = { column: reader.current.column, line: reader.current.line };
        const tagName: string = reader.current.value!;
        reader.expectNext(HTMLToken.TagName);
        let attributes: Map<string, string | null> | null = null;

        // Parse attributes
        while (reader.current.type === HTMLToken.AttributeKey) {
            if (!attributes) attributes = new Map();

            let key = reader.current.value!;
            reader.move();
            if (reader.current.type as HTMLToken === HTMLToken.AttributeValue) {
                attributes.set(key, reader.current.value!);
                reader.move();
            } else {
                attributes.set(key, null);
            }
        }

        if (reader.current.type === HTMLToken.TagEndClose) {
            reader.move();
            return new HTMLElement(tagName, attributes, [], parent, position, true);
        } else {
            reader.expectNext(HTMLToken.TagEnd)
        }

        if (HTMLElement.selfClosingTags.has(tagName)) {
            return new HTMLElement(tagName, attributes, [], parent, position);
        } else if (tagName === "script" && reader.current.type !== HTMLToken.TagCloseStart) {
            const elem = new HTMLElement(tagName, attributes, [], parent, position);
            elem.module = Module.fromString(reader.current.value!, reader.filename, reader.current.column, reader.current.line);
            reader.move();
            reader.expectNext(HTMLToken.TagCloseStart);
            reader.expectNext(HTMLToken.TagName);
            reader.expectNext(HTMLToken.TagEnd);
            return elem;
        } else if (tagName === "style" && reader.current.type !== HTMLToken.TagCloseStart) {
            const elem = new HTMLElement(tagName, attributes, [], parent, position);
            elem.stylesheet = Stylesheet.fromString(reader.current.value!, reader.filename, reader.current.column, reader.current.line);
            reader.move();
            reader.expectNext(HTMLToken.TagCloseStart);
            reader.expectNext(HTMLToken.TagName);
            reader.expectNext(HTMLToken.TagEnd);
            return elem;
        }

        const children: Array<Node> = [];
        const element = new HTMLElement(tagName, attributes, children, parent, position);
        while (reader.current.type !== HTMLToken.TagCloseStart) {
            if (reader.current.type === HTMLToken.TagStart) {
                children.push(HTMLElement.fromTokens(reader, settings, element));
            } else if (reader.current.type === HTMLToken.Content) {
                const position: IPosition = { column: reader.current.column, line: reader.current.line };
                // Parent here can be null as it will be set in the HTMLConstructor
                children.push(new TextNode(reader.current.value, element, position));
                reader.move();
            } else if (reader.current.type === HTMLToken.Comment) {
                if (settings.comments) {
                    children.push(new HTMLComment(element, reader.current.value));
                }
                reader.move();
            } else {
                reader.throwExpect(`Expected tag name, comment or content under tag "${element.render(defaultRenderSettings, { inline: true })}"`);
            }
        }

        reader.move();
        if (reader.current.value !== tagName) reader.throwError(`Expected </${tagName}>`);
        reader.expectNext(HTMLToken.TagName);
        reader.expectNext(HTMLToken.TagEnd);

        return element;
    }

    static fromString(string: string, settings: IParseSettings = defaultParseSettings): HTMLElement {
        const reader = stringToTokens(string);
        const element = HTMLElement.fromTokens(reader, settings);
        reader.expect(HTMLToken.EOF);
        return element;
    }

    /**
     * Renders the given the HTMLElement
     * @param settings 
     * @param renderChildren if false only renders tagname & attributes (default: true) (used for debugging)
     */
    render(settings: IRenderSettings = defaultRenderSettings, renderOptions?: IRenderOptions): string {
        let acc = "<";
        acc += this.tagName;
        if (this.attributes) {
            for (const [attr, value] of this.attributes) {
                acc += " " + attr;
                if (value !== null) {
                    acc += `="${value}"`;
                }
            }
        }
        if (this.closesSelf) acc += "/";
        acc += ">";
        if (renderOptions?.inline || HTMLElement.selfClosingTags.has(this.tagName) || this.closesSelf) return acc;

        // If module or stylesheet render that using Javascript or CSS rendering
        if (this.module) {
            const serializedChild = this.module.render(settings);
            if (settings.minify) {
                acc += serializedChild;
            } else {
                acc += ("\n" + serializedChild).replace(/\n/g, "\n" + " ".repeat(settings.indent));
                acc += "\n";
            }
        } else if (this.stylesheet) {
            const serializedChild = this.stylesheet.render(settings);
            if (settings.minify) {
                acc += serializedChild;
            } else {
                acc += ("\n" + serializedChild).replace(/\n/g, "\n" + " ".repeat(settings.indent));
                acc += "\n";
            }
        } else {
            for (const child of this.children) {
                const serializedChild = child.render(settings);
                if (settings.minify) {
                    acc += serializedChild;
                } else {
                    acc += ("\n" + serializedChild).replace(/\n/g, "\n" + " ".repeat(settings.indent));
                }
            }
            if (!settings.minify && this.children.length > 0) acc += "\n";
        }
        acc += `</${this.tagName}>`;
        return acc;

    }
}

export class HTMLComment extends Node implements IConstruct {
    constructor(
        public parent: HTMLElement | HTMLDocument,
        public comment: string = "",
    ) {
        super();
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        if (settings.minify) return "";
        return `<!--${this.comment}-->`
    }
}

export class HTMLDocument {
    children: Array<Node> = [];
    filename: string;

    constructor(elements: Array<Node> = []) {
        elements.forEach(element => element.parent = this);
        this.children = elements;
    }

    static fromTokens(reader: TokenReader<HTMLToken>, settings: IParseSettings = defaultParseSettings) {
        const html = new HTMLDocument();
        while (reader.current.type !== HTMLToken.EOF) {
            if (reader.current.type === HTMLToken.Content) {
                reader.move();
                continue;
            }

            if (reader.current.type === HTMLToken.Comment) {
                if (settings.comments) {
                    html.children.push(new HTMLComment(html, reader.current.value));
                }
                reader.move();
                continue;
            }

            html.children.push(HTMLElement.fromTokens(reader, settings, html));
        }
        return html;
    }

    static fromString(text: string, filename?: string, settings: IParseSettings = defaultParseSettings): HTMLDocument {
        const reader = stringToTokens(text, { file: filename });
        const document = HTMLDocument.fromTokens(reader, settings);
        if (filename) document.filename = filename;
        reader.expect(HTMLToken.EOF);
        return document;
    }

    static fromFile(filename: string, settings: IParseSettings = defaultParseSettings): HTMLDocument {
        const string = readFile(filename).toString();
        return HTMLDocument.fromString(string, filename, settings);
    }

    render(settings: Partial<IRenderSettings> = {}) {
        const completeSettings = getSettings(settings);
        let acc = "";
        for (let i = 0; i < this.children.length; i++) {
            acc += this.children[i].render(completeSettings);
            if (!completeSettings.minify && i + 1 < this.children.length) acc += "\n";
        }
        return acc;
    }

    writeToFile(settings: Partial<IRenderSettings> = {}, filename?: string) {
        const contents = this.render(settings);
        writeFile(filename ?? this.filename!, contents);
    }
}

enum HTMLToken {
    TagStart, // <
    TagName, // <...>
    TagEnd, // >
    TagEndClose, // />
    TagCloseStart, // </
    AttributeKey, AttributeValue,
    Content,
    Comment,
    EOF
}

const reverse = new Map()
for (const key in HTMLToken) {
    // @ts-ignore key can be string
    if (!isNaN(key)) {
        reverse.set(parseInt(key), HTMLToken[key])
    }
}

export function stringToTokens(html: string, settings: ITokenizationSettings = {}): TokenReader<HTMLToken> {
    const reader = new TokenReader<HTMLToken>({ reverse, file: settings.file || null });

    let index = 0;
    let line = 1;
    let column = 0;
    let escapedGreaterThan: string | null = null;
    let attributeQuote: `"` | `'` | null = null; // If in attribute the string quote or (null) used to start

    reader.add({ type: HTMLToken.Content, value: "", line, column });

    while (index < html.length) {
        // Updates line and character token position:
        if (html[index] === "\n") {
            line++;
            column = 0;
        } else {
            column++;
        }

        switch (reader.top.type) {
            case HTMLToken.Content:
                if (html[index] === "<" && !escapedGreaterThan) {
                    reader.top.value = reader.top.value!.includes("\n") ? reader.top.value!.trim() : reader.top.value!;
                    if (reader.top.value.length === 0) reader.pop();
                    if (html.startsWith("!--", index + 1)) {
                        index += 3;
                        column += 3;
                        reader.add({ type: HTMLToken.Comment, value: "", line, column });
                    } else if (html[index + 1] === "/") {
                        index++; column++;
                        reader.add({ type: HTMLToken.TagCloseStart, line, column });
                        reader.add({ type: HTMLToken.TagName, value: "", line, column: column + 1 });
                    } else {
                        reader.add({ type: HTMLToken.TagStart, line, column });
                        reader.add({ type: HTMLToken.TagName, value: "", line, column: column + 1 });
                    }
                }
                // This deals with not breaking on "<..." during script and style tags
                else if (escapedGreaterThan && html.startsWith(`</${escapedGreaterThan}`, index)) {
                    index++; column++;
                    escapedGreaterThan = null;
                    reader.add({ type: HTMLToken.TagCloseStart, line, column });
                    reader.add({ type: HTMLToken.TagName, value: "", line, column: column + 1 });
                } else {
                    reader.top.value += html[index];
                }
                break;
            case HTMLToken.TagName:
                if (html[index] === " " || html[index] === "\n" || html[index] === "\r") {
                    reader.add({ type: HTMLToken.AttributeKey, value: "", column: column + 1, line });
                } else if (html[index] === ">") {
                    reader.add({ type: HTMLToken.TagEnd, column, line });
                    reader.add({ type: HTMLToken.Content, value: "", column: column + 1, line });
                } else if (html.startsWith("/>", index)) {
                    index++; column++;
                    reader.add({ type: HTMLToken.TagEndClose, column, line });
                    reader.add({ type: HTMLToken.Content, value: "", column: column + 1, line });
                } else {
                    reader.top.value += html[index];
                    if (reader.peekFromTop(1)?.type !== HTMLToken.TagCloseStart && ["script", "style"].includes(reader.top.value!)) {
                        escapedGreaterThan = reader.top.value!;
                    }
                }
                break;
            case HTMLToken.AttributeKey:
                if (html[index] === "=") {
                    reader.add({ type: HTMLToken.AttributeValue, value: "", column, line });
                } else if (html[index] === ">") {
                    if (reader.top.value?.length === 0) reader.pop();
                    reader.add({ type: HTMLToken.TagEnd, column, line });
                    reader.add({ type: HTMLToken.Content, value: "", column: column + 1, line });
                } else if (html.startsWith("/>", index)) {
                    if (reader.top.value?.length === 0) reader.pop();
                    index++; column++;
                    reader.add({ type: HTMLToken.TagEndClose, column, line });
                    reader.add({ type: HTMLToken.Content, value: "", column: column + 1, line });
                } else if (html[index] === " " && reader.top.value?.length !== 0) {
                    reader.add({ type: HTMLToken.AttributeKey, value: "", column, line })
                } else if (html[index] !== " " && html[index] !== "\n" && html[index] !== "\r") {
                    reader.top.value += html[index];
                }
                break;
            case HTMLToken.AttributeValue:
                if (reader.top.value?.length === 0 && "'\"".includes(html[index]) && attributeQuote === null) {
                    attributeQuote = html[index] as `"` | `'`;
                } else if (html[index] === attributeQuote) {
                    attributeQuote = null;
                    reader.add({ type: HTMLToken.AttributeKey, value: "", column, line });
                } else if (attributeQuote === null && html[index] === " ") {
                    reader.add({ type: HTMLToken.AttributeKey, value: "", column, line });
                } else if (attributeQuote === null && html[index] === ">") {
                    reader.add({ type: HTMLToken.TagEnd, column, line });
                    reader.add({ type: HTMLToken.Content, value: "", column: column + 1, line });
                } else {
                    reader.top.value += html[index];
                }
                break;
            case HTMLToken.Comment:
                if (html.startsWith("-->", index)) {
                    index += 3;
                    column += 3;
                    reader.add({ type: HTMLToken.Content, value: "", line, column })
                } else {
                    reader.top.value += html[index];
                }
                break;
        }

        index++;
    }

    if (reader.top.value?.length === 0) reader.pop();

    reader.add({ type: HTMLToken.EOF, line, column: column + 1 });

    return reader;
}

/**
 * Returns a flat list of a HTMLElement children
 * @param html 
 */
export function flatElements(html: HTMLDocument | HTMLElement): HTMLElement[] {
    const children: Array<HTMLElement> = []
    for (const child of html.children) {
        if (child instanceof HTMLElement) {
            children.push(child);
            children.push(...flatElements(child));
        }
    }
    return children;
}