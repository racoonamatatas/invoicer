// The id from the URL, or null when it can't be an id. Only digits without a
// leading zero: Number() alone would also take '1e3', ' 7' and '0x1F'.
export const parseRouteId = (param: string | string[] | undefined): number | null =>
{
    if (typeof param !== 'string' || !/^[1-9]\d*$/.test(param))
    {
        return null;
    }

    const id = Number(param);

    // A longer digit string would lose precision and could match the wrong id.
    return Number.isSafeInteger(id) ? id : null;
};
