import { RegExpLiteral } from "./javascript/components/value/regex";

/*
 * /pages/:pageID 
 * Slug = ^^^^^^^
 */
interface Slug {
    name: string
}

export type DynamicUrl = Array<string | Slug>;

/**
 * Takes a dynamic url and forms a string representation of it in express routing format
 * @example TODO
 */
export function dynamicUrlToString(url: DynamicUrl): string {
    if (url.length === 0) {
        return "/"
    }
    let acc = "";
    for (const part of url) {
        acc += "/";
        if (typeof part === "string") {
            acc += part;
        } else {
            acc += ":" + part.name;
        }
    }
    return acc;
}

export function stringToDynamicUrl(url: string): DynamicUrl {
    const dynamicUrl: DynamicUrl = [];
    const parts = url.split(/\//g).filter(Boolean);
    for (const part of parts) {
        if (part[0] === ":") {
            dynamicUrl.push({ name: part.slice(1) })
        } else {
            dynamicUrl.push(part);
        }
    }
    return dynamicUrl;
}

/**
 * Creates a regular expression with a pattern that matches urls
 * @param route A express style url pattern e.g. "/posts/:postID"
 */
export function dynamicUrlToRegexPattern(url: DynamicUrl): RegExpLiteral {
    if (url.length === 0) {
        return new RegExpLiteral("^\\/$")
    }
    let regexPattern = "^";
    for (const part of url) {
        regexPattern += "\\/";
        if (typeof part === "string") {
            regexPattern += part; // TODO escape characters like .
        } else {
            // Add a name capture group
            regexPattern += `(?<${part.name}>(.+?))`;
        }
    }
    regexPattern += "$";
    return new RegExpLiteral(regexPattern);
}