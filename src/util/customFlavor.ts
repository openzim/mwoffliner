import pathParser from 'path';
import fs from 'fs';
import logger from '../Logger';

/**
 * Search for the customFlavour in the following order
 *
 * 1. Current directory in which command has been run
 * 2. mwoffliner's extensions directory
 * 3. absolute path(for root folder)
 *
 * Note: CustomFlavour doesn't necessarily need be given with extension(.js)
 * like --customFlavour=wiktionary_fr. Hence, .js is explicitly added for
 * path resolution.
 */

export function getCustomFlavorPath(customFlavour: string): string {
    customFlavour += customFlavour.substr(customFlavour.length - 3) !== '.js' ? '.js' : '';
    const possiblePaths = [
        pathParser.resolve(customFlavour),
        pathParser.resolve(__dirname, `../../extensions/${customFlavour}`),
        customFlavour,
    ];
    for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
            return possiblePath;
        }
    }
    return null;
}