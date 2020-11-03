import { Stylesheet } from "../../../src/chef/css/stylesheet";
import { Rule } from "../../../src/chef/css/rule";
import { AttributeMatcher } from "../../../src/chef/css/selectors";
import { ParseError } from "../../../src/chef/helpers";
import { KeyFrameRule, FontFaceRule, ImportRule } from "../../../src/chef/css/at-rules";

describe("Parses selectors", () => {
    test("Tag Name", () => {
        const css = Stylesheet.fromString("h1 {}");

        expect((css.rules[0] as Rule).selectors[0]).toMatchObject({ tagName: "h1" })
    });

    test("* tag name", () => {
        const css = Stylesheet.fromString("* {}");

        expect((css.rules[0] as Rule).selectors[0]).toMatchObject({ tagName: "*" });
    });

    test("Class", () => {
        const css = Stylesheet.fromString("div.class1 {}");

        expect((css.rules[0] as Rule).selectors[0]).toMatchObject({
            tagName: "div",
            classes: ["class1"]
        });
    });

    test("Multiple classes", () => {
        const css = Stylesheet.fromString(".content.main {}");

        expect((css.rules[0] as Rule).selectors[0]).toMatchObject({
            classes: ["content", "main"]
        });
    });

    describe("Pseudo selectors", () => {
        test("Pseudo class", () => {
            const css = Stylesheet.fromString("li:first-child {}");

            expect((css.rules[0] as Rule).selectors[0]).toMatchObject({
                tagName: "li",
                pseudoClasses: [{ name: "first-child" }]
            });
        });

        test("Pseudo class with arguments", () => {
            const css = Stylesheet.fromString("li:nth-child(2) {}");

            expect((css.rules[0] as Rule).selectors[0]).toMatchObject({
                tagName: "li",
                pseudoClasses: [{ name: "nth-child", args: [{ value: "2" }] }]
            });
        });

        test("Pseudo class with selectors as arguments", () => {
            const css = Stylesheet.fromString("div:not(.post) {}");

            expect((css.rules[0] as Rule).selectors[0]).toMatchObject({
                tagName: "div",
                pseudoClasses: [{
                    name: "not", args: [
                        { classes: ["post"] }
                    ]
                }]
            });
        });

        test("Pseudo element", () => {
            const css = Stylesheet.fromString("p::after {}");

            expect((css.rules[0] as Rule).selectors[0]).toMatchObject({
                tagName: "p",
                pseudoElements: [{ name: "after" }]
            });
        });
    });

    test("Id", () => {
        const css = Stylesheet.fromString("#user {}");

        expect((css.rules[0] as Rule).selectors[0]).toMatchObject({
            id: "user"
        });
    });

    test("Throw if multiple ids", () => {
        expect.assertions(2);

        try {
            Stylesheet.fromString("h1#user#x {}");
        } catch (error) {
            expect(error).toBeInstanceOf(ParseError);
            expect(error).toHaveProperty("message", "CSS selector can only contain one id matcher in anom.css:1:11");
        }
    });

    test("Child", () => {
        const css = Stylesheet.fromString("div > .user {}");

        expect((css.rules[0] as Rule).selectors[0]).toMatchObject({
            tagName: "div",
            child: {
                classes: ["user"]
            }
        });
    });

    test("Adjacent", () => {
        const css = Stylesheet.fromString("h1 + p {}");

        expect((css.rules[0] as Rule).selectors[0]).toMatchObject({
            tagName: "h1",
            adjacent: {
                tagName: "p"
            }
        });
    });

    test("Descendant", () => {
        const css = Stylesheet.fromString("div h1 {}");

        expect((css.rules[0] as Rule).selectors[0]).toMatchObject({
            tagName: "div",
            descendant: {
                tagName: "h1"
            }
        });
    });

    test("Descendant of descendant", () => {
        const css = Stylesheet.fromString("div h1 i {}");

        expect((css.rules[0] as Rule).selectors[0]).toMatchObject({
            tagName: "div",
            descendant: {
                tagName: "h1",
                descendant: {
                    tagName: "i"
                }
            }
        });
    });

    test("Descendant class", () => {
        const css = Stylesheet.fromString("div .child {}");

        expect((css.rules[0] as Rule).selectors[0]).toMatchObject({
            tagName: "div",
            descendant: {
                classes: ["child"]
            }
        });
    });

    test("Group", () => {
        const css = Stylesheet.fromString("h1, h2, h3 {}");

        expect((css.rules[0] as Rule).selectors).toMatchObject([
            { tagName: "h1" },
            { tagName: "h2" },
            { tagName: "h3" }
        ]);
    });

    test("No empty selectors", () => {
        expect.assertions(2);
        try {
            Stylesheet.fromString("{color: red;}")
        } catch (error) {
            expect(error).toBeInstanceOf(ParseError);
            expect(error).toHaveProperty("message", "Expected selector received \"{\" at anom.css:1:1");
        }
    });

    describe("Attributes", () => {
        test("Attribute exists", () => {
            const css = Stylesheet.fromString("img[alt] {}");

            expect((css.rules[0] as Rule).selectors).toMatchObject([
                {
                    tagName: "img",
                    attributes: [
                        {
                            attribute: "alt",
                            matcher: AttributeMatcher.KeyExists
                        }
                    ]
                }
            ]);
        });

        test("Attribute is equal", () => {
            const css = Stylesheet.fromString(`div[data-foo="bar"] {}`);

            expect((css.rules[0] as Rule).selectors).toMatchObject([
                {
                    tagName: "div",
                    attributes: [
                        {
                            attribute: "data-foo",
                            matcher: AttributeMatcher.ExactEqual,
                            value: "bar"
                        }
                    ]
                }
            ]);
        });

        test("Attribute some word", () => {
            const css = Stylesheet.fromString(`div[class~="foo"] {}`);

            expect((css.rules[0] as Rule).selectors).toMatchObject([
                {
                    tagName: "div",
                    attributes: [
                        {
                            attribute: "class",
                            matcher: AttributeMatcher.SomeWord,
                            value: "foo"
                        }
                    ]
                }
            ]);
        });

        test("Attribute begins with", () => {
            const css = Stylesheet.fromString(`div[class|="foo"] {}`);

            expect((css.rules[0] as Rule).selectors).toMatchObject([
                {
                    tagName: "div",
                    attributes: [
                        {
                            attribute: "class",
                            matcher: AttributeMatcher.BeginsWith,
                            value: "foo"
                        }
                    ]
                }
            ]);
        });

        test("Attribute value is prefix", () => {
            const css = Stylesheet.fromString(`div[class^="foo"] {}`);

            expect((css.rules[0] as Rule).selectors).toMatchObject([
                {
                    tagName: "div",
                    attributes: [
                        {
                            attribute: "class",
                            matcher: AttributeMatcher.Prefixed,
                            value: "foo"
                        }
                    ]
                }
            ]);
        });

        test("Attribute value is suffix", () => {
            const css = Stylesheet.fromString(`div[class$="foo"] {}`);

            expect((css.rules[0] as Rule).selectors).toMatchObject([
                {
                    tagName: "div",
                    attributes: [
                        {
                            attribute: "class",
                            matcher: AttributeMatcher.Suffixed,
                            value: "foo"
                        }
                    ]
                }
            ]);
        });

        test("Attribute value occurs", () => {
            const css = Stylesheet.fromString(`div[class*="foo"] {}`);

            expect((css.rules[0] as Rule).selectors).toMatchObject([
                {
                    tagName: "div",
                    attributes: [
                        {
                            attribute: "class",
                            matcher: AttributeMatcher.Occurrence,
                            value: "foo"
                        }
                    ]
                }
            ]);
        });
    });
});

