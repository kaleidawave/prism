import { TextNode, HTMLElement, HTMLComment } from "../chef/html/html";
import type { IValue } from "../chef/javascript/components/value/value";
import type { VariableReference } from "../chef/javascript/components/value/variable";
import type { ForLoopExpression, ForIteratorExpression } from "../chef/javascript/components/statements/for";
import { Component } from "../component";
import { parseHTMLElement } from "./html-element";
import { parseTextNode } from "./text-node";

/**
 * Represents a event
 */
export interface IEvent {
    nodeIdentifier: string,
    element: PrismHTMLElement,
    event: string,
    callback: VariableReference,
    required: boolean, // If required for logic to work, if true will be disabled on ssr,
    existsOnComponentClass: boolean, // True if the callback points to a method on the component class
}

/**
 * Extends the HTMLElement interface adding new properties used in Prism template syntax
 */
export interface PrismHTMLElement extends HTMLElement {
    component?: Component // Whether the element is a external component
    dynamicAttributes?: Map<string, IValue> // Attributes of an element which are linked to data
    events?: Array<IEvent> // Events the element has
    identifier?: string // A identifier used for lookup of the element
    slotFor?: string // If slot the key of content that should be there
    nullable?: boolean // True if the element is not certain to exist in the DOM
    multiple?: boolean // If the element can exist multiple times in the DOM
    elseElement?: PrismHTMLElement,
    // Client and server are aliased different
    clientExpression?: IValue | ForIteratorExpression, 
    serverExpression?: IValue | ForIteratorExpression,
    clientRenderMethod?: string
}

export interface PrismTextNode extends TextNode {
    value?: IValue; // A expression value for its text content
}

export interface PrismComment extends HTMLComment {
    isFragment?: true // If the comment is used to break up text nodes for ssr hydration
}

export type PrismNode = PrismHTMLElement | PrismTextNode | PrismComment;

// Explains what a variable affects
export enum ValueAspect {
    Attribute, // Affects a specific attribute of a node
    Data, // A components data
    InnerText, // Affects the inner text value of a node
    Iterator, // Affects the number of a children under a node / iterator
    Conditional, // Affects if a node is rendered TODO not visible but exists
    DocumentTitle, // Affects the document title
    SetHook, // Hook to method on a class
    Style // A css style
}

// Represents a link between data and a element
export interface IDependency {
    element: PrismHTMLElement, // Used to see if the element is multiple or nullable
    expression: IValue | ForLoopExpression, // The expression that is the mutation of the variable
    aspect: ValueAspect, // The aspect the variable affects
    fragmentIndex?: number, // The index of the fragment to edit
    attribute?: string, // If aspect is a attribute then the name of the attribute
    styleKey?: string, // 
    referencesVariables: Array<VariableReferenceArray>,
}

export type PartialDependency = Omit<IDependency, 'referencesVariables'>;

export interface ForLoopVariable {
    aspect: "*",
    alias: string,
    origin: PrismHTMLElement
}

export type VariableReferenceArray = Array<string | number | ForLoopVariable>;
export type Locals = Array<{ name: string, path: VariableReferenceArray }>;

export interface Template {
    slots: Map<string, PrismHTMLElement>,
    dependencies: Array<IDependency>,
    events: Array<IEvent>,
}

/**
 * Parse the <template> element and its children. TODO explain
 * @param template
 * @param component The component that the template exists under
 */
export function parseTemplate(
    template: HTMLElement,
    ssr: boolean = true,
    locals: Array<VariableReference> = [],
    importedComponents: Map<string, Component> | null = null,
): Template {
    if (template.tagName !== "template") {
        throw Error("Element must be of tag name template");
    }

    const slots = new Map(), dependencies = [], events = [];

    for (const child of template.children as Array<PrismNode>) {
        parsePrismNode(child, slots, dependencies, events, importedComponents, ssr, locals);
    }

    return { slots, dependencies, events }
}

/**
 * Mutates all elements:
 * - Adds event listeners to nodes with event binding attributes
 * - Splits up text node with multiple variables to assist with ssr extraction
 */
export function parsePrismNode(
    element: PrismNode,
    slots: Map<string, PrismHTMLElement>,
    dependencies: Array<IDependency>,
    events: Array<IEvent>,
    importedComponents: Map<string, Component> | null,
    ssr: boolean,
    locals: Array<VariableReference>, // TODO eventually remove
    localData: Locals = [],
    nullable = false,
    multiple = false,
): void {
    if (element instanceof HTMLElement) {
        parseHTMLElement(element, slots, dependencies, events, importedComponents, ssr, locals, localData, nullable, multiple);
    } else if (element instanceof TextNode) {
        parseTextNode(element, dependencies, ssr, locals, localData, multiple);
    }
}