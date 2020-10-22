/**
 * Used for maintaining consistency of splitting text from SSR
 * TODO remove if context=="client"
 */
export function createComment(comment: string = ""): Comment {
    return document.createComment(comment);
}

// TODO temp
const svgElems = new Set(["svg", "g", "line", "rect", "path", "ellipse", "circle"]);
export const oE = (a, b) => Object.entries(a).forEach(b);

/** 
 * JSX minified render function 
 * O's is used as a falsy value if the element does not have any attribute or events
 * @param tN (tagName)
 * @param a (attributes)
 * @param v (events)
 * @param c (children)
*/
export function h(tn: string, a: Object | 0 = 0, v: Object | 0 = 0, ...c: Array<HTMLElement>): HTMLElement | SVGElement {
    const isSvg = svgElems.has(tn);
    const e = isSvg ? document.createElementNS("http://www.w3.org/2000/svg", tn) : document.createElement(tn);
    if (a) {
        oE(a, ([k, v]) => {
            // TODO temp, haven't figured the weird characteristics of IDL attributes and SVG
            if (k in e && !isSvg) {
                e[k] = v;
            } else {
                e.setAttribute(k, v);
            }
        });
    }
    if (v) {
        oE(v, ([eN, h]) => {
            e.addEventListener(eN, h);
        });
    }
    e.append(...c);
    return e;
}