describe("Reads declarations", () => {
    test("Simple declarations", () => {
        const rule1 = Stylesheet.fromString("h1 {color: red;}").rules[0] as Rule;
        const declarations = rule1.declarations;
        expect(declarations.size).toBe(1);
        expect(declarations.has("color")).toBeTruthy();
        expect(declarations.get("color")).toMatchObject([{ value: "red" }]);
    });

    test("Numbers", () => {
        const rule1 = Stylesheet.fromString("h1 {grid-row: 1;}").rules[0] as Rule;
        expect(rule1.declarations.get("grid-row")).toMatchObject([{ value: "1" }]);
    });

    test("Units", () => {
        const rule1 = Stylesheet.fromString("h1 {margin-top: 4px;}").rules[0] as Rule;
        expect(rule1.declarations.get("margin-top")).toMatchObject([{ value: "4", unit: "px" }]);
    });

    test("Decimal shorthand", () => {
        const rule1 = Stylesheet.fromString("h1 {transition: padding .3s;}").rules[0] as Rule;
        expect(rule1.declarations.get("transition")![1]).toMatchObject({ value: ".3", unit: "s" });
    });

    test("Multiple values", () => {
        const rule1 = Stylesheet.fromString("h1 {margin: 4px 3px 2px 1px;}").rules[0] as Rule;
        expect(rule1.declarations.get("margin")).toMatchObject([
            { value: "4", unit: "px" },
            { value: "3", unit: "px" },
            { value: "2", unit: "px" },
            { value: "1", unit: "px" },
        ]);
    });

    test("Comma separated list", () => {
        const rule1 = Stylesheet.fromString(`h1 {font-family: "Helvetica", sans-serif;}`).rules[0] as Rule;
        expect(rule1.declarations.get("font-family")).toMatchObject([
            { value: "Helvetica" },
            ",",
            { value: "sans-serif" },
        ]);
    });

    test("Quotation wrapped", () => {
        const rule1 = Stylesheet.fromString(`h1 {font-family: "Helvetica", sans-serif;}`).rules[0] as Rule;
        expect(rule1.declarations.get("font-family")).toMatchObject([
            { value: "Helvetica", quotationWrapped: true },
            ",",
            { value: "sans-serif" },
        ]);
    });

    test("!important", () => {
        const rule1 = Stylesheet.fromString(`h1 {color: red !important;}`).rules[0] as Rule;
        expect(rule1.declarations.get("color")).toMatchObject([
            { value: "red" },
            { value: "!important" },
        ]);
    });

    xtest("Mix of commented list and non commented", () => {
    });

    test("Ratio", () => {
        const rule1 = Stylesheet.fromString(`img {aspect-ratio: 1/3;}`).rules[0] as Rule;
        expect(rule1.declarations.get("aspect-ratio")).toMatchObject([
            { value: "1" },
            "/",
            { value: "3" },
        ]);
    });

    test("Ratio with span", () => {
        const rule1 = Stylesheet.fromString(`.post-image {grid-row: 1 / span 4;}`).rules[0] as Rule;
        expect(rule1.declarations.get("grid-row")).toMatchObject([
            { value: "1" },
            "/",
            { value: "span" },
            { value: "4" },
        ]);
    });

    test("Functions", () => {
        const cssString =
            `div.image {
                background-image: url("http://some.url.here/image.png");   
            }`;

        const declarations = (Stylesheet.fromString(cssString).rules[0] as Rule).declarations;

        expect(declarations.size).toBe(1);
        expect(declarations.has("background-image")).toBeTruthy();
        expect(declarations.get("background-image")![0]).toMatchObject({
            name: "url",
            arguments: [
                {
                    value: "http://some.url.here/image.png",
                    quotationWrapped: true,
                }
            ]
        });
    });

    test("At least one value", () => {
        expect.assertions(2);
        try {
            Stylesheet.fromString("h1 {color: ; }")
        } catch (error) {
            expect(error).toBeInstanceOf(ParseError);
            expect(error).toHaveProperty("message", `Expected value received ";" at anom.css:1:12`);
        }
    });

    test("Rule closed", () => {
        expect.assertions(2);
        try {
            Stylesheet.fromString("h1 {color: red; ")
        } catch (error) {
            expect(error).toBeInstanceOf(ParseError);
            expect(error).toHaveProperty("message", `Expected "}" received "End of file" at anom.css:1:16`);
        }
    });
})

