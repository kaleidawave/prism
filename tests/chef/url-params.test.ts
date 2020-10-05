import { stringToDynamicUrl, dynamicUrlToString, dynamicUrlToRegexPattern } from "../../src/chef/dynamic-url";
import { RegExpLiteral } from "../../src/chef/javascript/components/value/regex";

test("Static urls", () => {
    const urlExpression = stringToDynamicUrl("/about/details");
    expect(urlExpression).toMatchObject(["about", "details"]);
});

test("Dynamic urls", () => {
    const urlExpression = stringToDynamicUrl("/posts/:postID");
    expect(urlExpression).toMatchObject(["posts", { name: "postID" }]);
});

test("Builds static regexp", () => {
    const urlMatcher = dynamicUrlToRegexPattern(["about", "info"]);
    expect(urlMatcher).toBeInstanceOf(RegExpLiteral);
    expect(urlMatcher.expression).toBe("^\\/about\\/info$");
});

test.todo("Dynamic regex");
test.todo("Urls to strings");

test.todo("Invalid urls");