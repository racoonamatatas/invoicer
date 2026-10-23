// A /** */ comment, unlike the rest of the codebase, so this shows when you
// hover the type in the editor.
/**
 * Lists every field of a form: true if the form has a place on the page for
 * that field's error, false if it doesn't.
 *
 * ```ts
 * useForm<keyof EmailVerification>('verify-email', {
 *     token: true,
 *     name: true,
 *     password: true,
 *     password_confirmation: false, // Laravel puts its error on password
 * });
 * ```
 *
 * Why a Record
 *
 * Record<TField, boolean> needs one key per field, so leaving a field out is
 * a type error, and a typo is caught by the unknown-key check on object
 * literals. Every field gets a decision; none is forgotten.
 *
 * Why NoInfer
 *
 * Without it, TypeScript would work TField out from the object you pass, so
 * { emial: true } would make TField 'emial' and the check would only compare
 * the object with itself. With it, TField comes from the generic you write.
 *
 * Why the never branch
 *
 * useForm's TField defaults to never, so a call without the generic gets
 * never here. Record<never, boolean> has no keys, which makes it {}. But {}
 * is TypeScript's "any non-null value" type, and it skips the unknown-key
 * check, so useForm('login', { email: true }) would compile. That branch
 * swaps in Record<string, never> instead: {} still passes (the logout form
 * has no fields), but any key fails, because no value can be never.
 *
 * Why the brackets
 *
 * When the checked type is a bare type parameter, a conditional type is run
 * once per member of a union and the results joined. `never` is a union with no
 * members, so it would run zero times and give `never`, picking neither branch.
 * [TField] is a one-element tuple, not a bare parameter, so it's checked as a
 * whole.
 */
export type FormDisplaysFieldError<TField extends string> = [TField] extends [never]
    ? Record<string, never>
    : Record<NoInfer<TField>, boolean>;
