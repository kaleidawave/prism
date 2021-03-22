import { TextNode, HTMLElement, Node } from "../chef/html/html";
import type { ValueTypes } from "../chef/javascript/components/value/value";
import type { VariableReference } from "../chef/javascript/components/value/expression";
import type { ForLoopExpression, ForIteratorExpression } from "../chef/javascript/components/statements/for";
import { Component } from "../component";
import { parseHTMLElement } from "./html-element";
import { parseTextNode } from "./text-node";
import { FunctionDeclaration } from "../chef/javascript/components/constructs/function";

/**
 * Represents a event
 */
export interface IEvent {
    nodeIdentifier: string,
    element: HTMLElement,
    eventName: string,
    callback: VariableReference,
    required: boolean, // If required for logic to work, if true will be disabled on ssr,
    existsOnComponentClass: boolean, // True if the callback points to a method on the component class
}

/**
 * Extends the HTMLElement interface adding new properties used in Prism template syntax
 */
interface FullNodeData {
    component: Component // Whether the element is a external component
    dynamicAttributes: Map<string, ValueTypes> // Attributes of an element which are linked to data
    events: Array<IEvent> // Events the element has
    identifier: string // A identifier used for lookup of the element
    slotFor: string // If slot the key of content that should be there
    nullable: boolean // True if the element is not certain to exist in the DOM
    multiple: boolean // If the element can exist multiple times in the DOM

    rawAttribute: ValueTypes, // A name of a variable that does <div ${*rawAttribute*}>
    rawInnerHTML: ValueTypes, // Raw (unescaped) innerHTML value

    // A expression that has to return a truthy value to render (also used for determine that it was a #if node)
    conditionalExpression: ValueTypes,
    // A expression that is used for iteration over children (also used for determine that it was a #for node)
    iteratorExpression:  ForIteratorExpression,

    // A method that renders itself or its children, used for #if and #for node
    clientRenderMethod: FunctionDeclaration,

    elseElement: HTMLElement, // If #if points to the #else element

    // For TextNodes:
    textNodeValue: ValueTypes; // A expression value for its text content
    // For HTMLComments:
    isFragment: true // If the comment is used to break up text nodes for ssr hydration
}

export type NodeData = Partial<FullNodeData>;

// Explains what a variable affects
export enum BindingAspect {
    Attribute, // Affects a specific attribute of a node
    Data, // A components data
    InnerText, // Affects the inner text value of a node
    InnerHTML, // Affects raw inner HTML
    Iterator, // Affects the number of a children under a node / iterator
    Conditional, // Affects if a node is rendered TODO not visible but exists
    DocumentTitle, // Affects the document title
    SetHook, // Hook to method on a class
    Style, // A css style
    ServerParameter // Used in referencing the 
}

// Represents a link between data and a element
export interface IBinding {
    expression: ValueTypes | ForLoopExpression, // The expression that is the mutation of the variable
    aspect: BindingAspect, // The aspect the variable affects
    element?: HTMLElement, // The element that is around the binding. Used to see if the element is multiple or nullable
    fragmentIndex?: number, // The index of the fragment to edit
    attribute?: string, // If aspect is a attribute then the name of the attribute
    styleKey?: string, // 
    referencesVariables: Array<VariableReferenceArray>,
}

export type PartialBinding = Omit<IBinding, 'referencesVariables'>;

export interface ForLoopVariable {
    aspect: "*",
    alias: string,
    origin: HTMLElement
}

export type VariableReferenceArray = Array<string | number | ForLoopVariable>;
export type Locals = Array<{ name: string, path: VariableReferenceArray }>;

export interface ITemplateData {
    slots: Map<string, HTMLElement>,
    nodeData: WeakMap<Node, NodeData>
    bindings: Array<IBinding>,
    events: Array<IEvent>,
    hasSVG: boolean
}

export interface ITemplateConfig {
    staticSrc: string,
    ssrEnabled: boolean,
    tagNameToComponentMap: Map<string, Component>,
    doClientSideRouting: boolean
}

/**
 * Parse the <template> element and its children. TODO explain
 * @param templateElement A root <template> element
 * @param component The component that the template exists under
 */
export function parseTemplate(
    templateElement: HTMLElement,
    templateConfig: ITemplateConfig,
    locals: Array<VariableReference> = [],
): ITemplateData {
    if (templateElement.tagName !== "template") {
        throw Error("Element must be of tag name template");
    }

    const templateData: ITemplateData = {
        slots: new Map(),
        bindings: [],
        events: [],
        nodeData: new WeakMap(),
        hasSVG: false
    }

    for (const child of templateElement.children) {
        parseNode(child, templateData, templateConfig, locals);
    }

    return templateData;
}

/**
 * Mutates all elements:
 * - Adds event listeners to nodes with event binding attributes
 * - Splits up text node with multiple variables to assist with ssr extraction
 */
export function parseNode(
    element: Node,
    templateData: ITemplateData,
    templateConfig: ITemplateConfig,
    locals: Array<VariableReference>, // TODO eventually remove
    localData: Locals = [],
    nullable = false,
    multiple = false,
): void {
    if (element instanceof HTMLElement) {
        parseHTMLElement(element, templateData, templateConfig, locals, localData, nullable, multiple);
    } else if (element instanceof TextNode) {
        parseTextNode(element, templateData, templateConfig, locals, localData, multiple);
    }
}