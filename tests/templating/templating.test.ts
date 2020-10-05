import { HTMLElement } from "../../src/chef/html/html";
import { parseTemplate, PrismHTMLElement } from "../../src/templating/template";
import { VariableReference } from "../../src/chef/javascript/components/value/variable";

describe("Text nodes", () => {

});

test("Dynamic attributes", () => {
    const element = HTMLElement.fromString(`<template><h1 $title="x"></h1></template>`);
    parseTemplate(element);
    const h1 = element.children[0] as PrismHTMLElement; 
    expect(h1.dynamicAttributes).toBeTruthy();
    expect(h1.dynamicAttributes!.has("title")).toBeTruthy();
    expect(h1.dynamicAttributes!.get("title")).toMatchObject(new VariableReference("x"));
});

test.todo("Slot");