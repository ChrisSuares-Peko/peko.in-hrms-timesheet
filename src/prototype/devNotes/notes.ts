// PROTOTYPE-SETUP (Developer notes): the notes, docs/dev-notes/dev-notes.json, imported at build time (no fetch).
// Only the notes panel imports this file, and the panel is loaded only in the prototype build, so production bundles
// carry none of it.
import raw from '../../../docs/dev-notes/dev-notes.json';

export type NotesSection = [heading: string, items: string[]];

export interface PageNotes {
    title: string;
    module: string;
    what: string;
    sections: NotesSection[];
    prompt: string;
}

export interface NotesGuide {
    intro: string[];
    read: string[];
    order: string[];
    shared: NotesSection[];
    kickoff: string;
}

export interface DevNotes {
    pages: Record<string, PageNotes>;
    guide: NotesGuide;
}

export const DEV_NOTES = raw as unknown as DevNotes;

/** The notes for a key, falling back by trimming the last ":" segment ("ess:team:today" → "ess:team"). */
export const notesFor = (key: string | null, notes: DevNotes = DEV_NOTES): { key: string; notes: PageNotes } | null => {
    let k = key;
    while (k) {
        if (notes.pages[k]) return { key: k, notes: notes.pages[k] };
        const i = k.lastIndexOf(':');
        if (i < 0) break;
        k = k.slice(0, i);
    }
    return null;
};
