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

export function getCustomProcessorPath(customFlavour: string): string {
  const possiblePaths = [
    customFlavour,
    pathParser.resolve(process.cwd(), customFlavour),
    pathParser.resolve(process.cwd(), `${customFlavour}.js`),
    pathParser.resolve(__dirname, `../../extensions/${customFlavour}`),
    pathParser.resolve(__dirname, `../../extensions/${customFlavour}.js`),
    pathParser.resolve('/', `${customFlavour}`),
    pathParser.resolve('/', `${customFlavour}.js`),
  ];

  let fileFound = false;

  for (const possiblePath of possiblePaths) {
    if (!fileFound && fs.existsSync(possiblePath)) {
      fileFound = true;
      return possiblePath;
    }
  }

  return null;
}
