assert = require 'assert'
{inspect} = require 'util'
_ = require('underscore')
_.mixin require('../underscore.deep.js')

describe 'deep_extend', ->
  test_obj =
    a: 1
    b:
      c: 2
      d: e: 3
  tests = [
    [{},        { a: 1 },                 { a: 1 }]
    [{},        { a: 1, b: 2 },           { a: 1, b: 2}]
    [{ a: 1 },  { b: 2 },                 { a: 1, b: 2}]
    [{ a: 1 },  { a: 2 },                 { a: 2}]
    [{ a: 1 },  { a: b: 2 },              { a: b: 2}]
    [test_obj,  { a: 2, b: 1 },           { a: 2, b: 1 }]
    [test_obj,  { b: c: 1 },              { a: 1, b: { c: 1, d: e: 3 }}]
    [test_obj,  { b: d: e: 1 },           { a: 1, b: { c: 2, d: e: 1 }}]
    [test_obj,  { b: { c: 1, d: e: 1 }},  { a: 1, b: { c: 1, d: e: 1 }}]
    [test_obj,  { a: 2, b: d: e: 1 },     { a: 2, b: { c: 2, d: e: 1 }}]
    [test_obj,  {},                       test_obj]
  ]
  _(tests).each ([obj, ext, output]) ->
    it "returns #{inspect obj} extended with #{inspect ext}", ->
      assert.deepEqual _.deepExtend(obj, ext), output
    it "mutates #{inspect obj} with extension #{inspect ext}", ->
      obj = _.clone obj
      _.deepExtend(obj, ext, true)
      assert.deepEqual obj, output
