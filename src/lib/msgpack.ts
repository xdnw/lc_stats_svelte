import { Unpackr } from 'msgpackr';

export const appMsgpackUnpackOptions = Object.freeze({
    largeBigIntToFloat: true,
    mapsAsObjects: true,
    bundleStrings: true,
    int64AsType: 'number' as const,
});

export function createAppUnpackr(): Unpackr {
    return new Unpackr({ ...appMsgpackUnpackOptions });
}