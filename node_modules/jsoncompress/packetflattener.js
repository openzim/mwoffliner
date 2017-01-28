/**
 * Copyright (c) 2012 Karel Crombecq, modified 2014 by Fredrik Söderström
 * (modified to support objects with toJSON methods that returns strings, integers or booleans and support for Date objects)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
(function(Array, undefined) {

  function flattenData(data, template, array) {
    var dataType = typeof data;
    var tempData;

    if (data instanceof Date) {
      dataType = Date;
      tempData = data = data.getTime();
    }
    else if (data && typeof data.toJSON === "function") {
      dataType = data.constructor;
      tempData = data.toJSON();

      if (typeof(tempData) === "number" || typeof(tempData) === "string" || typeof(tempData) === "boolean") {
	data = tempData;
      }
    }

    if (dataType !== typeof(template) && dataType !== template) {
      throw new Error("Found mismatch between template type " + typeof(template) + " and data type " + dataType + " during flatten");
    }
    else if (data && data === tempData) {
      array.push(data);
    }
    else if (typeof(template) === "number" || typeof(template) === "string" || typeof(template) === "boolean") {
      array.push(data);
    }
    else if (typeof(template) === "object") {
      if (template instanceof Array) {
	array.push(data.length);
	for (var i = 0; i < data.length; ++i) {
	  arguments.callee(data[i], template[0], array);
	}
      }
      else if (template.constructor && template.constructor === Object) {
	for (var key in template) {
	  if (typeof(data[key]) === "undefined") arguments.callee(template[key], template[key], array);
	  else arguments.callee(data[key], template[key], array);
	}
      }
    }
  }

  function unflattenData(array, template, data, templateKey, dataKey, idx) {
    if (typeof(template[templateKey]) === "number" || typeof(template[templateKey]) === "string" || typeof(template[templateKey]) === "boolean") {
      data[dataKey] = array[idx++];
    }
    else if (typeof template[templateKey] === "function") {
      if (typeof template[templateKey].fromJSON === "function") {
	data[dataKey] = template[templateKey].fromJSON(array[idx++]);
      } else {
	data[dataKey] = new template[templateKey](parseInt(array[idx++], 10));
      }
    }
    else if (typeof(template[templateKey]) === "object") {
      if (template[templateKey] instanceof Array) {
	var n = array[idx++];
	data[dataKey] = new Array();
	data[dataKey].length = n;
	for (var i = 0; i < n; ++i) {
	  idx = arguments.callee(array, template[templateKey], data[dataKey], 0, i, idx);
	}
      }
      else if (template[templateKey].constructor && template[templateKey].constructor === Object) {
	data[dataKey] = {};
	for (var key in template[templateKey]) {
	  idx = arguments.callee(array, template[templateKey], data[dataKey], key, key, idx);
	}
      }
    }
    return idx;
  }

  function flatten(data, template) {
    var array = [];
    flattenData(data, template, array);
    return array;
  }

  function unflatten(array, template) {
    var container = {};
    unflattenData(array, {data: template}, container, "data", "data", 0);
    return container.data;
  }

  // Exports
  exports.flatten = flatten;
  exports.unflatten = unflatten;

})(Array);
