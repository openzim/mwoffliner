import pathParser from 'path';
import fs from 'fs';

export function getCustomProcessorPath(customFlavour: string):string {

  /**
   * Search for the customFlavour in the below order and 
   * returns the absolute path of the customFlavour.
   * 
   * Order as follows
   * 1. Absolute Path
   * 2. Current directory in which command has been run
   * 3. mwoffliner's extensions directory
   * 4. Root folder
   * 
   * Note: Extension(.js) does not necessarily be included in the customFlavour,
   * that's the reason .js is included in path resolution.
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