test("Skip comments", () => {
    const cssString =
        `h1 {
            /* I am a comment */
            color: red;
        }
        
        /*  I am a multiline
            comment */`;

    const css = Stylesheet.fromString(cssString);
    expect(css.rules).toHaveLength(1);
});

describe("At rules", () => {
    describe("Media query", () => {

    });

    test("import rule", () => {
        const importRule = Stylesheet.fromString(`@import url("./modal.css");`).rules[0] as ImportRule;
        expect(importRule).toBeInstanceOf(ImportRule);
        expect(importRule.value).toMatchObject([{
            name: "url",
            arguments: [
                { value: "./modal.css" }
            ]
        }]);
    });

    test.todo("supports");

    test("font-face", () => {
        const css =
            `@font-face {
            font-family: 'Inter';
            font-style:  normal;
            font-weight: 100;
            font-display: swap;
            src: url("font-files/Inter-Thin.woff2?3.13") format("woff2"),
                 url("font-files/Inter-Thin.woff?3.13") format("woff");
        }`;

        const fontFaceRule = Stylesheet.fromString(css).rules[0] as FontFaceRule;
        expect(fontFaceRule).toBeInstanceOf(FontFaceRule);
        expect(fontFaceRule.declarations.length).toBe(5);
    });

    describe("Keyframes", () => {

        test("Name", () => {
            const cssString =
                `@keyframes Rotate { }`;
            const keyframesRule = Stylesheet.fromString(cssString).rules[0] as KeyFrameRule;
            expect(keyframesRule.name).toBe("Rotate");
        });

        test("To from", () => {
            const cssString =
                `@keyframes Rotate {
                from {
                    transform: rotate(0deg);
                }

                to {
                    transform: rotate(360deg);
                }
            }`;
            const keyframesRule = Stylesheet.fromString(cssString).rules[0] as KeyFrameRule;

            expect(keyframesRule.declarations.size).toBe(2);
            expect(keyframesRule.declarations.has("from")).toBeTruthy();
            expect(keyframesRule.declarations.has("to")).toBeTruthy();
        });

        test("Percentages", () => {
            const cssString =
                `@keyframes Rotate {
                0% {
                    transform: rotate(0deg);
                }

                50% {
                    transform: rotate(360deg);
                }
            }`;
            const keyframesRule = Stylesheet.fromString(cssString).rules[0] as KeyFrameRule;

            expect(keyframesRule.name).toBe("Rotate");
            expect(keyframesRule.declarations.size).toBe(2);
            expect(keyframesRule.declarations.has(0)).toBeTruthy();
            expect(keyframesRule.declarations.has(50)).toBeTruthy();
        });
    });
});

