## NODE.JS

-   Node 20.x || 18.x

## USING YARN (Recommend)

-   yarn install
-   yarn start

## USING NPM

-   npm i OR npm i --legacy-peer-deps
-   npm start

## Prototype flag (`VITE_PROTOTYPE`)

Prototype-only tools are behind one build flag. Today that is the **Developer notes** button (bottom right, inside the
demo controls), which opens the notes from `docs/dev-notes/developer-notes.md` for the page you're on.

| Where | Developer notes |
|---|---|
| `yarn dev` | Shown (set `VITE_PROTOTYPE=false` to hide them) |
| `yarn build` with `VITE_PROTOTYPE=true` | Shown (the prototype build) |
| `yarn build` without it (production) | Not built at all: the panel and the notes text are left out of the bundle |

-   The Vercel prototype deploy sets `VITE_PROTOTYPE=true` in `vercel.json` (`build.env`). Production pipelines
    (Docker / Azure) don't, so the notes never ship to production.
-   Locally: `VITE_PROTOTYPE=true yarn build` (bash) or `$env:VITE_PROTOTYPE='true'; yarn build` (PowerShell).
-   The notes are imported as raw text at build time (`?raw`), so a change to the markdown needs a rebuild, not a fetch.
    How to edit them: `docs/dev-notes/README.md`.
