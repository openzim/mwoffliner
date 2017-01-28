var fs = require('fs');
var im = require('./imagemagick'); // hotfix on line 156
var supportedFiles = ['jpg', 'jpeg', 'png', 'gif']

function readdir(dir, imgLocations) {
  var current = fs.readdirSync(dir);
  for (var each in current) {
    if ( fs.statSync(dir + current[each]).isDirectory() ) {
      readdir(dir + current[each] + '/', imgLocations);
    } else {
      var ext = /\.(\w{1,3})$/.exec(dir + current[each])
      if (ext && ext[1] && supportedFiles.indexOf(ext[1].toLowerCase()) !== -1) {
        imgLocations.push(dir + current[each]);
      }
    }
  }
  return imgLocations;
}

function deleteFile(filename) {
  return fs.unlinkSync(filename);
}

function isNewSmaller(originalFilename) {
  var original = fs.statSync(originalFilename).size;
  var converted = fs.statSync(originalFilename + '.out').size;
  return original > converted ? true : false;
}

function identify(filename) {
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
      imgArgs.push(filename + '.out');
    })
    .then(function() {
      return convert(imgArgs)
    })
    .then(function() {
      if (!isNewSmaller(filename) && imgArgs[imgArgs.length - 3] == '-quality') {
        // Retry without '-quality 82' setting
        imgArgs.splice(imgArgs.length - 3, 2);
        convert(imgArgs).then(function() {
          if (!isNewSmaller(filename)) {
            deleteFile(filename + '.out');
          }
        });
      } 
      else { return; }
    })
    .then(function() {
      return overwriteImage(filename);
    })
    .then(function() {resolve()})
  })

}

// --------------------------------- Main --------------------------------- //

// Initial Run Setup
if (!fs.existsSync(__dirname + '/in')) {
  fs.mkdirSync(__dirname + '/in');
  console.log('Created \'in\' directory.')
  console.log('Place directory of files to convert in the \'in\' folder and rerun.');
  console.log('Folders may contain other files and will process images in-place.');
  process.exit();
}

// Check for cmd line arguments
var processHeads = 1;
for (var i=0; i<process.argv.length; i++) {
  if (process.argv[i] == '-heads') processHeads = parseInt(process.argv[i+1]);
  if (process.argv[i] == '--help') {
    console.log('Place anything to be converted inside the \'in\' folder.');
    console.log('Nested folders are recursed and non-images are okay.');
    console.log('If the folder does not exist, run once to have it generated.\n');
    console.log('The only parameter is \'-heads <#>\'');
    console.log('Specify a number to instantiate multiple imagemagick threads');
    console.log('Too many heads will overflow memory. Too few is safe but slow.');
    process.exit();
  }
}

// Actual Run
// Due to memory allocation, we must wait for each image to complete to
// start the next one. Plan to handle multiple concurrent conversions
// at once
(function(){
  console.log('Running with ', processHeads, 'head(s)');
  var imageLocations = readdir(__dirname + '/in/', []);

  var timeStarted = Date.now();
  // var j = 0;
  var next = function(headID) {
    if (headID < imageLocations.length-1) {
      processImage(imageLocations[headID])
      .then(function() {
        console.log( headID + '/' + imageLocations.length, 'ETA: ',
          parseInt((imageLocations.length - headID) * 
                  ((Date.now() - timeStarted) / headID )/ 1000 / 60) + ' minutes');
        console.log(imageLocations[headID]);
        next(headID + processHeads);
      })
    }
  }
  // Bootstrap
  for (var i=0; i<processHeads; i++) next(i);
})();


// Dry-run single-test
// var imageLocations = readdir(__dirname + '/in/', []);
// processImage(imageLocations[37028])