'use strict';

/* global describe, it */

var jsoncompress = require('../jsoncompress');
var assert = require('assert');
var sizeof = require('object-sizeof');

var testDate = new Date(1413108095936);
var testDate2 = new Date(1413108195936);
var testDate3 = new Date(1413108295936);

function Uppercase() {}

Uppercase.fromJSON = function (data) {
  var instance = new Uppercase();
  data = data.split('|');
  instance.string = data[0];
  instance.upperCase = data[1];
  return instance;
};

Uppercase.prototype.toJSON = function () {
  return this.string + '|' + this.upperCase;
};

Uppercase.prototype.setString = function (string) {
  this.string = string;
  this.upperCase = string.toUpperCase();
};

var customObject = new Uppercase();
customObject.setString('testing custom object uppercase');

var object = {
  id: 12345,
  name: 'Another position object, testing',
  date: testDate,
  customObject: customObject,
  active: true,
  visible: false,
  position: {
    x: 10000.35453475,
    y: 5000.4,
    z: 12076876.3232
  },
  colors: [
    [247, 125, 163],
    [150, 100, 123],
    [234, 266, 183]
  ],
  places: [
    {
      name: 'Park',
      date: testDate2,
      owner: {
	name: 'Anna',
	phone: '+46 70-1234567'
      }
    },
    {
      name: 'The Boat',
      date: testDate3,
      owner: {
	name: 'Per',
	phone: '+46 73-1234567'
      }
    }
  ]
};

var template = {
  id: 0,
  name: '',
  date: Date,
  customObject: Uppercase,
  active: true,
  visible: false,
  position: {
    x: 0,
    y: 0,
    z: 0
  },
  colors: [
    [ 0 ]
  ],
  places: [
    {
      name: '',
      date: Date,
      owner: {
	name: '',
	phone: ''
      }
    }
  ]
};

describe('jsoncompress', function () {
  describe('#compress()', function () {
    var compressed = jsoncompress.compress(object, template);
    var compressedLossyDecimal = jsoncompress.compress(object, template, 1);

    it('should be at least 40% smaller than the original with given example', function () {
      assert.equal(
	1 - sizeof(compressed) / sizeof(object) > 0.4,
	true
      );
    });

    it('lossy decimal should be smaller than lossless compression', function () {
      assert.equal(
	sizeof(compressedLossyDecimal) < sizeof(compressed),
	true
      );
    });
  });

  describe('#decompress()', function () {
    var compressed = jsoncompress.compress(object, template);
    var compressedLossyDecimal = jsoncompress.compress(object, template, 2);
    var decompressed = jsoncompress.decompress(compressed, template);
    var decompressedLossyDecimal = jsoncompress.decompress(compressedLossyDecimal, template);

    it('should convert properties back to the same type', function () {
      Object.keys(object).forEach(function (key) {
	if (typeof object[key] === 'object') {
	  Object.keys(object[key]).forEach(function (subKey) {
	    assert.equal(typeof decompressed[key][subKey], typeof object[key][subKey]);
	  });
	}

	assert.equal(typeof decompressed[key], typeof object[key]);
      });
    });

    it('should decompress to exactly the same value', function () {
      assert.equal(
	JSON.stringify(decompressed),
	JSON.stringify(object)
      );
    });

    it('should handle option to reduce to 2 decimals or less for all float values', function () {
      assert.equal(decompressedLossyDecimal.position.x.toString().split('.').length < 3, true);
      assert.equal(decompressedLossyDecimal.position.y.toString().split('.').length < 3, true);
      assert.equal(decompressedLossyDecimal.position.z.toString().split('.').length < 3, true);
    });

    it('should restore Date object from integer to object', function () {
      assert.equal(decompressed.date instanceof Date, true);
      assert.equal(decompressedLossyDecimal.date instanceof Date, true);
    });

    it('should restore custom Uppercase object from string to object', function () {
      assert.equal(decompressed.customObject instanceof Uppercase, true);
      assert.equal(decompressedLossyDecimal.customObject instanceof Uppercase, true);
    });
  });
});
