import { parseTemplate } from "../../src/templating/template";
import { HTMLElement } from "../../src/chef/html/html";

test("Events", () => {
    const template = `<template>
        <button @click="doThing"></button>
    </template>`;

    const templateElement = HTMLElement.fromString(template);

    const { events } = parseTemplate(templateElement);

    expect(events.length).toBe(1);
    expect(events[0].element).toBe(templateElement.children[0]);
    expect(events[0].event).toBe("click");
    expect(events[0].callback.name).toBe("doThing");
});