// The fields the server assigns to every entity it stores. A form never sends
// them, so `New<T>` strips exactly these. A field the server starts assigning
// later goes here, and every payload drops it without being edited.
export interface Identified
{
    id: number;
}

// What a form sends for entity `T`: `T` without the server-assigned fields.
// Conditional on a bare `T`, so a union is handled one member at a time
// (`extends unknown` is always true; it's there to make TypeScript distribute).
// A plain `Omit` on a union would merge the members: a Dutch address with a
// `region` would compile, and a key only one member has would be dropped.
export type New<T> = T extends unknown ? Omit<T, keyof Identified> : never;
