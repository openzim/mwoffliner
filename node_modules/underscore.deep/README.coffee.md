# underscore.deep

Underscore.deep is a collection of Underscore mixins that operate on nested
objects.

This README is written in [Literate CoffeeScript](http://coffeescript.org/#literate) as a [Mocha](http://visionmedia.github.io/mocha/) test suite, so you can execute all of the examples - just run:

```
make README.coffee.md
```

## Installation

```
npm install underscore
npm install underscore.deep
```

## Usage

```
_ = require 'underscore'
_.mixin require 'underscore.deep'
```

## Functions

    describe 'underscore.deep', ->
      assert = require 'assert'
      _ = require 'underscore'
      _.mixin require './underscore.deep'

### _.deepToFlat(obj)

Takes an object and produces a new object with no nested objects, converting any nested objects to sets of fields with dot-notation keys, recursively.

      describe '_.deepToFlat', ->

        it 'does nothing with shallow objects', ->
          assert.deepEqual _.deepToFlat({}),             {}
          assert.deepEqual _.deepToFlat( shallow: 1 ),   shallow: 1

        it 'deepToFlats nested objects', ->
          assert.deepEqual _.deepToFlat( deeply: { nested: 2 } ), 'deeply.nested': 2
          assert.deepEqual _.deepToFlat(
            user1:
              name:
                first: 'Deep'
                last: 'Blue'
              age: 33
          ),
            'user1.name.first': 'Deep'
            'user1.name.last': 'Blue'
            'user1.age': '33'

### _.deepFromFlat(obj)

Takes an object and produces a new object with no dot-notation keys, converting any set of dot-notation keys with the same prefix to a nested object, recursively.

**Warning:** Any keys with a dot (`.`) in the input object will be converted to nested objects, so if you use dots in your keys you may want to replace them before you call `_.deepFromFlat`.

      describe '_.deepFromFlat', ->
        it 'does nothing with objects with no dot-notation', ->
          assert.deepEqual _.deepFromFlat({}),             {}
          assert.deepEqual _.deepFromFlat( shallow: 1 ),   shallow: 1

        it 'deepFromFlats a flat object', ->
          assert.deepEqual _.deepFromFlat( 'deeply.nested': 2 ), deeply: { nested: 2 }
          assert.deepEqual _.deepFromFlat(
            'user1.name.first': 'Deep'
            'user1.name.last': 'Blue'
            'user1.age': '33'
          ),
            user1:
              name:
                first: 'Deep'
                last: 'Blue'
              age: 33

### _.deepToFlat and _.deepFromFlat

Taken as a pair, `_.deepToFlat` and `_.deepFromFlat` have an interesting relationship:

      describe '_.deepToFlat and _.deepFromFlat', ->
        it 'they undo each other', ->
          deepObj = a: 1, b: { c: 2 }
          flatObj = a: 1, 'b.c': 2
          assert.deepEqual flatObj, _.deepToFlat deepObj
          assert.deepEqual deepObj, _.deepFromFlat flatObj

They are inverses (of a sort)! We can reformulate this as a property that holds for any `flatObj` and `deepObj`:

          assert.deepEqual flatObj, _.deepToFlat _.deepFromFlat flatObj
          assert.deepEqual deepObj, _.deepFromFlat _.deepToFlat deepObj

### _.deepClone(obj)

Takes an object and makes a copy of it, recursively copying any nested objects
or arrays. Instances of classes, like `Number` or `String`, are *not* cloned.

      describe '_.deepClone', ->

        orig =
          deepThings:
            proverbs:
              quote: 'Computer science is no more about computers' +
                'than astronomy is about telescopes.'
              sayer: 'Dijkstra'
            pools: [
              { depth: 10 }
              { depth: 20 }
              { depth: 30 }
            ]

        it 'clones an object deeply', ->
          copy = _.deepClone orig
          assert.deepEqual copy, orig
          assert.notStrictEqual copy, orig
          assert.notStrictEqual copy.deepThings.proverbs, orig.deepThings.proverbs
          assert.notStrictEqual copy.deepThings.pools, orig.deepThings.pools

        it 'is equivalent to the composition of _.deepFromFlat, _.clone, and _.deepToFlat', ->
          copy2 = _.deepFromFlat _.clone _.deepToFlat orig
          assert.deepEqual copy2, orig
          assert.notEqual copy2, orig

### _.deepHas(obj, key)

Takes an object `obj` and a string `key` (which should be a dot-notation key) and returns true if `obj` has a nested field named `key`.

      describe '_.deepHas', ->

        obj = we: have: to: go: 'deeper'

        it 'returns true if a regular key exists', ->
          assert.equal _.deepHas(obj, 'we'), true

        it 'returns true if the deep key exists', ->
          assert.equal _.deepHas(obj, 'we.have'), true
          assert.equal _.deepHas(obj, 'we.have.to'), true
          assert.equal _.deepHas(obj, 'we.have.to.go'), true

        it 'returns false if the deep key does not exist', ->
          assert.equal _.deepHas(obj, 'we.have.to.goop'), false

        it 'is not equivalent to the composition of _.has and _.deepToFlat', ->
          assert.equal _.deepHas(obj, 'we.have.to.go'), _.has(_.deepToFlat(obj), 'we.have.to.go')
          assert.equal _.deepHas(obj, 'we.have.to.goop'), _.has(_.deepToFlat(obj), 'we.have.to.goop')
          assert.notEqual _.deepHas(obj, 'we'), _.has(_.deepToFlat(obj), 'we')

### _.deepKeys(obj)

Takes an object and returns all of its nested keys in dot-notation.

If you think of a deeply-nested object as a tree, then it will return the paths to all of the tree's leaves. That means it won't return intermediate keys. As a consequence, `_.deepHas(obj, key)` is not equivalent to `_.contains _.deepKeys(obj), key`.

      describe '_.deepKeys', ->

        obj =
          node1:
            leaf1: 1
          node2:
            node3:
              leaf2: 2
              leaf3: 3

        it 'returns dot-notation keys for only the leaf fields of an object', ->
          assert.deepEqual _.deepKeys(obj), [
            'node1.leaf1'
            'node2.node3.leaf2'
            'node2.node3.leaf3'
          ]

        it 'is equivalent to the composition of _.keys and _.deepToFlat', ->
          assert.deepEqual _.deepKeys(obj), _.keys(_.deepToFlat obj)

        it 'does not make _.deepHas equivalent to the composition of _.contains and _.deepKeys', ->
          assert.notDeepEqual _.contains(_.deepKeys(obj), 'node1'), _.has(obj, 'node1')

### _.deepOmit(obj, keys)

Takes an object and a list of dot-notation keys and returns a new object without those keys.

      foods =
        fruit:
          apple: true
          orange: true
          carrot: true
        vegetables:
          banana: true

      describe '_.deepOmit', ->

        it 'returns an object without the given keys', ->
          assert.deepEqual _.deepOmit(foods, ['fruit.carrot', 'vegetables']),
            fruit:
              apple: true
              orange: true

### _.deepPick(obj, keys)

Takes an object and a list of dot-notation keys and returns a new object with only those keys. If you pick a key that has a subobject below it, the entire subobject will be included, regardless of whether its subkeys are also picked.

      describe '_.deepPick', ->

        it 'returns an object with only the given keys', ->
          assert.deepEqual _.deepPick(foods, ['fruit.carrot', 'vegetables']),
            fruit:
              carrot: true
            vegetables:
              banana: true

### _.deepExtend(destination, source, mutate = false)

Takes an object `destination` and an object `source` and creates a new object with all the deep fields of `destination` and all the deep fields of `source`. Any deep fields with the same deep key in `destination` and `source` will have the value from `source` (so `source` fields overwrite `destination` fields).

Unlike `_.extend`, `_.deepExtend` is pure, so the original objects `destination` and `source` will not be modified. If you really want to mutate `destination` by adding the deep fields of `source`, pass `true` as the third parameter `mutate`.

      describe '_.deepExtend', ->

        destination =
          name: 'heaven'
          angels:
            michael: true

        it 'combines all the deep fields of destination and source', ->
          assert.deepEqual _.deepExtend(destination, { angels: gabriel: false }),
            name: 'heaven'
            angels:
              michael: true
              gabriel: false

        it 'overwrites fields of destination with fields from source', ->
          assert.deepEqual _.deepExtend(destination, { angels: michael: false }),
            name: 'heaven'
            angels:
              michael: false

        it 'does not mutate the input objects', ->
          assert.notStrictEqual destination, _.deepExtend(destination, { name: 'hell' })

        it 'is equivalent to a weird composition of _.deepFromFlat, _.extend, and _.deepToFlat', ->
          assert.deepEqual _.deepExtend(destination, { angels: gabriel: false }),
            _.deepFromFlat _.extend _.deepToFlat(destination), _.deepToFlat({ angels: gabriel: false })

### _.deepMapValues(obj, func)

Like [_.mapValues](#_mapvaluesobj-func), but for deep objects. Constructs a new object by applying function `func` to the value for every deep field in object `obj`.

      describe '_.deepMapValues', ->
        obj =
          values:
            empathy: true
            responsibility: false

        it 'creates an object by applying func to each deep value in obj', ->
          assert.deepEqual _.deepMapValues(obj, (v) -> not v),
            values:
              empathy: false
              responsibility: true

        it 'is equivalent to the composition of _.deepFromFlat, _.mapValues, and _.deepToFlat', ->
          assert.deepEqual _.deepMapValues(obj, (v) -> String v),
            _.deepFromFlat _.mapValues _.deepToFlat(obj), (v) -> String v

## Non-deep Helpers

Someday these will probably be moved into their own library, but for now they live here.

### _.isPlainObject(val)

Takes a value `val` and returns `true` if it's a vanilla JS object (i.e. not an instance of any built-in or custom class). Otherwise returns false.

      describe '_.isPlainObject', ->

        it 'returns true for vanilla objects', ->
          assert.equal _.isPlainObject({}), true
          assert.equal _.isPlainObject({ vanilla: 'is so plain' }), true

        it 'returns false for other values', ->
          assert.equal _.isPlainObject(1), false
          assert.equal _.isPlainObject('chocolate'), false
          assert.equal _.isPlainObject(new Date()), false

### _.mapValues(obj, func)

Takes an object `obj` and a function `func` and constructs a new object by applying `func` to every value in `obj`. `func` receives two arguments, the value and the key for that value.

Some have [described](https://github.com/jashkenas/underscore/issues/220#issuecomment-12112759) this function as "the fundamental map over dictionaries." Others have [said](https://github.com/jashkenas/underscore/issues/220#issuecomment-1470150) its not "mainstream enough to deserve to make it into Underscore proper." We take no stance in the debate, but we have to admit we use it on the daily.

      describe '_.mapValues', ->
        obj =
          respect: 1
          fairness: 2

        it 'creates an object by applying func to each value in obj', ->
          assert.deepEqual _.mapValues(obj, (v) -> v * 10),
            respect: 10
            fairness: 20

### _.mapKeys(obj, func)
Exactly like [_.mapValues](#_mapvaluesobj-func) but for keys.

Note that the function takes a function takes a key and optionally a value, not the usual mapping function pattern of taking a value and optionally a key

      describe '_.mapKeys', ->
        obj =
          animate: 1
          charge: 2

        it 'creates an object by applying func to each key in obj', ->
          assert.deepEqual _.mapKeys(obj, (key) -> 're' + key),
            reanimate: 1
            recharge: 2

        it 'creates an object by applying func to each key, val in obj', ->
          assert.deepEqual _.mapKeys(obj, (key, val) -> 're' + key + val),
            reanimate1: 1
            recharge2: 2
