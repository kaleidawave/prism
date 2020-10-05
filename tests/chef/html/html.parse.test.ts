import { HTMLElement, TextNode, HTMLDocument, HTMLComment, flatElements } from "../../../src/chef/html/html";
import { Stylesheet } from "../../../src/chef/css/stylesheet";
import { Module } from "../../../src/chef/javascript/components/module";

describe("Parses tags", () => {
    test("Basic tag", () => {
        const htmlString = "<h1>Hello World</h1>";
        const h1 = HTMLDocument.fromString(htmlString).children[0] as HTMLElement;
        expect(h1.tagName).toBe("h1");
    });

    test("Doctype tag", () => {
        const htmlString = "<!DOCTYPE html>";
        const h1 = HTMLDocument.fromString(htmlString).children[0] as HTMLElement;
        expect(h1.tagName).toBe("!DOCTYPE");
        expect(h1.attributes?.has("html")).toBeTruthy();
    });

    test("Handles self closing elements", () => {
        const htmlString = `<img src="a"><h1>ABC</h1>`;
        const childNodes = HTMLDocument.fromString(htmlString).children;
        expect(childNodes).toHaveLength(2);
        expect((childNodes[0] as HTMLElement).tagName).toBe("img");
        expect((childNodes[1] as HTMLElement).tagName).toBe("h1");
    });

    test("Reads comments", () => {
        const htmlString = `<h1>Hello World</h1> <!-- Some comment-->`;
        const childNodes = HTMLDocument.fromString(htmlString).children;
        expect(childNodes).toHaveLength(2);
        expect(childNodes[0]).toBeInstanceOf(HTMLElement);
        expect(childNodes[1]).toBeInstanceOf(HTMLComment);
    });

    test("Children nodes have reference to parent", () => {
        const html1 = `<div>
            <h1>a</h1>
            <h2>b</h2>
        </div>`;
        const html = HTMLDocument.fromString(html1).children[0] as HTMLElement;
        for (const child of html.children) {
            expect(child.parent).toBe(html);
        }
    });

    test("Handles closing elements", () => {
        const htmlString = `<circle cx="50" cy="50" r="50"/>`;
        const circleNode = HTMLDocument.fromString(htmlString).children[0];
        expect(circleNode).toHaveProperty("closesSelf", true);
    });
});

describe("Parses attributes", () => {
    test("Parses attributes", () => {
        const htmlString = `<h1 title="Test">Hello World</h1>`;
        const html = HTMLDocument.fromString(htmlString);

        expect(html.children[0]).toMatchObject({
            tagName: 'h1',
            attributes: new Map([['title', 'Test']]),
            children: [{ text: 'Hello World' }]
        });

        expect(html.children).toHaveLength(1);

    });

    test("Parses boolean attributes", () => {
        const html = `<div id='x' hidden>Hello World</div>`;

        expect(HTMLDocument.fromString(html).children[0]).toMatchObject(
            {
                tagName: 'div',
                attributes: new Map([['id', 'x'], ['hidden', null]]),
                children: [{ text: 'Hello World' }]
            }
        );
    });

    test("Attributes on multiple lines", () => {
        const htmlString =
            `<h1 
                title="Hello"
                id='Test'
            ></h1>`;

        const h1 = HTMLDocument.fromString(htmlString).children[0] as HTMLElement;

        expect(h1.attributes).not.toBeNull();
        expect(h1.attributes?.size).toBe(2);
        expect(h1.attributes?.has('title')).toBeTruthy();
        expect(h1.attributes?.has('id')).toBeTruthy();
        expect(h1.attributes?.get('title')).toBe("Hello");
        expect(h1.attributes?.get('id')).toBe("Test");
    });

    test("Parses attributes without quotes", () => {
        const htmlString = `<h1 title=Hello id=Test></h1>`;

        const h1 = HTMLDocument.fromString(htmlString).children[0] as HTMLElement;

        expect(h1.attributes).not.toBeNull();
        expect(h1.attributes?.size).toBe(2);
        expect(h1.attributes?.has('title')).toBeTruthy();
        expect(h1.attributes?.has('id')).toBeTruthy();
        expect(h1.attributes?.get('title')).toBe("Hello");
        expect(h1.attributes?.get('id')).toBe("Test");
    });
});

describe("Parses text content", () => {
    test("Basic test", () => {
        const htmlString = `<h1>Hello World</h1>`;
        const html = HTMLDocument.fromString(htmlString).children[0] as HTMLElement;

        expect(html.children).toHaveLength(1);
        expect(html.children[0]).toBeInstanceOf(TextNode);
        expect((html.children[0] as TextNode).text).toBe("Hello World");
    });

    test("Interspersed with HTML tags", () => {
        const htmlString =
            `<div>
                Hello
                <span> middle text </span>
                World
            </div>`;
        const html = HTMLDocument.fromString(htmlString).children[0] as HTMLElement;

        expect(html.children[0]).toBeInstanceOf(TextNode);
        expect((html.children[0] as TextNode).text).toBe("Hello");

        expect(html.children[2]).toBeInstanceOf(TextNode);
        expect((html.children[2] as TextNode).text).toBe("World");
    });

    test("Allows angle braces in text", () => {
        const htmlString =
            `<p>
                4 + 3 > 2
            </p>`;

        const p = HTMLDocument.fromString(htmlString).children[0] as HTMLElement;

        expect(p.children[0]).toBeInstanceOf(TextNode);
        expect((p.children[0] as TextNode).text).toBe("4 + 3 > 2");
    });
});

describe("Tags with data", () => {
    test("Style tag", () => {
        const htmlString =
            `<style>
                h1 {
                    color: red;
                }
            </style>`;

        const styleElement = HTMLDocument.fromString(htmlString).children[0] as HTMLElement;
        expect(styleElement.tagName).toBe("style");
        expect(styleElement.stylesheet).toBeTruthy();
        expect(styleElement.stylesheet).toBeInstanceOf(Stylesheet);
    });

    test("Script tag", () => {
        const htmlString =
            `<script>
                // <h1> Hello World </h1>
                console.log("Here");
            </script>`;

        const scriptElement = HTMLDocument.fromString(htmlString).children[0] as HTMLElement;
        expect(scriptElement.tagName).toBe("script");
        expect(scriptElement.module).toBeTruthy();
        expect(scriptElement.module).toBeInstanceOf(Module);
    });
});

describe("Properties", () => {
    test("Depth", () => {
        const html = HTMLDocument.fromString("<div><div><div>Test</div></div></div>");

        const lowestDiv: HTMLElement = ((html.children[0] as HTMLElement).children[0] as HTMLElement).children[0] as HTMLElement;

        expect(lowestDiv.depth).toBe(3);
    });

    test("Next adjacent element", () => {
        const html = HTMLDocument.fromString("<h1>Hello</h1><h2>World</h2>");

        expect((html.children[0] as HTMLElement).next).toBe(html.children[1]);
    });

    test("Previous adjacent element", () => {
        const html = HTMLDocument.fromString("<h1>Hello</h1><h2>World</h2>");

        expect((html.children[1] as HTMLElement).previous).toBe(html.children[0]);
    });
});

test("Flat elements", () => {
    const html = `<h1>
            <h2>
                <h3>Deep</h3>
            </h2>
        </h1>`;

    const doc = HTMLDocument.fromString(html);
    expect(flatElements(doc)).toMatchObject([
        { tagName: "h1" },
        { tagName: "h2" },
        { tagName: "h3" }
    ])
});