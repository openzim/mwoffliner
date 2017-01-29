_ = require 'underscore'

module.exports =

  deepKeys: deepKeys = (obj) ->
    throw new Error "deepKeys must be called on an object, not '#{obj}'" unless isPlainObject obj
    # In the base case where obj is empty, _.map(obj, ...) will produce []
    _.flatten _.map obj, (v, k) ->
      if isPlainObject(v) and not _.isEmpty(v)
        _.map deepKeys(v), (subkey) -> "#{k}.#{subkey}"
      else
        [k]

  # http://stackoverflow.com/questions/4459928/how-to-deep-clone-in-javascript
  # This is mostly the same as the accepted answer, just shorter.
  # However, whereas they convert instances of String, etc. to the literal, we create a new instance
  # (`return type object for type` -> `return new type object for type`). This also allows us to
  # handle Dates in the same statement.
  # TODO: Support all core objects in js: Array, Boolean, Date, Function, Math, Number, RegExp, and
  #       String. Currently missing Function, Math, and RegExp.
  deepClone: deepClone = (object) ->
    return object if not object?

    # normalizing primitives e.g. if someone did new String('aaa'), or new Number('444');
    return new type object for type in [Date, Number, String, Boolean] when object instanceof type

    # for arrays clone each element of it
    return _(object).map deepClone if _(object).isArray()

    # primitives like numbers, strings and stuff
    return object if not _(object).isObject()

    # if this is a DOM element
    return object.cloneNode true if object.nodeType and _(object.cloneNode).isFunction()

    # a class of some sort - we can't handle this, so we just return it
    return object unless object.constructor is {}.constructor

    # it is an object literal
    mapValues object, deepClone

  # like "of" operator except can recurse on keys with dot notation
  deepHas: (obj, keys) ->
    helper = (obj, keys) ->
      if (keys.length is 0) or (not _.isObject obj)
        false
      else if keys.length is 1
        _.first(keys) of obj
      else
        helper obj[_.first(keys)], _.rest(keys)
    helper obj, if _.isArray keys then keys else keys.split('.')

  deepOmit: (obj, keys) ->
    unless isPlainObject obj
      throw new Error "deepOmit must be called on an object, not '#{obj}'"
    deepOmitOne = (obj, key) ->
      helper = (obj, key_arr) ->
        switch
          when _.isEmpty key_arr then obj
          when key_arr.length is 1 then _.omit obj, _.first key_arr
          when not isPlainObject obj[_.first key_arr] then obj
          else
            _.extend {}, obj, _.object [_.first key_arr], [
              helper obj[_.first key_arr], _.rest key_arr
            ]
      helper obj, key.split('.')
    _.reduce keys, deepOmitOne, obj

  deepPick: do ->
    deepGet = (obj, key) ->
      helper = (obj, key_arr) ->
        if key_arr.length is 1
          obj?[_.first key_arr]
        else
          helper obj[_.first key_arr], _.rest key_arr
      helper obj, key.split('.')

    (obj, keys) ->
      unless isPlainObject obj
        throw new Error "deepPick must be called on an object, not '#{obj}'"
      flat_new_obj = _.reduce keys, (new_obj, key) ->
        val = deepGet obj, key
        new_obj[key] = val if val isnt undefined
        new_obj
      , {}
      deepFromFlat flat_new_obj

  deepDelete: deepDelete = (obj, key) ->
    return if not key? or not obj?
    key = key.split '.' if not _(key).isArray()
    if key.length is 1
      delete obj[key]
      return
    deepDelete obj[key[0]], key.slice(1, key.length)

  # Like _.extend, except instead of overwriting all nested objects, it extends
  # each leaf of `obj` with the value at the corresponding leaf of `ext`.
  # Note: this function is pure - it returns a new object instead of mutating
  # the original object. If you must have a mutative version, pass true as the
  # third `mutate` parameter.
  deepExtend: deepExtend = (obj, ext, mutate) ->
    _.reduce ext, (acc, val, key) ->
      acc[key] =
        if (key of obj) and isPlainObject(obj[key]) and isPlainObject(val)
        then deepExtend obj[key], val
        else val
      acc
    , if mutate then obj else _.clone obj

  isPlainObject: isPlainObject = (value) -> value?.constructor is {}.constructor

  deepToFlat: (obj) ->
    res = {}
    recurse = (obj, current) ->
      for key of obj
        value = obj[key]
        newKey = ((if current then current + "." + key else key)) # joined key with dot
        if value and isPlainObject value
          recurse value, newKey # it's a nested object, so do it again
        else
          res[newKey] = value # it's not an object, so set the property
    recurse obj
    res

  # Takes an object with keys with dot.notation and deepens it into dot{notation:{}}
  deepFromFlat: deepFromFlat = (o) ->
    oo = {}
    t = undefined
    parts = undefined
    part = undefined
    for k of o
      t = oo
      parts = k.split(".")
      key = parts.pop()
      while parts.length
        part = parts.shift()
        t = t[part] = t[part] or {}
      t[key] = o[k]
    oo

  # Takes an object and replaces each of its values with the result of a
  # function applied to that value (and its key).
  mapValues: mapValues = (obj, f_val) ->
    unless isPlainObject obj
      throw new Error "mapValues must be called on an object, not '#{obj}'"
    _.object _.keys(obj), _.map(obj, f_val)

  deepMapValues: deepMapValues = (obj, f) ->
    unless isPlainObject obj
      throw new Error "deepMapValues must be called on an object, not '#{obj}'"
    mapValues obj, (v, k) ->
      if isPlainObject v
        deepMapValues v, (subv, subk) ->
          f subv, "#{k}.#{subk}"
      else
        f v, k

  # note that the function takes a key and optionally a value, not the usual
  # mapping function pattern of taking a value and optionally a key
  mapKeys: mapKeys = (obj, f_val) ->
    unless isPlainObject obj
      throw new Error "mapKeys must be called on an object, not '#{obj}'"
    _.object _.map(obj, (v,k) -> f_val k,v), _.values obj
