/**
 * Escapes HTML on the server. From: https://stackoverflow.com/a/6234804/10048799
 */
function escape(unsafe: string | number | boolean | Date): string {
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}