import { HTMLElement } from "../../src/chef/html/html";
import { parseTemplate, ITemplateConfig, BindingAspect } from "../../src/templating/template";
import { VariableReference } from "../../src/chef/javascript/components/value/variable";
import { ForIteratorExpression } from "../../src/chef/javascript/components/statements/for";
import { Operation } from "../../src/chef/javascript/components/value/expression";

const templateConfig: ITemplateConfig  = {doClientSideRouting: false, tagNameToComponentMap: new Map, ssrEnabled: false}

test("Dynamic attribute", () => {
    const template = `<template>
        <img $src="abc">
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { bindings } = parseTemplate(templateElement, templateConfig);

    expect(bindings).toHaveLength(1);
    expect(bindings[0].aspect).toBe(BindingAspect.Attribute);
    expect(bindings[0].element).toBe(templateElement.children[0]);
    expect(bindings[0].attribute).toBe("src");
    expect(bindings[0].expression).toBeInstanceOf(VariableReference);
    expect((bindings[0].expression as VariableReference).name).toBe("abc");
    expect(bindings[0].referencesVariables).toHaveLength(1);
});

test("Dynamic text", () => {
    const template = `<template>
        <h1>{title}</h1>
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { bindings } = parseTemplate(templateElement, templateConfig);

    expect(bindings).toHaveLength(1);
    expect(bindings[0].aspect).toBe(BindingAspect.InnerText);
    expect(bindings[0].element).toBe(templateElement.children[0]);
    expect(bindings[0].fragmentIndex).toBe(0);
    expect(bindings[0].expression).toBeInstanceOf(VariableReference);
    expect((bindings[0].expression as VariableReference).name).toBe("title");
    expect(bindings[0].referencesVariables).toHaveLength(1);
});

test("Dynamic text alongside text", () => {
    const template = `<template>
        <h1>Title: {title}</h1>
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { bindings } = parseTemplate(templateElement, templateConfig);

    expect(bindings).toHaveLength(1);
    expect(bindings[0].aspect).toBe(BindingAspect.InnerText);
    expect(bindings[0].fragmentIndex).toBe(1);
});

test.todo("Comments injection for dynamic text under ssr");

test("Dynamic text with multiple variables", () => {
    const template = `<template>
        <h1>{a + b}</h1>
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { bindings } = parseTemplate(templateElement, templateConfig);

    expect(bindings).toHaveLength(1);
    expect(bindings[0].aspect).toBe(BindingAspect.InnerText);
    expect(bindings[0].referencesVariables).toHaveLength(2);
});

test("Existence", () => {
    const template = `<template>
        <h1 #if="x > 4">x is greater than 4</h1>
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { bindings } = parseTemplate(templateElement, templateConfig);

    expect(bindings).toHaveLength(1);
    expect(bindings[0].aspect).toBe(BindingAspect.Conditional);
    expect(bindings[0].element).toBe(templateElement.children[0]);
});

test("Iteration", () => {
    const template = `<template>
        <ul>
            <li #for="const x of y"></li>
        </ul>
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { bindings } = parseTemplate(templateElement, templateConfig);

    expect(bindings).toHaveLength(1);
    expect(bindings[0].aspect).toBe(BindingAspect.Iterator);
    expect(bindings[0].expression).toBeInstanceOf(ForIteratorExpression);
    expect((bindings[0].expression as ForIteratorExpression).variable.name).toBe("x");
    expect((bindings[0].expression as ForIteratorExpression).operation).toBe(Operation.Of);
    expect((bindings[0].expression as ForIteratorExpression).subject).toBeInstanceOf(VariableReference);
});

test("Variable under iteration", () => {
    const template = `<template>
        <ul>
            <li #for="const x of y">
                {x}
            </li>
        </ul>
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { bindings } = parseTemplate(templateElement, templateConfig);
    expect(bindings).toHaveLength(2);
    const variableDependency = bindings.find(dep => dep.aspect === BindingAspect.InnerText)!;
    expect(variableDependency).toBeTruthy();
    expect(variableDependency.referencesVariables[0]).toMatchObject([
        "y",
        {alias: "x", aspect: "*", origin: (templateElement.children[0] as HTMLElement).children[0]}
    ]);
});

test("Dynamic style", () => {
    const template = `<template>
        <h1 $style="color: someVar;"></h1>
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { bindings } = parseTemplate(templateElement, templateConfig);

    expect(bindings).toHaveLength(1);
    expect(bindings[0].aspect).toBe(BindingAspect.Style);
    expect(bindings[0].styleKey).toBe("color");
    expect(bindings[0].expression).toBeInstanceOf(VariableReference);
    expect((bindings[0].expression as VariableReference).name).toBe("someVar");
});