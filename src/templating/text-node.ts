import { BindingAspect, Locals, PartialBinding, ITemplateData, ITemplateConfig } from "./template";
import { IValue } from "../chef/javascript/components/value/value";
import { Expression } from "../chef/javascript/components/value/expression";
import { HTMLComment, TextNode } from "../chef/html/html";
import { addIdentifierToElement, addBinding } from "./helpers";
import { HTMLElement } from "../chef/html/html";
import { VariableReference } from "../chef/javascript/components/value/variable";
import { assignToObjectMap } from "../helpers";

export function parseTextNode(
    textNode: TextNode,
    templateData: ITemplateData,
    templateConfig: ITemplateConfig,
    locals: Array<VariableReference>,
    localData: Locals,
    multiple: boolean = false
): void {
    // TODO what about "Hello {name(x: {})}"; Uhh? Maybe alternative to regex?
    const text = textNode.text.split(/{(.+?)}/g);

    // Should never throw
    if (!textNode.parent) {
        throw Error("Found text node without parent");
    }

    // If no instances of {...} return;
    if (text.length <= 1) {
        return;
    }

    // TODO allow interpolated variables alongside elements
    // Check could also be done via element.parent.children.length > 1 but ...
    if (textNode.parent?.children.some(element => element instanceof HTMLElement)) {
        throw Error("Not supported - Interpolated variables alongside elements");
    }

    const fragments: Array<string | IValue> = []
    for (let i = 0; i < text.length; i++) {
        if (i % 2 === 0) {
            if (text[i] !== "") {
                fragments.push(text[i]);
            }
        } else {
            try {
                let expression = Expression.fromString(text[i])
                fragments.push(expression);
            } catch (error) {
                throw Error(`Error in text "{${text[i]}}" in ${"TODO"}: ${error}`);
            }
        }
    }

    if (!multiple) {
        addIdentifierToElement(textNode.parent, templateData.nodeData);
    }

    const insertedChildren: Array<TextNode | HTMLComment> = [];

    for (let i = 0; i < fragments.length; i++) {
        const fragment = fragments[i];
        if (typeof fragment === "string") {
            const staticTextNode = new TextNode(fragment, textNode.parent);
            insertedChildren.push(staticTextNode)
        } else {
            const dynamicTextNode: TextNode = new TextNode("", textNode.parent);
            assignToObjectMap(templateData.nodeData, dynamicTextNode, "textNodeValue", fragment)

            const bindings: PartialBinding = {
                aspect: BindingAspect.InnerText,
                element: textNode.parent,
                expression: fragment,
                // Under SSR comments are needed to create text nodes,
                // therefore the text nodes are every other index and the need for *2
                fragmentIndex: templateConfig.ssrEnabled ? i * 2 : i
            }

            addBinding(bindings, localData, locals, templateData.bindings);
            insertedChildren.push(dynamicTextNode);
        }

        // Comments are required to be inserted to separated text nodes during ssr
        if (i + 1 < fragments.length && templateConfig.ssrEnabled) {
            const comment = new HTMLComment(textNode.parent!);
            assignToObjectMap(templateData.nodeData, comment, "isFragment", true);
            insertedChildren.push(comment);
        }
    }

    textNode.parent.children.splice(textNode.parent.children.indexOf(textNode), 1, ...insertedChildren);
}