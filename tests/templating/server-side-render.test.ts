import { serverRenderPrismNode } from "../../src/templating/builders/server-render";
import { HTMLElement, TextNode } from "../../src/chef/html/html";
import { PrismHTMLElement } from "../../src/templating/template";
import { VariableReference } from "../../src/chef/javascript/components/value/variable";
import { Operation } from "../../src/chef/javascript/components/value/expression";

test("Tag and text", () => {
    // TODO parse and create maybe from html example
    const dom = new HTMLElement("div");
    dom.children = [
        new TextNode("Hello World", dom)
    ];
    expect(serverRenderPrismNode(dom).entries[0]).toBe("<div>Hello World</div>");
    expect(serverRenderPrismNode(dom).entries[0]).toBe("<div>Hello World</div>");
});

test("Attributes", () => {
    const dom = new HTMLElement("div", new Map());
    dom.attributes!.set("title", "abc");
    dom.attributes!.set("id", "123");
    dom.attributes!.set("hidden", null);

    expect(serverRenderPrismNode(dom).entries[0]).toBe(`<div title="abc" id="123" hidden></div>`);
});

test("Dynamic Attributes", () => {
    const dom: PrismHTMLElement = new HTMLElement("div");
    dom.dynamicAttributes = new Map([["title", new VariableReference("someTitle")]]);

    expect(serverRenderPrismNode(dom).entries).toMatchObject([
        `<div title="`,
        {
            lhs: {name: "escape"},
            operation: Operation.Call,
            rhs: {
                args: [
                    { name: "someTitle" }
                ]
            }
        },
        `"></div>`
    ]);
});

test("Self closing tags", () => {
    const element = new HTMLElement("img");
    expect(serverRenderPrismNode(element).entries[0]).toBe(`<img>`)
});

test.todo("Comments");