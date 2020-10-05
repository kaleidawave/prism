import { HTMLElement } from "../../src/chef/html/html";
import { parseTemplate, ValueAspect, PrismHTMLElement } from "../../src/templating/template";
import { VariableReference } from "../../src/chef/javascript/components/value/variable";
import { ForIteratorExpression } from "../../src/chef/javascript/components/statements/for";
import { Operation } from "../../src/chef/javascript/components/value/expression";

test("Dynamic attribute", () => {
    const template = `<template>
        <img $src="abc">
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { dependencies } = parseTemplate(templateElement);

    expect(dependencies).toHaveLength(1);
    expect(dependencies[0].aspect).toBe(ValueAspect.Attribute);
    expect(dependencies[0].element).toBe(templateElement.children[0]);
    expect(dependencies[0].attribute).toBe("src");
    expect(dependencies[0].expression).toBeInstanceOf(VariableReference);
    expect((dependencies[0].expression as VariableReference).name).toBe("abc");
    expect(dependencies[0].referencesVariables).toHaveLength(1);
});

test("Dynamic text", () => {
    const template = `<template>
        <h1>{title}</h1>
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { dependencies } = parseTemplate(templateElement);

    expect(dependencies).toHaveLength(1);
    expect(dependencies[0].aspect).toBe(ValueAspect.InnerText);
    expect(dependencies[0].element).toBe(templateElement.children[0]);
    expect(dependencies[0].fragmentIndex).toBe(0);
    expect(dependencies[0].expression).toBeInstanceOf(VariableReference);
    expect((dependencies[0].expression as VariableReference).name).toBe("title");
    expect(dependencies[0].referencesVariables).toHaveLength(1);
});

test("Dynamic text alongside text", () => {
    const template = `<template>
        <h1>Title: {title}</h1>
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { dependencies } = parseTemplate(templateElement, false);

    expect(dependencies).toHaveLength(1);
    expect(dependencies[0].aspect).toBe(ValueAspect.InnerText);
    expect(dependencies[0].fragmentIndex).toBe(1);
});

test.todo("Comments injection for dynamic text under ssr");

test("Dynamic text with multiple variables", () => {
    const template = `<template>
        <h1>{a + b}</h1>
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { dependencies } = parseTemplate(templateElement);

    expect(dependencies).toHaveLength(1);
    expect(dependencies[0].aspect).toBe(ValueAspect.InnerText);
    expect(dependencies[0].referencesVariables).toHaveLength(2);
});

test("Existence", () => {
    const template = `<template>
        <h1 #if="x > 4">x is greater than 4</h1>
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { dependencies } = parseTemplate(templateElement);

    expect(dependencies).toHaveLength(1);
    expect(dependencies[0].aspect).toBe(ValueAspect.Conditional);
    expect(dependencies[0].element).toBe(templateElement.children[0]);
});

test("Iteration", () => {
    const template = `<template>
        <ul>
            <li #for="const x of y"></li>
        </ul>
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { dependencies } = parseTemplate(templateElement);

    expect(dependencies).toHaveLength(1);
    expect(dependencies[0].aspect).toBe(ValueAspect.Iterator);
    expect(dependencies[0].expression).toBeInstanceOf(ForIteratorExpression);
    expect((dependencies[0].expression as ForIteratorExpression).variable.name).toBe("x");
    expect((dependencies[0].expression as ForIteratorExpression).operation).toBe(Operation.Of);
    expect((dependencies[0].expression as ForIteratorExpression).subject).toBeInstanceOf(VariableReference);
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

    const { dependencies } = parseTemplate(templateElement);
    expect(dependencies).toHaveLength(2);
    const variableDependency = dependencies.find(dep => dep.aspect === ValueAspect.InnerText)!;
    expect(variableDependency).toBeTruthy();
    expect(variableDependency.referencesVariables[0]).toMatchObject([
        "y",
        {alias: "x", aspect: "*", origin: (templateElement.children[0]! as PrismHTMLElement).children[0]}
    ]);
});

test("Dynamic style", () => {
    const template = `<template>
        <h1 $style="color: someVar;"></h1>
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { dependencies } = parseTemplate(templateElement);

    expect(dependencies).toHaveLength(1);
    expect(dependencies[0].aspect).toBe(ValueAspect.Style);
    expect(dependencies[0].styleKey).toBe("color");
    expect(dependencies[0].expression).toBeInstanceOf(VariableReference);
    expect((dependencies[0].expression as VariableReference).name).toBe("someVar");
});