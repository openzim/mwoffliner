import pathParser from 'path';
import fs from 'fs';

export function getCustomProcessorPath(customFlavour: string):string {

  /**
   * Priorities as follows
   * 1. Absolute Path
   * 2. Current directory in which command has been run
   * 3. mwoffliner's extensions directory
   * 4. Root folder
   */
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

  for(let possiblePath of possiblePaths){
    if(!fileFound && fs.existsSync(possiblePath)){
      fileFound = true;
      return possiblePath;
    }
  };

  return null;
}
