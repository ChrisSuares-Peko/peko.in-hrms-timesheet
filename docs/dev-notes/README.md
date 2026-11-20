# Developer notes

`developer-notes.md` holds the developer notes for every module of the HRMS prototype. They are the build spec for
each module, and the prototype shows them in the **Developer notes** panel (bottom right, prototype build only — see
the root `README.md` → Prototype flag). The panel opens on the module for the current page.

## How to update the notes

-   Edit `developer-notes.md` directly. There is no other copy: the panel imports this file at build time.
-   Keep the module markers. Each module starts with a line `<!-- module: name -->` followed by its `## Title`. The
    names are what the panel uses to pick a page's module, so don't rename them without updating `moduleForPath` in
    `src/prototype/devNotes/devNotes.tsx`.
-   One section per module. Put rules that apply to every module in **Shared platform** (`<!-- module: shared -->`),
    not in each module.
-   Update the notes in the same commit as any behaviour change they describe, so the notes and the code never
    disagree.
-   Markdown supported by the panel: headings (`#`–`####`), bullet lists (`- `), **bold** and `inline code`.
    Anything else shows as plain text.
