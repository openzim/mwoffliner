import pathParser from 'path';
import fs from 'fs';

/**
 * Search for the customFlavour in the following order
 *
 * 1. Absolute Path
 * 2. Current directory in which command has been run
 * 3. mwoffliner's extensions directory
 * 4. Root folder
 *
 * Note: CustomFlavour doesn't necessarily need be given with extension(.js)
 * like --customFlavour=wiktionary_fr. Hence, .js is explicitly added for
 * path resolution.
 */

export function getCustomFlavorPath(customFlavour: string): string {
    customFlavour += customFlavour.substr(customFlavour.length - 3) !== '.js'? '.js': '';
    [
        customFlavour,
        pathParser.resolve(process.cwd(), customFlavour),
        pathParser.resolve(__dirname, `../../extensions/${customFlavour}`),
        pathParser.resolve('/', `${customFlavour}`),
    ].forEach((possiblePath) => {
        if(fs.existsSync(possiblePath))
            return possiblePath;
    })
    return null;
}