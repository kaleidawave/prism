import { IServerRenderSettings, serverRenderPrismNode } from "../../src/templating/builders/server-render";
import { HTMLElement, TextNode } from "../../src/chef/html/html";
import { VariableReference } from "../../src/chef/javascript/components/value/variable";
import { Operation } from "../../src/chef/javascript/components/value/expression";
import { assignToObjectMap } from "../../src/helpers";

const serverRenderSettings: IServerRenderSettings = {addDisableToElementWithEvents: false, dynamicAttribute: false, minify: true}

test("Tag and text", () => {
    // TODO parse and create maybe from html example
    const dom = new HTMLElement("div");
    dom.children = [
        new TextNode("Hello World", dom)
    ];
    expect(serverRenderPrismNode(dom, new WeakMap, serverRenderSettings).entries[0]).toBe("<div>Hello World</div>");
    expect(serverRenderPrismNode(dom, new WeakMap, serverRenderSettings).entries[0]).toBe("<div>Hello World</div>");
});

test("Attributes", () => {
    const dom = new HTMLElement("div", new Map());
    dom.attributes!.set("title", "abc");
    dom.attributes!.set("id", "123");
    dom.attributes!.set("hidden", null);

    expect(serverRenderPrismNode(dom, new WeakMap, serverRenderSettings).entries[0]).toBe(`<div title="abc" id="123" hidden></div>`);
});

test("Dynamic Attributes", () => {
    const div = new HTMLElement("div");
    const nodeData = new WeakMap;
    assignToObjectMap(nodeData, div, "dynamicAttributes", new Map([["title", new VariableReference("someTitle")]]))

    expect(serverRenderPrismNode(div, nodeData, serverRenderSettings).entries).toMatchObject([
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
    expect(serverRenderPrismNode(element, new WeakMap, serverRenderSettings).entries[0]).toBe(`<img>`)
});

test.todo("Comments");