import { ValueTypes } from "./value";
import { TokenReader, IRenderSettings, defaultRenderSettings, IRenderable } from "../../../helpers";
import { JSToken } from "../../javascript";
import { Expression } from "./expression";

export class TemplateLiteral implements IRenderable {

    entries: Array<string | ValueTypes> = []

    constructor(
        entries: Array<string | ValueTypes> = [],
        public tag: string | null = null // TODO tagging as IValue ???
    ) {
        this.entries = [];
        entries.forEach(entry => this.addEntry(entry));
    }

    addEntry(...entries: Array<string | ValueTypes>): void {
        // Collapses strings 
        for (const entry of entries) {
            if (typeof entry === "string" && typeof this.entries[this.entries.length - 1] === "string") {
                this.entries[this.entries.length - 1] += entry;
            } else if (entry instanceof TemplateLiteral) {
                this.entries = this.entries.concat(entry.entries);
            } else {
                this.entries.push(entry);
            }
        }
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = `${this.tag || ""}\``;
        for (const entry of this.entries) {
            if (typeof entry === "string") {
                acc += entry;
            } else {
                acc += "${" + entry.render(settings) + "}";
            }
        }
        return acc + "`";
    }

    static fromTokens(reader: TokenReader<JSToken>): TemplateLiteral {
        let tag: string | null = null;
        // If has tag
        if (reader.current.type === JSToken.Identifier) {
            tag = reader.current.value!;
            reader.move();
        }
        reader.expectNext(JSToken.TemplateLiteralStart);
        const entries: Array<string | ValueTypes> = [];
        while (reader.current.type !== JSToken.TemplateLiteralEnd) {
            if (reader.current.type === JSToken.TemplateLiteralString) {
                if (reader.current.value !== "") {
                    entries.push(reader.current.value!);
                }
                reader.move();
            } else {
                entries.push(Expression.fromTokens(reader));
            }
        }
        reader.move();
        return new TemplateLiteral(entries, tag);
    }

}