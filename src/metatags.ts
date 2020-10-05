import { PrismNode } from "./templating/template";
import { HTMLElement } from "./chef/html/html";
import { IValue } from "./chef/javascript/components/value/value";
import { addAttribute } from "./templating/helpers";

/**
 * Helper for building meta tag with attributes
 * @param metadata a object equal to the 
 */
function buildMetaTag(metadata: object): PrismNode {
    const tag: PrismNode = new HTMLElement("meta");
    for (const key in metadata) {
        addAttribute(tag, key, metadata[key]);
    }
    return tag;
}

/**
 * Creates a series of standard meta tags used for seo and 
 * TODO stricter metadata types (possible string enums)
 * @param metadata 
 */
export function* buildMetaTags(metadata: Map<string, string | IValue>): Generator<PrismNode> {
    for (const [key, value] of metadata) {
        switch (key) {
            case "title":
                yield buildMetaTag({ name: "title", content: value });
                yield buildMetaTag({ property: "og:title", content: value });
                yield buildMetaTag({ property: "twitter:title", content: value });
                break;
            case "description":
                yield buildMetaTag({ name: "description", content: value });
                yield buildMetaTag({ property: "og:description", content: value });
                yield buildMetaTag({ property: "twitter:description", content: value });
                break;
            case "image":
                yield buildMetaTag({ property: "og:image", content: value });
                yield buildMetaTag({ property: "twitter:image", content: value });
                break;
            case "website":
                yield buildMetaTag({ property: "og:website", content: value });
                yield buildMetaTag({ property: "twitter:website", content: value });
                break;
            default:
                yield buildMetaTag({ property: key, content: value });
                break;
        }
    }

    yield buildMetaTag({ property: "og:type", content: "website" });
    yield buildMetaTag({ property: "twitter:card", content: "summary_large_image" });
}