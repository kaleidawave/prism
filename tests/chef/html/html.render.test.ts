import { HTMLElement, TextNode } from "../../../src/chef/html/html";
import { makeRenderSettings } from "../../../src/chef/helpers";
import { Module } from "../../../src/chef/javascript/components/module";
import { Expression, Operation } from "../../../src/chef/javascript/components/value/expression";
import { Value, Type } from "../../../src/chef/javascript/components/value/value";
import { Stylesheet } from "../../../src/chef/css/stylesheet";
import { Rule } from "../../../src/chef/css/rule";

const minificationSettings = makeRenderSettings({ minify: true });

test("Renders tag", () => {
    const element = new HTMLElement("h1");
    expect(element.render()).toBe("<h1></h1>");
});

test("Renders self closing tag", () => {
    const element = new HTMLElement("img");
    expect(element.render()).toBe("<img>");
});

test("Renders attributes", () => {
    const element = new HTMLElement("h1", new Map([["class", "red"]]));
    expect(element.render()).toBe(`<h1 class="red"></h1>`);
});

test("Renders boolean attribute", () => {
    const element = new HTMLElement("h1", new Map([["hidden", null]]));
    expect(element.render()).toBe(`<h1 hidden></h1>`);
});

test("Renders children", () => {
    const element = new HTMLElement("div", null, [
        new HTMLElement("h1")
    ]);

    expect(element.render(minificationSettings)).toBe("<div><h1></h1></div>");
});

test("Renders children text nodes", () => {
    const element = new HTMLElement("h1", null, [
        new TextNode("Hello World")
    ]);

    expect(element.render(minificationSettings)).toBe("<h1>Hello World</h1>");
});

test("Renders modules", () => {
    const scriptElement = new HTMLElement("script");
    scriptElement.module = new Module("", [
        new Expression({
            lhs: new Value(Type.number, "3"),
            operation: Operation.Add,
            rhs: new Value(Type.number, "5")
        })
    ]);

    expect(scriptElement.render(minificationSettings)).toBe("<script>3+5</script>");
});

test("Renders stylesheet", () => {
    const styleElement = new HTMLElement("style");
    styleElement.stylesheet = new Stylesheet("", [
        new Rule(
            [{tagName: "h1"}],
            new Map([["color", [{value: "red"}]]])
        )
    ]);

    expect(styleElement.render(minificationSettings)).toBe("<style>h1{color:red}</style>");
});

test("Self closing elements", () => {
    const circleNode = new HTMLElement("circle", new Map([["r", "50"]]), undefined, undefined, undefined, true);
    expect(circleNode.render()).toBe(`<circle r="50"/>`);
});