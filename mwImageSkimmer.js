var fs = require('fs');
var im = require('imagemagick');

console.log('1');

function convert(imageArgs) {
  return new Promise(function(resolve, reject) {
    im.convert(imageArgs, function(err, stdout) {
      if (err) reject(err);
      resolve();
    })
  })
}

function getFilenameNoExtension(filename) {
  return filename.match(/(.+?)(\.[^.]*$|$)/)[1];
}

function getExtension(filename) {
  return filename.match(/[0-9a-z]+$/)[0];
}

function deleteFile(filename) {
  console.log('deleting()');
  return fs.unlinkSync(filename);
}

function findBest(filename) {
  var shortFilename = getFilenameNoExtension(filename);

  var original = fs.statSync(filename).size; 
  var jpg = fs.statSync(shortFilename + '.out.jpg').size;
  var png = fs.statSync(shortFilename + '.out.png').size;
  var gif = fs.statSync(shortFilename + '.out.gif').size;

  var sizes = {
    original: fs.statSync(filename).size,
    jpg: fs.statSync(shortFilename + '.out.jpg').size,
    png: fs.statSync(shortFilename + '.out.png').size,
    gif: fs.statSync(shortFilename + '.out.gif').size
  }

  var best = 'original';
  for (var key in sizes) {
    if (sizes[key] < sizes[best]) best = key;
  }
  return best;
}

function deleteOthers(filename, shortFilename, fileNotToDelete) {
  var list = [
    filename,
    shortFilename + '.out.jpg',
    shortFilename + '.out.png',
    shortFilename + '.out.gif',
  ]
  if (fileNotToDelete === 'original') list.splice(0, 1);
  if (fileNotToDelete === 'jpg') list.splice(1, 1);
  if (fileNotToDelete === 'png') list.splice(2, 1);
  if (fileNotToDelete === 'gif') list.splice(3, 1);
  list.forEach(function(item) {deleteFile(item)});
}

function renameImage(shortFilename, smallestFileType) {
  return fs.rename(
    shortFilename + '.out.' + smallestFileType,
    shortFilename + '.' + smallestFileType
  )
}

function skimImage(filename) {
  var shortFilename = getFilenameNoExtension(filename);
  var ext = getExtension(filename);
  var imgArgs = [
    filename, 
    '-define', 'png:compression-level=9',
    '-colorspace', 'sRGB',
    '-depth', '8',
    '-interlace', 'none',
    '-posterize', '32',
    '-dither', 'Riemersma',
    '-quality', '82',
    shortFilename + '.out.png'
  ]

  convert(imgArgs)
  .then(function() {
    console.log('4');
    imgArgs[imgArgs.length-1] = shortFilename + '.out.jpg';
    return convert(imgArgs);
  })
  .then(function() {
    console.log('5');
    imgArgs[imgArgs.length-1] = shortFilename + '.out.gif';
    return convert(imgArgs);
  })
  .then(function() {
    console.log('finding the best one...');
    var smallestFileType = findBest(filename);
    deleteOthers(filename, shortFilename, smallestFileType);
    renameImage(shortFilename, smallestFileType);
  })

}






console.log('2');

// processImage(__dirname + '/logo.png')
skimImage(__dirname + '/logo.png');

console.log('3');