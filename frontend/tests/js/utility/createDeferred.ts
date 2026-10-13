// A promise the test settles by hand, to look at state while a request is in
// flight. Promise.withResolvers() does the same, but the test tsconfig's lib
// does not include ES2024 yet.
export const createDeferred = () =>
{
    let resolve!: () => void;
    const promise = new Promise<void>((settle) =>
    {
        resolve = settle;
    });

    return { promise, resolve };
};
