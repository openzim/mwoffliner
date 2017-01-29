'use strict';

var LZString = require('lz-string');
var packetflattener = require('./packetflattener');

function reduceDecimals(value, numberOfDecimals) {
  var result;

  // Remove any decimals after numberOfDecimals
  if (numberOfDecimals > 0) {
    var multiplier = Math.pow(10, numberOfDecimals);
    result = Math.round(value * multiplier) / multiplier;
  } else {
    result = Math.round(value);
  }

  return result;
}

function getFreeSeparatorCharacter(string) {
  if (typeof string !== 'string') {
    string = string.toString();
  }

  // Loop through the 1024 first character codes
  // to find a character that is not used in the
  // given string, abort as soon as it's found.
  for (var i = 0; i < 1024; i += 1) {
    var separator = String.fromCharCode(i);
    if (string.indexOf(separator) === -1) {
      return separator;
    }
  }
}

function convertValueDataTypeWithTemplate(data, template, value, index) {
  if (Array.isArray(value)) {
    restoreDataTypes(value, template);
  } else if (typeof value === 'object') {
    restoreDataTypes(value, template);
  } else {
    if (typeof template === 'number') {
      data[index] = parseFloat(value);
    } else if (typeof template === 'boolean') {
      if (value === '1') {
	data[index] = true;
      } else {
	data[index] = false;
      }
    }
  }
}

function restoreDataTypes(data, template) { // jshint ignore:line
  if (Array.isArray(data)) {
    data.forEach(function (value, index) {
      convertValueDataTypeWithTemplate(data, template[0], value, index);
    });
  } else {
    Object.keys(data).forEach(function (index) {
      convertValueDataTypeWithTemplate(data, template[index], data[index], index);
    });
  }
}

module.exports.compress = function compress(data, template, maxFloatDecimals) {
  var separator = '';

  // Use a json template to convert the data into a long array
  data = packetflattener.flatten(data, template);

  // If decimal reduction is set, remove any excess decimals
  // to shrink the size of the data.
  if (maxFloatDecimals >= 0) {
    data = data.map(function (value) {
      if (typeof value === 'number') {
	value = reduceDecimals(value, maxFloatDecimals);
      }

      return value;
    });
  }

  // Save boolean as integer 0 or 1
  data = data.map(function (value) {
    if (typeof value === 'boolean') {
      return value === true ? 1 : 0;
    } else {
      return value;
    }
  });

  // Find a character that is unused in the data for use as a
  // separator when converting array into an string.
  separator = getFreeSeparatorCharacter(data);

  // Convert the string to an array, add a separator
  // character first in the string.
  data = separator + data.join(separator);

  // Compress the string with lz.
  // TODO:  look if there are better compression libraries
  data = LZString.compress(data);

  return data;
};

module.exports.decompress = function decompress(data, template) {
  var separator = '';

  // Decompress the data string
  data = LZString.decompress(data);

  // Extract the separator character
  separator = data[0];

  // Extract the rest of the string
  data = data.slice(1, data.length);

  // Split the string into an array
  data = data.split(separator);

  // Use a JSON template to turn the array into an object
  data = packetflattener.unflatten(data, template);

  // Restore data types
  restoreDataTypes(data, template);

  return data;
};

if (typeof window === 'object') {
  window.jsoncompress = {
    compress: module.exports.compress,
    decompress: module.exports.decompress
  };
}
