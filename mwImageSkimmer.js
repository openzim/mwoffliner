var fs = require('fs');
var im = require('imagemagick');

function deleteFile(filename) {return fs.unlinkSync(filename)}

function renameImage(filename) {return fs.rename(filename + '.out', filename)}

function isNewSmaller(filename) {
  var original = fs.statSync(filename).size;
  var newer = fs.statSync(filename+ '.out').size;
  return newer < original ? true : false;
}

function convert(imageArgs) {
  return new Promise(function(resolve, reject) {
    im.convert(imageArgs, function(err, stdout) {
      if (err) reject(err);
      resolve();
    })
  })
}

function skimImage(filename) {
  var imgArgs = [
    filename, 
    '-define', 'png:compression-level=9',
    '-colorspace', 'sRGB',
    '-depth', '8',
    '-interlace', 'none',
    '-posterize', '32',
    '-dither', 'Riemersma',
    '-quality', '82',
    filename + '.out'
  ]

  convert(imgArgs)
  .catch(function(err) {console.log(err)})
  .then(function() {
    if (isNewSmaller(filename)) renameImage(filename); 
    else deleteFile(filename + '.out');
  })

}

skimImage(process.argv[2]);