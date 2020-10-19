import { HTMLElement, Node } from "./chef/html/html";
import { IValue } from "./chef/javascript/components/value/value";
import { assignToObjectMap } from "./helpers";
import { NodeData } from "./templating/template";

/**
 * Helper for building meta tag with attributes
 * @param metadata a object equal to the 
 */
function buildMetaTag(metadata: object, nodeData: WeakMap<Node, NodeData>): HTMLElement {
    const tag = new HTMLElement("meta");
    for (const key in metadata) {
        const attribute = metadata[key];
        if (attribute === null) {
            if (!tag.attributes) {
                tag.attributes = new Map();
            }
            tag.attributes.set(key, null);
        } else if (typeof attribute === "string") {
            if (!tag.attributes) {
                tag.attributes = new Map();
            }
            tag.attributes.set(key, attribute);
        } else {
            const dynamicAttributes = nodeData.get(tag)?.dynamicAttributes;
            if (!dynamicAttributes) {
                assignToObjectMap(nodeData, tag, "dynamicAttributes", new Map([[key, attribute]]));
            } else {
                dynamicAttributes.set(key, attribute);
            }
        }
    }
    return tag;
}

/**
 * Creates a series of standard meta tags used for seo and 
 * TODO stricter metadata types (possible string enums)
 * TODO send also node data as well
 * @param metadata 
 */
export function buildMetaTags(metadata: Map<string, string | IValue>): {
    metadataTags: Array<HTMLElement>,
    nodeData: WeakMap<Node, NodeData>
} {
    const metadataTags: Array<HTMLElement> = [], nodeData = new WeakMap();
    for (const [key, value] of metadata) {
        switch (key) {
            case "title":
                metadataTags.push(
                    buildMetaTag({ name: "title", content: value }, nodeData),
                    buildMetaTag({ property: "og:title", content: value }, nodeData),
                    buildMetaTag({ property: "twitter:title", content: value }, nodeData)
                );
                break;
            case "description":
                metadataTags.push(
                    buildMetaTag({ name: "description", content: value }, nodeData),
                    buildMetaTag({ property: "og:description", content: value }, nodeData),
                    buildMetaTag({ property: "twitter:description", content: value }, nodeData)
                );
                break;
            case "image":
                metadataTags.push(
                    buildMetaTag({ property: "og:image", content: value }, nodeData),
                    buildMetaTag({ property: "twitter:image", content: value }, nodeData)
                );
                break;
            case "website":
                metadataTags.push(
                    buildMetaTag({ property: "og:website", content: value }, nodeData),
                    buildMetaTag({ property: "twitter:website", content: value }, nodeData)
                );
                break;
            default:
                // TODO dynamic tags other than <meta>
                metadataTags.push(buildMetaTag({ property: key, content: value }, nodeData));
                break;
        }
    }

    metadataTags.push(
        buildMetaTag({ property: "og:type", content: "website" }, nodeData),
        buildMetaTag({ property: "twitter:card", content: "summary_large_image" }, nodeData),
    );

    return { metadataTags, nodeData };
}