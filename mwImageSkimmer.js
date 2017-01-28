var fs = require('fs');
var im = require('imagemagick');

console.log('1');

function identify(filename) {
  console.log('identifying()');
  return new Promise(function(resolve, reject) {
    im.identify(filename, function(err, features) {
      if (err) reject(err);
      resolve(features);
    })
  })
}

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

function isNewSmaller(originalFilename) {
  console.log('isnewsmaller()');
  var original = fs.statSync(originalFilename).size;
  var converted = fs.statSync(originalFilename + '.out').size;
  return original > converted ? true : false;
}

function deleteFile(filename) {
  console.log('deleting()');
  return fs.unlinkSync(filename);
}

function overwriteImage(originalFilename) {
  setTimeout(function() { // Delay fixes bug where file isn't done writing yet
    fs.rename(originalFilename + '.out', originalFilename, function() {
      // console.log('renamed: ', originalFilename);
    });
  },1000);
}

function processImage(filename) {
  return new Promise(function(resolve, reject) {
    var imgArgs = [filename];
    identify(filename)
    .catch(function(err) {
      console.log('Error in identification: ', err);
      resolve();
    })
    .then(function(meta) {
      if (meta.format == 'PNG') imgArgs.push('-define', 'png:compression-level=9');
      if (meta.colorspace != 'sRGB') imgArgs.push('-colorspace', 'sRGB');
      if (meta.depth > 8) imgArgs.push('-depth', '8');
      if (meta.interlace != 'None') imgArgs.push('-interlace', 'none');
      if (meta.width > 50) imgArgs.push('-posterize', '32'); // remove from if and compare icons before/after
      imgArgs.push('-dither', 'Riemersma');
      imgArgs.push('-quality', '82'); // dont move. needs to be second to last
      imgArgs.push(filename + '.jpg');
    })
    .then(function() {
      console.log('converting()');
      return convert(imgArgs)
    })
    .then(function() {
      if (!isNewSmaller(filename) && imgArgs[imgArgs.length - 3] == '-quality') {
        // Retry without '-quality 82' setting
        console.log('Result B');
        imgArgs.splice(imgArgs.length - 3, 2);
        convert(imgArgs).then(function() {
          if (!isNewSmaller(filename)) {
            console.log('Result C');
            deleteFile(filename + '.jpg');
          }
        });
      } 
      else { console.log('Result A'); return; }
    })
    .then(function() {
      console.log('overwrite image');
      return overwriteImage(filename);
    })
    .then(function() {console.log('resolving the very end'),resolve()})
  })

}

function toJpeg(filename) {
  
}

console.log('2');

processImage(__dirname + '/logo.png')

console.log('3');