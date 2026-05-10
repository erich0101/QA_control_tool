# Project Rules: CSS Compatibility

## 1. Safari/iOS Support
- **Property:** `user-select`
- **Rule:** Always prefix `user-select: none;` with `-webkit-user-select: none;`.
- **Reason:** Safari and Safari on iOS do not support the standard property without the prefix.

```css
/* Correct Usage */
.element {
    -webkit-user-select: none;
    user-select: none;
}
```

## 2. Accessible Form Elements
- **Rule:** All <select>, <input>, and <textarea> elements MUST have an accessible name.
- **Implementation:** Use a corresponding <label> with for attribute, or an aria-label / title attribute.
- **Reason:** Ensuring the application is usable by everyone, including those using screen readers.

## 3. Separation of Concerns (CSS)
- **Rule:** Avoid inline style=... attributes for layout and decoration.
- **Implementation:** Use classes defined in public/css/main.css. Dynamic visibility (e.g., display: none) is acceptable if managed via JS.
- **Reason:** Improves maintainability and allows for easier global design changes.

## 4. XSS Prevention (Frontend Security)
- **Rule:** NEVER inject variable content directly into `innerHTML` or as attribute values without escaping.
- **Implementation:** Always wrap dynamic strings in `UI.escapeHTML(variable)` from `public/js/utils/ui-utils.js`.
- **Reason:** Prevents Cross-Site Scripting (XSS) attacks when rendering user-provided or database-sourced data.

```javascript
/* Correct Usage */
container.innerHTML = `<div>${UI.escapeHTML(userTitle)}</div>`;
```

