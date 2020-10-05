/**
 * Used for maintaining consistency of splitting text from SSR
 * TODO remove if context=="client"
 */
export function createComment(comment: string = ""): Comment {
    return document.createComment(comment);
}

// TODO temp
const svgElements = ["svg", "g", "line", "rect", "path", "ellipse", "circle"];

/** 
 * JSX minified render function 
 * O's is used as a falsy value if the element does not have any attribute or events
*/
export function h(tagName: string, attribute: Object | 0 = 0, events: Object | 0 = 0, ...children: Array<HTMLElement>): HTMLElement | SVGElement {
    const isSvgElem = svgElements.includes(tagName);
    const elem = isSvgElem ? document.createElementNS("http://www.w3.org/2000/svg", tagName) : document.createElement(tagName);
    if (attribute) {
        Object.entries(attribute).forEach(([k, v]) => {
            // TODO temp, haven't figured the weird characteristics of IDL attributes and SVG
            if (k in elem && !isSvgElem) {
                elem[k] = v;
            } else {
                elem.setAttribute(k, v);
            }
        });
    }
    if (events) {
        Object.entries(events).forEach(([e, h]) => {
            elem.addEventListener(e, h);
        });
    }
    elem.append(...children);
    return elem;
}