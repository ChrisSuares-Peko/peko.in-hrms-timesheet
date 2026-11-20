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
demo controls). It opens a panel docked on the right with the notes for the page you're on (from
`docs/dev-notes/dev-notes.json`); the notes follow you as you move between pages and sub-tabs.

| Where | Developer notes |
|---|---|
| `yarn dev` | Shown (set `VITE_PROTOTYPE=false` to hide them) |
| `yarn build` with `VITE_PROTOTYPE=true` | Shown (the prototype build) |
| `yarn build` without it (production) | Not built at all: the panel and the notes are left out of the bundle |

-   The Vercel prototype deploy sets `VITE_PROTOTYPE=true` in `vercel.json` (`build.env`). Production pipelines
    (Docker / Azure) don't, so the notes never ship to production.
-   Locally: `VITE_PROTOTYPE=true yarn build` (bash) or `$env:VITE_PROTOTYPE='true'; yarn build` (PowerShell).
-   The notes are imported at build time (a static JSON import), so a change to them needs a rebuild, not a fetch.
    How to edit them and which page reads which entry: `docs/dev-notes/README.md`.