describe("Parses nested css", () => {
    test("h1 in a header", () => {
        const css =
            `header {
                padding: 12px;

                h1 {
                    font-size: 18px;
                }
            }`;

        const stylesheet = Stylesheet.fromString(css);
        expect(stylesheet.rules).toHaveLength(2);
        expect((stylesheet.rules[1] as Rule).selectors[0]).toMatchObject({
            tagName: "header",
            descendant: { tagName: "h1" }
        });
    });

    test("Expand out group", () => {
        const css =
            `h1, h2, h3 {
            a, b, i {
                color: green;
            }
        }`;

        const stylesheet = Stylesheet.fromString(css);
        expect((stylesheet.rules[0] as Rule).selectors).toHaveLength(3 * 3);
    });

    test("Deeply nested rules", () => {
        const css =
            `h1 {
                h2 {
                    h3 {
                        color: blue;
                    }
                }
            }`;

        const stylesheet = Stylesheet.fromString(css);
        expect((stylesheet.rules[0] as Rule).selectors[0]).toMatchObject({
            tagName: "h1",
            descendant: {
                tagName: "h2",
                descendant: {
                    tagName: "h3",
                }
            }
        });
    });

    xtest("Pseudo selectors", () => {
        const cssString =
            `p.info {
                font-size: 12px;

                :first-child {
                    content: "Before content";
                }
            }`;

        // const css = stringToTokens(cssString)[0];
        // expect(css.Selectors).toEqual(["p.info"]);
        // expect(css.Declarations).toEqual(new Map([["font-size", "12px"]]));
        // expect(css.SubRules).toHaveLength(1);
        // expect(css.SubRules[0].Selectors).toEqual(["::before"]);
        // expect(css.SubRules[0].Declarations).toEqual(new Map([["content", ""Before content""]]));
    });

    xtest("Nth child selector", () => {
        const cssString =
            `ul {
                padding-left: 0px;

                li:nth-child(2n) {
                    text-decoration: underline;
                }
            }`;

        // const css = stringToTokens(cssString)[0];
        // expect(css.Selectors).toEqual(["ul"]);
        // expect(css.Declarations).toEqual(new Map([["padding-left", "0px"]]));
        // expect(css.SubRules).toHaveLength(1);
        // expect(css.SubRules[0].Selectors).toEqual(["li:nth-child(2n)"]);
        // expect(css.SubRules[0].Declarations).toEqual(new Map([["text-decoration", "underline"]]));
    });

    test.todo("Under media query");
});
