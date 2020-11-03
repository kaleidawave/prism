import { Rule } from "../../../src/chef/css/rule";
import { AttributeMatcher } from "../../../src/chef/css/selectors";
import { makeRenderSettings } from "../../../src/chef/helpers";
import { ImportRule, KeyFrameRule } from "../../../src/chef/css/at-rules";

const minificationSettings = makeRenderSettings({ minify: true });

describe("Renders selectors", () => {
    test("Tag name", () => {
        const selector = new Rule([{ tagName: "h1" }]);
        expect(selector.render()).toBe("h1 {}");
    });

    test("Classes", () => {
        const selector = new Rule([{ classes: ["x", "y"] }]);
        expect(selector.render()).toBe(".x.y {}");
    });

    test("Id", () => {
        const selector = new Rule([{ tagName: "h1", id: "section1" }]);
        expect(selector.render()).toBe("h1#section1 {}");
    });

    test("Multiple", () => {
        const selector = new Rule([{ tagName: "h1" }, { classes: ["headers"] }]);
        expect(selector.render()).toBe("h1, .headers {}");
    });

    test("Descendant", () => {
        const selector = new Rule([{ tagName: "div", descendant: { classes: ["comment"] } }]);
        expect(selector.render()).toBe("div .comment {}");
    });

    test("Child", () => {
        const selector = new Rule([{ classes: ["grid"], child: { classes: ["row"] } }]);
        expect(selector.render()).toBe(".grid > .row {}");
    });

    test("Adjacent", () => {
        const selector = new Rule([{ tagName: "h1", adjacent: { tagName: "p" } }]);
        expect(selector.render()).toBe("h1 + p {}");
    });

    test("Pseudo class", () => {
        const selector = new Rule([{ tagName: "li", pseudoClasses: [{ name: "first-child" }] }]);
        expect(selector.render()).toBe("li:first-child {}");
    });

    test("Pseudo class with arg", () => {
        const selector = new Rule([{
            tagName: "li", pseudoClasses: [
                {
                    name: "nth-child",
                    args: [{ value: "2", unit: "n" }]
                }
            ]
        }]);

        expect(selector.render()).toBe("li:nth-child(2n) {}");
    });

    test("Pseudo class with selector arg", () => {
        const selector = new Rule([{
            tagName: "li", pseudoClasses: [
                {
                    name: "not",
                    args: [
                        { pseudoClasses: [{ name: "first-child" }] }
                    ]
                }
            ]
        }]);

        expect(selector.render()).toBe("li:not(:first-child) {}");
    });

    test("Pseudo element", () => {
        const selector = new Rule([{ tagName: "p", pseudoElements: [{ name: "first-child" }] }]);
        expect(selector.render()).toBe("p::first-child {}");
    });

    describe("Attributes", () => {
        test("Key exists", () => {
            const selector = new Rule([{
                tagName: "a",
                attributes: [{
                    attribute: "href",
                    matcher: AttributeMatcher.KeyExists
                }]
            }]);

            expect(selector.render()).toBe("a[href] {}")
        });

        test("Exactly Equal", () => {
            const selector = new Rule([{
                tagName: "a",
                attributes: [{
                    attribute: "data-foo",
                    matcher: AttributeMatcher.ExactEqual,
                    value: "bar"
                }]
            }]);

            expect(selector.render()).toBe(`a[data-foo="bar"] {}`)
        });

        test("Some Word", () => {
            const selector = new Rule([{
                tagName: "a",
                attributes: [{
                    attribute: "data-foo",
                    matcher: AttributeMatcher.SomeWord,
                    value: "bar"
                }]
            }]);

            expect(selector.render()).toBe(`a[data-foo~="bar"] {}`)
        });

        test("Begins With", () => {
            const selector = new Rule([{
                tagName: "a",
                attributes: [{
                    attribute: "data-foo",
                    matcher: AttributeMatcher.BeginsWith,
                    value: "bar"
                }]
            }]);

            expect(selector.render()).toBe(`a[data-foo|="bar"] {}`)
        });

        test("Prefixed", () => {
            const selector = new Rule([{
                tagName: "a",
                attributes: [{
                    attribute: "data-foo",
                    matcher: AttributeMatcher.Prefixed,
                    value: "bar"
                }]
            }]);

            expect(selector.render()).toBe(`a[data-foo^="bar"] {}`)
        });

        test("Suffixed", () => {
            const selector = new Rule([{
                tagName: "a",
                attributes: [{
                    attribute: "data-foo",
                    matcher: AttributeMatcher.Suffixed,
                    value: "bar"
                }]
            }]);

            expect(selector.render()).toBe(`a[data-foo$="bar"] {}`)
        });

        test("Occurrence", () => {
            const selector = new Rule([{
                tagName: "a",
                attributes: [{
                    attribute: "data-foo",
                    matcher: AttributeMatcher.Occurrence,
                    value: "bar"
                }]
            }]);

            expect(selector.render()).toBe(`a[data-foo*="bar"] {}`)
        });
    });
});

describe("Declarations & Values", () => {
    test("Value", () => {
        const selector = new Rule([{
            tagName: "h1"
        }], new Map([["color", [{ value: "red" }]]]));

        expect(selector.render(minificationSettings)).toBe(`h1{color:red}`);
    });

    test.todo("Function");
    test.todo("Comma separated list");
    test.todo("Non comma separated list");
    test.todo("Non comma separated list");
});

describe("At rules", () => {
    test("Import", () => {
        const importStatement = new ImportRule([{
            name: "url",
            arguments: [{ value: "./index.css", quotationWrapped: true }]
        }]);
        expect(importStatement.render()).toBe(`@import url("./index.css");`);
    });

    test("Keyframes", () => {
        const keyframeStatement = new KeyFrameRule("redToBlue", new Map([
            ["from", new Map([["color", [{ value: "red" }] ]])],
            ["to", new Map([["color", [{ value: "blue" }] ]])],
        ]));
        expect(keyframeStatement.render(minificationSettings))
            .toBe(`@keyframes redToBlue{from{color:red}to{color:blue}}`);
    });

    test.todo("font-face");
    test.todo("supports");
    test.todo("media query");
});
