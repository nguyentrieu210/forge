var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x2) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x2, {
  get: (a, b3) => (typeof require !== "undefined" ? require : a)[b3]
}) : x2)(function(x2) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x2 + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseHas.js
var require_baseHas = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseHas.js"(exports, module) {
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function baseHas(object, key) {
      return object != null && hasOwnProperty.call(object, key);
    }
    module.exports = baseHas;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isArray.js
var require_isArray = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isArray.js"(exports, module) {
    var isArray = Array.isArray;
    module.exports = isArray;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_freeGlobal.js
var require_freeGlobal = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_freeGlobal.js"(exports, module) {
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    module.exports = freeGlobal;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_root.js
var require_root = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_root.js"(exports, module) {
    var freeGlobal = require_freeGlobal();
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    module.exports = root;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_Symbol.js
var require_Symbol = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_Symbol.js"(exports, module) {
    var root = require_root();
    var Symbol2 = root.Symbol;
    module.exports = Symbol2;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getRawTag.js
var require_getRawTag = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getRawTag.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var nativeObjectToString = objectProto.toString;
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    function getRawTag(value) {
      var isOwn = hasOwnProperty.call(value, symToStringTag), tag = value[symToStringTag];
      try {
        value[symToStringTag] = void 0;
        var unmasked = true;
      } catch (e) {
      }
      var result = nativeObjectToString.call(value);
      if (unmasked) {
        if (isOwn) {
          value[symToStringTag] = tag;
        } else {
          delete value[symToStringTag];
        }
      }
      return result;
    }
    module.exports = getRawTag;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_objectToString.js
var require_objectToString = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_objectToString.js"(exports, module) {
    var objectProto = Object.prototype;
    var nativeObjectToString = objectProto.toString;
    function objectToString(value) {
      return nativeObjectToString.call(value);
    }
    module.exports = objectToString;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseGetTag.js
var require_baseGetTag = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseGetTag.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var getRawTag = require_getRawTag();
    var objectToString = require_objectToString();
    var nullTag = "[object Null]";
    var undefinedTag = "[object Undefined]";
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    function baseGetTag(value) {
      if (value == null) {
        return value === void 0 ? undefinedTag : nullTag;
      }
      return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
    }
    module.exports = baseGetTag;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isObjectLike.js
var require_isObjectLike = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isObjectLike.js"(exports, module) {
    function isObjectLike(value) {
      return value != null && typeof value == "object";
    }
    module.exports = isObjectLike;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isSymbol.js
var require_isSymbol = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isSymbol.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isObjectLike = require_isObjectLike();
    var symbolTag = "[object Symbol]";
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && baseGetTag(value) == symbolTag;
    }
    module.exports = isSymbol;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isKey.js
var require_isKey = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isKey.js"(exports, module) {
    var isArray = require_isArray();
    var isSymbol = require_isSymbol();
    var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/;
    var reIsPlainProp = /^\w*$/;
    function isKey(value, object) {
      if (isArray(value)) {
        return false;
      }
      var type = typeof value;
      if (type == "number" || type == "symbol" || type == "boolean" || value == null || isSymbol(value)) {
        return true;
      }
      return reIsPlainProp.test(value) || !reIsDeepProp.test(value) || object != null && value in Object(object);
    }
    module.exports = isKey;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isObject.js
var require_isObject = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isObject.js"(exports, module) {
    function isObject(value) {
      var type = typeof value;
      return value != null && (type == "object" || type == "function");
    }
    module.exports = isObject;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isFunction.js
var require_isFunction = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isFunction.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isObject = require_isObject();
    var asyncTag = "[object AsyncFunction]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var proxyTag = "[object Proxy]";
    function isFunction(value) {
      if (!isObject(value)) {
        return false;
      }
      var tag = baseGetTag(value);
      return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
    }
    module.exports = isFunction;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_coreJsData.js
var require_coreJsData = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_coreJsData.js"(exports, module) {
    var root = require_root();
    var coreJsData = root["__core-js_shared__"];
    module.exports = coreJsData;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isMasked.js
var require_isMasked = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isMasked.js"(exports, module) {
    var coreJsData = require_coreJsData();
    var maskSrcKey = (function() {
      var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
      return uid ? "Symbol(src)_1." + uid : "";
    })();
    function isMasked(func) {
      return !!maskSrcKey && maskSrcKey in func;
    }
    module.exports = isMasked;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_toSource.js
var require_toSource = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_toSource.js"(exports, module) {
    var funcProto = Function.prototype;
    var funcToString = funcProto.toString;
    function toSource(func) {
      if (func != null) {
        try {
          return funcToString.call(func);
        } catch (e) {
        }
        try {
          return func + "";
        } catch (e) {
        }
      }
      return "";
    }
    module.exports = toSource;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIsNative.js
var require_baseIsNative = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIsNative.js"(exports, module) {
    var isFunction = require_isFunction();
    var isMasked = require_isMasked();
    var isObject = require_isObject();
    var toSource = require_toSource();
    var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    var reIsHostCtor = /^\[object .+?Constructor\]$/;
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var reIsNative = RegExp(
      "^" + funcToString.call(hasOwnProperty).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    );
    function baseIsNative(value) {
      if (!isObject(value) || isMasked(value)) {
        return false;
      }
      var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
      return pattern.test(toSource(value));
    }
    module.exports = baseIsNative;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getValue.js
var require_getValue = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getValue.js"(exports, module) {
    function getValue(object, key) {
      return object == null ? void 0 : object[key];
    }
    module.exports = getValue;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getNative.js
var require_getNative = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getNative.js"(exports, module) {
    var baseIsNative = require_baseIsNative();
    var getValue = require_getValue();
    function getNative(object, key) {
      var value = getValue(object, key);
      return baseIsNative(value) ? value : void 0;
    }
    module.exports = getNative;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_nativeCreate.js
var require_nativeCreate = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_nativeCreate.js"(exports, module) {
    var getNative = require_getNative();
    var nativeCreate = getNative(Object, "create");
    module.exports = nativeCreate;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_hashClear.js
var require_hashClear = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_hashClear.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    function hashClear() {
      this.__data__ = nativeCreate ? nativeCreate(null) : {};
      this.size = 0;
    }
    module.exports = hashClear;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_hashDelete.js
var require_hashDelete = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_hashDelete.js"(exports, module) {
    function hashDelete(key) {
      var result = this.has(key) && delete this.__data__[key];
      this.size -= result ? 1 : 0;
      return result;
    }
    module.exports = hashDelete;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_hashGet.js
var require_hashGet = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_hashGet.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function hashGet(key) {
      var data = this.__data__;
      if (nativeCreate) {
        var result = data[key];
        return result === HASH_UNDEFINED ? void 0 : result;
      }
      return hasOwnProperty.call(data, key) ? data[key] : void 0;
    }
    module.exports = hashGet;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_hashHas.js
var require_hashHas = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_hashHas.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function hashHas(key) {
      var data = this.__data__;
      return nativeCreate ? data[key] !== void 0 : hasOwnProperty.call(data, key);
    }
    module.exports = hashHas;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_hashSet.js
var require_hashSet = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_hashSet.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    function hashSet(key, value) {
      var data = this.__data__;
      this.size += this.has(key) ? 0 : 1;
      data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED : value;
      return this;
    }
    module.exports = hashSet;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_Hash.js
var require_Hash = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_Hash.js"(exports, module) {
    var hashClear = require_hashClear();
    var hashDelete = require_hashDelete();
    var hashGet = require_hashGet();
    var hashHas = require_hashHas();
    var hashSet = require_hashSet();
    function Hash(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    Hash.prototype.clear = hashClear;
    Hash.prototype["delete"] = hashDelete;
    Hash.prototype.get = hashGet;
    Hash.prototype.has = hashHas;
    Hash.prototype.set = hashSet;
    module.exports = Hash;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_listCacheClear.js
var require_listCacheClear = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_listCacheClear.js"(exports, module) {
    function listCacheClear() {
      this.__data__ = [];
      this.size = 0;
    }
    module.exports = listCacheClear;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/eq.js
var require_eq = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/eq.js"(exports, module) {
    function eq(value, other) {
      return value === other || value !== value && other !== other;
    }
    module.exports = eq;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_assocIndexOf.js
var require_assocIndexOf = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_assocIndexOf.js"(exports, module) {
    var eq = require_eq();
    function assocIndexOf(array, key) {
      var length = array.length;
      while (length--) {
        if (eq(array[length][0], key)) {
          return length;
        }
      }
      return -1;
    }
    module.exports = assocIndexOf;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_listCacheDelete.js
var require_listCacheDelete = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_listCacheDelete.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    var arrayProto = Array.prototype;
    var splice = arrayProto.splice;
    function listCacheDelete(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        return false;
      }
      var lastIndex = data.length - 1;
      if (index == lastIndex) {
        data.pop();
      } else {
        splice.call(data, index, 1);
      }
      --this.size;
      return true;
    }
    module.exports = listCacheDelete;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_listCacheGet.js
var require_listCacheGet = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_listCacheGet.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheGet(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      return index < 0 ? void 0 : data[index][1];
    }
    module.exports = listCacheGet;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_listCacheHas.js
var require_listCacheHas = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_listCacheHas.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheHas(key) {
      return assocIndexOf(this.__data__, key) > -1;
    }
    module.exports = listCacheHas;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_listCacheSet.js
var require_listCacheSet = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_listCacheSet.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheSet(key, value) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        ++this.size;
        data.push([key, value]);
      } else {
        data[index][1] = value;
      }
      return this;
    }
    module.exports = listCacheSet;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_ListCache.js
var require_ListCache = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_ListCache.js"(exports, module) {
    var listCacheClear = require_listCacheClear();
    var listCacheDelete = require_listCacheDelete();
    var listCacheGet = require_listCacheGet();
    var listCacheHas = require_listCacheHas();
    var listCacheSet = require_listCacheSet();
    function ListCache(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    ListCache.prototype.clear = listCacheClear;
    ListCache.prototype["delete"] = listCacheDelete;
    ListCache.prototype.get = listCacheGet;
    ListCache.prototype.has = listCacheHas;
    ListCache.prototype.set = listCacheSet;
    module.exports = ListCache;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_Map.js
var require_Map = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_Map.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var Map2 = getNative(root, "Map");
    module.exports = Map2;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_mapCacheClear.js
var require_mapCacheClear = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_mapCacheClear.js"(exports, module) {
    var Hash = require_Hash();
    var ListCache = require_ListCache();
    var Map2 = require_Map();
    function mapCacheClear() {
      this.size = 0;
      this.__data__ = {
        "hash": new Hash(),
        "map": new (Map2 || ListCache)(),
        "string": new Hash()
      };
    }
    module.exports = mapCacheClear;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isKeyable.js
var require_isKeyable = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isKeyable.js"(exports, module) {
    function isKeyable(value) {
      var type = typeof value;
      return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
    }
    module.exports = isKeyable;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getMapData.js
var require_getMapData = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getMapData.js"(exports, module) {
    var isKeyable = require_isKeyable();
    function getMapData(map, key) {
      var data = map.__data__;
      return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
    }
    module.exports = getMapData;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_mapCacheDelete.js
var require_mapCacheDelete = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_mapCacheDelete.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheDelete(key) {
      var result = getMapData(this, key)["delete"](key);
      this.size -= result ? 1 : 0;
      return result;
    }
    module.exports = mapCacheDelete;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_mapCacheGet.js
var require_mapCacheGet = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_mapCacheGet.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheGet(key) {
      return getMapData(this, key).get(key);
    }
    module.exports = mapCacheGet;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_mapCacheHas.js
var require_mapCacheHas = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_mapCacheHas.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheHas(key) {
      return getMapData(this, key).has(key);
    }
    module.exports = mapCacheHas;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_mapCacheSet.js
var require_mapCacheSet = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_mapCacheSet.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheSet(key, value) {
      var data = getMapData(this, key), size = data.size;
      data.set(key, value);
      this.size += data.size == size ? 0 : 1;
      return this;
    }
    module.exports = mapCacheSet;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_MapCache.js
var require_MapCache = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_MapCache.js"(exports, module) {
    var mapCacheClear = require_mapCacheClear();
    var mapCacheDelete = require_mapCacheDelete();
    var mapCacheGet = require_mapCacheGet();
    var mapCacheHas = require_mapCacheHas();
    var mapCacheSet = require_mapCacheSet();
    function MapCache(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    MapCache.prototype.clear = mapCacheClear;
    MapCache.prototype["delete"] = mapCacheDelete;
    MapCache.prototype.get = mapCacheGet;
    MapCache.prototype.has = mapCacheHas;
    MapCache.prototype.set = mapCacheSet;
    module.exports = MapCache;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/memoize.js
var require_memoize = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/memoize.js"(exports, module) {
    var MapCache = require_MapCache();
    var FUNC_ERROR_TEXT = "Expected a function";
    function memoize2(func, resolver) {
      if (typeof func != "function" || resolver != null && typeof resolver != "function") {
        throw new TypeError(FUNC_ERROR_TEXT);
      }
      var memoized = function() {
        var args = arguments, key = resolver ? resolver.apply(this, args) : args[0], cache2 = memoized.cache;
        if (cache2.has(key)) {
          return cache2.get(key);
        }
        var result = func.apply(this, args);
        memoized.cache = cache2.set(key, result) || cache2;
        return result;
      };
      memoized.cache = new (memoize2.Cache || MapCache)();
      return memoized;
    }
    memoize2.Cache = MapCache;
    module.exports = memoize2;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_memoizeCapped.js
var require_memoizeCapped = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_memoizeCapped.js"(exports, module) {
    var memoize2 = require_memoize();
    var MAX_MEMOIZE_SIZE = 500;
    function memoizeCapped(func) {
      var result = memoize2(func, function(key) {
        if (cache2.size === MAX_MEMOIZE_SIZE) {
          cache2.clear();
        }
        return key;
      });
      var cache2 = result.cache;
      return result;
    }
    module.exports = memoizeCapped;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_stringToPath.js
var require_stringToPath = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_stringToPath.js"(exports, module) {
    var memoizeCapped = require_memoizeCapped();
    var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
    var reEscapeChar = /\\(\\)?/g;
    var stringToPath = memoizeCapped(function(string) {
      var result = [];
      if (string.charCodeAt(0) === 46) {
        result.push("");
      }
      string.replace(rePropName, function(match, number, quote, subString) {
        result.push(quote ? subString.replace(reEscapeChar, "$1") : number || match);
      });
      return result;
    });
    module.exports = stringToPath;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arrayMap.js
var require_arrayMap = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arrayMap.js"(exports, module) {
    function arrayMap(array, iteratee) {
      var index = -1, length = array == null ? 0 : array.length, result = Array(length);
      while (++index < length) {
        result[index] = iteratee(array[index], index, array);
      }
      return result;
    }
    module.exports = arrayMap;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseToString.js
var require_baseToString = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseToString.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var arrayMap = require_arrayMap();
    var isArray = require_isArray();
    var isSymbol = require_isSymbol();
    var INFINITY = 1 / 0;
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolToString = symbolProto ? symbolProto.toString : void 0;
    function baseToString(value) {
      if (typeof value == "string") {
        return value;
      }
      if (isArray(value)) {
        return arrayMap(value, baseToString) + "";
      }
      if (isSymbol(value)) {
        return symbolToString ? symbolToString.call(value) : "";
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    module.exports = baseToString;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/toString.js
var require_toString = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/toString.js"(exports, module) {
    var baseToString = require_baseToString();
    function toString(value) {
      return value == null ? "" : baseToString(value);
    }
    module.exports = toString;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_castPath.js
var require_castPath = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_castPath.js"(exports, module) {
    var isArray = require_isArray();
    var isKey = require_isKey();
    var stringToPath = require_stringToPath();
    var toString = require_toString();
    function castPath(value, object) {
      if (isArray(value)) {
        return value;
      }
      return isKey(value, object) ? [value] : stringToPath(toString(value));
    }
    module.exports = castPath;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIsArguments.js
var require_baseIsArguments = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIsArguments.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isObjectLike = require_isObjectLike();
    var argsTag = "[object Arguments]";
    function baseIsArguments(value) {
      return isObjectLike(value) && baseGetTag(value) == argsTag;
    }
    module.exports = baseIsArguments;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isArguments.js
var require_isArguments = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isArguments.js"(exports, module) {
    var baseIsArguments = require_baseIsArguments();
    var isObjectLike = require_isObjectLike();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var isArguments = baseIsArguments(/* @__PURE__ */ (function() {
      return arguments;
    })()) ? baseIsArguments : function(value) {
      return isObjectLike(value) && hasOwnProperty.call(value, "callee") && !propertyIsEnumerable.call(value, "callee");
    };
    module.exports = isArguments;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isIndex.js
var require_isIndex = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isIndex.js"(exports, module) {
    var MAX_SAFE_INTEGER = 9007199254740991;
    var reIsUint = /^(?:0|[1-9]\d*)$/;
    function isIndex(value, length) {
      var type = typeof value;
      length = length == null ? MAX_SAFE_INTEGER : length;
      return !!length && (type == "number" || type != "symbol" && reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
    }
    module.exports = isIndex;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isLength.js
var require_isLength = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isLength.js"(exports, module) {
    var MAX_SAFE_INTEGER = 9007199254740991;
    function isLength(value) {
      return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
    }
    module.exports = isLength;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_toKey.js
var require_toKey = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_toKey.js"(exports, module) {
    var isSymbol = require_isSymbol();
    var INFINITY = 1 / 0;
    function toKey(value) {
      if (typeof value == "string" || isSymbol(value)) {
        return value;
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    module.exports = toKey;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_hasPath.js
var require_hasPath = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_hasPath.js"(exports, module) {
    var castPath = require_castPath();
    var isArguments = require_isArguments();
    var isArray = require_isArray();
    var isIndex = require_isIndex();
    var isLength = require_isLength();
    var toKey = require_toKey();
    function hasPath(object, path, hasFunc) {
      path = castPath(path, object);
      var index = -1, length = path.length, result = false;
      while (++index < length) {
        var key = toKey(path[index]);
        if (!(result = object != null && hasFunc(object, key))) {
          break;
        }
        object = object[key];
      }
      if (result || ++index != length) {
        return result;
      }
      length = object == null ? 0 : object.length;
      return !!length && isLength(length) && isIndex(key, length) && (isArray(object) || isArguments(object));
    }
    module.exports = hasPath;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/has.js
var require_has = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/has.js"(exports, module) {
    var baseHas = require_baseHas();
    var hasPath = require_hasPath();
    function has3(object, path) {
      return object != null && hasPath(object, path, baseHas);
    }
    module.exports = has3;
  }
});

// vendor/glide-data-grid/dist/esm/common/support.js
function proveType(_val) {
}
function panic(message = "This should not happen") {
  throw new Error(message);
}
function assert(fact, message = "Assertion failed") {
  if (fact)
    return;
  return panic(message);
}
function assertNever(_never, msg) {
  return panic(msg ?? "Hell froze over");
}
function maybe(fn, defaultValue) {
  try {
    return fn();
  } catch {
    return defaultValue;
  }
}
function deepEqual(foo, bar) {
  let ctor, len;
  if (foo === bar)
    return true;
  if (foo && bar && (ctor = foo.constructor) === bar.constructor) {
    if (ctor === Date)
      return foo.getTime() === bar.getTime();
    if (ctor === RegExp)
      return foo.toString() === bar.toString();
    if (ctor === Array) {
      if ((len = foo.length) === bar.length) {
        while (len-- && deepEqual(foo[len], bar[len]))
          ;
      }
      return len === -1;
    }
    if (!ctor || typeof foo === "object") {
      len = 0;
      for (ctor in foo) {
        if (has.call(foo, ctor) && ++len && !has.call(bar, ctor))
          return false;
        if (!(ctor in bar) || !deepEqual(foo[ctor], bar[ctor]))
          return false;
      }
      return Object.keys(bar).length === len;
    }
  }
  return foo !== foo && bar !== bar;
}
var has;
var init_support = __esm({
  "vendor/glide-data-grid/dist/esm/common/support.js"() {
    has = Object.prototype.hasOwnProperty;
  }
});

// vendor/glide-data-grid/dist/esm/internal/data-grid/data-grid-types.js
function isSizedGridColumn(c) {
  return "width" in c && typeof c.width === "number";
}
async function resolveCellsThunk(thunk) {
  if (typeof thunk === "object")
    return thunk;
  return await thunk();
}
function isEditableGridCell(cell) {
  if (cell.kind === GridCellKind.Loading || cell.kind === GridCellKind.Bubble || cell.kind === GridCellKind.RowID || cell.kind === GridCellKind.Protected || cell.kind === GridCellKind.Drilldown) {
    return false;
  }
  proveType(cell);
  return true;
}
function isTextEditableGridCell(cell) {
  if (cell.kind === GridCellKind.Loading || cell.kind === GridCellKind.Bubble || cell.kind === GridCellKind.RowID || cell.kind === GridCellKind.Protected || cell.kind === GridCellKind.Drilldown || cell.kind === GridCellKind.Boolean || cell.kind === GridCellKind.Image || cell.kind === GridCellKind.Custom) {
    return false;
  }
  proveType(cell);
  return true;
}
function isInnerOnlyCell(cell) {
  return cell.kind === InnerGridCellKind.Marker || cell.kind === InnerGridCellKind.NewRow;
}
function isReadWriteCell(cell) {
  if (!isEditableGridCell(cell) || cell.kind === GridCellKind.Image)
    return false;
  switch (cell.kind) {
    case GridCellKind.Text:
    case GridCellKind.Number:
    case GridCellKind.Markdown:
    case GridCellKind.Uri:
    case GridCellKind.Custom:
    case GridCellKind.Boolean:
      return cell.readonly !== true;
    default:
      assertNever(cell, "A cell was passed with an invalid kind");
  }
}
function isRectangleEqual(a, b3) {
  if (a === b3)
    return true;
  if (a === void 0 || b3 === void 0)
    return false;
  return a.x === b3.x && a.y === b3.y && a.width === b3.width && a.height === b3.height;
}
function isObjectEditorCallbackResult(obj) {
  return (0, import_has.default)(obj, "editor");
}
function booleanCellIsEditable(cell) {
  return !(cell.readonly ?? false);
}
function mergeRanges(input) {
  if (input.length === 0) {
    return [];
  }
  const ranges = [...input];
  const stack = [];
  ranges.sort(function(a, b3) {
    return a[0] - b3[0];
  });
  stack.push([...ranges[0]]);
  for (const range2 of ranges.slice(1)) {
    const top = stack[stack.length - 1];
    if (top[1] < range2[0]) {
      stack.push([...range2]);
    } else if (top[1] < range2[1]) {
      top[1] = range2[1];
    }
  }
  return stack;
}
var import_has, BooleanEmpty, BooleanIndeterminate, GridCellKind, GridColumnIcon, GridColumnMenuIcon, InnerGridCellKind, DEFAULT_FILL_HANDLE, emptyCompactSelection, CompactSelection;
var init_data_grid_types = __esm({
  "vendor/glide-data-grid/dist/esm/internal/data-grid/data-grid-types.js"() {
    import_has = __toESM(require_has(), 1);
    init_support();
    BooleanEmpty = null;
    BooleanIndeterminate = void 0;
    (function(GridCellKind2) {
      GridCellKind2["Uri"] = "uri";
      GridCellKind2["Text"] = "text";
      GridCellKind2["Image"] = "image";
      GridCellKind2["RowID"] = "row-id";
      GridCellKind2["Number"] = "number";
      GridCellKind2["Bubble"] = "bubble";
      GridCellKind2["Boolean"] = "boolean";
      GridCellKind2["Loading"] = "loading";
      GridCellKind2["Markdown"] = "markdown";
      GridCellKind2["Drilldown"] = "drilldown";
      GridCellKind2["Protected"] = "protected";
      GridCellKind2["Custom"] = "custom";
    })(GridCellKind || (GridCellKind = {}));
    (function(GridColumnIcon2) {
      GridColumnIcon2["HeaderRowID"] = "headerRowID";
      GridColumnIcon2["HeaderCode"] = "headerCode";
      GridColumnIcon2["HeaderNumber"] = "headerNumber";
      GridColumnIcon2["HeaderString"] = "headerString";
      GridColumnIcon2["HeaderBoolean"] = "headerBoolean";
      GridColumnIcon2["HeaderAudioUri"] = "headerAudioUri";
      GridColumnIcon2["HeaderVideoUri"] = "headerVideoUri";
      GridColumnIcon2["HeaderEmoji"] = "headerEmoji";
      GridColumnIcon2["HeaderImage"] = "headerImage";
      GridColumnIcon2["HeaderUri"] = "headerUri";
      GridColumnIcon2["HeaderPhone"] = "headerPhone";
      GridColumnIcon2["HeaderMarkdown"] = "headerMarkdown";
      GridColumnIcon2["HeaderDate"] = "headerDate";
      GridColumnIcon2["HeaderTime"] = "headerTime";
      GridColumnIcon2["HeaderEmail"] = "headerEmail";
      GridColumnIcon2["HeaderReference"] = "headerReference";
      GridColumnIcon2["HeaderIfThenElse"] = "headerIfThenElse";
      GridColumnIcon2["HeaderSingleValue"] = "headerSingleValue";
      GridColumnIcon2["HeaderLookup"] = "headerLookup";
      GridColumnIcon2["HeaderTextTemplate"] = "headerTextTemplate";
      GridColumnIcon2["HeaderMath"] = "headerMath";
      GridColumnIcon2["HeaderRollup"] = "headerRollup";
      GridColumnIcon2["HeaderJoinStrings"] = "headerJoinStrings";
      GridColumnIcon2["HeaderSplitString"] = "headerSplitString";
      GridColumnIcon2["HeaderGeoDistance"] = "headerGeoDistance";
      GridColumnIcon2["HeaderArray"] = "headerArray";
      GridColumnIcon2["RowOwnerOverlay"] = "rowOwnerOverlay";
      GridColumnIcon2["ProtectedColumnOverlay"] = "protectedColumnOverlay";
    })(GridColumnIcon || (GridColumnIcon = {}));
    (function(GridColumnMenuIcon2) {
      GridColumnMenuIcon2["Triangle"] = "triangle";
      GridColumnMenuIcon2["Dots"] = "dots";
    })(GridColumnMenuIcon || (GridColumnMenuIcon = {}));
    (function(InnerGridCellKind2) {
      InnerGridCellKind2["NewRow"] = "new-row";
      InnerGridCellKind2["Marker"] = "marker";
    })(InnerGridCellKind || (InnerGridCellKind = {}));
    DEFAULT_FILL_HANDLE = {
      shape: "square",
      size: 4,
      offsetX: -2,
      offsetY: -2,
      outline: 0
    };
    CompactSelection = class _CompactSelection {
      items;
      constructor(items) {
        this.items = items;
      }
      static create = (items) => {
        return new _CompactSelection(mergeRanges(items));
      };
      static empty = () => {
        return emptyCompactSelection ?? (emptyCompactSelection = new _CompactSelection([]));
      };
      static fromSingleSelection = (selection) => {
        return _CompactSelection.empty().add(selection);
      };
      static fromArray = (items) => {
        if (items.length === 0)
          return _CompactSelection.empty();
        const slices = items.map((s) => [s, s + 1]);
        const newItems = mergeRanges(slices);
        return new _CompactSelection(newItems);
      };
      offset(amount) {
        if (amount === 0)
          return this;
        const newItems = this.items.map((x2) => [x2[0] + amount, x2[1] + amount]);
        return new _CompactSelection(newItems);
      }
      add(selection) {
        const slice = typeof selection === "number" ? [selection, selection + 1] : selection;
        const newItems = mergeRanges([...this.items, slice]);
        return new _CompactSelection(newItems);
      }
      remove(selection) {
        const items = [...this.items];
        const selMin = typeof selection === "number" ? selection : selection[0];
        const selMax = typeof selection === "number" ? selection + 1 : selection[1];
        for (const [i, slice] of items.entries()) {
          const [start, end] = slice;
          if (start <= selMax && selMin <= end) {
            const toAdd = [];
            if (start < selMin) {
              toAdd.push([start, selMin]);
            }
            if (selMax < end) {
              toAdd.push([selMax, end]);
            }
            items.splice(i, 1, ...toAdd);
          }
        }
        return new _CompactSelection(items);
      }
      first() {
        if (this.items.length === 0)
          return void 0;
        return this.items[0][0];
      }
      last() {
        if (this.items.length === 0)
          return void 0;
        return this.items.slice(-1)[0][1] - 1;
      }
      hasIndex(index) {
        for (let i = 0; i < this.items.length; i++) {
          const [start, end] = this.items[i];
          if (index >= start && index < end)
            return true;
        }
        return false;
      }
      hasAll(index) {
        for (let x2 = index[0]; x2 < index[1]; x2++) {
          if (!this.hasIndex(x2))
            return false;
        }
        return true;
      }
      some(predicate) {
        for (const i of this) {
          if (predicate(i))
            return true;
        }
        return false;
      }
      equals(other) {
        if (other === this)
          return true;
        if (other.items.length !== this.items.length)
          return false;
        for (let i = 0; i < this.items.length; i++) {
          const left = other.items[i];
          const right = this.items[i];
          if (left[0] !== right[0] || left[1] !== right[1])
            return false;
        }
        return true;
      }
      // Really old JS wont have access to the iterator and babel will stop people using it
      // when trying to support browsers so old we don't support them anyway. What goes on
      // between an engineer and their bundler in the privacy of their CI server is none of
      // my business anyway.
      toArray() {
        const result = [];
        for (const [start, end] of this.items) {
          for (let x2 = start; x2 < end; x2++) {
            result.push(x2);
          }
        }
        return result;
      }
      get length() {
        let len = 0;
        for (const [start, end] of this.items) {
          len += end - start;
        }
        return len;
      }
      *[Symbol.iterator]() {
        for (const [start, end] of this.items) {
          for (let x2 = start; x2 < end; x2++) {
            yield x2;
          }
        }
      }
    };
  }
});

// node_modules/.pnpm/@emotion+memoize@0.9.0/node_modules/@emotion/memoize/dist/emotion-memoize.esm.js
function memoize(fn) {
  var cache2 = /* @__PURE__ */ Object.create(null);
  return function(arg) {
    if (cache2[arg] === void 0) cache2[arg] = fn(arg);
    return cache2[arg];
  };
}
var init_emotion_memoize_esm = __esm({
  "node_modules/.pnpm/@emotion+memoize@0.9.0/node_modules/@emotion/memoize/dist/emotion-memoize.esm.js"() {
  }
});

// node_modules/.pnpm/@emotion+is-prop-valid@1.4.0/node_modules/@emotion/is-prop-valid/dist/emotion-is-prop-valid.esm.js
var reactPropsRegex, isPropValid;
var init_emotion_is_prop_valid_esm = __esm({
  "node_modules/.pnpm/@emotion+is-prop-valid@1.4.0/node_modules/@emotion/is-prop-valid/dist/emotion-is-prop-valid.esm.js"() {
    init_emotion_memoize_esm();
    reactPropsRegex = /^((children|dangerouslySetInnerHTML|key|ref|autoFocus|defaultValue|defaultChecked|innerHTML|suppressContentEditableWarning|suppressHydrationWarning|valueLink|abbr|accept|acceptCharset|accessKey|action|allow|allowUserMedia|allowPaymentRequest|allowFullScreen|allowTransparency|alt|async|autoComplete|autoPlay|capture|cellPadding|cellSpacing|challenge|charSet|checked|cite|classID|className|cols|colSpan|content|contentEditable|contextMenu|controls|controlsList|coords|crossOrigin|data|dateTime|decoding|default|defer|dir|disabled|disablePictureInPicture|disableRemotePlayback|download|draggable|encType|enterKeyHint|fetchpriority|fetchPriority|form|formAction|formEncType|formMethod|formNoValidate|formTarget|frameBorder|headers|height|hidden|high|href|hrefLang|htmlFor|httpEquiv|id|inputMode|integrity|is|keyParams|keyType|kind|label|lang|list|loading|loop|low|marginHeight|marginWidth|max|maxLength|media|mediaGroup|method|min|minLength|multiple|muted|name|nonce|noValidate|open|optimum|pattern|placeholder|playsInline|popover|popoverTarget|popoverTargetAction|poster|preload|profile|radioGroup|readOnly|referrerPolicy|rel|required|reversed|role|rows|rowSpan|sandbox|scope|scoped|scrolling|seamless|selected|shape|size|sizes|slot|span|spellCheck|src|srcDoc|srcLang|srcSet|start|step|style|summary|tabIndex|target|title|translate|type|useMap|value|width|wmode|wrap|about|datatype|inlist|prefix|property|resource|typeof|vocab|autoCapitalize|autoCorrect|autoSave|color|incremental|fallback|inert|itemProp|itemScope|itemType|itemID|itemRef|on|option|results|security|unselectable|accentHeight|accumulate|additive|alignmentBaseline|allowReorder|alphabetic|amplitude|arabicForm|ascent|attributeName|attributeType|autoReverse|azimuth|baseFrequency|baselineShift|baseProfile|bbox|begin|bias|by|calcMode|capHeight|clip|clipPathUnits|clipPath|clipRule|colorInterpolation|colorInterpolationFilters|colorProfile|colorRendering|contentScriptType|contentStyleType|cursor|cx|cy|d|decelerate|descent|diffuseConstant|direction|display|divisor|dominantBaseline|dur|dx|dy|edgeMode|elevation|enableBackground|end|exponent|externalResourcesRequired|fill|fillOpacity|fillRule|filter|filterRes|filterUnits|floodColor|floodOpacity|focusable|fontFamily|fontSize|fontSizeAdjust|fontStretch|fontStyle|fontVariant|fontWeight|format|from|fr|fx|fy|g1|g2|glyphName|glyphOrientationHorizontal|glyphOrientationVertical|glyphRef|gradientTransform|gradientUnits|hanging|horizAdvX|horizOriginX|ideographic|imageRendering|in|in2|intercept|k|k1|k2|k3|k4|kernelMatrix|kernelUnitLength|kerning|keyPoints|keySplines|keyTimes|lengthAdjust|letterSpacing|lightingColor|limitingConeAngle|local|markerEnd|markerMid|markerStart|markerHeight|markerUnits|markerWidth|mask|maskContentUnits|maskUnits|mathematical|mode|numOctaves|offset|opacity|operator|order|orient|orientation|origin|overflow|overlinePosition|overlineThickness|panose1|paintOrder|pathLength|patternContentUnits|patternTransform|patternUnits|pointerEvents|points|pointsAtX|pointsAtY|pointsAtZ|preserveAlpha|preserveAspectRatio|primitiveUnits|r|radius|refX|refY|renderingIntent|repeatCount|repeatDur|requiredExtensions|requiredFeatures|restart|result|rotate|rx|ry|scale|seed|shapeRendering|slope|spacing|specularConstant|specularExponent|speed|spreadMethod|startOffset|stdDeviation|stemh|stemv|stitchTiles|stopColor|stopOpacity|strikethroughPosition|strikethroughThickness|string|stroke|strokeDasharray|strokeDashoffset|strokeLinecap|strokeLinejoin|strokeMiterlimit|strokeOpacity|strokeWidth|surfaceScale|systemLanguage|tableValues|targetX|targetY|textAnchor|textDecoration|textRendering|textLength|to|transform|u1|u2|underlinePosition|underlineThickness|unicode|unicodeBidi|unicodeRange|unitsPerEm|vAlphabetic|vHanging|vIdeographic|vMathematical|values|vectorEffect|version|vertAdvY|vertOriginX|vertOriginY|viewBox|viewTarget|visibility|widths|wordSpacing|writingMode|x|xHeight|x1|x2|xChannelSelector|xlinkActuate|xlinkArcrole|xlinkHref|xlinkRole|xlinkShow|xlinkTitle|xlinkType|xmlBase|xmlns|xmlnsXlink|xmlLang|xmlSpace|y|y1|y2|yChannelSelector|z|zoomAndPan|for|class|autofocus)|(([Dd][Aa][Tt][Aa]|[Aa][Rr][Ii][Aa]|x)-.*))$/;
    isPropValid = /* @__PURE__ */ memoize(
      function(prop) {
        return reactPropsRegex.test(prop) || prop.charCodeAt(0) === 111 && prop.charCodeAt(1) === 110 && prop.charCodeAt(2) < 91;
      }
      /* Z+1 */
    );
  }
});

// node_modules/.pnpm/@linaria+core@6.3.0/node_modules/@linaria/core/dist/index.mjs
var cx, cx_default;
var init_dist = __esm({
  "node_modules/.pnpm/@linaria+core@6.3.0/node_modules/@linaria/core/dist/index.mjs"() {
    cx = function cx2() {
      const presentClassNames = Array.prototype.slice.call(arguments).filter(Boolean);
      const atomicClasses = {};
      const nonAtomicClasses = [];
      presentClassNames.forEach((arg) => {
        const individualClassNames = arg ? arg.split(" ") : [];
        individualClassNames.forEach((className) => {
          if (className.startsWith("atm_")) {
            const [, keyHash] = className.split("_");
            atomicClasses[keyHash] = className;
          } else {
            nonAtomicClasses.push(className);
          }
        });
      });
      const result = [];
      for (const keyHash in atomicClasses) {
        if (Object.prototype.hasOwnProperty.call(atomicClasses, keyHash)) {
          result.push(atomicClasses[keyHash]);
        }
      }
      result.push(...nonAtomicClasses);
      return result.join(" ");
    };
    cx_default = cx;
  }
});

// node_modules/.pnpm/@linaria+react@6.3.0_react@18.3.1/node_modules/@linaria/react/dist/index.mjs
import { createElement, forwardRef } from "react";
function filterProps(asIs, props, omitKeys) {
  const filteredProps = omit(props, omitKeys);
  if (!asIs) {
    const interopValidAttr = typeof isPropValid === "function" ? { default: isPropValid } : isPropValid;
    Object.keys(filteredProps).forEach((key) => {
      if (!interopValidAttr.default(key)) {
        delete filteredProps[key];
      }
    });
  }
  return filteredProps;
}
function styled(tag) {
  let mockedClass = "";
  if (false) {
    mockedClass += `mocked-styled-${idx++}`;
    if (tag && tag.__wyw_meta && tag.__wyw_meta.className) {
      mockedClass += ` ${tag.__wyw_meta.className}`;
    }
  }
  return (options) => {
    if (true) {
      if (Array.isArray(options)) {
        throw new Error(
          'Using the "styled" tag in runtime is not supported. Make sure you have set up the Babel plugin correctly. See https://github.com/callstack/linaria#setup'
        );
      }
    }
    const render = (props, ref) => {
      const { as: component = tag, class: className = mockedClass } = props;
      const shouldKeepProps = options.propsAsIs === void 0 ? !(typeof component === "string" && component.indexOf("-") === -1 && !isCapital(component[0])) : options.propsAsIs;
      const filteredProps = filterProps(shouldKeepProps, props, [
        "as",
        "class"
      ]);
      filteredProps.ref = ref;
      filteredProps.className = options.atomic ? cx_default(options.class, filteredProps.className || className) : cx_default(filteredProps.className || className, options.class);
      const { vars } = options;
      if (vars) {
        const style = {};
        for (const name in vars) {
          const variable = vars[name];
          const result = variable[0];
          const unit = variable[1] || "";
          const value = typeof result === "function" ? result(props) : result;
          warnIfInvalid(value, options.name);
          style[`--${name}`] = `${value}${unit}`;
        }
        const ownStyle = filteredProps.style || {};
        const keys = Object.keys(ownStyle);
        if (keys.length > 0) {
          keys.forEach((key) => {
            style[key] = ownStyle[key];
          });
        }
        filteredProps.style = style;
      }
      if (tag.__wyw_meta && tag !== component) {
        filteredProps.as = component;
        return createElement(tag, filteredProps);
      }
      return createElement(component, filteredProps);
    };
    const Result = forwardRef ? forwardRef(render) : (
      // React.forwardRef won't available on older React versions and in Preact
      // Fallback to a innerRef prop in that case
      ((props) => {
        const rest = omit(props, ["innerRef"]);
        return render(rest, props.innerRef);
      })
    );
    Result.displayName = options.name;
    Result.__wyw_meta = {
      className: options.class || mockedClass,
      extends: tag
    };
    return Result;
  };
}
var isCapital, filterKey, omit, warnIfInvalid, styled_default;
var init_dist2 = __esm({
  "node_modules/.pnpm/@linaria+react@6.3.0_react@18.3.1/node_modules/@linaria/react/dist/index.mjs"() {
    init_emotion_is_prop_valid_esm();
    init_dist();
    isCapital = (ch) => ch.toUpperCase() === ch;
    filterKey = (keys) => (key) => keys.indexOf(key) === -1;
    omit = (obj, keys) => {
      const res = {};
      Object.keys(obj).filter(filterKey(keys)).forEach((key) => {
        res[key] = obj[key];
      });
      return res;
    };
    warnIfInvalid = (value, componentName) => {
      if (true) {
        if (typeof value === "string" || // eslint-disable-next-line no-self-compare,no-restricted-globals
        typeof value === "number" && isFinite(value)) {
          return;
        }
        const stringified = typeof value === "object" ? JSON.stringify(value) : String(value);
        console.warn(
          `An interpolation evaluated to '${stringified}' in the component '${componentName}', which is probably a mistake. You should explicitly cast or transform the value to a string.`
        );
      }
    };
    styled_default = true ? new Proxy(styled, {
      get(o, prop) {
        return o(prop);
      }
    }) : styled;
  }
});

// node_modules/.pnpm/react-is@16.13.1/node_modules/react-is/cjs/react-is.development.js
var require_react_is_development = __commonJS({
  "node_modules/.pnpm/react-is@16.13.1/node_modules/react-is/cjs/react-is.development.js"(exports) {
    "use strict";
    if (true) {
      (function() {
        "use strict";
        var hasSymbol = typeof Symbol === "function" && Symbol.for;
        var REACT_ELEMENT_TYPE = hasSymbol ? Symbol.for("react.element") : 60103;
        var REACT_PORTAL_TYPE = hasSymbol ? Symbol.for("react.portal") : 60106;
        var REACT_FRAGMENT_TYPE = hasSymbol ? Symbol.for("react.fragment") : 60107;
        var REACT_STRICT_MODE_TYPE = hasSymbol ? Symbol.for("react.strict_mode") : 60108;
        var REACT_PROFILER_TYPE = hasSymbol ? Symbol.for("react.profiler") : 60114;
        var REACT_PROVIDER_TYPE = hasSymbol ? Symbol.for("react.provider") : 60109;
        var REACT_CONTEXT_TYPE = hasSymbol ? Symbol.for("react.context") : 60110;
        var REACT_ASYNC_MODE_TYPE = hasSymbol ? Symbol.for("react.async_mode") : 60111;
        var REACT_CONCURRENT_MODE_TYPE = hasSymbol ? Symbol.for("react.concurrent_mode") : 60111;
        var REACT_FORWARD_REF_TYPE = hasSymbol ? Symbol.for("react.forward_ref") : 60112;
        var REACT_SUSPENSE_TYPE = hasSymbol ? Symbol.for("react.suspense") : 60113;
        var REACT_SUSPENSE_LIST_TYPE = hasSymbol ? Symbol.for("react.suspense_list") : 60120;
        var REACT_MEMO_TYPE = hasSymbol ? Symbol.for("react.memo") : 60115;
        var REACT_LAZY_TYPE = hasSymbol ? Symbol.for("react.lazy") : 60116;
        var REACT_BLOCK_TYPE = hasSymbol ? Symbol.for("react.block") : 60121;
        var REACT_FUNDAMENTAL_TYPE = hasSymbol ? Symbol.for("react.fundamental") : 60117;
        var REACT_RESPONDER_TYPE = hasSymbol ? Symbol.for("react.responder") : 60118;
        var REACT_SCOPE_TYPE = hasSymbol ? Symbol.for("react.scope") : 60119;
        function isValidElementType(type) {
          return typeof type === "string" || typeof type === "function" || // Note: its typeof might be other than 'symbol' or 'number' if it's a polyfill.
          type === REACT_FRAGMENT_TYPE || type === REACT_CONCURRENT_MODE_TYPE || type === REACT_PROFILER_TYPE || type === REACT_STRICT_MODE_TYPE || type === REACT_SUSPENSE_TYPE || type === REACT_SUSPENSE_LIST_TYPE || typeof type === "object" && type !== null && (type.$$typeof === REACT_LAZY_TYPE || type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_PROVIDER_TYPE || type.$$typeof === REACT_CONTEXT_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE || type.$$typeof === REACT_FUNDAMENTAL_TYPE || type.$$typeof === REACT_RESPONDER_TYPE || type.$$typeof === REACT_SCOPE_TYPE || type.$$typeof === REACT_BLOCK_TYPE);
        }
        function typeOf(object) {
          if (typeof object === "object" && object !== null) {
            var $$typeof = object.$$typeof;
            switch ($$typeof) {
              case REACT_ELEMENT_TYPE:
                var type = object.type;
                switch (type) {
                  case REACT_ASYNC_MODE_TYPE:
                  case REACT_CONCURRENT_MODE_TYPE:
                  case REACT_FRAGMENT_TYPE:
                  case REACT_PROFILER_TYPE:
                  case REACT_STRICT_MODE_TYPE:
                  case REACT_SUSPENSE_TYPE:
                    return type;
                  default:
                    var $$typeofType = type && type.$$typeof;
                    switch ($$typeofType) {
                      case REACT_CONTEXT_TYPE:
                      case REACT_FORWARD_REF_TYPE:
                      case REACT_LAZY_TYPE:
                      case REACT_MEMO_TYPE:
                      case REACT_PROVIDER_TYPE:
                        return $$typeofType;
                      default:
                        return $$typeof;
                    }
                }
              case REACT_PORTAL_TYPE:
                return $$typeof;
            }
          }
          return void 0;
        }
        var AsyncMode = REACT_ASYNC_MODE_TYPE;
        var ConcurrentMode = REACT_CONCURRENT_MODE_TYPE;
        var ContextConsumer = REACT_CONTEXT_TYPE;
        var ContextProvider = REACT_PROVIDER_TYPE;
        var Element = REACT_ELEMENT_TYPE;
        var ForwardRef = REACT_FORWARD_REF_TYPE;
        var Fragment5 = REACT_FRAGMENT_TYPE;
        var Lazy2 = REACT_LAZY_TYPE;
        var Memo = REACT_MEMO_TYPE;
        var Portal = REACT_PORTAL_TYPE;
        var Profiler = REACT_PROFILER_TYPE;
        var StrictMode = REACT_STRICT_MODE_TYPE;
        var Suspense3 = REACT_SUSPENSE_TYPE;
        var hasWarnedAboutDeprecatedIsAsyncMode = false;
        function isAsyncMode(object) {
          {
            if (!hasWarnedAboutDeprecatedIsAsyncMode) {
              hasWarnedAboutDeprecatedIsAsyncMode = true;
              console["warn"]("The ReactIs.isAsyncMode() alias has been deprecated, and will be removed in React 17+. Update your code to use ReactIs.isConcurrentMode() instead. It has the exact same API.");
            }
          }
          return isConcurrentMode(object) || typeOf(object) === REACT_ASYNC_MODE_TYPE;
        }
        function isConcurrentMode(object) {
          return typeOf(object) === REACT_CONCURRENT_MODE_TYPE;
        }
        function isContextConsumer(object) {
          return typeOf(object) === REACT_CONTEXT_TYPE;
        }
        function isContextProvider(object) {
          return typeOf(object) === REACT_PROVIDER_TYPE;
        }
        function isElement(object) {
          return typeof object === "object" && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
        }
        function isForwardRef(object) {
          return typeOf(object) === REACT_FORWARD_REF_TYPE;
        }
        function isFragment(object) {
          return typeOf(object) === REACT_FRAGMENT_TYPE;
        }
        function isLazy(object) {
          return typeOf(object) === REACT_LAZY_TYPE;
        }
        function isMemo(object) {
          return typeOf(object) === REACT_MEMO_TYPE;
        }
        function isPortal(object) {
          return typeOf(object) === REACT_PORTAL_TYPE;
        }
        function isProfiler(object) {
          return typeOf(object) === REACT_PROFILER_TYPE;
        }
        function isStrictMode(object) {
          return typeOf(object) === REACT_STRICT_MODE_TYPE;
        }
        function isSuspense(object) {
          return typeOf(object) === REACT_SUSPENSE_TYPE;
        }
        exports.AsyncMode = AsyncMode;
        exports.ConcurrentMode = ConcurrentMode;
        exports.ContextConsumer = ContextConsumer;
        exports.ContextProvider = ContextProvider;
        exports.Element = Element;
        exports.ForwardRef = ForwardRef;
        exports.Fragment = Fragment5;
        exports.Lazy = Lazy2;
        exports.Memo = Memo;
        exports.Portal = Portal;
        exports.Profiler = Profiler;
        exports.StrictMode = StrictMode;
        exports.Suspense = Suspense3;
        exports.isAsyncMode = isAsyncMode;
        exports.isConcurrentMode = isConcurrentMode;
        exports.isContextConsumer = isContextConsumer;
        exports.isContextProvider = isContextProvider;
        exports.isElement = isElement;
        exports.isForwardRef = isForwardRef;
        exports.isFragment = isFragment;
        exports.isLazy = isLazy;
        exports.isMemo = isMemo;
        exports.isPortal = isPortal;
        exports.isProfiler = isProfiler;
        exports.isStrictMode = isStrictMode;
        exports.isSuspense = isSuspense;
        exports.isValidElementType = isValidElementType;
        exports.typeOf = typeOf;
      })();
    }
  }
});

// node_modules/.pnpm/react-is@16.13.1/node_modules/react-is/index.js
var require_react_is = __commonJS({
  "node_modules/.pnpm/react-is@16.13.1/node_modules/react-is/index.js"(exports, module) {
    "use strict";
    if (false) {
      module.exports = null;
    } else {
      module.exports = require_react_is_development();
    }
  }
});

// node_modules/.pnpm/object-assign@4.1.1/node_modules/object-assign/index.js
var require_object_assign = __commonJS({
  "node_modules/.pnpm/object-assign@4.1.1/node_modules/object-assign/index.js"(exports, module) {
    "use strict";
    var getOwnPropertySymbols = Object.getOwnPropertySymbols;
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    var propIsEnumerable = Object.prototype.propertyIsEnumerable;
    function toObject(val) {
      if (val === null || val === void 0) {
        throw new TypeError("Object.assign cannot be called with null or undefined");
      }
      return Object(val);
    }
    function shouldUseNative() {
      try {
        if (!Object.assign) {
          return false;
        }
        var test1 = new String("abc");
        test1[5] = "de";
        if (Object.getOwnPropertyNames(test1)[0] === "5") {
          return false;
        }
        var test2 = {};
        for (var i = 0; i < 10; i++) {
          test2["_" + String.fromCharCode(i)] = i;
        }
        var order2 = Object.getOwnPropertyNames(test2).map(function(n) {
          return test2[n];
        });
        if (order2.join("") !== "0123456789") {
          return false;
        }
        var test3 = {};
        "abcdefghijklmnopqrst".split("").forEach(function(letter) {
          test3[letter] = letter;
        });
        if (Object.keys(Object.assign({}, test3)).join("") !== "abcdefghijklmnopqrst") {
          return false;
        }
        return true;
      } catch (err) {
        return false;
      }
    }
    module.exports = shouldUseNative() ? Object.assign : function(target, source) {
      var from;
      var to = toObject(target);
      var symbols;
      for (var s = 1; s < arguments.length; s++) {
        from = Object(arguments[s]);
        for (var key in from) {
          if (hasOwnProperty.call(from, key)) {
            to[key] = from[key];
          }
        }
        if (getOwnPropertySymbols) {
          symbols = getOwnPropertySymbols(from);
          for (var i = 0; i < symbols.length; i++) {
            if (propIsEnumerable.call(from, symbols[i])) {
              to[symbols[i]] = from[symbols[i]];
            }
          }
        }
      }
      return to;
    };
  }
});

// node_modules/.pnpm/prop-types@15.8.1/node_modules/prop-types/lib/ReactPropTypesSecret.js
var require_ReactPropTypesSecret = __commonJS({
  "node_modules/.pnpm/prop-types@15.8.1/node_modules/prop-types/lib/ReactPropTypesSecret.js"(exports, module) {
    "use strict";
    var ReactPropTypesSecret = "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED";
    module.exports = ReactPropTypesSecret;
  }
});

// node_modules/.pnpm/prop-types@15.8.1/node_modules/prop-types/lib/has.js
var require_has2 = __commonJS({
  "node_modules/.pnpm/prop-types@15.8.1/node_modules/prop-types/lib/has.js"(exports, module) {
    module.exports = Function.call.bind(Object.prototype.hasOwnProperty);
  }
});

// node_modules/.pnpm/prop-types@15.8.1/node_modules/prop-types/checkPropTypes.js
var require_checkPropTypes = __commonJS({
  "node_modules/.pnpm/prop-types@15.8.1/node_modules/prop-types/checkPropTypes.js"(exports, module) {
    "use strict";
    var printWarning = function() {
    };
    if (true) {
      ReactPropTypesSecret = require_ReactPropTypesSecret();
      loggedTypeFailures = {};
      has3 = require_has2();
      printWarning = function(text) {
        var message = "Warning: " + text;
        if (typeof console !== "undefined") {
          console.error(message);
        }
        try {
          throw new Error(message);
        } catch (x2) {
        }
      };
    }
    var ReactPropTypesSecret;
    var loggedTypeFailures;
    var has3;
    function checkPropTypes(typeSpecs, values, location, componentName, getStack) {
      if (true) {
        for (var typeSpecName in typeSpecs) {
          if (has3(typeSpecs, typeSpecName)) {
            var error;
            try {
              if (typeof typeSpecs[typeSpecName] !== "function") {
                var err = Error(
                  (componentName || "React class") + ": " + location + " type `" + typeSpecName + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof typeSpecs[typeSpecName] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`."
                );
                err.name = "Invariant Violation";
                throw err;
              }
              error = typeSpecs[typeSpecName](values, typeSpecName, componentName, location, null, ReactPropTypesSecret);
            } catch (ex) {
              error = ex;
            }
            if (error && !(error instanceof Error)) {
              printWarning(
                (componentName || "React class") + ": type specification of " + location + " `" + typeSpecName + "` is invalid; the type checker function must return `null` or an `Error` but returned a " + typeof error + ". You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument)."
              );
            }
            if (error instanceof Error && !(error.message in loggedTypeFailures)) {
              loggedTypeFailures[error.message] = true;
              var stack = getStack ? getStack() : "";
              printWarning(
                "Failed " + location + " type: " + error.message + (stack != null ? stack : "")
              );
            }
          }
        }
      }
    }
    checkPropTypes.resetWarningCache = function() {
      if (true) {
        loggedTypeFailures = {};
      }
    };
    module.exports = checkPropTypes;
  }
});

// node_modules/.pnpm/prop-types@15.8.1/node_modules/prop-types/factoryWithTypeCheckers.js
var require_factoryWithTypeCheckers = __commonJS({
  "node_modules/.pnpm/prop-types@15.8.1/node_modules/prop-types/factoryWithTypeCheckers.js"(exports, module) {
    "use strict";
    var ReactIs = require_react_is();
    var assign = require_object_assign();
    var ReactPropTypesSecret = require_ReactPropTypesSecret();
    var has3 = require_has2();
    var checkPropTypes = require_checkPropTypes();
    var printWarning = function() {
    };
    if (true) {
      printWarning = function(text) {
        var message = "Warning: " + text;
        if (typeof console !== "undefined") {
          console.error(message);
        }
        try {
          throw new Error(message);
        } catch (x2) {
        }
      };
    }
    function emptyFunctionThatReturnsNull() {
      return null;
    }
    module.exports = function(isValidElement, throwOnDirectAccess) {
      var ITERATOR_SYMBOL = typeof Symbol === "function" && Symbol.iterator;
      var FAUX_ITERATOR_SYMBOL = "@@iterator";
      function getIteratorFn(maybeIterable) {
        var iteratorFn = maybeIterable && (ITERATOR_SYMBOL && maybeIterable[ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL]);
        if (typeof iteratorFn === "function") {
          return iteratorFn;
        }
      }
      var ANONYMOUS = "<<anonymous>>";
      var ReactPropTypes = {
        array: createPrimitiveTypeChecker("array"),
        bigint: createPrimitiveTypeChecker("bigint"),
        bool: createPrimitiveTypeChecker("boolean"),
        func: createPrimitiveTypeChecker("function"),
        number: createPrimitiveTypeChecker("number"),
        object: createPrimitiveTypeChecker("object"),
        string: createPrimitiveTypeChecker("string"),
        symbol: createPrimitiveTypeChecker("symbol"),
        any: createAnyTypeChecker(),
        arrayOf: createArrayOfTypeChecker,
        element: createElementTypeChecker(),
        elementType: createElementTypeTypeChecker(),
        instanceOf: createInstanceTypeChecker,
        node: createNodeChecker(),
        objectOf: createObjectOfTypeChecker,
        oneOf: createEnumTypeChecker,
        oneOfType: createUnionTypeChecker,
        shape: createShapeTypeChecker,
        exact: createStrictShapeTypeChecker
      };
      function is(x2, y2) {
        if (x2 === y2) {
          return x2 !== 0 || 1 / x2 === 1 / y2;
        } else {
          return x2 !== x2 && y2 !== y2;
        }
      }
      function PropTypeError(message, data) {
        this.message = message;
        this.data = data && typeof data === "object" ? data : {};
        this.stack = "";
      }
      PropTypeError.prototype = Error.prototype;
      function createChainableTypeChecker(validate) {
        if (true) {
          var manualPropTypeCallCache = {};
          var manualPropTypeWarningCount = 0;
        }
        function checkType(isRequired, props, propName, componentName, location, propFullName, secret) {
          componentName = componentName || ANONYMOUS;
          propFullName = propFullName || propName;
          if (secret !== ReactPropTypesSecret) {
            if (throwOnDirectAccess) {
              var err = new Error(
                "Calling PropTypes validators directly is not supported by the `prop-types` package. Use `PropTypes.checkPropTypes()` to call them. Read more at http://fb.me/use-check-prop-types"
              );
              err.name = "Invariant Violation";
              throw err;
            } else if (typeof console !== "undefined") {
              var cacheKey = componentName + ":" + propName;
              if (!manualPropTypeCallCache[cacheKey] && // Avoid spamming the console because they are often not actionable except for lib authors
              manualPropTypeWarningCount < 3) {
                printWarning(
                  "You are manually calling a React.PropTypes validation function for the `" + propFullName + "` prop on `" + componentName + "`. This is deprecated and will throw in the standalone `prop-types` package. You may be seeing this warning due to a third-party PropTypes library. See https://fb.me/react-warning-dont-call-proptypes for details."
                );
                manualPropTypeCallCache[cacheKey] = true;
                manualPropTypeWarningCount++;
              }
            }
          }
          if (props[propName] == null) {
            if (isRequired) {
              if (props[propName] === null) {
                return new PropTypeError("The " + location + " `" + propFullName + "` is marked as required " + ("in `" + componentName + "`, but its value is `null`."));
              }
              return new PropTypeError("The " + location + " `" + propFullName + "` is marked as required in " + ("`" + componentName + "`, but its value is `undefined`."));
            }
            return null;
          } else {
            return validate(props, propName, componentName, location, propFullName);
          }
        }
        var chainedCheckType = checkType.bind(null, false);
        chainedCheckType.isRequired = checkType.bind(null, true);
        return chainedCheckType;
      }
      function createPrimitiveTypeChecker(expectedType) {
        function validate(props, propName, componentName, location, propFullName, secret) {
          var propValue = props[propName];
          var propType = getPropType(propValue);
          if (propType !== expectedType) {
            var preciseType = getPreciseType(propValue);
            return new PropTypeError(
              "Invalid " + location + " `" + propFullName + "` of type " + ("`" + preciseType + "` supplied to `" + componentName + "`, expected ") + ("`" + expectedType + "`."),
              { expectedType }
            );
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function createAnyTypeChecker() {
        return createChainableTypeChecker(emptyFunctionThatReturnsNull);
      }
      function createArrayOfTypeChecker(typeChecker) {
        function validate(props, propName, componentName, location, propFullName) {
          if (typeof typeChecker !== "function") {
            return new PropTypeError("Property `" + propFullName + "` of component `" + componentName + "` has invalid PropType notation inside arrayOf.");
          }
          var propValue = props[propName];
          if (!Array.isArray(propValue)) {
            var propType = getPropType(propValue);
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` of type " + ("`" + propType + "` supplied to `" + componentName + "`, expected an array."));
          }
          for (var i = 0; i < propValue.length; i++) {
            var error = typeChecker(propValue, i, componentName, location, propFullName + "[" + i + "]", ReactPropTypesSecret);
            if (error instanceof Error) {
              return error;
            }
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function createElementTypeChecker() {
        function validate(props, propName, componentName, location, propFullName) {
          var propValue = props[propName];
          if (!isValidElement(propValue)) {
            var propType = getPropType(propValue);
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` of type " + ("`" + propType + "` supplied to `" + componentName + "`, expected a single ReactElement."));
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function createElementTypeTypeChecker() {
        function validate(props, propName, componentName, location, propFullName) {
          var propValue = props[propName];
          if (!ReactIs.isValidElementType(propValue)) {
            var propType = getPropType(propValue);
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` of type " + ("`" + propType + "` supplied to `" + componentName + "`, expected a single ReactElement type."));
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function createInstanceTypeChecker(expectedClass) {
        function validate(props, propName, componentName, location, propFullName) {
          if (!(props[propName] instanceof expectedClass)) {
            var expectedClassName = expectedClass.name || ANONYMOUS;
            var actualClassName = getClassName(props[propName]);
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` of type " + ("`" + actualClassName + "` supplied to `" + componentName + "`, expected ") + ("instance of `" + expectedClassName + "`."));
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function createEnumTypeChecker(expectedValues) {
        if (!Array.isArray(expectedValues)) {
          if (true) {
            if (arguments.length > 1) {
              printWarning(
                "Invalid arguments supplied to oneOf, expected an array, got " + arguments.length + " arguments. A common mistake is to write oneOf(x, y, z) instead of oneOf([x, y, z])."
              );
            } else {
              printWarning("Invalid argument supplied to oneOf, expected an array.");
            }
          }
          return emptyFunctionThatReturnsNull;
        }
        function validate(props, propName, componentName, location, propFullName) {
          var propValue = props[propName];
          for (var i = 0; i < expectedValues.length; i++) {
            if (is(propValue, expectedValues[i])) {
              return null;
            }
          }
          var valuesString = JSON.stringify(expectedValues, function replacer(key, value) {
            var type = getPreciseType(value);
            if (type === "symbol") {
              return String(value);
            }
            return value;
          });
          return new PropTypeError("Invalid " + location + " `" + propFullName + "` of value `" + String(propValue) + "` " + ("supplied to `" + componentName + "`, expected one of " + valuesString + "."));
        }
        return createChainableTypeChecker(validate);
      }
      function createObjectOfTypeChecker(typeChecker) {
        function validate(props, propName, componentName, location, propFullName) {
          if (typeof typeChecker !== "function") {
            return new PropTypeError("Property `" + propFullName + "` of component `" + componentName + "` has invalid PropType notation inside objectOf.");
          }
          var propValue = props[propName];
          var propType = getPropType(propValue);
          if (propType !== "object") {
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` of type " + ("`" + propType + "` supplied to `" + componentName + "`, expected an object."));
          }
          for (var key in propValue) {
            if (has3(propValue, key)) {
              var error = typeChecker(propValue, key, componentName, location, propFullName + "." + key, ReactPropTypesSecret);
              if (error instanceof Error) {
                return error;
              }
            }
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function createUnionTypeChecker(arrayOfTypeCheckers) {
        if (!Array.isArray(arrayOfTypeCheckers)) {
          true ? printWarning("Invalid argument supplied to oneOfType, expected an instance of array.") : void 0;
          return emptyFunctionThatReturnsNull;
        }
        for (var i = 0; i < arrayOfTypeCheckers.length; i++) {
          var checker = arrayOfTypeCheckers[i];
          if (typeof checker !== "function") {
            printWarning(
              "Invalid argument supplied to oneOfType. Expected an array of check functions, but received " + getPostfixForTypeWarning(checker) + " at index " + i + "."
            );
            return emptyFunctionThatReturnsNull;
          }
        }
        function validate(props, propName, componentName, location, propFullName) {
          var expectedTypes = [];
          for (var i2 = 0; i2 < arrayOfTypeCheckers.length; i2++) {
            var checker2 = arrayOfTypeCheckers[i2];
            var checkerResult = checker2(props, propName, componentName, location, propFullName, ReactPropTypesSecret);
            if (checkerResult == null) {
              return null;
            }
            if (checkerResult.data && has3(checkerResult.data, "expectedType")) {
              expectedTypes.push(checkerResult.data.expectedType);
            }
          }
          var expectedTypesMessage = expectedTypes.length > 0 ? ", expected one of type [" + expectedTypes.join(", ") + "]" : "";
          return new PropTypeError("Invalid " + location + " `" + propFullName + "` supplied to " + ("`" + componentName + "`" + expectedTypesMessage + "."));
        }
        return createChainableTypeChecker(validate);
      }
      function createNodeChecker() {
        function validate(props, propName, componentName, location, propFullName) {
          if (!isNode(props[propName])) {
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` supplied to " + ("`" + componentName + "`, expected a ReactNode."));
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function invalidValidatorError(componentName, location, propFullName, key, type) {
        return new PropTypeError(
          (componentName || "React class") + ": " + location + " type `" + propFullName + "." + key + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + type + "`."
        );
      }
      function createShapeTypeChecker(shapeTypes) {
        function validate(props, propName, componentName, location, propFullName) {
          var propValue = props[propName];
          var propType = getPropType(propValue);
          if (propType !== "object") {
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` of type `" + propType + "` " + ("supplied to `" + componentName + "`, expected `object`."));
          }
          for (var key in shapeTypes) {
            var checker = shapeTypes[key];
            if (typeof checker !== "function") {
              return invalidValidatorError(componentName, location, propFullName, key, getPreciseType(checker));
            }
            var error = checker(propValue, key, componentName, location, propFullName + "." + key, ReactPropTypesSecret);
            if (error) {
              return error;
            }
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function createStrictShapeTypeChecker(shapeTypes) {
        function validate(props, propName, componentName, location, propFullName) {
          var propValue = props[propName];
          var propType = getPropType(propValue);
          if (propType !== "object") {
            return new PropTypeError("Invalid " + location + " `" + propFullName + "` of type `" + propType + "` " + ("supplied to `" + componentName + "`, expected `object`."));
          }
          var allKeys = assign({}, props[propName], shapeTypes);
          for (var key in allKeys) {
            var checker = shapeTypes[key];
            if (has3(shapeTypes, key) && typeof checker !== "function") {
              return invalidValidatorError(componentName, location, propFullName, key, getPreciseType(checker));
            }
            if (!checker) {
              return new PropTypeError(
                "Invalid " + location + " `" + propFullName + "` key `" + key + "` supplied to `" + componentName + "`.\nBad object: " + JSON.stringify(props[propName], null, "  ") + "\nValid keys: " + JSON.stringify(Object.keys(shapeTypes), null, "  ")
              );
            }
            var error = checker(propValue, key, componentName, location, propFullName + "." + key, ReactPropTypesSecret);
            if (error) {
              return error;
            }
          }
          return null;
        }
        return createChainableTypeChecker(validate);
      }
      function isNode(propValue) {
        switch (typeof propValue) {
          case "number":
          case "string":
          case "undefined":
            return true;
          case "boolean":
            return !propValue;
          case "object":
            if (Array.isArray(propValue)) {
              return propValue.every(isNode);
            }
            if (propValue === null || isValidElement(propValue)) {
              return true;
            }
            var iteratorFn = getIteratorFn(propValue);
            if (iteratorFn) {
              var iterator = iteratorFn.call(propValue);
              var step;
              if (iteratorFn !== propValue.entries) {
                while (!(step = iterator.next()).done) {
                  if (!isNode(step.value)) {
                    return false;
                  }
                }
              } else {
                while (!(step = iterator.next()).done) {
                  var entry = step.value;
                  if (entry) {
                    if (!isNode(entry[1])) {
                      return false;
                    }
                  }
                }
              }
            } else {
              return false;
            }
            return true;
          default:
            return false;
        }
      }
      function isSymbol(propType, propValue) {
        if (propType === "symbol") {
          return true;
        }
        if (!propValue) {
          return false;
        }
        if (propValue["@@toStringTag"] === "Symbol") {
          return true;
        }
        if (typeof Symbol === "function" && propValue instanceof Symbol) {
          return true;
        }
        return false;
      }
      function getPropType(propValue) {
        var propType = typeof propValue;
        if (Array.isArray(propValue)) {
          return "array";
        }
        if (propValue instanceof RegExp) {
          return "object";
        }
        if (isSymbol(propType, propValue)) {
          return "symbol";
        }
        return propType;
      }
      function getPreciseType(propValue) {
        if (typeof propValue === "undefined" || propValue === null) {
          return "" + propValue;
        }
        var propType = getPropType(propValue);
        if (propType === "object") {
          if (propValue instanceof Date) {
            return "date";
          } else if (propValue instanceof RegExp) {
            return "regexp";
          }
        }
        return propType;
      }
      function getPostfixForTypeWarning(value) {
        var type = getPreciseType(value);
        switch (type) {
          case "array":
          case "object":
            return "an " + type;
          case "boolean":
          case "date":
          case "regexp":
            return "a " + type;
          default:
            return type;
        }
      }
      function getClassName(propValue) {
        if (!propValue.constructor || !propValue.constructor.name) {
          return ANONYMOUS;
        }
        return propValue.constructor.name;
      }
      ReactPropTypes.checkPropTypes = checkPropTypes;
      ReactPropTypes.resetWarningCache = checkPropTypes.resetWarningCache;
      ReactPropTypes.PropTypes = ReactPropTypes;
      return ReactPropTypes;
    };
  }
});

// node_modules/.pnpm/prop-types@15.8.1/node_modules/prop-types/index.js
var require_prop_types = __commonJS({
  "node_modules/.pnpm/prop-types@15.8.1/node_modules/prop-types/index.js"(exports, module) {
    if (true) {
      ReactIs = require_react_is();
      throwOnDirectAccess = true;
      module.exports = require_factoryWithTypeCheckers()(ReactIs.isElement, throwOnDirectAccess);
    } else {
      module.exports = null();
    }
    var ReactIs;
    var throwOnDirectAccess;
  }
});

// node_modules/.pnpm/react-easy-swipe@0.0.21/node_modules/react-easy-swipe/lib/react-swipe.js
var require_react_swipe = __commonJS({
  "node_modules/.pnpm/react-easy-swipe@0.0.21/node_modules/react-easy-swipe/lib/react-swipe.js"(exports) {
    (function(global2, factory) {
      if (typeof define === "function" && define.amd) {
        define(["exports", "react", "prop-types"], factory);
      } else if (typeof exports !== "undefined") {
        factory(exports, __require("react"), require_prop_types());
      } else {
        var mod = {
          exports: {}
        };
        factory(mod.exports, global2.react, global2.propTypes);
        global2.reactSwipe = mod.exports;
      }
    })(exports, function(exports2, _react, _propTypes) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", {
        value: true
      });
      exports2.setHasSupportToCaptureOption = setHasSupportToCaptureOption;
      var _react2 = _interopRequireDefault(_react);
      var _propTypes2 = _interopRequireDefault(_propTypes);
      function _interopRequireDefault(obj) {
        return obj && obj.__esModule ? obj : {
          default: obj
        };
      }
      var _extends = Object.assign || function(target) {
        for (var i = 1; i < arguments.length; i++) {
          var source = arguments[i];
          for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
              target[key] = source[key];
            }
          }
        }
        return target;
      };
      function _objectWithoutProperties(obj, keys) {
        var target = {};
        for (var i in obj) {
          if (keys.indexOf(i) >= 0) continue;
          if (!Object.prototype.hasOwnProperty.call(obj, i)) continue;
          target[i] = obj[i];
        }
        return target;
      }
      function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
          throw new TypeError("Cannot call a class as a function");
        }
      }
      var _createClass = /* @__PURE__ */ (function() {
        function defineProperties(target, props) {
          for (var i = 0; i < props.length; i++) {
            var descriptor = props[i];
            descriptor.enumerable = descriptor.enumerable || false;
            descriptor.configurable = true;
            if ("value" in descriptor) descriptor.writable = true;
            Object.defineProperty(target, descriptor.key, descriptor);
          }
        }
        return function(Constructor, protoProps, staticProps) {
          if (protoProps) defineProperties(Constructor.prototype, protoProps);
          if (staticProps) defineProperties(Constructor, staticProps);
          return Constructor;
        };
      })();
      function _possibleConstructorReturn(self2, call) {
        if (!self2) {
          throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
        }
        return call && (typeof call === "object" || typeof call === "function") ? call : self2;
      }
      function _inherits(subClass, superClass) {
        if (typeof superClass !== "function" && superClass !== null) {
          throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
        }
        subClass.prototype = Object.create(superClass && superClass.prototype, {
          constructor: {
            value: subClass,
            enumerable: false,
            writable: true,
            configurable: true
          }
        });
        if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
      }
      var supportsCaptureOption = false;
      function setHasSupportToCaptureOption(hasSupport) {
        supportsCaptureOption = hasSupport;
      }
      try {
        addEventListener("test", null, Object.defineProperty({}, "capture", { get: function get() {
          setHasSupportToCaptureOption(true);
        } }));
      } catch (e) {
      }
      function getSafeEventHandlerOpts() {
        var options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : { capture: true };
        return supportsCaptureOption ? options : options.capture;
      }
      function getPosition(event) {
        if ("touches" in event) {
          var _event$touches$ = event.touches[0], pageX = _event$touches$.pageX, pageY = _event$touches$.pageY;
          return { x: pageX, y: pageY };
        }
        var screenX = event.screenX, screenY = event.screenY;
        return { x: screenX, y: screenY };
      }
      var ReactSwipe = (function(_Component) {
        _inherits(ReactSwipe2, _Component);
        function ReactSwipe2() {
          var _ref;
          _classCallCheck(this, ReactSwipe2);
          for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
          }
          var _this = _possibleConstructorReturn(this, (_ref = ReactSwipe2.__proto__ || Object.getPrototypeOf(ReactSwipe2)).call.apply(_ref, [this].concat(args)));
          _this._handleSwipeStart = _this._handleSwipeStart.bind(_this);
          _this._handleSwipeMove = _this._handleSwipeMove.bind(_this);
          _this._handleSwipeEnd = _this._handleSwipeEnd.bind(_this);
          _this._onMouseDown = _this._onMouseDown.bind(_this);
          _this._onMouseMove = _this._onMouseMove.bind(_this);
          _this._onMouseUp = _this._onMouseUp.bind(_this);
          _this._setSwiperRef = _this._setSwiperRef.bind(_this);
          return _this;
        }
        _createClass(ReactSwipe2, [{
          key: "componentDidMount",
          value: function componentDidMount() {
            if (this.swiper) {
              this.swiper.addEventListener("touchmove", this._handleSwipeMove, getSafeEventHandlerOpts({
                capture: true,
                passive: false
              }));
            }
          }
        }, {
          key: "componentWillUnmount",
          value: function componentWillUnmount() {
            if (this.swiper) {
              this.swiper.removeEventListener("touchmove", this._handleSwipeMove, getSafeEventHandlerOpts({
                capture: true,
                passive: false
              }));
            }
          }
        }, {
          key: "_onMouseDown",
          value: function _onMouseDown(event) {
            if (!this.props.allowMouseEvents) {
              return;
            }
            this.mouseDown = true;
            document.addEventListener("mouseup", this._onMouseUp);
            document.addEventListener("mousemove", this._onMouseMove);
            this._handleSwipeStart(event);
          }
        }, {
          key: "_onMouseMove",
          value: function _onMouseMove(event) {
            if (!this.mouseDown) {
              return;
            }
            this._handleSwipeMove(event);
          }
        }, {
          key: "_onMouseUp",
          value: function _onMouseUp(event) {
            this.mouseDown = false;
            document.removeEventListener("mouseup", this._onMouseUp);
            document.removeEventListener("mousemove", this._onMouseMove);
            this._handleSwipeEnd(event);
          }
        }, {
          key: "_handleSwipeStart",
          value: function _handleSwipeStart(event) {
            var _getPosition = getPosition(event), x2 = _getPosition.x, y2 = _getPosition.y;
            this.moveStart = { x: x2, y: y2 };
            this.props.onSwipeStart(event);
          }
        }, {
          key: "_handleSwipeMove",
          value: function _handleSwipeMove(event) {
            if (!this.moveStart) {
              return;
            }
            var _getPosition2 = getPosition(event), x2 = _getPosition2.x, y2 = _getPosition2.y;
            var deltaX = x2 - this.moveStart.x;
            var deltaY = y2 - this.moveStart.y;
            this.moving = true;
            var shouldPreventDefault = this.props.onSwipeMove({
              x: deltaX,
              y: deltaY
            }, event);
            if (shouldPreventDefault && event.cancelable) {
              event.preventDefault();
            }
            this.movePosition = { deltaX, deltaY };
          }
        }, {
          key: "_handleSwipeEnd",
          value: function _handleSwipeEnd(event) {
            this.props.onSwipeEnd(event);
            var tolerance = this.props.tolerance;
            if (this.moving && this.movePosition) {
              if (this.movePosition.deltaX < -tolerance) {
                this.props.onSwipeLeft(1, event);
              } else if (this.movePosition.deltaX > tolerance) {
                this.props.onSwipeRight(1, event);
              }
              if (this.movePosition.deltaY < -tolerance) {
                this.props.onSwipeUp(1, event);
              } else if (this.movePosition.deltaY > tolerance) {
                this.props.onSwipeDown(1, event);
              }
            }
            this.moveStart = null;
            this.moving = false;
            this.movePosition = null;
          }
        }, {
          key: "_setSwiperRef",
          value: function _setSwiperRef(node) {
            this.swiper = node;
            this.props.innerRef(node);
          }
        }, {
          key: "render",
          value: function render() {
            var _props = this.props, tagName = _props.tagName, className = _props.className, style = _props.style, children = _props.children, allowMouseEvents = _props.allowMouseEvents, onSwipeUp = _props.onSwipeUp, onSwipeDown = _props.onSwipeDown, onSwipeLeft = _props.onSwipeLeft, onSwipeRight = _props.onSwipeRight, onSwipeStart = _props.onSwipeStart, onSwipeMove = _props.onSwipeMove, onSwipeEnd = _props.onSwipeEnd, innerRef = _props.innerRef, tolerance = _props.tolerance, props = _objectWithoutProperties(_props, ["tagName", "className", "style", "children", "allowMouseEvents", "onSwipeUp", "onSwipeDown", "onSwipeLeft", "onSwipeRight", "onSwipeStart", "onSwipeMove", "onSwipeEnd", "innerRef", "tolerance"]);
            return _react2.default.createElement(
              this.props.tagName,
              _extends({
                ref: this._setSwiperRef,
                onMouseDown: this._onMouseDown,
                onTouchStart: this._handleSwipeStart,
                onTouchEnd: this._handleSwipeEnd,
                className,
                style
              }, props),
              children
            );
          }
        }]);
        return ReactSwipe2;
      })(_react.Component);
      ReactSwipe.displayName = "ReactSwipe";
      ReactSwipe.propTypes = {
        tagName: _propTypes2.default.string,
        className: _propTypes2.default.string,
        style: _propTypes2.default.object,
        children: _propTypes2.default.node,
        allowMouseEvents: _propTypes2.default.bool,
        onSwipeUp: _propTypes2.default.func,
        onSwipeDown: _propTypes2.default.func,
        onSwipeLeft: _propTypes2.default.func,
        onSwipeRight: _propTypes2.default.func,
        onSwipeStart: _propTypes2.default.func,
        onSwipeMove: _propTypes2.default.func,
        onSwipeEnd: _propTypes2.default.func,
        innerRef: _propTypes2.default.func,
        tolerance: _propTypes2.default.number.isRequired
      };
      ReactSwipe.defaultProps = {
        tagName: "div",
        allowMouseEvents: false,
        onSwipeUp: function onSwipeUp() {
        },
        onSwipeDown: function onSwipeDown() {
        },
        onSwipeLeft: function onSwipeLeft() {
        },
        onSwipeRight: function onSwipeRight() {
        },
        onSwipeStart: function onSwipeStart() {
        },
        onSwipeMove: function onSwipeMove() {
        },
        onSwipeEnd: function onSwipeEnd() {
        },
        innerRef: function innerRef() {
        },
        tolerance: 0
      };
      exports2.default = ReactSwipe;
    });
  }
});

// node_modules/.pnpm/react-easy-swipe@0.0.21/node_modules/react-easy-swipe/lib/index.js
var require_lib = __commonJS({
  "node_modules/.pnpm/react-easy-swipe@0.0.21/node_modules/react-easy-swipe/lib/index.js"(exports) {
    (function(global2, factory) {
      if (typeof define === "function" && define.amd) {
        define(["exports", "./react-swipe"], factory);
      } else if (typeof exports !== "undefined") {
        factory(exports, require_react_swipe());
      } else {
        var mod = {
          exports: {}
        };
        factory(mod.exports, global2.reactSwipe);
        global2.index = mod.exports;
      }
    })(exports, function(exports2, _reactSwipe) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", {
        value: true
      });
      var _reactSwipe2 = _interopRequireDefault(_reactSwipe);
      function _interopRequireDefault(obj) {
        return obj && obj.__esModule ? obj : {
          default: obj
        };
      }
      exports2.default = _reactSwipe2.default;
    });
  }
});

// node_modules/.pnpm/classnames@2.5.1/node_modules/classnames/index.js
var require_classnames = __commonJS({
  "node_modules/.pnpm/classnames@2.5.1/node_modules/classnames/index.js"(exports, module) {
    (function() {
      "use strict";
      var hasOwn = {}.hasOwnProperty;
      function classNames() {
        var classes = "";
        for (var i = 0; i < arguments.length; i++) {
          var arg = arguments[i];
          if (arg) {
            classes = appendClass(classes, parseValue(arg));
          }
        }
        return classes;
      }
      function parseValue(arg) {
        if (typeof arg === "string" || typeof arg === "number") {
          return arg;
        }
        if (typeof arg !== "object") {
          return "";
        }
        if (Array.isArray(arg)) {
          return classNames.apply(null, arg);
        }
        if (arg.toString !== Object.prototype.toString && !arg.toString.toString().includes("[native code]")) {
          return arg.toString();
        }
        var classes = "";
        for (var key in arg) {
          if (hasOwn.call(arg, key) && arg[key]) {
            classes = appendClass(classes, key);
          }
        }
        return classes;
      }
      function appendClass(value, newClass) {
        if (!newClass) {
          return value;
        }
        if (value) {
          return value + " " + newClass;
        }
        return value + newClass;
      }
      if (typeof module !== "undefined" && module.exports) {
        classNames.default = classNames;
        module.exports = classNames;
      } else if (typeof define === "function" && typeof define.amd === "object" && define.amd) {
        define("classnames", [], function() {
          return classNames;
        });
      } else {
        window.classNames = classNames;
      }
    })();
  }
});

// node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/cssClasses.js
var require_cssClasses = __commonJS({
  "node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/cssClasses.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _classnames = _interopRequireDefault(require_classnames());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function _defineProperty(obj, key, value) {
      if (key in obj) {
        Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writable: true });
      } else {
        obj[key] = value;
      }
      return obj;
    }
    var _default = {
      ROOT: function ROOT(customClassName) {
        return (0, _classnames.default)(_defineProperty({
          "carousel-root": true
        }, customClassName || "", !!customClassName));
      },
      CAROUSEL: function CAROUSEL(isSlider) {
        return (0, _classnames.default)({
          carousel: true,
          "carousel-slider": isSlider
        });
      },
      WRAPPER: function WRAPPER(isSlider, axis) {
        return (0, _classnames.default)({
          "thumbs-wrapper": !isSlider,
          "slider-wrapper": isSlider,
          "axis-horizontal": axis === "horizontal",
          "axis-vertical": axis !== "horizontal"
        });
      },
      SLIDER: function SLIDER(isSlider, isSwiping) {
        return (0, _classnames.default)({
          thumbs: !isSlider,
          slider: isSlider,
          animated: !isSwiping
        });
      },
      ITEM: function ITEM(isSlider, selected, previous) {
        return (0, _classnames.default)({
          thumb: !isSlider,
          slide: isSlider,
          selected,
          previous
        });
      },
      ARROW_PREV: function ARROW_PREV(disabled) {
        return (0, _classnames.default)({
          "control-arrow control-prev": true,
          "control-disabled": disabled
        });
      },
      ARROW_NEXT: function ARROW_NEXT(disabled) {
        return (0, _classnames.default)({
          "control-arrow control-next": true,
          "control-disabled": disabled
        });
      },
      DOT: function DOT(selected) {
        return (0, _classnames.default)({
          dot: true,
          selected
        });
      }
    };
    exports.default = _default;
  }
});

// node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/dimensions.js
var require_dimensions = __commonJS({
  "node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/dimensions.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.outerWidth = void 0;
    var outerWidth = function outerWidth2(el) {
      var width = el.offsetWidth;
      var style = getComputedStyle(el);
      width += parseInt(style.marginLeft) + parseInt(style.marginRight);
      return width;
    };
    exports.outerWidth = outerWidth;
  }
});

// node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/CSSTranslate.js
var require_CSSTranslate = __commonJS({
  "node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/CSSTranslate.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _default = function _default2(position, metric, axis) {
      var positionPercent = position === 0 ? position : position + metric;
      var positionCss = axis === "horizontal" ? [positionPercent, 0, 0] : [0, positionPercent, 0];
      var transitionProp = "translate3d";
      var translatedPosition = "(" + positionCss.join(",") + ")";
      return transitionProp + translatedPosition;
    };
    exports.default = _default;
  }
});

// node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/shims/window.js
var require_window = __commonJS({
  "node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/shims/window.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _default = function _default2() {
      return window;
    };
    exports.default = _default;
  }
});

// node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/components/Thumbs.js
var require_Thumbs = __commonJS({
  "node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/components/Thumbs.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _react = _interopRequireWildcard(__require("react"));
    var _cssClasses = _interopRequireDefault(require_cssClasses());
    var _dimensions = require_dimensions();
    var _CSSTranslate = _interopRequireDefault(require_CSSTranslate());
    var _reactEasySwipe = _interopRequireDefault(require_lib());
    var _window = _interopRequireDefault(require_window());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function _getRequireWildcardCache() {
      if (typeof WeakMap !== "function") return null;
      var cache2 = /* @__PURE__ */ new WeakMap();
      _getRequireWildcardCache = function _getRequireWildcardCache2() {
        return cache2;
      };
      return cache2;
    }
    function _interopRequireWildcard(obj) {
      if (obj && obj.__esModule) {
        return obj;
      }
      if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") {
        return { default: obj };
      }
      var cache2 = _getRequireWildcardCache();
      if (cache2 && cache2.has(obj)) {
        return cache2.get(obj);
      }
      var newObj = {};
      var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor;
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null;
          if (desc && (desc.get || desc.set)) {
            Object.defineProperty(newObj, key, desc);
          } else {
            newObj[key] = obj[key];
          }
        }
      }
      newObj.default = obj;
      if (cache2) {
        cache2.set(obj, newObj);
      }
      return newObj;
    }
    function _typeof(obj) {
      "@babel/helpers - typeof";
      if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
        _typeof = function _typeof2(obj2) {
          return typeof obj2;
        };
      } else {
        _typeof = function _typeof2(obj2) {
          return obj2 && typeof Symbol === "function" && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
        };
      }
      return _typeof(obj);
    }
    function _extends() {
      _extends = Object.assign || function(target) {
        for (var i = 1; i < arguments.length; i++) {
          var source = arguments[i];
          for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
              target[key] = source[key];
            }
          }
        }
        return target;
      };
      return _extends.apply(this, arguments);
    }
    function _classCallCheck(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
      }
    }
    function _defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
      }
    }
    function _createClass(Constructor, protoProps, staticProps) {
      if (protoProps) _defineProperties(Constructor.prototype, protoProps);
      if (staticProps) _defineProperties(Constructor, staticProps);
      return Constructor;
    }
    function _inherits(subClass, superClass) {
      if (typeof superClass !== "function" && superClass !== null) {
        throw new TypeError("Super expression must either be null or a function");
      }
      subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } });
      if (superClass) _setPrototypeOf(subClass, superClass);
    }
    function _setPrototypeOf(o, p2) {
      _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf2(o2, p3) {
        o2.__proto__ = p3;
        return o2;
      };
      return _setPrototypeOf(o, p2);
    }
    function _createSuper(Derived) {
      var hasNativeReflectConstruct = _isNativeReflectConstruct();
      return function _createSuperInternal() {
        var Super = _getPrototypeOf(Derived), result;
        if (hasNativeReflectConstruct) {
          var NewTarget = _getPrototypeOf(this).constructor;
          result = Reflect.construct(Super, arguments, NewTarget);
        } else {
          result = Super.apply(this, arguments);
        }
        return _possibleConstructorReturn(this, result);
      };
    }
    function _possibleConstructorReturn(self2, call) {
      if (call && (_typeof(call) === "object" || typeof call === "function")) {
        return call;
      }
      return _assertThisInitialized(self2);
    }
    function _assertThisInitialized(self2) {
      if (self2 === void 0) {
        throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
      }
      return self2;
    }
    function _isNativeReflectConstruct() {
      if (typeof Reflect === "undefined" || !Reflect.construct) return false;
      if (Reflect.construct.sham) return false;
      if (typeof Proxy === "function") return true;
      try {
        Date.prototype.toString.call(Reflect.construct(Date, [], function() {
        }));
        return true;
      } catch (e) {
        return false;
      }
    }
    function _getPrototypeOf(o) {
      _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf2(o2) {
        return o2.__proto__ || Object.getPrototypeOf(o2);
      };
      return _getPrototypeOf(o);
    }
    function _defineProperty(obj, key, value) {
      if (key in obj) {
        Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writable: true });
      } else {
        obj[key] = value;
      }
      return obj;
    }
    var isKeyboardEvent = function isKeyboardEvent2(e) {
      return e.hasOwnProperty("key");
    };
    var Thumbs = /* @__PURE__ */ (function(_Component) {
      _inherits(Thumbs2, _Component);
      var _super = _createSuper(Thumbs2);
      function Thumbs2(_props) {
        var _this;
        _classCallCheck(this, Thumbs2);
        _this = _super.call(this, _props);
        _defineProperty(_assertThisInitialized(_this), "itemsWrapperRef", void 0);
        _defineProperty(_assertThisInitialized(_this), "itemsListRef", void 0);
        _defineProperty(_assertThisInitialized(_this), "thumbsRef", void 0);
        _defineProperty(_assertThisInitialized(_this), "setItemsWrapperRef", function(node) {
          _this.itemsWrapperRef = node;
        });
        _defineProperty(_assertThisInitialized(_this), "setItemsListRef", function(node) {
          _this.itemsListRef = node;
        });
        _defineProperty(_assertThisInitialized(_this), "setThumbsRef", function(node, index) {
          if (!_this.thumbsRef) {
            _this.thumbsRef = [];
          }
          _this.thumbsRef[index] = node;
        });
        _defineProperty(_assertThisInitialized(_this), "updateSizes", function() {
          if (!_this.props.children || !_this.itemsWrapperRef || !_this.thumbsRef) {
            return;
          }
          var total = _react.Children.count(_this.props.children);
          var wrapperSize = _this.itemsWrapperRef.clientWidth;
          var itemSize = _this.props.thumbWidth ? _this.props.thumbWidth : (0, _dimensions.outerWidth)(_this.thumbsRef[0]);
          var visibleItems = Math.floor(wrapperSize / itemSize);
          var showArrows = visibleItems < total;
          var lastPosition = showArrows ? total - visibleItems : 0;
          _this.setState(function(_state, props) {
            return {
              itemSize,
              visibleItems,
              firstItem: showArrows ? _this.getFirstItem(props.selectedItem) : 0,
              lastPosition,
              showArrows
            };
          });
        });
        _defineProperty(_assertThisInitialized(_this), "handleClickItem", function(index, item, e) {
          if (!isKeyboardEvent(e) || e.key === "Enter") {
            var handler = _this.props.onSelectItem;
            if (typeof handler === "function") {
              handler(index, item);
            }
          }
        });
        _defineProperty(_assertThisInitialized(_this), "onSwipeStart", function() {
          _this.setState({
            swiping: true
          });
        });
        _defineProperty(_assertThisInitialized(_this), "onSwipeEnd", function() {
          _this.setState({
            swiping: false
          });
        });
        _defineProperty(_assertThisInitialized(_this), "onSwipeMove", function(delta) {
          var deltaX = delta.x;
          if (!_this.state.itemSize || !_this.itemsWrapperRef || !_this.state.visibleItems) {
            return false;
          }
          var leftBoundary = 0;
          var childrenLength = _react.Children.count(_this.props.children);
          var currentPosition = -(_this.state.firstItem * 100) / _this.state.visibleItems;
          var lastLeftItem = Math.max(childrenLength - _this.state.visibleItems, 0);
          var lastLeftBoundary = -lastLeftItem * 100 / _this.state.visibleItems;
          if (currentPosition === leftBoundary && deltaX > 0) {
            deltaX = 0;
          }
          if (currentPosition === lastLeftBoundary && deltaX < 0) {
            deltaX = 0;
          }
          var wrapperSize = _this.itemsWrapperRef.clientWidth;
          var position = currentPosition + 100 / (wrapperSize / deltaX);
          if (_this.itemsListRef) {
            ["WebkitTransform", "MozTransform", "MsTransform", "OTransform", "transform", "msTransform"].forEach(function(prop) {
              _this.itemsListRef.style[prop] = (0, _CSSTranslate.default)(position, "%", _this.props.axis);
            });
          }
          return true;
        });
        _defineProperty(_assertThisInitialized(_this), "slideRight", function(positions) {
          _this.moveTo(_this.state.firstItem - (typeof positions === "number" ? positions : 1));
        });
        _defineProperty(_assertThisInitialized(_this), "slideLeft", function(positions) {
          _this.moveTo(_this.state.firstItem + (typeof positions === "number" ? positions : 1));
        });
        _defineProperty(_assertThisInitialized(_this), "moveTo", function(position) {
          position = position < 0 ? 0 : position;
          position = position >= _this.state.lastPosition ? _this.state.lastPosition : position;
          _this.setState({
            firstItem: position
          });
        });
        _this.state = {
          selectedItem: _props.selectedItem,
          swiping: false,
          showArrows: false,
          firstItem: 0,
          visibleItems: 0,
          lastPosition: 0
        };
        return _this;
      }
      _createClass(Thumbs2, [{
        key: "componentDidMount",
        value: function componentDidMount() {
          this.setupThumbs();
        }
      }, {
        key: "componentDidUpdate",
        value: function componentDidUpdate(prevProps) {
          if (this.props.selectedItem !== this.state.selectedItem) {
            this.setState({
              selectedItem: this.props.selectedItem,
              firstItem: this.getFirstItem(this.props.selectedItem)
            });
          }
          if (this.props.children === prevProps.children) {
            return;
          }
          this.updateSizes();
        }
      }, {
        key: "componentWillUnmount",
        value: function componentWillUnmount() {
          this.destroyThumbs();
        }
      }, {
        key: "setupThumbs",
        value: function setupThumbs() {
          (0, _window.default)().addEventListener("resize", this.updateSizes);
          (0, _window.default)().addEventListener("DOMContentLoaded", this.updateSizes);
          this.updateSizes();
        }
      }, {
        key: "destroyThumbs",
        value: function destroyThumbs() {
          (0, _window.default)().removeEventListener("resize", this.updateSizes);
          (0, _window.default)().removeEventListener("DOMContentLoaded", this.updateSizes);
        }
      }, {
        key: "getFirstItem",
        value: function getFirstItem(selectedItem) {
          var firstItem = selectedItem;
          if (selectedItem >= this.state.lastPosition) {
            firstItem = this.state.lastPosition;
          }
          if (selectedItem < this.state.firstItem + this.state.visibleItems) {
            firstItem = this.state.firstItem;
          }
          if (selectedItem < this.state.firstItem) {
            firstItem = selectedItem;
          }
          return firstItem;
        }
      }, {
        key: "renderItems",
        value: function renderItems() {
          var _this2 = this;
          return this.props.children.map(function(img, index) {
            var itemClass = _cssClasses.default.ITEM(false, index === _this2.state.selectedItem);
            var thumbProps = {
              key: index,
              ref: function ref(e) {
                return _this2.setThumbsRef(e, index);
              },
              className: itemClass,
              onClick: _this2.handleClickItem.bind(_this2, index, _this2.props.children[index]),
              onKeyDown: _this2.handleClickItem.bind(_this2, index, _this2.props.children[index]),
              "aria-label": "".concat(_this2.props.labels.item, " ").concat(index + 1),
              style: {
                width: _this2.props.thumbWidth
              }
            };
            return /* @__PURE__ */ _react.default.createElement("li", _extends({}, thumbProps, {
              role: "button",
              tabIndex: 0
            }), img);
          });
        }
      }, {
        key: "render",
        value: function render() {
          var _this3 = this;
          if (!this.props.children) {
            return null;
          }
          var isSwipeable = _react.Children.count(this.props.children) > 1;
          var hasPrev = this.state.showArrows && this.state.firstItem > 0;
          var hasNext = this.state.showArrows && this.state.firstItem < this.state.lastPosition;
          var itemListStyles = {};
          var currentPosition = -this.state.firstItem * (this.state.itemSize || 0);
          var transformProp = (0, _CSSTranslate.default)(currentPosition, "px", this.props.axis);
          var transitionTime = this.props.transitionTime + "ms";
          itemListStyles = {
            WebkitTransform: transformProp,
            MozTransform: transformProp,
            MsTransform: transformProp,
            OTransform: transformProp,
            transform: transformProp,
            msTransform: transformProp,
            WebkitTransitionDuration: transitionTime,
            MozTransitionDuration: transitionTime,
            MsTransitionDuration: transitionTime,
            OTransitionDuration: transitionTime,
            transitionDuration: transitionTime,
            msTransitionDuration: transitionTime
          };
          return /* @__PURE__ */ _react.default.createElement("div", {
            className: _cssClasses.default.CAROUSEL(false)
          }, /* @__PURE__ */ _react.default.createElement("div", {
            className: _cssClasses.default.WRAPPER(false),
            ref: this.setItemsWrapperRef
          }, /* @__PURE__ */ _react.default.createElement("button", {
            type: "button",
            className: _cssClasses.default.ARROW_PREV(!hasPrev),
            onClick: function onClick() {
              return _this3.slideRight();
            },
            "aria-label": this.props.labels.leftArrow
          }), isSwipeable ? /* @__PURE__ */ _react.default.createElement(_reactEasySwipe.default, {
            tagName: "ul",
            className: _cssClasses.default.SLIDER(false, this.state.swiping),
            onSwipeLeft: this.slideLeft,
            onSwipeRight: this.slideRight,
            onSwipeMove: this.onSwipeMove,
            onSwipeStart: this.onSwipeStart,
            onSwipeEnd: this.onSwipeEnd,
            style: itemListStyles,
            innerRef: this.setItemsListRef,
            allowMouseEvents: this.props.emulateTouch
          }, this.renderItems()) : /* @__PURE__ */ _react.default.createElement("ul", {
            className: _cssClasses.default.SLIDER(false, this.state.swiping),
            ref: function ref(node) {
              return _this3.setItemsListRef(node);
            },
            style: itemListStyles
          }, this.renderItems()), /* @__PURE__ */ _react.default.createElement("button", {
            type: "button",
            className: _cssClasses.default.ARROW_NEXT(!hasNext),
            onClick: function onClick() {
              return _this3.slideLeft();
            },
            "aria-label": this.props.labels.rightArrow
          })));
        }
      }]);
      return Thumbs2;
    })(_react.Component);
    exports.default = Thumbs;
    _defineProperty(Thumbs, "displayName", "Thumbs");
    _defineProperty(Thumbs, "defaultProps", {
      axis: "horizontal",
      labels: {
        leftArrow: "previous slide / item",
        rightArrow: "next slide / item",
        item: "slide item"
      },
      selectedItem: 0,
      thumbWidth: 80,
      transitionTime: 350
    });
  }
});

// node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/shims/document.js
var require_document = __commonJS({
  "node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/shims/document.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _default = function _default2() {
      return document;
    };
    exports.default = _default;
  }
});

// node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/components/Carousel/utils.js
var require_utils = __commonJS({
  "node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/components/Carousel/utils.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.setPosition = exports.getPosition = exports.isKeyboardEvent = exports.defaultStatusFormatter = exports.noop = void 0;
    var _react = __require("react");
    var _CSSTranslate = _interopRequireDefault(require_CSSTranslate());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    var noop2 = function noop3() {
    };
    exports.noop = noop2;
    var defaultStatusFormatter = function defaultStatusFormatter2(current, total) {
      return "".concat(current, " of ").concat(total);
    };
    exports.defaultStatusFormatter = defaultStatusFormatter;
    var isKeyboardEvent = function isKeyboardEvent2(e) {
      return e ? e.hasOwnProperty("key") : false;
    };
    exports.isKeyboardEvent = isKeyboardEvent;
    var getPosition = function getPosition2(index, props) {
      if (props.infiniteLoop) {
        ++index;
      }
      if (index === 0) {
        return 0;
      }
      var childrenLength = _react.Children.count(props.children);
      if (props.centerMode && props.axis === "horizontal") {
        var currentPosition = -index * props.centerSlidePercentage;
        var lastPosition = childrenLength - 1;
        if (index && (index !== lastPosition || props.infiniteLoop)) {
          currentPosition += (100 - props.centerSlidePercentage) / 2;
        } else if (index === lastPosition) {
          currentPosition += 100 - props.centerSlidePercentage;
        }
        return currentPosition;
      }
      return -index * 100;
    };
    exports.getPosition = getPosition;
    var setPosition = function setPosition2(position, axis) {
      var style = {};
      ["WebkitTransform", "MozTransform", "MsTransform", "OTransform", "transform", "msTransform"].forEach(function(prop) {
        style[prop] = (0, _CSSTranslate.default)(position, "%", axis);
      });
      return style;
    };
    exports.setPosition = setPosition;
  }
});

// node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/components/Carousel/animations.js
var require_animations = __commonJS({
  "node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/components/Carousel/animations.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.fadeAnimationHandler = exports.slideStopSwipingHandler = exports.slideSwipeAnimationHandler = exports.slideAnimationHandler = void 0;
    var _react = __require("react");
    var _CSSTranslate = _interopRequireDefault(require_CSSTranslate());
    var _utils = require_utils();
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function ownKeys(object, enumerableOnly) {
      var keys = Object.keys(object);
      if (Object.getOwnPropertySymbols) {
        var symbols = Object.getOwnPropertySymbols(object);
        if (enumerableOnly) symbols = symbols.filter(function(sym) {
          return Object.getOwnPropertyDescriptor(object, sym).enumerable;
        });
        keys.push.apply(keys, symbols);
      }
      return keys;
    }
    function _objectSpread(target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i] != null ? arguments[i] : {};
        if (i % 2) {
          ownKeys(Object(source), true).forEach(function(key) {
            _defineProperty(target, key, source[key]);
          });
        } else if (Object.getOwnPropertyDescriptors) {
          Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
        } else {
          ownKeys(Object(source)).forEach(function(key) {
            Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
          });
        }
      }
      return target;
    }
    function _defineProperty(obj, key, value) {
      if (key in obj) {
        Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writable: true });
      } else {
        obj[key] = value;
      }
      return obj;
    }
    var slideAnimationHandler = function slideAnimationHandler2(props, state) {
      var returnStyles = {};
      var selectedItem = state.selectedItem;
      var previousItem = selectedItem;
      var lastPosition = _react.Children.count(props.children) - 1;
      var needClonedSlide = props.infiniteLoop && (selectedItem < 0 || selectedItem > lastPosition);
      if (needClonedSlide) {
        if (previousItem < 0) {
          if (props.centerMode && props.centerSlidePercentage && props.axis === "horizontal") {
            returnStyles.itemListStyle = (0, _utils.setPosition)(-(lastPosition + 2) * props.centerSlidePercentage - (100 - props.centerSlidePercentage) / 2, props.axis);
          } else {
            returnStyles.itemListStyle = (0, _utils.setPosition)(-(lastPosition + 2) * 100, props.axis);
          }
        } else if (previousItem > lastPosition) {
          returnStyles.itemListStyle = (0, _utils.setPosition)(0, props.axis);
        }
        return returnStyles;
      }
      var currentPosition = (0, _utils.getPosition)(selectedItem, props);
      var transformProp = (0, _CSSTranslate.default)(currentPosition, "%", props.axis);
      var transitionTime = props.transitionTime + "ms";
      returnStyles.itemListStyle = {
        WebkitTransform: transformProp,
        msTransform: transformProp,
        OTransform: transformProp,
        transform: transformProp
      };
      if (!state.swiping) {
        returnStyles.itemListStyle = _objectSpread(_objectSpread({}, returnStyles.itemListStyle), {}, {
          WebkitTransitionDuration: transitionTime,
          MozTransitionDuration: transitionTime,
          OTransitionDuration: transitionTime,
          transitionDuration: transitionTime,
          msTransitionDuration: transitionTime
        });
      }
      return returnStyles;
    };
    exports.slideAnimationHandler = slideAnimationHandler;
    var slideSwipeAnimationHandler = function slideSwipeAnimationHandler2(delta, props, state, setState) {
      var returnStyles = {};
      var isHorizontal = props.axis === "horizontal";
      var childrenLength = _react.Children.count(props.children);
      var initialBoundry = 0;
      var currentPosition = (0, _utils.getPosition)(state.selectedItem, props);
      var finalBoundry = props.infiniteLoop ? (0, _utils.getPosition)(childrenLength - 1, props) - 100 : (0, _utils.getPosition)(childrenLength - 1, props);
      var axisDelta = isHorizontal ? delta.x : delta.y;
      var handledDelta = axisDelta;
      if (currentPosition === initialBoundry && axisDelta > 0) {
        handledDelta = 0;
      }
      if (currentPosition === finalBoundry && axisDelta < 0) {
        handledDelta = 0;
      }
      var position = currentPosition + 100 / (state.itemSize / handledDelta);
      var hasMoved = Math.abs(axisDelta) > props.swipeScrollTolerance;
      if (props.infiniteLoop && hasMoved) {
        if (state.selectedItem === 0 && position > -100) {
          position -= childrenLength * 100;
        } else if (state.selectedItem === childrenLength - 1 && position < -childrenLength * 100) {
          position += childrenLength * 100;
        }
      }
      if (!props.preventMovementUntilSwipeScrollTolerance || hasMoved || state.swipeMovementStarted) {
        if (!state.swipeMovementStarted) {
          setState({
            swipeMovementStarted: true
          });
        }
        returnStyles.itemListStyle = (0, _utils.setPosition)(position, props.axis);
      }
      if (hasMoved && !state.cancelClick) {
        setState({
          cancelClick: true
        });
      }
      return returnStyles;
    };
    exports.slideSwipeAnimationHandler = slideSwipeAnimationHandler;
    var slideStopSwipingHandler = function slideStopSwipingHandler2(props, state) {
      var currentPosition = (0, _utils.getPosition)(state.selectedItem, props);
      var itemListStyle = (0, _utils.setPosition)(currentPosition, props.axis);
      return {
        itemListStyle
      };
    };
    exports.slideStopSwipingHandler = slideStopSwipingHandler;
    var fadeAnimationHandler = function fadeAnimationHandler2(props, state) {
      var transitionTime = props.transitionTime + "ms";
      var transitionTimingFunction = "ease-in-out";
      var slideStyle = {
        position: "absolute",
        display: "block",
        zIndex: -2,
        minHeight: "100%",
        opacity: 0,
        top: 0,
        right: 0,
        left: 0,
        bottom: 0,
        transitionTimingFunction,
        msTransitionTimingFunction: transitionTimingFunction,
        MozTransitionTimingFunction: transitionTimingFunction,
        WebkitTransitionTimingFunction: transitionTimingFunction,
        OTransitionTimingFunction: transitionTimingFunction
      };
      if (!state.swiping) {
        slideStyle = _objectSpread(_objectSpread({}, slideStyle), {}, {
          WebkitTransitionDuration: transitionTime,
          MozTransitionDuration: transitionTime,
          OTransitionDuration: transitionTime,
          transitionDuration: transitionTime,
          msTransitionDuration: transitionTime
        });
      }
      return {
        slideStyle,
        selectedStyle: _objectSpread(_objectSpread({}, slideStyle), {}, {
          opacity: 1,
          position: "relative"
        }),
        prevStyle: _objectSpread({}, slideStyle)
      };
    };
    exports.fadeAnimationHandler = fadeAnimationHandler;
  }
});

// node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/components/Carousel/index.js
var require_Carousel = __commonJS({
  "node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/components/Carousel/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _react = _interopRequireWildcard(__require("react"));
    var _reactEasySwipe = _interopRequireDefault(require_lib());
    var _cssClasses = _interopRequireDefault(require_cssClasses());
    var _Thumbs = _interopRequireDefault(require_Thumbs());
    var _document = _interopRequireDefault(require_document());
    var _window = _interopRequireDefault(require_window());
    var _utils = require_utils();
    var _animations = require_animations();
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function _getRequireWildcardCache() {
      if (typeof WeakMap !== "function") return null;
      var cache2 = /* @__PURE__ */ new WeakMap();
      _getRequireWildcardCache = function _getRequireWildcardCache2() {
        return cache2;
      };
      return cache2;
    }
    function _interopRequireWildcard(obj) {
      if (obj && obj.__esModule) {
        return obj;
      }
      if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") {
        return { default: obj };
      }
      var cache2 = _getRequireWildcardCache();
      if (cache2 && cache2.has(obj)) {
        return cache2.get(obj);
      }
      var newObj = {};
      var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor;
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null;
          if (desc && (desc.get || desc.set)) {
            Object.defineProperty(newObj, key, desc);
          } else {
            newObj[key] = obj[key];
          }
        }
      }
      newObj.default = obj;
      if (cache2) {
        cache2.set(obj, newObj);
      }
      return newObj;
    }
    function _typeof(obj) {
      "@babel/helpers - typeof";
      if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
        _typeof = function _typeof2(obj2) {
          return typeof obj2;
        };
      } else {
        _typeof = function _typeof2(obj2) {
          return obj2 && typeof Symbol === "function" && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
        };
      }
      return _typeof(obj);
    }
    function _extends() {
      _extends = Object.assign || function(target) {
        for (var i = 1; i < arguments.length; i++) {
          var source = arguments[i];
          for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
              target[key] = source[key];
            }
          }
        }
        return target;
      };
      return _extends.apply(this, arguments);
    }
    function ownKeys(object, enumerableOnly) {
      var keys = Object.keys(object);
      if (Object.getOwnPropertySymbols) {
        var symbols = Object.getOwnPropertySymbols(object);
        if (enumerableOnly) symbols = symbols.filter(function(sym) {
          return Object.getOwnPropertyDescriptor(object, sym).enumerable;
        });
        keys.push.apply(keys, symbols);
      }
      return keys;
    }
    function _objectSpread(target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i] != null ? arguments[i] : {};
        if (i % 2) {
          ownKeys(Object(source), true).forEach(function(key) {
            _defineProperty(target, key, source[key]);
          });
        } else if (Object.getOwnPropertyDescriptors) {
          Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
        } else {
          ownKeys(Object(source)).forEach(function(key) {
            Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
          });
        }
      }
      return target;
    }
    function _classCallCheck(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
      }
    }
    function _defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
      }
    }
    function _createClass(Constructor, protoProps, staticProps) {
      if (protoProps) _defineProperties(Constructor.prototype, protoProps);
      if (staticProps) _defineProperties(Constructor, staticProps);
      return Constructor;
    }
    function _inherits(subClass, superClass) {
      if (typeof superClass !== "function" && superClass !== null) {
        throw new TypeError("Super expression must either be null or a function");
      }
      subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } });
      if (superClass) _setPrototypeOf(subClass, superClass);
    }
    function _setPrototypeOf(o, p2) {
      _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf2(o2, p3) {
        o2.__proto__ = p3;
        return o2;
      };
      return _setPrototypeOf(o, p2);
    }
    function _createSuper(Derived) {
      var hasNativeReflectConstruct = _isNativeReflectConstruct();
      return function _createSuperInternal() {
        var Super = _getPrototypeOf(Derived), result;
        if (hasNativeReflectConstruct) {
          var NewTarget = _getPrototypeOf(this).constructor;
          result = Reflect.construct(Super, arguments, NewTarget);
        } else {
          result = Super.apply(this, arguments);
        }
        return _possibleConstructorReturn(this, result);
      };
    }
    function _possibleConstructorReturn(self2, call) {
      if (call && (_typeof(call) === "object" || typeof call === "function")) {
        return call;
      }
      return _assertThisInitialized(self2);
    }
    function _assertThisInitialized(self2) {
      if (self2 === void 0) {
        throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
      }
      return self2;
    }
    function _isNativeReflectConstruct() {
      if (typeof Reflect === "undefined" || !Reflect.construct) return false;
      if (Reflect.construct.sham) return false;
      if (typeof Proxy === "function") return true;
      try {
        Date.prototype.toString.call(Reflect.construct(Date, [], function() {
        }));
        return true;
      } catch (e) {
        return false;
      }
    }
    function _getPrototypeOf(o) {
      _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf2(o2) {
        return o2.__proto__ || Object.getPrototypeOf(o2);
      };
      return _getPrototypeOf(o);
    }
    function _defineProperty(obj, key, value) {
      if (key in obj) {
        Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writable: true });
      } else {
        obj[key] = value;
      }
      return obj;
    }
    var Carousel2 = /* @__PURE__ */ (function(_React$Component) {
      _inherits(Carousel3, _React$Component);
      var _super = _createSuper(Carousel3);
      function Carousel3(props) {
        var _this;
        _classCallCheck(this, Carousel3);
        _this = _super.call(this, props);
        _defineProperty(_assertThisInitialized(_this), "thumbsRef", void 0);
        _defineProperty(_assertThisInitialized(_this), "carouselWrapperRef", void 0);
        _defineProperty(_assertThisInitialized(_this), "listRef", void 0);
        _defineProperty(_assertThisInitialized(_this), "itemsRef", void 0);
        _defineProperty(_assertThisInitialized(_this), "timer", void 0);
        _defineProperty(_assertThisInitialized(_this), "animationHandler", void 0);
        _defineProperty(_assertThisInitialized(_this), "setThumbsRef", function(node) {
          _this.thumbsRef = node;
        });
        _defineProperty(_assertThisInitialized(_this), "setCarouselWrapperRef", function(node) {
          _this.carouselWrapperRef = node;
        });
        _defineProperty(_assertThisInitialized(_this), "setListRef", function(node) {
          _this.listRef = node;
        });
        _defineProperty(_assertThisInitialized(_this), "setItemsRef", function(node, index) {
          if (!_this.itemsRef) {
            _this.itemsRef = [];
          }
          _this.itemsRef[index] = node;
        });
        _defineProperty(_assertThisInitialized(_this), "autoPlay", function() {
          if (_react.Children.count(_this.props.children) <= 1) {
            return;
          }
          _this.clearAutoPlay();
          if (!_this.props.autoPlay) {
            return;
          }
          _this.timer = setTimeout(function() {
            _this.increment();
          }, _this.props.interval);
        });
        _defineProperty(_assertThisInitialized(_this), "clearAutoPlay", function() {
          if (_this.timer) clearTimeout(_this.timer);
        });
        _defineProperty(_assertThisInitialized(_this), "resetAutoPlay", function() {
          _this.clearAutoPlay();
          _this.autoPlay();
        });
        _defineProperty(_assertThisInitialized(_this), "stopOnHover", function() {
          _this.setState({
            isMouseEntered: true
          }, _this.clearAutoPlay);
        });
        _defineProperty(_assertThisInitialized(_this), "startOnLeave", function() {
          _this.setState({
            isMouseEntered: false
          }, _this.autoPlay);
        });
        _defineProperty(_assertThisInitialized(_this), "isFocusWithinTheCarousel", function() {
          if (!_this.carouselWrapperRef) {
            return false;
          }
          if ((0, _document.default)().activeElement === _this.carouselWrapperRef || _this.carouselWrapperRef.contains((0, _document.default)().activeElement)) {
            return true;
          }
          return false;
        });
        _defineProperty(_assertThisInitialized(_this), "navigateWithKeyboard", function(e) {
          if (!_this.isFocusWithinTheCarousel()) {
            return;
          }
          var axis = _this.props.axis;
          var isHorizontal = axis === "horizontal";
          var keyNames = {
            ArrowUp: 38,
            ArrowRight: 39,
            ArrowDown: 40,
            ArrowLeft: 37
          };
          var nextKey = isHorizontal ? keyNames.ArrowRight : keyNames.ArrowDown;
          var prevKey = isHorizontal ? keyNames.ArrowLeft : keyNames.ArrowUp;
          if (nextKey === e.keyCode) {
            _this.increment();
          } else if (prevKey === e.keyCode) {
            _this.decrement();
          }
        });
        _defineProperty(_assertThisInitialized(_this), "updateSizes", function() {
          if (!_this.state.initialized || !_this.itemsRef || _this.itemsRef.length === 0) {
            return;
          }
          var isHorizontal = _this.props.axis === "horizontal";
          var firstItem = _this.itemsRef[0];
          if (!firstItem) {
            return;
          }
          var itemSize = isHorizontal ? firstItem.clientWidth : firstItem.clientHeight;
          _this.setState({
            itemSize
          });
          if (_this.thumbsRef) {
            _this.thumbsRef.updateSizes();
          }
        });
        _defineProperty(_assertThisInitialized(_this), "setMountState", function() {
          _this.setState({
            hasMount: true
          });
          _this.updateSizes();
        });
        _defineProperty(_assertThisInitialized(_this), "handleClickItem", function(index, item) {
          if (_react.Children.count(_this.props.children) === 0) {
            return;
          }
          if (_this.state.cancelClick) {
            _this.setState({
              cancelClick: false
            });
            return;
          }
          _this.props.onClickItem(index, item);
          if (index !== _this.state.selectedItem) {
            _this.setState({
              selectedItem: index
            });
          }
        });
        _defineProperty(_assertThisInitialized(_this), "handleOnChange", function(index, item) {
          if (_react.Children.count(_this.props.children) <= 1) {
            return;
          }
          _this.props.onChange(index, item);
        });
        _defineProperty(_assertThisInitialized(_this), "handleClickThumb", function(index, item) {
          _this.props.onClickThumb(index, item);
          _this.moveTo(index);
        });
        _defineProperty(_assertThisInitialized(_this), "onSwipeStart", function(event) {
          _this.setState({
            swiping: true
          });
          _this.props.onSwipeStart(event);
        });
        _defineProperty(_assertThisInitialized(_this), "onSwipeEnd", function(event) {
          _this.setState({
            swiping: false,
            cancelClick: false,
            swipeMovementStarted: false
          });
          _this.props.onSwipeEnd(event);
          _this.clearAutoPlay();
          if (_this.state.autoPlay) {
            _this.autoPlay();
          }
        });
        _defineProperty(_assertThisInitialized(_this), "onSwipeMove", function(delta, event) {
          _this.props.onSwipeMove(event);
          var animationHandlerResponse = _this.props.swipeAnimationHandler(delta, _this.props, _this.state, _this.setState.bind(_assertThisInitialized(_this)));
          _this.setState(_objectSpread({}, animationHandlerResponse));
          return !!Object.keys(animationHandlerResponse).length;
        });
        _defineProperty(_assertThisInitialized(_this), "decrement", function() {
          var positions = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : 1;
          _this.moveTo(_this.state.selectedItem - (typeof positions === "number" ? positions : 1));
        });
        _defineProperty(_assertThisInitialized(_this), "increment", function() {
          var positions = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : 1;
          _this.moveTo(_this.state.selectedItem + (typeof positions === "number" ? positions : 1));
        });
        _defineProperty(_assertThisInitialized(_this), "moveTo", function(position) {
          if (typeof position !== "number") {
            return;
          }
          var lastPosition = _react.Children.count(_this.props.children) - 1;
          if (position < 0) {
            position = _this.props.infiniteLoop ? lastPosition : 0;
          }
          if (position > lastPosition) {
            position = _this.props.infiniteLoop ? 0 : lastPosition;
          }
          _this.selectItem({
            // if it's not a slider, we don't need to set position here
            selectedItem: position
          });
          if (_this.state.autoPlay && _this.state.isMouseEntered === false) {
            _this.resetAutoPlay();
          }
        });
        _defineProperty(_assertThisInitialized(_this), "onClickNext", function() {
          _this.increment(1);
        });
        _defineProperty(_assertThisInitialized(_this), "onClickPrev", function() {
          _this.decrement(1);
        });
        _defineProperty(_assertThisInitialized(_this), "onSwipeForward", function() {
          _this.increment(1);
          if (_this.props.emulateTouch) {
            _this.setState({
              cancelClick: true
            });
          }
        });
        _defineProperty(_assertThisInitialized(_this), "onSwipeBackwards", function() {
          _this.decrement(1);
          if (_this.props.emulateTouch) {
            _this.setState({
              cancelClick: true
            });
          }
        });
        _defineProperty(_assertThisInitialized(_this), "changeItem", function(newIndex) {
          return function(e) {
            if (!(0, _utils.isKeyboardEvent)(e) || e.key === "Enter") {
              _this.moveTo(newIndex);
            }
          };
        });
        _defineProperty(_assertThisInitialized(_this), "selectItem", function(state) {
          _this.setState(_objectSpread({
            previousItem: _this.state.selectedItem
          }, state), function() {
            _this.setState(_this.animationHandler(_this.props, _this.state));
          });
          _this.handleOnChange(state.selectedItem, _react.Children.toArray(_this.props.children)[state.selectedItem]);
        });
        _defineProperty(_assertThisInitialized(_this), "getInitialImage", function() {
          var selectedItem = _this.props.selectedItem;
          var item = _this.itemsRef && _this.itemsRef[selectedItem];
          var images = item && item.getElementsByTagName("img") || [];
          return images[0];
        });
        _defineProperty(_assertThisInitialized(_this), "getVariableItemHeight", function(position) {
          var item = _this.itemsRef && _this.itemsRef[position];
          if (_this.state.hasMount && item && item.children.length) {
            var slideImages = item.children[0].getElementsByTagName("img") || [];
            if (slideImages.length > 0) {
              var image = slideImages[0];
              if (!image.complete) {
                var onImageLoad = function onImageLoad2() {
                  _this.forceUpdate();
                  image.removeEventListener("load", onImageLoad2);
                };
                image.addEventListener("load", onImageLoad);
              }
            }
            var displayItem = slideImages[0] || item.children[0];
            var height = displayItem.clientHeight;
            return height > 0 ? height : null;
          }
          return null;
        });
        var initState = {
          initialized: false,
          previousItem: props.selectedItem,
          selectedItem: props.selectedItem,
          hasMount: false,
          isMouseEntered: false,
          autoPlay: props.autoPlay,
          swiping: false,
          swipeMovementStarted: false,
          cancelClick: false,
          itemSize: 1,
          itemListStyle: {},
          slideStyle: {},
          selectedStyle: {},
          prevStyle: {}
        };
        _this.animationHandler = typeof props.animationHandler === "function" && props.animationHandler || props.animationHandler === "fade" && _animations.fadeAnimationHandler || _animations.slideAnimationHandler;
        _this.state = _objectSpread(_objectSpread({}, initState), _this.animationHandler(props, initState));
        return _this;
      }
      _createClass(Carousel3, [{
        key: "componentDidMount",
        value: function componentDidMount() {
          if (!this.props.children) {
            return;
          }
          this.setupCarousel();
        }
      }, {
        key: "componentDidUpdate",
        value: function componentDidUpdate(prevProps, prevState) {
          if (!prevProps.children && this.props.children && !this.state.initialized) {
            this.setupCarousel();
          }
          if (!prevProps.autoFocus && this.props.autoFocus) {
            this.forceFocus();
          }
          if (prevState.swiping && !this.state.swiping) {
            this.setState(_objectSpread({}, this.props.stopSwipingHandler(this.props, this.state)));
          }
          if (prevProps.selectedItem !== this.props.selectedItem || prevProps.centerMode !== this.props.centerMode) {
            this.updateSizes();
            this.moveTo(this.props.selectedItem);
          }
          if (prevProps.autoPlay !== this.props.autoPlay) {
            if (this.props.autoPlay) {
              this.setupAutoPlay();
            } else {
              this.destroyAutoPlay();
            }
            this.setState({
              autoPlay: this.props.autoPlay
            });
          }
        }
      }, {
        key: "componentWillUnmount",
        value: function componentWillUnmount() {
          this.destroyCarousel();
        }
      }, {
        key: "setupCarousel",
        value: function setupCarousel() {
          var _this2 = this;
          this.bindEvents();
          if (this.state.autoPlay && _react.Children.count(this.props.children) > 1) {
            this.setupAutoPlay();
          }
          if (this.props.autoFocus) {
            this.forceFocus();
          }
          this.setState({
            initialized: true
          }, function() {
            var initialImage = _this2.getInitialImage();
            if (initialImage && !initialImage.complete) {
              initialImage.addEventListener("load", _this2.setMountState);
            } else {
              _this2.setMountState();
            }
          });
        }
      }, {
        key: "destroyCarousel",
        value: function destroyCarousel() {
          if (this.state.initialized) {
            this.unbindEvents();
            this.destroyAutoPlay();
          }
        }
      }, {
        key: "setupAutoPlay",
        value: function setupAutoPlay() {
          this.autoPlay();
          var carouselWrapper = this.carouselWrapperRef;
          if (this.props.stopOnHover && carouselWrapper) {
            carouselWrapper.addEventListener("mouseenter", this.stopOnHover);
            carouselWrapper.addEventListener("mouseleave", this.startOnLeave);
          }
        }
      }, {
        key: "destroyAutoPlay",
        value: function destroyAutoPlay() {
          this.clearAutoPlay();
          var carouselWrapper = this.carouselWrapperRef;
          if (this.props.stopOnHover && carouselWrapper) {
            carouselWrapper.removeEventListener("mouseenter", this.stopOnHover);
            carouselWrapper.removeEventListener("mouseleave", this.startOnLeave);
          }
        }
      }, {
        key: "bindEvents",
        value: function bindEvents() {
          (0, _window.default)().addEventListener("resize", this.updateSizes);
          (0, _window.default)().addEventListener("DOMContentLoaded", this.updateSizes);
          if (this.props.useKeyboardArrows) {
            (0, _document.default)().addEventListener("keydown", this.navigateWithKeyboard);
          }
        }
      }, {
        key: "unbindEvents",
        value: function unbindEvents() {
          (0, _window.default)().removeEventListener("resize", this.updateSizes);
          (0, _window.default)().removeEventListener("DOMContentLoaded", this.updateSizes);
          var initialImage = this.getInitialImage();
          if (initialImage) {
            initialImage.removeEventListener("load", this.setMountState);
          }
          if (this.props.useKeyboardArrows) {
            (0, _document.default)().removeEventListener("keydown", this.navigateWithKeyboard);
          }
        }
      }, {
        key: "forceFocus",
        value: function forceFocus() {
          var _this$carouselWrapper;
          (_this$carouselWrapper = this.carouselWrapperRef) === null || _this$carouselWrapper === void 0 ? void 0 : _this$carouselWrapper.focus();
        }
      }, {
        key: "renderItems",
        value: function renderItems(isClone) {
          var _this3 = this;
          if (!this.props.children) {
            return [];
          }
          return _react.Children.map(this.props.children, function(item, index) {
            var isSelected = index === _this3.state.selectedItem;
            var isPrevious = index === _this3.state.previousItem;
            var style = isSelected && _this3.state.selectedStyle || isPrevious && _this3.state.prevStyle || _this3.state.slideStyle || {};
            if (_this3.props.centerMode && _this3.props.axis === "horizontal") {
              style = _objectSpread(_objectSpread({}, style), {}, {
                minWidth: _this3.props.centerSlidePercentage + "%"
              });
            }
            if (_this3.state.swiping && _this3.state.swipeMovementStarted) {
              style = _objectSpread(_objectSpread({}, style), {}, {
                pointerEvents: "none"
              });
            }
            var slideProps = {
              ref: function ref(e) {
                return _this3.setItemsRef(e, index);
              },
              key: "itemKey" + index + (isClone ? "clone" : ""),
              className: _cssClasses.default.ITEM(true, index === _this3.state.selectedItem, index === _this3.state.previousItem),
              onClick: _this3.handleClickItem.bind(_this3, index, item),
              style
            };
            return /* @__PURE__ */ _react.default.createElement("li", slideProps, _this3.props.renderItem(item, {
              isSelected: index === _this3.state.selectedItem,
              isPrevious: index === _this3.state.previousItem
            }));
          });
        }
      }, {
        key: "renderControls",
        value: function renderControls() {
          var _this4 = this;
          var _this$props = this.props, showIndicators = _this$props.showIndicators, labels = _this$props.labels, renderIndicator = _this$props.renderIndicator, children = _this$props.children;
          if (!showIndicators) {
            return null;
          }
          return /* @__PURE__ */ _react.default.createElement("ul", {
            className: "control-dots"
          }, _react.Children.map(children, function(_3, index) {
            return renderIndicator && renderIndicator(_this4.changeItem(index), index === _this4.state.selectedItem, index, labels.item);
          }));
        }
      }, {
        key: "renderStatus",
        value: function renderStatus() {
          if (!this.props.showStatus) {
            return null;
          }
          return /* @__PURE__ */ _react.default.createElement("p", {
            className: "carousel-status"
          }, this.props.statusFormatter(this.state.selectedItem + 1, _react.Children.count(this.props.children)));
        }
      }, {
        key: "renderThumbs",
        value: function renderThumbs() {
          if (!this.props.showThumbs || !this.props.children || _react.Children.count(this.props.children) === 0) {
            return null;
          }
          return /* @__PURE__ */ _react.default.createElement(_Thumbs.default, {
            ref: this.setThumbsRef,
            onSelectItem: this.handleClickThumb,
            selectedItem: this.state.selectedItem,
            transitionTime: this.props.transitionTime,
            thumbWidth: this.props.thumbWidth,
            labels: this.props.labels,
            emulateTouch: this.props.emulateTouch
          }, this.props.renderThumbs(this.props.children));
        }
      }, {
        key: "render",
        value: function render() {
          var _this5 = this;
          if (!this.props.children || _react.Children.count(this.props.children) === 0) {
            return null;
          }
          var isSwipeable = this.props.swipeable && _react.Children.count(this.props.children) > 1;
          var isHorizontal = this.props.axis === "horizontal";
          var canShowArrows = this.props.showArrows && _react.Children.count(this.props.children) > 1;
          var hasPrev = canShowArrows && (this.state.selectedItem > 0 || this.props.infiniteLoop) || false;
          var hasNext = canShowArrows && (this.state.selectedItem < _react.Children.count(this.props.children) - 1 || this.props.infiniteLoop) || false;
          var itemsClone = this.renderItems(true);
          var firstClone = itemsClone.shift();
          var lastClone = itemsClone.pop();
          var swiperProps = {
            className: _cssClasses.default.SLIDER(true, this.state.swiping),
            onSwipeMove: this.onSwipeMove,
            onSwipeStart: this.onSwipeStart,
            onSwipeEnd: this.onSwipeEnd,
            style: this.state.itemListStyle,
            tolerance: this.props.swipeScrollTolerance
          };
          var containerStyles = {};
          if (isHorizontal) {
            swiperProps.onSwipeLeft = this.onSwipeForward;
            swiperProps.onSwipeRight = this.onSwipeBackwards;
            if (this.props.dynamicHeight) {
              var itemHeight = this.getVariableItemHeight(this.state.selectedItem);
              containerStyles.height = itemHeight || "auto";
            }
          } else {
            swiperProps.onSwipeUp = this.props.verticalSwipe === "natural" ? this.onSwipeBackwards : this.onSwipeForward;
            swiperProps.onSwipeDown = this.props.verticalSwipe === "natural" ? this.onSwipeForward : this.onSwipeBackwards;
            swiperProps.style = _objectSpread(_objectSpread({}, swiperProps.style), {}, {
              height: this.state.itemSize
            });
            containerStyles.height = this.state.itemSize;
          }
          return /* @__PURE__ */ _react.default.createElement("div", {
            "aria-label": this.props.ariaLabel,
            className: _cssClasses.default.ROOT(this.props.className),
            ref: this.setCarouselWrapperRef,
            tabIndex: this.props.useKeyboardArrows ? 0 : void 0
          }, /* @__PURE__ */ _react.default.createElement("div", {
            className: _cssClasses.default.CAROUSEL(true),
            style: {
              width: this.props.width
            }
          }, this.renderControls(), this.props.renderArrowPrev(this.onClickPrev, hasPrev, this.props.labels.leftArrow), /* @__PURE__ */ _react.default.createElement("div", {
            className: _cssClasses.default.WRAPPER(true, this.props.axis),
            style: containerStyles
          }, isSwipeable ? /* @__PURE__ */ _react.default.createElement(_reactEasySwipe.default, _extends({
            tagName: "ul",
            innerRef: this.setListRef
          }, swiperProps, {
            allowMouseEvents: this.props.emulateTouch
          }), this.props.infiniteLoop && lastClone, this.renderItems(), this.props.infiniteLoop && firstClone) : /* @__PURE__ */ _react.default.createElement("ul", {
            className: _cssClasses.default.SLIDER(true, this.state.swiping),
            ref: function ref(node) {
              return _this5.setListRef(node);
            },
            style: this.state.itemListStyle || {}
          }, this.props.infiniteLoop && lastClone, this.renderItems(), this.props.infiniteLoop && firstClone)), this.props.renderArrowNext(this.onClickNext, hasNext, this.props.labels.rightArrow), this.renderStatus()), this.renderThumbs());
        }
      }]);
      return Carousel3;
    })(_react.default.Component);
    exports.default = Carousel2;
    _defineProperty(Carousel2, "displayName", "Carousel");
    _defineProperty(Carousel2, "defaultProps", {
      ariaLabel: void 0,
      axis: "horizontal",
      centerSlidePercentage: 80,
      interval: 3e3,
      labels: {
        leftArrow: "previous slide / item",
        rightArrow: "next slide / item",
        item: "slide item"
      },
      onClickItem: _utils.noop,
      onClickThumb: _utils.noop,
      onChange: _utils.noop,
      onSwipeStart: function onSwipeStart() {
      },
      onSwipeEnd: function onSwipeEnd() {
      },
      onSwipeMove: function onSwipeMove() {
        return false;
      },
      preventMovementUntilSwipeScrollTolerance: false,
      renderArrowPrev: function renderArrowPrev(onClickHandler, hasPrev, label) {
        return /* @__PURE__ */ _react.default.createElement("button", {
          type: "button",
          "aria-label": label,
          className: _cssClasses.default.ARROW_PREV(!hasPrev),
          onClick: onClickHandler
        });
      },
      renderArrowNext: function renderArrowNext(onClickHandler, hasNext, label) {
        return /* @__PURE__ */ _react.default.createElement("button", {
          type: "button",
          "aria-label": label,
          className: _cssClasses.default.ARROW_NEXT(!hasNext),
          onClick: onClickHandler
        });
      },
      renderIndicator: function renderIndicator(onClickHandler, isSelected, index, label) {
        return /* @__PURE__ */ _react.default.createElement("li", {
          className: _cssClasses.default.DOT(isSelected),
          onClick: onClickHandler,
          onKeyDown: onClickHandler,
          value: index,
          key: index,
          role: "button",
          tabIndex: 0,
          "aria-label": "".concat(label, " ").concat(index + 1)
        });
      },
      renderItem: function renderItem(item) {
        return item;
      },
      renderThumbs: function renderThumbs(children) {
        var images = _react.Children.map(children, function(item) {
          var img = item;
          if (item.type !== "img") {
            img = _react.Children.toArray(item.props.children).find(function(children2) {
              return children2.type === "img";
            });
          }
          if (!img) {
            return void 0;
          }
          return img;
        });
        if (images.filter(function(image) {
          return image;
        }).length === 0) {
          console.warn("No images found! Can't build the thumb list without images. If you don't need thumbs, set showThumbs={false} in the Carousel. Note that it's not possible to get images rendered inside custom components. More info at https://github.com/leandrowd/react-responsive-carousel/blob/master/TROUBLESHOOTING.md");
          return [];
        }
        return images;
      },
      statusFormatter: _utils.defaultStatusFormatter,
      selectedItem: 0,
      showArrows: true,
      showIndicators: true,
      showStatus: true,
      showThumbs: true,
      stopOnHover: true,
      swipeScrollTolerance: 5,
      swipeable: true,
      transitionTime: 350,
      verticalSwipe: "standard",
      width: "100%",
      animationHandler: "slide",
      swipeAnimationHandler: _animations.slideSwipeAnimationHandler,
      stopSwipingHandler: _animations.slideStopSwipingHandler
    });
  }
});

// node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/components/Carousel/types.js
var require_types = __commonJS({
  "node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/components/Carousel/types.js"() {
    "use strict";
  }
});

// node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/index.js
var require_js = __commonJS({
  "node_modules/.pnpm/react-responsive-carousel@3.2.23/node_modules/react-responsive-carousel/lib/js/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    Object.defineProperty(exports, "Carousel", {
      enumerable: true,
      get: function get() {
        return _Carousel.default;
      }
    });
    Object.defineProperty(exports, "CarouselProps", {
      enumerable: true,
      get: function get() {
        return _types.CarouselProps;
      }
    });
    Object.defineProperty(exports, "Thumbs", {
      enumerable: true,
      get: function get() {
        return _Thumbs.default;
      }
    });
    var _Carousel = _interopRequireDefault(require_Carousel());
    var _types = require_types();
    var _Thumbs = _interopRequireDefault(require_Thumbs());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/now.js
var require_now = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/now.js"(exports, module) {
    var root = require_root();
    var now = function() {
      return root.Date.now();
    };
    module.exports = now;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_trimmedEndIndex.js
var require_trimmedEndIndex = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_trimmedEndIndex.js"(exports, module) {
    var reWhitespace = /\s/;
    function trimmedEndIndex(string) {
      var index = string.length;
      while (index-- && reWhitespace.test(string.charAt(index))) {
      }
      return index;
    }
    module.exports = trimmedEndIndex;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseTrim.js
var require_baseTrim = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseTrim.js"(exports, module) {
    var trimmedEndIndex = require_trimmedEndIndex();
    var reTrimStart = /^\s+/;
    function baseTrim(string) {
      return string ? string.slice(0, trimmedEndIndex(string) + 1).replace(reTrimStart, "") : string;
    }
    module.exports = baseTrim;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/toNumber.js
var require_toNumber = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/toNumber.js"(exports, module) {
    var baseTrim = require_baseTrim();
    var isObject = require_isObject();
    var isSymbol = require_isSymbol();
    var NAN = 0 / 0;
    var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
    var reIsBinary = /^0b[01]+$/i;
    var reIsOctal = /^0o[0-7]+$/i;
    var freeParseInt = parseInt;
    function toNumber(value) {
      if (typeof value == "number") {
        return value;
      }
      if (isSymbol(value)) {
        return NAN;
      }
      if (isObject(value)) {
        var other = typeof value.valueOf == "function" ? value.valueOf() : value;
        value = isObject(other) ? other + "" : other;
      }
      if (typeof value != "string") {
        return value === 0 ? value : +value;
      }
      value = baseTrim(value);
      var isBinary = reIsBinary.test(value);
      return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
    }
    module.exports = toNumber;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/debounce.js
var require_debounce = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/debounce.js"(exports, module) {
    var isObject = require_isObject();
    var now = require_now();
    var toNumber = require_toNumber();
    var FUNC_ERROR_TEXT = "Expected a function";
    var nativeMax = Math.max;
    var nativeMin = Math.min;
    function debounce3(func, wait, options) {
      var lastArgs, lastThis, maxWait, result, timerId, lastCallTime, lastInvokeTime = 0, leading = false, maxing = false, trailing = true;
      if (typeof func != "function") {
        throw new TypeError(FUNC_ERROR_TEXT);
      }
      wait = toNumber(wait) || 0;
      if (isObject(options)) {
        leading = !!options.leading;
        maxing = "maxWait" in options;
        maxWait = maxing ? nativeMax(toNumber(options.maxWait) || 0, wait) : maxWait;
        trailing = "trailing" in options ? !!options.trailing : trailing;
      }
      function invokeFunc(time) {
        var args = lastArgs, thisArg = lastThis;
        lastArgs = lastThis = void 0;
        lastInvokeTime = time;
        result = func.apply(thisArg, args);
        return result;
      }
      function leadingEdge(time) {
        lastInvokeTime = time;
        timerId = setTimeout(timerExpired, wait);
        return leading ? invokeFunc(time) : result;
      }
      function remainingWait(time) {
        var timeSinceLastCall = time - lastCallTime, timeSinceLastInvoke = time - lastInvokeTime, timeWaiting = wait - timeSinceLastCall;
        return maxing ? nativeMin(timeWaiting, maxWait - timeSinceLastInvoke) : timeWaiting;
      }
      function shouldInvoke(time) {
        var timeSinceLastCall = time - lastCallTime, timeSinceLastInvoke = time - lastInvokeTime;
        return lastCallTime === void 0 || timeSinceLastCall >= wait || timeSinceLastCall < 0 || maxing && timeSinceLastInvoke >= maxWait;
      }
      function timerExpired() {
        var time = now();
        if (shouldInvoke(time)) {
          return trailingEdge(time);
        }
        timerId = setTimeout(timerExpired, remainingWait(time));
      }
      function trailingEdge(time) {
        timerId = void 0;
        if (trailing && lastArgs) {
          return invokeFunc(time);
        }
        lastArgs = lastThis = void 0;
        return result;
      }
      function cancel() {
        if (timerId !== void 0) {
          clearTimeout(timerId);
        }
        lastInvokeTime = 0;
        lastArgs = lastCallTime = lastThis = timerId = void 0;
      }
      function flush() {
        return timerId === void 0 ? result : trailingEdge(now());
      }
      function debounced() {
        var time = now(), isInvoking = shouldInvoke(time);
        lastArgs = arguments;
        lastThis = this;
        lastCallTime = time;
        if (isInvoking) {
          if (timerId === void 0) {
            return leadingEdge(lastCallTime);
          }
          if (maxing) {
            clearTimeout(timerId);
            timerId = setTimeout(timerExpired, wait);
            return invokeFunc(lastCallTime);
          }
        }
        if (timerId === void 0) {
          timerId = setTimeout(timerExpired, wait);
        }
        return result;
      }
      debounced.cancel = cancel;
      debounced.flush = flush;
      return debounced;
    }
    module.exports = debounce3;
  }
});

// vendor/glide-data-grid/dist/esm/internal/data-grid/color-parser.js
function createDiv() {
  const d3 = document.createElement("div");
  d3.style.opacity = "0";
  d3.style.pointerEvents = "none";
  d3.style.position = "fixed";
  document.body.append(d3);
  return d3;
}
function parseToRgba(color) {
  const normalizedColor = color.toLowerCase().trim();
  if (cache[normalizedColor] !== void 0)
    return cache[normalizedColor];
  div = div || createDiv();
  div.style.color = "#000";
  div.style.color = normalizedColor;
  const control = getComputedStyle(div).color;
  div.style.color = "#fff";
  div.style.color = normalizedColor;
  const computedColor = getComputedStyle(div).color;
  if (computedColor !== control)
    return [0, 0, 0, 1];
  let result = computedColor.replace(/[^\d.,]/g, "").split(",").map(Number.parseFloat);
  if (result.length < 4) {
    result.push(1);
  }
  result = result.map((x2) => {
    const isNaN2 = Number.isNaN(x2);
    if (isNaN2) {
      console.warn("Could not parse color", color);
    }
    return isNaN2 ? 0 : x2;
  });
  cache[normalizedColor] = result;
  return result;
}
function withAlpha(color, alpha) {
  const [r, g, b3] = parseToRgba(color);
  return `rgba(${r}, ${g}, ${b3}, ${alpha})`;
}
function blendCache(color, background) {
  const cacheKey = `${color}-${background}`;
  const maybe2 = blendResultCache.get(cacheKey);
  if (maybe2 !== void 0)
    return maybe2;
  const result = blend(color, background);
  blendResultCache.set(cacheKey, result);
  return result;
}
function blend(color, background) {
  if (background === void 0)
    return color;
  const [r, g, b3, a] = parseToRgba(color);
  if (a === 1)
    return color;
  const [br, bg, bb, ba] = parseToRgba(background);
  const ao = a + ba * (1 - a);
  const ro = (a * r + ba * br * (1 - a)) / ao;
  const go = (a * g + ba * bg * (1 - a)) / ao;
  const bo = (a * b3 + ba * bb * (1 - a)) / ao;
  return `rgba(${ro}, ${go}, ${bo}, ${ao})`;
}
function interpolateColors(leftColor, rightColor, val) {
  if (val <= 0)
    return leftColor;
  if (val >= 1)
    return rightColor;
  const [lr, lg, lb, la] = parseToRgba(leftColor);
  const [rr, rg, rb, ra] = parseToRgba(rightColor);
  const leftR = lr * la;
  const leftG = lg * la;
  const leftB = lb * la;
  const rightR = rr * ra;
  const rightG = rg * ra;
  const rightB = rb * ra;
  const hScaler = val;
  const nScaler = 1 - val;
  const a = la * nScaler + ra * hScaler;
  if (a === 0)
    return "rgba(0, 0, 0, 0)";
  const r = Math.floor((leftR * nScaler + rightR * hScaler) / a);
  const g = Math.floor((leftG * nScaler + rightG * hScaler) / a);
  const b3 = Math.floor((leftB * nScaler + rightB * hScaler) / a);
  return `rgba(${r}, ${g}, ${b3}, ${a})`;
}
function getLuminance(color) {
  if (color === "transparent")
    return 0;
  function f(x2) {
    const channel = x2 / 255;
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  }
  const [r, g, b3] = parseToRgba(color);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b3);
}
var cache, div, blendResultCache;
var init_color_parser = __esm({
  "vendor/glide-data-grid/dist/esm/internal/data-grid/color-parser.js"() {
    cache = {};
    div = null;
    blendResultCache = /* @__PURE__ */ new Map();
  }
});

// vendor/glide-data-grid/dist/esm/common/styles.js
import React6 from "react";
function makeCSSStyle(theme) {
  return {
    "--gdg-accent-color": theme.accentColor,
    "--gdg-accent-fg": theme.accentFg,
    "--gdg-accent-light": theme.accentLight,
    "--gdg-text-dark": theme.textDark,
    "--gdg-text-medium": theme.textMedium,
    "--gdg-text-light": theme.textLight,
    "--gdg-text-bubble": theme.textBubble,
    "--gdg-bg-icon-header": theme.bgIconHeader,
    "--gdg-fg-icon-header": theme.fgIconHeader,
    "--gdg-text-header": theme.textHeader,
    "--gdg-text-group-header": theme.textGroupHeader ?? theme.textHeader,
    "--gdg-bg-group-header": theme.bgGroupHeader ?? theme.bgHeader,
    "--gdg-bg-group-header-hovered": theme.bgGroupHeaderHovered ?? theme.bgHeaderHovered,
    "--gdg-text-header-selected": theme.textHeaderSelected,
    "--gdg-bg-cell": theme.bgCell,
    "--gdg-bg-cell-medium": theme.bgCellMedium,
    "--gdg-bg-header": theme.bgHeader,
    "--gdg-bg-header-has-focus": theme.bgHeaderHasFocus,
    "--gdg-bg-header-hovered": theme.bgHeaderHovered,
    "--gdg-bg-bubble": theme.bgBubble,
    "--gdg-bg-bubble-selected": theme.bgBubbleSelected,
    "--gdg-bubble-height": `${theme.bubbleHeight}px`,
    "--gdg-bubble-padding": `${theme.bubblePadding}px`,
    "--gdg-bubble-margin": `${theme.bubbleMargin}px`,
    "--gdg-bg-search-result": theme.bgSearchResult,
    "--gdg-border-color": theme.borderColor,
    "--gdg-horizontal-border-color": theme.horizontalBorderColor ?? theme.borderColor,
    "--gdg-drilldown-border": theme.drilldownBorder,
    "--gdg-link-color": theme.linkColor,
    "--gdg-cell-horizontal-padding": `${theme.cellHorizontalPadding}px`,
    "--gdg-cell-vertical-padding": `${theme.cellVerticalPadding}px`,
    "--gdg-header-font-style": theme.headerFontStyle,
    "--gdg-base-font-style": theme.baseFontStyle,
    "--gdg-marker-font-style": theme.markerFontStyle,
    "--gdg-font-family": theme.fontFamily,
    "--gdg-editor-font-size": theme.editorFontSize,
    "--gdg-checkbox-max-size": `${theme.checkboxMaxSize}px`,
    ...theme.resizeIndicatorColor === void 0 ? {} : { "--gdg-resize-indicator-color": theme.resizeIndicatorColor },
    ...theme.headerBottomBorderColor === void 0 ? {} : { "--gdg-header-bottom-border-color": theme.headerBottomBorderColor },
    ...theme.roundingRadius === void 0 ? {} : { "--gdg-rounding-radius": `${theme.roundingRadius}px` }
  };
}
function getDataEditorTheme() {
  return dataEditorBaseTheme;
}
function useTheme() {
  return React6.useContext(ThemeContext);
}
function mergeAndRealizeTheme(theme, ...overlays) {
  const merged = { ...theme };
  for (const overlay of overlays) {
    if (overlay !== void 0) {
      for (const key in overlay) {
        if (overlay.hasOwnProperty(key)) {
          if (key === "bgCell") {
            merged[key] = blend(overlay[key], merged[key]);
          } else {
            merged[key] = overlay[key];
          }
        }
      }
    }
  }
  if (merged.headerFontFull === void 0 || theme.fontFamily !== merged.fontFamily || theme.headerFontStyle !== merged.headerFontStyle) {
    merged.headerFontFull = `${merged.headerFontStyle} ${merged.fontFamily}`;
  }
  if (merged.baseFontFull === void 0 || theme.fontFamily !== merged.fontFamily || theme.baseFontStyle !== merged.baseFontStyle) {
    merged.baseFontFull = `${merged.baseFontStyle} ${merged.fontFamily}`;
  }
  if (merged.markerFontFull === void 0 || theme.fontFamily !== merged.fontFamily || theme.markerFontStyle !== merged.markerFontStyle) {
    merged.markerFontFull = `${merged.markerFontStyle} ${merged.fontFamily}`;
  }
  return merged;
}
var dataEditorBaseTheme, ThemeContext;
var init_styles = __esm({
  "vendor/glide-data-grid/dist/esm/common/styles.js"() {
    init_color_parser();
    dataEditorBaseTheme = {
      accentColor: "#4F5DFF",
      accentFg: "#FFFFFF",
      accentLight: "rgba(62, 116, 253, 0.1)",
      textDark: "#313139",
      textMedium: "#737383",
      textLight: "#B2B2C0",
      textBubble: "#313139",
      bgIconHeader: "#737383",
      fgIconHeader: "#FFFFFF",
      textHeader: "#313139",
      textGroupHeader: "#313139BB",
      textHeaderSelected: "#FFFFFF",
      bgCell: "#FFFFFF",
      bgCellMedium: "#FAFAFB",
      bgHeader: "#F7F7F8",
      bgHeaderHasFocus: "#E9E9EB",
      bgHeaderHovered: "#EFEFF1",
      bgBubble: "#EDEDF3",
      bgBubbleSelected: "#FFFFFF",
      bubbleHeight: 20,
      bubblePadding: 6,
      bubbleMargin: 4,
      bgSearchResult: "#fff9e3",
      borderColor: "rgba(115, 116, 131, 0.16)",
      drilldownBorder: "rgba(0, 0, 0, 0)",
      linkColor: "#353fb5",
      cellHorizontalPadding: 8,
      cellVerticalPadding: 3,
      headerIconSize: 18,
      headerFontStyle: "600 13px",
      baseFontStyle: "13px",
      markerFontStyle: "9px",
      fontFamily: "Inter, Roboto, -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Ubuntu, noto, arial, sans-serif",
      editorFontSize: "13px",
      lineHeight: 1.4,
      //unitless scaler depends on your font
      checkboxMaxSize: 18
    };
    ThemeContext = React6.createContext(dataEditorBaseTheme);
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseClamp.js
var require_baseClamp = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseClamp.js"(exports, module) {
    function baseClamp(number, lower, upper) {
      if (number === number) {
        if (upper !== void 0) {
          number = number <= upper ? number : upper;
        }
        if (lower !== void 0) {
          number = number >= lower ? number : lower;
        }
      }
      return number;
    }
    module.exports = baseClamp;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/clamp.js
var require_clamp = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/clamp.js"(exports, module) {
    var baseClamp = require_baseClamp();
    var toNumber = require_toNumber();
    function clamp6(number, lower, upper) {
      if (upper === void 0) {
        upper = lower;
        lower = void 0;
      }
      if (upper !== void 0) {
        upper = toNumber(upper);
        upper = upper === upper ? upper : 0;
      }
      if (lower !== void 0) {
        lower = toNumber(lower);
        lower = lower === lower ? lower : 0;
      }
      return baseClamp(toNumber(number), lower, upper);
    }
    module.exports = clamp6;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_setCacheAdd.js
var require_setCacheAdd = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_setCacheAdd.js"(exports, module) {
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    function setCacheAdd(value) {
      this.__data__.set(value, HASH_UNDEFINED);
      return this;
    }
    module.exports = setCacheAdd;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_setCacheHas.js
var require_setCacheHas = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_setCacheHas.js"(exports, module) {
    function setCacheHas(value) {
      return this.__data__.has(value);
    }
    module.exports = setCacheHas;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_SetCache.js
var require_SetCache = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_SetCache.js"(exports, module) {
    var MapCache = require_MapCache();
    var setCacheAdd = require_setCacheAdd();
    var setCacheHas = require_setCacheHas();
    function SetCache(values) {
      var index = -1, length = values == null ? 0 : values.length;
      this.__data__ = new MapCache();
      while (++index < length) {
        this.add(values[index]);
      }
    }
    SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
    SetCache.prototype.has = setCacheHas;
    module.exports = SetCache;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseFindIndex.js
var require_baseFindIndex = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseFindIndex.js"(exports, module) {
    function baseFindIndex(array, predicate, fromIndex, fromRight) {
      var length = array.length, index = fromIndex + (fromRight ? 1 : -1);
      while (fromRight ? index-- : ++index < length) {
        if (predicate(array[index], index, array)) {
          return index;
        }
      }
      return -1;
    }
    module.exports = baseFindIndex;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIsNaN.js
var require_baseIsNaN = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIsNaN.js"(exports, module) {
    function baseIsNaN(value) {
      return value !== value;
    }
    module.exports = baseIsNaN;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_strictIndexOf.js
var require_strictIndexOf = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_strictIndexOf.js"(exports, module) {
    function strictIndexOf(array, value, fromIndex) {
      var index = fromIndex - 1, length = array.length;
      while (++index < length) {
        if (array[index] === value) {
          return index;
        }
      }
      return -1;
    }
    module.exports = strictIndexOf;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIndexOf.js
var require_baseIndexOf = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIndexOf.js"(exports, module) {
    var baseFindIndex = require_baseFindIndex();
    var baseIsNaN = require_baseIsNaN();
    var strictIndexOf = require_strictIndexOf();
    function baseIndexOf(array, value, fromIndex) {
      return value === value ? strictIndexOf(array, value, fromIndex) : baseFindIndex(array, baseIsNaN, fromIndex);
    }
    module.exports = baseIndexOf;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arrayIncludes.js
var require_arrayIncludes = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arrayIncludes.js"(exports, module) {
    var baseIndexOf = require_baseIndexOf();
    function arrayIncludes(array, value) {
      var length = array == null ? 0 : array.length;
      return !!length && baseIndexOf(array, value, 0) > -1;
    }
    module.exports = arrayIncludes;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arrayIncludesWith.js
var require_arrayIncludesWith = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arrayIncludesWith.js"(exports, module) {
    function arrayIncludesWith(array, value, comparator) {
      var index = -1, length = array == null ? 0 : array.length;
      while (++index < length) {
        if (comparator(value, array[index])) {
          return true;
        }
      }
      return false;
    }
    module.exports = arrayIncludesWith;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_cacheHas.js
var require_cacheHas = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_cacheHas.js"(exports, module) {
    function cacheHas(cache2, key) {
      return cache2.has(key);
    }
    module.exports = cacheHas;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_Set.js
var require_Set = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_Set.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var Set2 = getNative(root, "Set");
    module.exports = Set2;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/noop.js
var require_noop = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/noop.js"(exports, module) {
    function noop2() {
    }
    module.exports = noop2;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_setToArray.js
var require_setToArray = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_setToArray.js"(exports, module) {
    function setToArray(set) {
      var index = -1, result = Array(set.size);
      set.forEach(function(value) {
        result[++index] = value;
      });
      return result;
    }
    module.exports = setToArray;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_createSet.js
var require_createSet = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_createSet.js"(exports, module) {
    var Set2 = require_Set();
    var noop2 = require_noop();
    var setToArray = require_setToArray();
    var INFINITY = 1 / 0;
    var createSet = !(Set2 && 1 / setToArray(new Set2([, -0]))[1] == INFINITY) ? noop2 : function(values) {
      return new Set2(values);
    };
    module.exports = createSet;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseUniq.js
var require_baseUniq = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseUniq.js"(exports, module) {
    var SetCache = require_SetCache();
    var arrayIncludes = require_arrayIncludes();
    var arrayIncludesWith = require_arrayIncludesWith();
    var cacheHas = require_cacheHas();
    var createSet = require_createSet();
    var setToArray = require_setToArray();
    var LARGE_ARRAY_SIZE = 200;
    function baseUniq(array, iteratee, comparator) {
      var index = -1, includes = arrayIncludes, length = array.length, isCommon = true, result = [], seen = result;
      if (comparator) {
        isCommon = false;
        includes = arrayIncludesWith;
      } else if (length >= LARGE_ARRAY_SIZE) {
        var set = iteratee ? null : createSet(array);
        if (set) {
          return setToArray(set);
        }
        isCommon = false;
        includes = cacheHas;
        seen = new SetCache();
      } else {
        seen = iteratee ? [] : result;
      }
      outer:
        while (++index < length) {
          var value = array[index], computed = iteratee ? iteratee(value) : value;
          value = comparator || value !== 0 ? value : 0;
          if (isCommon && computed === computed) {
            var seenIndex = seen.length;
            while (seenIndex--) {
              if (seen[seenIndex] === computed) {
                continue outer;
              }
            }
            if (iteratee) {
              seen.push(computed);
            }
            result.push(value);
          } else if (!includes(seen, computed, comparator)) {
            if (seen !== result) {
              seen.push(computed);
            }
            result.push(value);
          }
        }
      return result;
    }
    module.exports = baseUniq;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/uniq.js
var require_uniq = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/uniq.js"(exports, module) {
    var baseUniq = require_baseUniq();
    function uniq2(array) {
      return array && array.length ? baseUniq(array) : [];
    }
    module.exports = uniq2;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arrayPush.js
var require_arrayPush = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arrayPush.js"(exports, module) {
    function arrayPush(array, values) {
      var index = -1, length = values.length, offset = array.length;
      while (++index < length) {
        array[offset + index] = values[index];
      }
      return array;
    }
    module.exports = arrayPush;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isFlattenable.js
var require_isFlattenable = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isFlattenable.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var isArguments = require_isArguments();
    var isArray = require_isArray();
    var spreadableSymbol = Symbol2 ? Symbol2.isConcatSpreadable : void 0;
    function isFlattenable(value) {
      return isArray(value) || isArguments(value) || !!(spreadableSymbol && value && value[spreadableSymbol]);
    }
    module.exports = isFlattenable;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseFlatten.js
var require_baseFlatten = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseFlatten.js"(exports, module) {
    var arrayPush = require_arrayPush();
    var isFlattenable = require_isFlattenable();
    function baseFlatten(array, depth, predicate, isStrict, result) {
      var index = -1, length = array.length;
      predicate || (predicate = isFlattenable);
      result || (result = []);
      while (++index < length) {
        var value = array[index];
        if (depth > 0 && predicate(value)) {
          if (depth > 1) {
            baseFlatten(value, depth - 1, predicate, isStrict, result);
          } else {
            arrayPush(result, value);
          }
        } else if (!isStrict) {
          result[result.length] = value;
        }
      }
      return result;
    }
    module.exports = baseFlatten;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/flatten.js
var require_flatten = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/flatten.js"(exports, module) {
    var baseFlatten = require_baseFlatten();
    function flatten2(array) {
      var length = array == null ? 0 : array.length;
      return length ? baseFlatten(array, 1) : [];
    }
    module.exports = flatten2;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseRange.js
var require_baseRange = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseRange.js"(exports, module) {
    var nativeCeil = Math.ceil;
    var nativeMax = Math.max;
    function baseRange(start, end, step, fromRight) {
      var index = -1, length = nativeMax(nativeCeil((end - start) / (step || 1)), 0), result = Array(length);
      while (length--) {
        result[fromRight ? length : ++index] = start;
        start += step;
      }
      return result;
    }
    module.exports = baseRange;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isArrayLike.js
var require_isArrayLike = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isArrayLike.js"(exports, module) {
    var isFunction = require_isFunction();
    var isLength = require_isLength();
    function isArrayLike(value) {
      return value != null && isLength(value.length) && !isFunction(value);
    }
    module.exports = isArrayLike;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isIterateeCall.js
var require_isIterateeCall = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isIterateeCall.js"(exports, module) {
    var eq = require_eq();
    var isArrayLike = require_isArrayLike();
    var isIndex = require_isIndex();
    var isObject = require_isObject();
    function isIterateeCall(value, index, object) {
      if (!isObject(object)) {
        return false;
      }
      var type = typeof index;
      if (type == "number" ? isArrayLike(object) && isIndex(index, object.length) : type == "string" && index in object) {
        return eq(object[index], value);
      }
      return false;
    }
    module.exports = isIterateeCall;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/toFinite.js
var require_toFinite = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/toFinite.js"(exports, module) {
    var toNumber = require_toNumber();
    var INFINITY = 1 / 0;
    var MAX_INTEGER = 17976931348623157e292;
    function toFinite(value) {
      if (!value) {
        return value === 0 ? value : 0;
      }
      value = toNumber(value);
      if (value === INFINITY || value === -INFINITY) {
        var sign = value < 0 ? -1 : 1;
        return sign * MAX_INTEGER;
      }
      return value === value ? value : 0;
    }
    module.exports = toFinite;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_createRange.js
var require_createRange = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_createRange.js"(exports, module) {
    var baseRange = require_baseRange();
    var isIterateeCall = require_isIterateeCall();
    var toFinite = require_toFinite();
    function createRange(fromRight) {
      return function(start, end, step) {
        if (step && typeof step != "number" && isIterateeCall(start, end, step)) {
          end = step = void 0;
        }
        start = toFinite(start);
        if (end === void 0) {
          end = start;
          start = 0;
        } else {
          end = toFinite(end);
        }
        step = step === void 0 ? start < end ? 1 : -1 : toFinite(step);
        return baseRange(start, end, step, fromRight);
      };
    }
    module.exports = createRange;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/range.js
var require_range = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/range.js"(exports, module) {
    var createRange = require_createRange();
    var range2 = createRange();
    module.exports = range2;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_defineProperty.js
var require_defineProperty = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_defineProperty.js"(exports, module) {
    var getNative = require_getNative();
    var defineProperty = (function() {
      try {
        var func = getNative(Object, "defineProperty");
        func({}, "", {});
        return func;
      } catch (e) {
      }
    })();
    module.exports = defineProperty;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseAssignValue.js
var require_baseAssignValue = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseAssignValue.js"(exports, module) {
    var defineProperty = require_defineProperty();
    function baseAssignValue(object, key, value) {
      if (key == "__proto__" && defineProperty) {
        defineProperty(object, key, {
          "configurable": true,
          "enumerable": true,
          "value": value,
          "writable": true
        });
      } else {
        object[key] = value;
      }
    }
    module.exports = baseAssignValue;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arrayAggregator.js
var require_arrayAggregator = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arrayAggregator.js"(exports, module) {
    function arrayAggregator(array, setter, iteratee, accumulator) {
      var index = -1, length = array == null ? 0 : array.length;
      while (++index < length) {
        var value = array[index];
        setter(accumulator, value, iteratee(value), array);
      }
      return accumulator;
    }
    module.exports = arrayAggregator;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_createBaseFor.js
var require_createBaseFor = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_createBaseFor.js"(exports, module) {
    function createBaseFor(fromRight) {
      return function(object, iteratee, keysFunc) {
        var index = -1, iterable = Object(object), props = keysFunc(object), length = props.length;
        while (length--) {
          var key = props[fromRight ? length : ++index];
          if (iteratee(iterable[key], key, iterable) === false) {
            break;
          }
        }
        return object;
      };
    }
    module.exports = createBaseFor;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseFor.js
var require_baseFor = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseFor.js"(exports, module) {
    var createBaseFor = require_createBaseFor();
    var baseFor = createBaseFor();
    module.exports = baseFor;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseTimes.js
var require_baseTimes = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseTimes.js"(exports, module) {
    function baseTimes(n, iteratee) {
      var index = -1, result = Array(n);
      while (++index < n) {
        result[index] = iteratee(index);
      }
      return result;
    }
    module.exports = baseTimes;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/stubFalse.js
var require_stubFalse = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/stubFalse.js"(exports, module) {
    function stubFalse() {
      return false;
    }
    module.exports = stubFalse;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isBuffer.js
var require_isBuffer = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isBuffer.js"(exports, module) {
    var root = require_root();
    var stubFalse = require_stubFalse();
    var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
    var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var Buffer2 = moduleExports ? root.Buffer : void 0;
    var nativeIsBuffer = Buffer2 ? Buffer2.isBuffer : void 0;
    var isBuffer = nativeIsBuffer || stubFalse;
    module.exports = isBuffer;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIsTypedArray.js
var require_baseIsTypedArray = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIsTypedArray.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isLength = require_isLength();
    var isObjectLike = require_isObjectLike();
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var funcTag = "[object Function]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var objectTag = "[object Object]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var weakMapTag = "[object WeakMap]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var float32Tag = "[object Float32Array]";
    var float64Tag = "[object Float64Array]";
    var int8Tag = "[object Int8Array]";
    var int16Tag = "[object Int16Array]";
    var int32Tag = "[object Int32Array]";
    var uint8Tag = "[object Uint8Array]";
    var uint8ClampedTag = "[object Uint8ClampedArray]";
    var uint16Tag = "[object Uint16Array]";
    var uint32Tag = "[object Uint32Array]";
    var typedArrayTags = {};
    typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
    typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dataViewTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
    function baseIsTypedArray(value) {
      return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
    }
    module.exports = baseIsTypedArray;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseUnary.js
var require_baseUnary = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseUnary.js"(exports, module) {
    function baseUnary(func) {
      return function(value) {
        return func(value);
      };
    }
    module.exports = baseUnary;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_nodeUtil.js
var require_nodeUtil = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_nodeUtil.js"(exports, module) {
    var freeGlobal = require_freeGlobal();
    var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
    var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var freeProcess = moduleExports && freeGlobal.process;
    var nodeUtil = (function() {
      try {
        var types = freeModule && freeModule.require && freeModule.require("util").types;
        if (types) {
          return types;
        }
        return freeProcess && freeProcess.binding && freeProcess.binding("util");
      } catch (e) {
      }
    })();
    module.exports = nodeUtil;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isTypedArray.js
var require_isTypedArray = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/isTypedArray.js"(exports, module) {
    var baseIsTypedArray = require_baseIsTypedArray();
    var baseUnary = require_baseUnary();
    var nodeUtil = require_nodeUtil();
    var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;
    var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;
    module.exports = isTypedArray;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arrayLikeKeys.js
var require_arrayLikeKeys = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arrayLikeKeys.js"(exports, module) {
    var baseTimes = require_baseTimes();
    var isArguments = require_isArguments();
    var isArray = require_isArray();
    var isBuffer = require_isBuffer();
    var isIndex = require_isIndex();
    var isTypedArray = require_isTypedArray();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function arrayLikeKeys(value, inherited) {
      var isArr = isArray(value), isArg = !isArr && isArguments(value), isBuff = !isArr && !isArg && isBuffer(value), isType = !isArr && !isArg && !isBuff && isTypedArray(value), skipIndexes = isArr || isArg || isBuff || isType, result = skipIndexes ? baseTimes(value.length, String) : [], length = result.length;
      for (var key in value) {
        if ((inherited || hasOwnProperty.call(value, key)) && !(skipIndexes && // Safari 9 has enumerable `arguments.length` in strict mode.
        (key == "length" || // Node.js 0.10 has enumerable non-index properties on buffers.
        isBuff && (key == "offset" || key == "parent") || // PhantomJS 2 has enumerable non-index properties on typed arrays.
        isType && (key == "buffer" || key == "byteLength" || key == "byteOffset") || // Skip index properties.
        isIndex(key, length)))) {
          result.push(key);
        }
      }
      return result;
    }
    module.exports = arrayLikeKeys;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isPrototype.js
var require_isPrototype = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isPrototype.js"(exports, module) {
    var objectProto = Object.prototype;
    function isPrototype(value) {
      var Ctor = value && value.constructor, proto = typeof Ctor == "function" && Ctor.prototype || objectProto;
      return value === proto;
    }
    module.exports = isPrototype;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_overArg.js
var require_overArg = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_overArg.js"(exports, module) {
    function overArg(func, transform) {
      return function(arg) {
        return func(transform(arg));
      };
    }
    module.exports = overArg;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_nativeKeys.js
var require_nativeKeys = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_nativeKeys.js"(exports, module) {
    var overArg = require_overArg();
    var nativeKeys = overArg(Object.keys, Object);
    module.exports = nativeKeys;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseKeys.js
var require_baseKeys = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseKeys.js"(exports, module) {
    var isPrototype = require_isPrototype();
    var nativeKeys = require_nativeKeys();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function baseKeys(object) {
      if (!isPrototype(object)) {
        return nativeKeys(object);
      }
      var result = [];
      for (var key in Object(object)) {
        if (hasOwnProperty.call(object, key) && key != "constructor") {
          result.push(key);
        }
      }
      return result;
    }
    module.exports = baseKeys;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/keys.js
var require_keys = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/keys.js"(exports, module) {
    var arrayLikeKeys = require_arrayLikeKeys();
    var baseKeys = require_baseKeys();
    var isArrayLike = require_isArrayLike();
    function keys(object) {
      return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
    }
    module.exports = keys;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseForOwn.js
var require_baseForOwn = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseForOwn.js"(exports, module) {
    var baseFor = require_baseFor();
    var keys = require_keys();
    function baseForOwn(object, iteratee) {
      return object && baseFor(object, iteratee, keys);
    }
    module.exports = baseForOwn;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_createBaseEach.js
var require_createBaseEach = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_createBaseEach.js"(exports, module) {
    var isArrayLike = require_isArrayLike();
    function createBaseEach(eachFunc, fromRight) {
      return function(collection, iteratee) {
        if (collection == null) {
          return collection;
        }
        if (!isArrayLike(collection)) {
          return eachFunc(collection, iteratee);
        }
        var length = collection.length, index = fromRight ? length : -1, iterable = Object(collection);
        while (fromRight ? index-- : ++index < length) {
          if (iteratee(iterable[index], index, iterable) === false) {
            break;
          }
        }
        return collection;
      };
    }
    module.exports = createBaseEach;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseEach.js
var require_baseEach = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseEach.js"(exports, module) {
    var baseForOwn = require_baseForOwn();
    var createBaseEach = require_createBaseEach();
    var baseEach = createBaseEach(baseForOwn);
    module.exports = baseEach;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseAggregator.js
var require_baseAggregator = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseAggregator.js"(exports, module) {
    var baseEach = require_baseEach();
    function baseAggregator(collection, setter, iteratee, accumulator) {
      baseEach(collection, function(value, key, collection2) {
        setter(accumulator, value, iteratee(value), collection2);
      });
      return accumulator;
    }
    module.exports = baseAggregator;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_stackClear.js
var require_stackClear = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_stackClear.js"(exports, module) {
    var ListCache = require_ListCache();
    function stackClear() {
      this.__data__ = new ListCache();
      this.size = 0;
    }
    module.exports = stackClear;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_stackDelete.js
var require_stackDelete = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_stackDelete.js"(exports, module) {
    function stackDelete(key) {
      var data = this.__data__, result = data["delete"](key);
      this.size = data.size;
      return result;
    }
    module.exports = stackDelete;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_stackGet.js
var require_stackGet = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_stackGet.js"(exports, module) {
    function stackGet(key) {
      return this.__data__.get(key);
    }
    module.exports = stackGet;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_stackHas.js
var require_stackHas = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_stackHas.js"(exports, module) {
    function stackHas(key) {
      return this.__data__.has(key);
    }
    module.exports = stackHas;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_stackSet.js
var require_stackSet = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_stackSet.js"(exports, module) {
    var ListCache = require_ListCache();
    var Map2 = require_Map();
    var MapCache = require_MapCache();
    var LARGE_ARRAY_SIZE = 200;
    function stackSet(key, value) {
      var data = this.__data__;
      if (data instanceof ListCache) {
        var pairs = data.__data__;
        if (!Map2 || pairs.length < LARGE_ARRAY_SIZE - 1) {
          pairs.push([key, value]);
          this.size = ++data.size;
          return this;
        }
        data = this.__data__ = new MapCache(pairs);
      }
      data.set(key, value);
      this.size = data.size;
      return this;
    }
    module.exports = stackSet;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_Stack.js
var require_Stack = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_Stack.js"(exports, module) {
    var ListCache = require_ListCache();
    var stackClear = require_stackClear();
    var stackDelete = require_stackDelete();
    var stackGet = require_stackGet();
    var stackHas = require_stackHas();
    var stackSet = require_stackSet();
    function Stack(entries) {
      var data = this.__data__ = new ListCache(entries);
      this.size = data.size;
    }
    Stack.prototype.clear = stackClear;
    Stack.prototype["delete"] = stackDelete;
    Stack.prototype.get = stackGet;
    Stack.prototype.has = stackHas;
    Stack.prototype.set = stackSet;
    module.exports = Stack;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arraySome.js
var require_arraySome = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arraySome.js"(exports, module) {
    function arraySome(array, predicate) {
      var index = -1, length = array == null ? 0 : array.length;
      while (++index < length) {
        if (predicate(array[index], index, array)) {
          return true;
        }
      }
      return false;
    }
    module.exports = arraySome;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_equalArrays.js
var require_equalArrays = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_equalArrays.js"(exports, module) {
    var SetCache = require_SetCache();
    var arraySome = require_arraySome();
    var cacheHas = require_cacheHas();
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG, arrLength = array.length, othLength = other.length;
      if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
        return false;
      }
      var arrStacked = stack.get(array);
      var othStacked = stack.get(other);
      if (arrStacked && othStacked) {
        return arrStacked == other && othStacked == array;
      }
      var index = -1, result = true, seen = bitmask & COMPARE_UNORDERED_FLAG ? new SetCache() : void 0;
      stack.set(array, other);
      stack.set(other, array);
      while (++index < arrLength) {
        var arrValue = array[index], othValue = other[index];
        if (customizer) {
          var compared = isPartial ? customizer(othValue, arrValue, index, other, array, stack) : customizer(arrValue, othValue, index, array, other, stack);
        }
        if (compared !== void 0) {
          if (compared) {
            continue;
          }
          result = false;
          break;
        }
        if (seen) {
          if (!arraySome(other, function(othValue2, othIndex) {
            if (!cacheHas(seen, othIndex) && (arrValue === othValue2 || equalFunc(arrValue, othValue2, bitmask, customizer, stack))) {
              return seen.push(othIndex);
            }
          })) {
            result = false;
            break;
          }
        } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
          result = false;
          break;
        }
      }
      stack["delete"](array);
      stack["delete"](other);
      return result;
    }
    module.exports = equalArrays;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_Uint8Array.js
var require_Uint8Array = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_Uint8Array.js"(exports, module) {
    var root = require_root();
    var Uint8Array2 = root.Uint8Array;
    module.exports = Uint8Array2;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_mapToArray.js
var require_mapToArray = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_mapToArray.js"(exports, module) {
    function mapToArray(map) {
      var index = -1, result = Array(map.size);
      map.forEach(function(value, key) {
        result[++index] = [key, value];
      });
      return result;
    }
    module.exports = mapToArray;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_equalByTag.js
var require_equalByTag = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_equalByTag.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var Uint8Array2 = require_Uint8Array();
    var eq = require_eq();
    var equalArrays = require_equalArrays();
    var mapToArray = require_mapToArray();
    var setToArray = require_setToArray();
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var symbolTag = "[object Symbol]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolValueOf = symbolProto ? symbolProto.valueOf : void 0;
    function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
      switch (tag) {
        case dataViewTag:
          if (object.byteLength != other.byteLength || object.byteOffset != other.byteOffset) {
            return false;
          }
          object = object.buffer;
          other = other.buffer;
        case arrayBufferTag:
          if (object.byteLength != other.byteLength || !equalFunc(new Uint8Array2(object), new Uint8Array2(other))) {
            return false;
          }
          return true;
        case boolTag:
        case dateTag:
        case numberTag:
          return eq(+object, +other);
        case errorTag:
          return object.name == other.name && object.message == other.message;
        case regexpTag:
        case stringTag:
          return object == other + "";
        case mapTag:
          var convert = mapToArray;
        case setTag:
          var isPartial = bitmask & COMPARE_PARTIAL_FLAG;
          convert || (convert = setToArray);
          if (object.size != other.size && !isPartial) {
            return false;
          }
          var stacked = stack.get(object);
          if (stacked) {
            return stacked == other;
          }
          bitmask |= COMPARE_UNORDERED_FLAG;
          stack.set(object, other);
          var result = equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
          stack["delete"](object);
          return result;
        case symbolTag:
          if (symbolValueOf) {
            return symbolValueOf.call(object) == symbolValueOf.call(other);
          }
      }
      return false;
    }
    module.exports = equalByTag;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseGetAllKeys.js
var require_baseGetAllKeys = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseGetAllKeys.js"(exports, module) {
    var arrayPush = require_arrayPush();
    var isArray = require_isArray();
    function baseGetAllKeys(object, keysFunc, symbolsFunc) {
      var result = keysFunc(object);
      return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
    }
    module.exports = baseGetAllKeys;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arrayFilter.js
var require_arrayFilter = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_arrayFilter.js"(exports, module) {
    function arrayFilter(array, predicate) {
      var index = -1, length = array == null ? 0 : array.length, resIndex = 0, result = [];
      while (++index < length) {
        var value = array[index];
        if (predicate(value, index, array)) {
          result[resIndex++] = value;
        }
      }
      return result;
    }
    module.exports = arrayFilter;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/stubArray.js
var require_stubArray = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/stubArray.js"(exports, module) {
    function stubArray() {
      return [];
    }
    module.exports = stubArray;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getSymbols.js
var require_getSymbols = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getSymbols.js"(exports, module) {
    var arrayFilter = require_arrayFilter();
    var stubArray = require_stubArray();
    var objectProto = Object.prototype;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var nativeGetSymbols = Object.getOwnPropertySymbols;
    var getSymbols = !nativeGetSymbols ? stubArray : function(object) {
      if (object == null) {
        return [];
      }
      object = Object(object);
      return arrayFilter(nativeGetSymbols(object), function(symbol) {
        return propertyIsEnumerable.call(object, symbol);
      });
    };
    module.exports = getSymbols;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getAllKeys.js
var require_getAllKeys = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getAllKeys.js"(exports, module) {
    var baseGetAllKeys = require_baseGetAllKeys();
    var getSymbols = require_getSymbols();
    var keys = require_keys();
    function getAllKeys(object) {
      return baseGetAllKeys(object, keys, getSymbols);
    }
    module.exports = getAllKeys;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_equalObjects.js
var require_equalObjects = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_equalObjects.js"(exports, module) {
    var getAllKeys = require_getAllKeys();
    var COMPARE_PARTIAL_FLAG = 1;
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG, objProps = getAllKeys(object), objLength = objProps.length, othProps = getAllKeys(other), othLength = othProps.length;
      if (objLength != othLength && !isPartial) {
        return false;
      }
      var index = objLength;
      while (index--) {
        var key = objProps[index];
        if (!(isPartial ? key in other : hasOwnProperty.call(other, key))) {
          return false;
        }
      }
      var objStacked = stack.get(object);
      var othStacked = stack.get(other);
      if (objStacked && othStacked) {
        return objStacked == other && othStacked == object;
      }
      var result = true;
      stack.set(object, other);
      stack.set(other, object);
      var skipCtor = isPartial;
      while (++index < objLength) {
        key = objProps[index];
        var objValue = object[key], othValue = other[key];
        if (customizer) {
          var compared = isPartial ? customizer(othValue, objValue, key, other, object, stack) : customizer(objValue, othValue, key, object, other, stack);
        }
        if (!(compared === void 0 ? objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack) : compared)) {
          result = false;
          break;
        }
        skipCtor || (skipCtor = key == "constructor");
      }
      if (result && !skipCtor) {
        var objCtor = object.constructor, othCtor = other.constructor;
        if (objCtor != othCtor && ("constructor" in object && "constructor" in other) && !(typeof objCtor == "function" && objCtor instanceof objCtor && typeof othCtor == "function" && othCtor instanceof othCtor)) {
          result = false;
        }
      }
      stack["delete"](object);
      stack["delete"](other);
      return result;
    }
    module.exports = equalObjects;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_DataView.js
var require_DataView = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_DataView.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var DataView = getNative(root, "DataView");
    module.exports = DataView;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_Promise.js
var require_Promise = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_Promise.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var Promise2 = getNative(root, "Promise");
    module.exports = Promise2;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_WeakMap.js
var require_WeakMap = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_WeakMap.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var WeakMap2 = getNative(root, "WeakMap");
    module.exports = WeakMap2;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getTag.js
var require_getTag = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getTag.js"(exports, module) {
    var DataView = require_DataView();
    var Map2 = require_Map();
    var Promise2 = require_Promise();
    var Set2 = require_Set();
    var WeakMap2 = require_WeakMap();
    var baseGetTag = require_baseGetTag();
    var toSource = require_toSource();
    var mapTag = "[object Map]";
    var objectTag = "[object Object]";
    var promiseTag = "[object Promise]";
    var setTag = "[object Set]";
    var weakMapTag = "[object WeakMap]";
    var dataViewTag = "[object DataView]";
    var dataViewCtorString = toSource(DataView);
    var mapCtorString = toSource(Map2);
    var promiseCtorString = toSource(Promise2);
    var setCtorString = toSource(Set2);
    var weakMapCtorString = toSource(WeakMap2);
    var getTag = baseGetTag;
    if (DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag || Map2 && getTag(new Map2()) != mapTag || Promise2 && getTag(Promise2.resolve()) != promiseTag || Set2 && getTag(new Set2()) != setTag || WeakMap2 && getTag(new WeakMap2()) != weakMapTag) {
      getTag = function(value) {
        var result = baseGetTag(value), Ctor = result == objectTag ? value.constructor : void 0, ctorString = Ctor ? toSource(Ctor) : "";
        if (ctorString) {
          switch (ctorString) {
            case dataViewCtorString:
              return dataViewTag;
            case mapCtorString:
              return mapTag;
            case promiseCtorString:
              return promiseTag;
            case setCtorString:
              return setTag;
            case weakMapCtorString:
              return weakMapTag;
          }
        }
        return result;
      };
    }
    module.exports = getTag;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIsEqualDeep.js
var require_baseIsEqualDeep = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIsEqualDeep.js"(exports, module) {
    var Stack = require_Stack();
    var equalArrays = require_equalArrays();
    var equalByTag = require_equalByTag();
    var equalObjects = require_equalObjects();
    var getTag = require_getTag();
    var isArray = require_isArray();
    var isBuffer = require_isBuffer();
    var isTypedArray = require_isTypedArray();
    var COMPARE_PARTIAL_FLAG = 1;
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var objectTag = "[object Object]";
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
      var objIsArr = isArray(object), othIsArr = isArray(other), objTag = objIsArr ? arrayTag : getTag(object), othTag = othIsArr ? arrayTag : getTag(other);
      objTag = objTag == argsTag ? objectTag : objTag;
      othTag = othTag == argsTag ? objectTag : othTag;
      var objIsObj = objTag == objectTag, othIsObj = othTag == objectTag, isSameTag = objTag == othTag;
      if (isSameTag && isBuffer(object)) {
        if (!isBuffer(other)) {
          return false;
        }
        objIsArr = true;
        objIsObj = false;
      }
      if (isSameTag && !objIsObj) {
        stack || (stack = new Stack());
        return objIsArr || isTypedArray(object) ? equalArrays(object, other, bitmask, customizer, equalFunc, stack) : equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
      }
      if (!(bitmask & COMPARE_PARTIAL_FLAG)) {
        var objIsWrapped = objIsObj && hasOwnProperty.call(object, "__wrapped__"), othIsWrapped = othIsObj && hasOwnProperty.call(other, "__wrapped__");
        if (objIsWrapped || othIsWrapped) {
          var objUnwrapped = objIsWrapped ? object.value() : object, othUnwrapped = othIsWrapped ? other.value() : other;
          stack || (stack = new Stack());
          return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
        }
      }
      if (!isSameTag) {
        return false;
      }
      stack || (stack = new Stack());
      return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
    }
    module.exports = baseIsEqualDeep;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIsEqual.js
var require_baseIsEqual = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIsEqual.js"(exports, module) {
    var baseIsEqualDeep = require_baseIsEqualDeep();
    var isObjectLike = require_isObjectLike();
    function baseIsEqual(value, other, bitmask, customizer, stack) {
      if (value === other) {
        return true;
      }
      if (value == null || other == null || !isObjectLike(value) && !isObjectLike(other)) {
        return value !== value && other !== other;
      }
      return baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual, stack);
    }
    module.exports = baseIsEqual;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIsMatch.js
var require_baseIsMatch = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIsMatch.js"(exports, module) {
    var Stack = require_Stack();
    var baseIsEqual = require_baseIsEqual();
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    function baseIsMatch(object, source, matchData, customizer) {
      var index = matchData.length, length = index, noCustomizer = !customizer;
      if (object == null) {
        return !length;
      }
      object = Object(object);
      while (index--) {
        var data = matchData[index];
        if (noCustomizer && data[2] ? data[1] !== object[data[0]] : !(data[0] in object)) {
          return false;
        }
      }
      while (++index < length) {
        data = matchData[index];
        var key = data[0], objValue = object[key], srcValue = data[1];
        if (noCustomizer && data[2]) {
          if (objValue === void 0 && !(key in object)) {
            return false;
          }
        } else {
          var stack = new Stack();
          if (customizer) {
            var result = customizer(objValue, srcValue, key, object, source, stack);
          }
          if (!(result === void 0 ? baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG | COMPARE_UNORDERED_FLAG, customizer, stack) : result)) {
            return false;
          }
        }
      }
      return true;
    }
    module.exports = baseIsMatch;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isStrictComparable.js
var require_isStrictComparable = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_isStrictComparable.js"(exports, module) {
    var isObject = require_isObject();
    function isStrictComparable(value) {
      return value === value && !isObject(value);
    }
    module.exports = isStrictComparable;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getMatchData.js
var require_getMatchData = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_getMatchData.js"(exports, module) {
    var isStrictComparable = require_isStrictComparable();
    var keys = require_keys();
    function getMatchData(object) {
      var result = keys(object), length = result.length;
      while (length--) {
        var key = result[length], value = object[key];
        result[length] = [key, value, isStrictComparable(value)];
      }
      return result;
    }
    module.exports = getMatchData;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_matchesStrictComparable.js
var require_matchesStrictComparable = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_matchesStrictComparable.js"(exports, module) {
    function matchesStrictComparable(key, srcValue) {
      return function(object) {
        if (object == null) {
          return false;
        }
        return object[key] === srcValue && (srcValue !== void 0 || key in Object(object));
      };
    }
    module.exports = matchesStrictComparable;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseMatches.js
var require_baseMatches = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseMatches.js"(exports, module) {
    var baseIsMatch = require_baseIsMatch();
    var getMatchData = require_getMatchData();
    var matchesStrictComparable = require_matchesStrictComparable();
    function baseMatches(source) {
      var matchData = getMatchData(source);
      if (matchData.length == 1 && matchData[0][2]) {
        return matchesStrictComparable(matchData[0][0], matchData[0][1]);
      }
      return function(object) {
        return object === source || baseIsMatch(object, source, matchData);
      };
    }
    module.exports = baseMatches;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseGet.js
var require_baseGet = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseGet.js"(exports, module) {
    var castPath = require_castPath();
    var toKey = require_toKey();
    function baseGet(object, path) {
      path = castPath(path, object);
      var index = 0, length = path.length;
      while (object != null && index < length) {
        object = object[toKey(path[index++])];
      }
      return index && index == length ? object : void 0;
    }
    module.exports = baseGet;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/get.js
var require_get = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/get.js"(exports, module) {
    var baseGet = require_baseGet();
    function get(object, path, defaultValue) {
      var result = object == null ? void 0 : baseGet(object, path);
      return result === void 0 ? defaultValue : result;
    }
    module.exports = get;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseHasIn.js
var require_baseHasIn = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseHasIn.js"(exports, module) {
    function baseHasIn(object, key) {
      return object != null && key in Object(object);
    }
    module.exports = baseHasIn;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/hasIn.js
var require_hasIn = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/hasIn.js"(exports, module) {
    var baseHasIn = require_baseHasIn();
    var hasPath = require_hasPath();
    function hasIn(object, path) {
      return object != null && hasPath(object, path, baseHasIn);
    }
    module.exports = hasIn;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseMatchesProperty.js
var require_baseMatchesProperty = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseMatchesProperty.js"(exports, module) {
    var baseIsEqual = require_baseIsEqual();
    var get = require_get();
    var hasIn = require_hasIn();
    var isKey = require_isKey();
    var isStrictComparable = require_isStrictComparable();
    var matchesStrictComparable = require_matchesStrictComparable();
    var toKey = require_toKey();
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    function baseMatchesProperty(path, srcValue) {
      if (isKey(path) && isStrictComparable(srcValue)) {
        return matchesStrictComparable(toKey(path), srcValue);
      }
      return function(object) {
        var objValue = get(object, path);
        return objValue === void 0 && objValue === srcValue ? hasIn(object, path) : baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG | COMPARE_UNORDERED_FLAG);
      };
    }
    module.exports = baseMatchesProperty;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/identity.js
var require_identity = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/identity.js"(exports, module) {
    function identity(value) {
      return value;
    }
    module.exports = identity;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseProperty.js
var require_baseProperty = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseProperty.js"(exports, module) {
    function baseProperty(key) {
      return function(object) {
        return object == null ? void 0 : object[key];
      };
    }
    module.exports = baseProperty;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_basePropertyDeep.js
var require_basePropertyDeep = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_basePropertyDeep.js"(exports, module) {
    var baseGet = require_baseGet();
    function basePropertyDeep(path) {
      return function(object) {
        return baseGet(object, path);
      };
    }
    module.exports = basePropertyDeep;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/property.js
var require_property = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/property.js"(exports, module) {
    var baseProperty = require_baseProperty();
    var basePropertyDeep = require_basePropertyDeep();
    var isKey = require_isKey();
    var toKey = require_toKey();
    function property(path) {
      return isKey(path) ? baseProperty(toKey(path)) : basePropertyDeep(path);
    }
    module.exports = property;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIteratee.js
var require_baseIteratee = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_baseIteratee.js"(exports, module) {
    var baseMatches = require_baseMatches();
    var baseMatchesProperty = require_baseMatchesProperty();
    var identity = require_identity();
    var isArray = require_isArray();
    var property = require_property();
    function baseIteratee(value) {
      if (typeof value == "function") {
        return value;
      }
      if (value == null) {
        return identity;
      }
      if (typeof value == "object") {
        return isArray(value) ? baseMatchesProperty(value[0], value[1]) : baseMatches(value);
      }
      return property(value);
    }
    module.exports = baseIteratee;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_createAggregator.js
var require_createAggregator = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/_createAggregator.js"(exports, module) {
    var arrayAggregator = require_arrayAggregator();
    var baseAggregator = require_baseAggregator();
    var baseIteratee = require_baseIteratee();
    var isArray = require_isArray();
    function createAggregator(setter, initializer) {
      return function(collection, iteratee) {
        var func = isArray(collection) ? arrayAggregator : baseAggregator, accumulator = initializer ? initializer() : {};
        return func(collection, setter, baseIteratee(iteratee, 2), accumulator);
      };
    }
    module.exports = createAggregator;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/groupBy.js
var require_groupBy = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/groupBy.js"(exports, module) {
    var baseAssignValue = require_baseAssignValue();
    var createAggregator = require_createAggregator();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var groupBy2 = createAggregator(function(result, value, key) {
      if (hasOwnProperty.call(result, key)) {
        result[key].push(value);
      } else {
        baseAssignValue(result, key, [value]);
      }
    });
    module.exports = groupBy2;
  }
});

// vendor/glide-data-grid/dist/esm/internal/click-outside-container/click-outside-container.js
import * as React14 from "react";
var ClickOutsideContainer;
var init_click_outside_container = __esm({
  "vendor/glide-data-grid/dist/esm/internal/click-outside-container/click-outside-container.js"() {
    ClickOutsideContainer = class extends React14.PureComponent {
      wrapperRef = React14.createRef();
      componentDidMount() {
        const eventTarget = this.props.customEventTarget ?? document;
        eventTarget.addEventListener("pointerdown", this.clickOutside, true);
        eventTarget.addEventListener("contextmenu", this.clickOutside, true);
      }
      componentWillUnmount() {
        const eventTarget = this.props.customEventTarget ?? document;
        eventTarget.removeEventListener("pointerdown", this.clickOutside, true);
        eventTarget.removeEventListener("contextmenu", this.clickOutside, true);
      }
      clickOutside = (event) => {
        if (this.props.isOutsideClick && !this.props.isOutsideClick(event)) {
          return;
        }
        if (this.wrapperRef.current !== null && !this.wrapperRef.current.contains(event.target)) {
          let node = event.target;
          while (node !== null) {
            if (node.classList.contains("click-outside-ignore")) {
              return;
            }
            node = node.parentElement;
          }
          this.props.onClickOutside();
        }
      };
      render() {
        const { onClickOutside, isOutsideClick, customEventTarget, ...rest } = this.props;
        return React14.createElement("div", { ...rest, ref: this.wrapperRef }, this.props.children);
      }
    };
  }
});

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/data-grid-overlay-editor-style.js
var _exp23, _exp32, _exp4, _exp5, _exp6, _exp7, DataGridOverlayEditorStyle;
var init_data_grid_overlay_editor_style = __esm({
  "vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/data-grid-overlay-editor-style.js"() {
    init_dist2();
    _exp23 = () => (p2) => p2.targetX;
    _exp32 = () => (p2) => p2.targetY;
    _exp4 = () => (p2) => p2.targetWidth;
    _exp5 = () => (p2) => p2.targetHeight;
    _exp6 = () => (p2) => p2.targetY + 10;
    _exp7 = () => (p2) => Math.max(0, (p2.targetHeight - 28) / 2);
    DataGridOverlayEditorStyle = /* @__PURE__ */ styled_default("div")({
      name: "DataGridOverlayEditorStyle",
      class: "gdg-d19meir1",
      propsAsIs: false,
      vars: {
        "d19meir1-0": [_exp32(), "px"],
        "d19meir1-1": [_exp23(), "px"],
        "d19meir1-2": [_exp4(), "px"],
        "d19meir1-3": [_exp5(), "px"],
        "d19meir1-4": [_exp6(), "px"],
        "d19meir1-5": [_exp7(), "px"]
      }
    });
  }
});

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/use-stay-on-screen.js
import * as React25 from "react";
function useRefState() {
  const [refState, setRefState] = React25.useState();
  return [refState ?? void 0, setRefState];
}
function useStayOnScreen() {
  const [ref, setRef] = useRefState();
  const [xOffset, setXOffset] = React25.useState(0);
  const [isIntersecting, setIsIntersecting] = React25.useState(true);
  React25.useLayoutEffect(() => {
    if (ref === void 0)
      return;
    if (!("IntersectionObserver" in window))
      return;
    const observer = new IntersectionObserver((ents) => {
      if (ents.length === 0)
        return;
      setIsIntersecting(ents[0].isIntersecting);
    }, { threshold: 1 });
    observer.observe(ref);
    return () => observer.disconnect();
  }, [ref]);
  React25.useEffect(() => {
    if (isIntersecting || ref === void 0)
      return;
    let rafHandle;
    const fn = () => {
      const { right: refRight } = ref.getBoundingClientRect();
      setXOffset((cv) => Math.min(cv + window.innerWidth - refRight - 10, 0));
      rafHandle = requestAnimationFrame(fn);
    };
    rafHandle = requestAnimationFrame(fn);
    return () => {
      if (rafHandle !== void 0) {
        cancelAnimationFrame(rafHandle);
      }
    };
  }, [ref, isIntersecting]);
  const style = React25.useMemo(() => {
    return { transform: `translateX(${xOffset}px)` };
  }, [xOffset]);
  return {
    ref: setRef,
    style
  };
}
var init_use_stay_on_screen = __esm({
  "vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/use-stay-on-screen.js"() {
  }
});

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/data-grid-overlay-editor.js
var data_grid_overlay_editor_exports = {};
__export(data_grid_overlay_editor_exports, {
  default: () => data_grid_overlay_editor_default
});
import * as React26 from "react";
import { createPortal } from "react-dom";
var DataGridOverlayEditor, data_grid_overlay_editor_default;
var init_data_grid_overlay_editor = __esm({
  "vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/data-grid-overlay-editor.js"() {
    init_click_outside_container();
    init_styles();
    init_data_grid_types();
    init_data_grid_overlay_editor_style();
    init_use_stay_on_screen();
    DataGridOverlayEditor = (p2) => {
      const { target, content, onFinishEditing: onFinishEditingIn, forceEditMode, initialValue, imageEditorOverride, markdownDivCreateNode, highlight, className, theme, id, cell, bloom, portalElementRef, validateCell, getCellRenderer, provideEditor, isOutsideClick, customEventTarget, activation } = p2;
      const [tempValue, setTempValueRaw] = React26.useState(forceEditMode ? content : void 0);
      const lastValueRef = React26.useRef(tempValue ?? content);
      lastValueRef.current = tempValue ?? content;
      const [isValid, setIsValid] = React26.useState(() => {
        if (validateCell === void 0)
          return true;
        return !(isEditableGridCell(content) && validateCell?.(cell, content, lastValueRef.current) === false);
      });
      const onFinishEditing = React26.useCallback((newCell, movement) => {
        onFinishEditingIn(isValid ? newCell : void 0, movement);
      }, [isValid, onFinishEditingIn]);
      const setTempValue = React26.useCallback((newVal) => {
        if (validateCell !== void 0 && newVal !== void 0 && isEditableGridCell(newVal)) {
          const validResult = validateCell(cell, newVal, lastValueRef.current);
          if (validResult === false) {
            setIsValid(false);
          } else if (typeof validResult === "object") {
            newVal = validResult;
            setIsValid(true);
          } else {
            setIsValid(true);
          }
        }
        setTempValueRaw(newVal);
      }, [cell, validateCell]);
      const finished = React26.useRef(false);
      const customMotion = React26.useRef(void 0);
      const onClickOutside = React26.useCallback(() => {
        onFinishEditing(tempValue, [0, 0]);
        finished.current = true;
      }, [tempValue, onFinishEditing]);
      const onEditorFinished = React26.useCallback((newValue, movement) => {
        onFinishEditing(newValue, movement ?? customMotion.current ?? [0, 0]);
        finished.current = true;
      }, [onFinishEditing]);
      const onKeyDown = React26.useCallback(async (event) => {
        let save = false;
        if (event.key === "Escape") {
          event.stopPropagation();
          event.preventDefault();
          customMotion.current = [0, 0];
        } else if (event.key === "Enter" && // The shift key is reserved for multi-line editing
        // to allow inserting new lines without closing the editor.
        !event.shiftKey) {
          event.stopPropagation();
          event.preventDefault();
          customMotion.current = [0, 1];
          save = true;
        } else if (event.key === "Tab") {
          event.stopPropagation();
          event.preventDefault();
          customMotion.current = [event.shiftKey ? -1 : 1, 0];
          save = true;
        }
        window.setTimeout(() => {
          if (!finished.current && customMotion.current !== void 0) {
            onFinishEditing(save ? tempValue : void 0, customMotion.current);
            finished.current = true;
          }
        }, 0);
      }, [onFinishEditing, tempValue]);
      const targetValue = tempValue ?? content;
      const [editorProvider, useLabel] = React26.useMemo(() => {
        if (isInnerOnlyCell(content))
          return [];
        const cellWithLocation = { ...content, location: cell, activation };
        const external = provideEditor?.(cellWithLocation);
        if (external !== void 0)
          return [external, false];
        return [getCellRenderer(content)?.provideEditor?.(cellWithLocation), false];
      }, [cell, content, getCellRenderer, provideEditor, activation]);
      const { ref, style: stayOnScreenStyle } = useStayOnScreen();
      let pad = true;
      let editor;
      let style = true;
      let styleOverride;
      if (editorProvider !== void 0) {
        pad = editorProvider.disablePadding !== true;
        style = editorProvider.disableStyling !== true;
        const isObjectEditor = isObjectEditorCallbackResult(editorProvider);
        if (isObjectEditor) {
          styleOverride = editorProvider.styleOverride;
        }
        const CustomEditor = isObjectEditor ? editorProvider.editor : editorProvider;
        editor = React26.createElement(CustomEditor, { portalElementRef, isHighlighted: highlight, activation, onChange: setTempValue, value: targetValue, initialValue, onFinishedEditing: onEditorFinished, validatedSelection: isEditableGridCell(targetValue) ? targetValue.selectionRange : void 0, forceEditMode, target, imageEditorOverride, markdownDivCreateNode, isValid, theme });
      }
      styleOverride = { ...styleOverride, ...stayOnScreenStyle };
      const portalElement = portalElementRef?.current ?? document.getElementById("portal");
      if (portalElement === null) {
        console.error('Cannot open Data Grid overlay editor, because portal not found. Please, either provide a portalElementRef or add `<div id="portal" />` as the last child of your `<body>`.');
        return null;
      }
      let classWrap = style ? "gdg-style" : "gdg-unstyle";
      if (!isValid) {
        classWrap += " gdg-invalid";
      }
      if (pad) {
        classWrap += " gdg-pad";
      }
      const bloomX = bloom?.[0] ?? 1;
      const bloomY = bloom?.[1] ?? 1;
      return createPortal(React26.createElement(
        ThemeContext.Provider,
        { value: theme },
        React26.createElement(
          ClickOutsideContainer,
          { style: makeCSSStyle(theme), className, onClickOutside, isOutsideClick, customEventTarget },
          React26.createElement(
            DataGridOverlayEditorStyle,
            { ref, id, className: classWrap, style: styleOverride, as: useLabel === true ? "label" : void 0, targetX: target.x - bloomX, targetY: target.y - bloomY, targetWidth: target.width + bloomX * 2, targetHeight: target.height + bloomY * 2 },
            React26.createElement("div", { className: "gdg-clip-region", onKeyDown }, editor)
          )
        )
      ), portalElement);
    };
    data_grid_overlay_editor_default = DataGridOverlayEditor;
  }
});

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/number-overlay-editor-style.js
var NumberOverlayEditorStyle;
var init_number_overlay_editor_style = __esm({
  "vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/number-overlay-editor-style.js"() {
    init_dist2();
    NumberOverlayEditorStyle = /* @__PURE__ */ styled_default("div")({
      name: "NumberOverlayEditorStyle",
      class: "gdg-n15fjm3e",
      propsAsIs: false
    });
  }
});

// node_modules/.pnpm/react-number-format@5.4.5_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/react-number-format/dist/react-number-format.es.js
import React35, { useState as useState14, useMemo as useMemo9, useEffect as useEffect9, useRef as useRef15, useLayoutEffect as useLayoutEffect10 } from "react";
function __rest(s, e) {
  var t = {};
  for (var p2 in s) {
    if (Object.prototype.hasOwnProperty.call(s, p2) && e.indexOf(p2) < 0) {
      t[p2] = s[p2];
    }
  }
  if (s != null && typeof Object.getOwnPropertySymbols === "function") {
    for (var i = 0, p2 = Object.getOwnPropertySymbols(s); i < p2.length; i++) {
      if (e.indexOf(p2[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p2[i])) {
        t[p2[i]] = s[p2[i]];
      }
    }
  }
  return t;
}
function noop() {
}
function memoizeOnce(cb) {
  var lastArgs;
  var lastValue = void 0;
  return function() {
    var args = [], len = arguments.length;
    while (len--) args[len] = arguments[len];
    if (lastArgs && args.length === lastArgs.length && args.every(function(value, index) {
      return value === lastArgs[index];
    })) {
      return lastValue;
    }
    lastArgs = args;
    lastValue = cb.apply(void 0, args);
    return lastValue;
  };
}
function charIsNumber(char) {
  return !!(char || "").match(/\d/);
}
function isNil(val) {
  return val === null || val === void 0;
}
function isNanValue(val) {
  return typeof val === "number" && isNaN(val);
}
function isNotValidValue(val) {
  return isNil(val) || isNanValue(val) || typeof val === "number" && !isFinite(val);
}
function escapeRegExp(str) {
  return str.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&");
}
function getThousandsGroupRegex(thousandsGroupStyle) {
  switch (thousandsGroupStyle) {
    case "lakh":
      return /(\d+?)(?=(\d\d)+(\d)(?!\d))(\.\d+)?/g;
    case "wan":
      return /(\d)(?=(\d{4})+(?!\d))/g;
    case "thousand":
    default:
      return /(\d)(?=(\d{3})+(?!\d))/g;
  }
}
function applyThousandSeparator(str, thousandSeparator, thousandsGroupStyle) {
  var thousandsGroupRegex = getThousandsGroupRegex(thousandsGroupStyle);
  var index = str.search(/[1-9]/);
  index = index === -1 ? str.length : index;
  return str.substring(0, index) + str.substring(index, str.length).replace(thousandsGroupRegex, "$1" + thousandSeparator);
}
function usePersistentCallback(cb) {
  var callbackRef = useRef15(cb);
  callbackRef.current = cb;
  var persistentCbRef = useRef15(function() {
    var args = [], len = arguments.length;
    while (len--) args[len] = arguments[len];
    return callbackRef.current.apply(callbackRef, args);
  });
  return persistentCbRef.current;
}
function splitDecimal(numStr, allowNegative) {
  if (allowNegative === void 0) allowNegative = true;
  var hasNegation = numStr[0] === "-";
  var addNegation = hasNegation && allowNegative;
  numStr = numStr.replace("-", "");
  var parts = numStr.split(".");
  var beforeDecimal = parts[0];
  var afterDecimal = parts[1] || "";
  return {
    beforeDecimal,
    afterDecimal,
    hasNegation,
    addNegation
  };
}
function fixLeadingZero(numStr) {
  if (!numStr) {
    return numStr;
  }
  var isNegative = numStr[0] === "-";
  if (isNegative) {
    numStr = numStr.substring(1, numStr.length);
  }
  var parts = numStr.split(".");
  var beforeDecimal = parts[0].replace(/^0+/, "") || "0";
  var afterDecimal = parts[1] || "";
  return (isNegative ? "-" : "") + beforeDecimal + (afterDecimal ? "." + afterDecimal : "");
}
function limitToScale(numStr, scale, fixedDecimalScale) {
  var str = "";
  var filler = fixedDecimalScale ? "0" : "";
  for (var i = 0; i <= scale - 1; i++) {
    str += numStr[i] || filler;
  }
  return str;
}
function repeat(str, count) {
  return Array(count + 1).join(str);
}
function toNumericString(num) {
  var _num = num + "";
  var sign = _num[0] === "-" ? "-" : "";
  if (sign) {
    _num = _num.substring(1);
  }
  var ref = _num.split(/[eE]/g);
  var coefficient = ref[0];
  var exponent = ref[1];
  exponent = Number(exponent);
  if (!exponent) {
    return sign + coefficient;
  }
  coefficient = coefficient.replace(".", "");
  var decimalIndex = 1 + exponent;
  var coffiecientLn = coefficient.length;
  if (decimalIndex < 0) {
    coefficient = "0." + repeat("0", Math.abs(decimalIndex)) + coefficient;
  } else if (decimalIndex >= coffiecientLn) {
    coefficient = coefficient + repeat("0", decimalIndex - coffiecientLn);
  } else {
    coefficient = (coefficient.substring(0, decimalIndex) || "0") + "." + coefficient.substring(decimalIndex);
  }
  return sign + coefficient;
}
function roundToPrecision(numStr, scale, fixedDecimalScale) {
  if (["", "-"].indexOf(numStr) !== -1) {
    return numStr;
  }
  var shouldHaveDecimalSeparator = (numStr.indexOf(".") !== -1 || fixedDecimalScale) && scale;
  var ref = splitDecimal(numStr);
  var beforeDecimal = ref.beforeDecimal;
  var afterDecimal = ref.afterDecimal;
  var hasNegation = ref.hasNegation;
  var floatValue = parseFloat("0." + (afterDecimal || "0"));
  var floatValueStr = afterDecimal.length <= scale ? "0." + afterDecimal : floatValue.toFixed(scale);
  var roundedDecimalParts = floatValueStr.split(".");
  var intPart = beforeDecimal;
  if (beforeDecimal && Number(roundedDecimalParts[0])) {
    intPart = beforeDecimal.split("").reverse().reduce(function(roundedStr, current, idx) {
      if (roundedStr.length > idx) {
        return (Number(roundedStr[0]) + Number(current)).toString() + roundedStr.substring(1, roundedStr.length);
      }
      return current + roundedStr;
    }, roundedDecimalParts[0]);
  }
  var decimalPart = limitToScale(roundedDecimalParts[1] || "", scale, fixedDecimalScale);
  var negation = hasNegation ? "-" : "";
  var decimalSeparator = shouldHaveDecimalSeparator ? "." : "";
  return "" + negation + intPart + decimalSeparator + decimalPart;
}
function setCaretPosition(el, caretPos) {
  el.value = el.value;
  if (el !== null) {
    if (el.createTextRange) {
      var range2 = el.createTextRange();
      range2.move("character", caretPos);
      range2.select();
      return true;
    }
    if (el.selectionStart || el.selectionStart === 0) {
      el.focus();
      el.setSelectionRange(caretPos, caretPos);
      return true;
    }
    el.focus();
    return false;
  }
}
function clamp5(num, min, max) {
  return Math.min(Math.max(num, min), max);
}
function geInputCaretPosition(el) {
  return Math.max(el.selectionStart, el.selectionEnd);
}
function addInputMode() {
  return typeof navigator !== "undefined" && !(navigator.platform && /iPhone|iPod/.test(navigator.platform));
}
function getDefaultChangeMeta(value) {
  return {
    from: {
      start: 0,
      end: 0
    },
    to: {
      start: 0,
      end: value.length
    },
    lastValue: ""
  };
}
function defaultIsCharacterSame(ref) {
  var currentValue = ref.currentValue;
  var formattedValue = ref.formattedValue;
  var currentValueIndex = ref.currentValueIndex;
  var formattedValueIndex = ref.formattedValueIndex;
  return currentValue[currentValueIndex] === formattedValue[formattedValueIndex];
}
function getCaretPosition(newFormattedValue, lastFormattedValue, curValue, curCaretPos, boundary, isValidInputCharacter, isCharacterSame) {
  if (isCharacterSame === void 0) isCharacterSame = defaultIsCharacterSame;
  var firstAllowedPosition = boundary.findIndex(function(b3) {
    return b3;
  });
  var prefixFormat = newFormattedValue.slice(0, firstAllowedPosition);
  if (!lastFormattedValue && !curValue.startsWith(prefixFormat)) {
    lastFormattedValue = prefixFormat;
    curValue = prefixFormat + curValue;
    curCaretPos = curCaretPos + prefixFormat.length;
  }
  var curValLn = curValue.length;
  var formattedValueLn = newFormattedValue.length;
  var addedIndexMap = {};
  var indexMap = new Array(curValLn);
  for (var i = 0; i < curValLn; i++) {
    indexMap[i] = -1;
    for (var j2 = 0, jLn = formattedValueLn; j2 < jLn; j2++) {
      var isCharSame = isCharacterSame({
        currentValue: curValue,
        lastValue: lastFormattedValue,
        formattedValue: newFormattedValue,
        currentValueIndex: i,
        formattedValueIndex: j2
      });
      if (isCharSame && addedIndexMap[j2] !== true) {
        indexMap[i] = j2;
        addedIndexMap[j2] = true;
        break;
      }
    }
  }
  var pos = curCaretPos;
  while (pos < curValLn && (indexMap[pos] === -1 || !isValidInputCharacter(curValue[pos]))) {
    pos++;
  }
  var endIndex = pos === curValLn || indexMap[pos] === -1 ? formattedValueLn : indexMap[pos];
  pos = curCaretPos - 1;
  while (pos > 0 && indexMap[pos] === -1) {
    pos--;
  }
  var startIndex = pos === -1 || indexMap[pos] === -1 ? 0 : indexMap[pos] + 1;
  if (startIndex > endIndex) {
    return endIndex;
  }
  return curCaretPos - startIndex < endIndex - curCaretPos ? startIndex : endIndex;
}
function getCaretPosInBoundary(value, caretPos, boundary, direction2) {
  var valLn = value.length;
  caretPos = clamp5(caretPos, 0, valLn);
  if (direction2 === "left") {
    while (caretPos >= 0 && !boundary[caretPos]) {
      caretPos--;
    }
    if (caretPos === -1) {
      caretPos = boundary.indexOf(true);
    }
  } else {
    while (caretPos <= valLn && !boundary[caretPos]) {
      caretPos++;
    }
    if (caretPos > valLn) {
      caretPos = boundary.lastIndexOf(true);
    }
  }
  if (caretPos === -1) {
    caretPos = valLn;
  }
  return caretPos;
}
function caretUnknownFormatBoundary(formattedValue) {
  var boundaryAry = Array.from({ length: formattedValue.length + 1 }).map(function() {
    return true;
  });
  for (var i = 0, ln = boundaryAry.length; i < ln; i++) {
    boundaryAry[i] = Boolean(charIsNumber(formattedValue[i]) || charIsNumber(formattedValue[i - 1]));
  }
  return boundaryAry;
}
function useInternalValues(value, defaultValue, valueIsNumericString, format2, removeFormatting2, onValueChange) {
  if (onValueChange === void 0) onValueChange = noop;
  var getValues = usePersistentCallback(function(value2, valueIsNumericString2) {
    var formattedValue, numAsString;
    if (isNotValidValue(value2)) {
      numAsString = "";
      formattedValue = "";
    } else if (typeof value2 === "number" || valueIsNumericString2) {
      numAsString = typeof value2 === "number" ? toNumericString(value2) : value2;
      formattedValue = format2(numAsString);
    } else {
      numAsString = removeFormatting2(value2, void 0);
      formattedValue = format2(numAsString);
    }
    return { formattedValue, numAsString };
  });
  var ref = useState14(function() {
    return getValues(isNil(value) ? defaultValue : value, valueIsNumericString);
  });
  var values = ref[0];
  var setValues = ref[1];
  var _onValueChange = usePersistentCallback(function(newValues2, sourceInfo) {
    if (newValues2.formattedValue !== values.formattedValue) {
      setValues({
        formattedValue: newValues2.formattedValue,
        numAsString: newValues2.value
      });
    }
    onValueChange(newValues2, sourceInfo);
  });
  var _value = value;
  var _valueIsNumericString = valueIsNumericString;
  if (isNil(value)) {
    _value = values.numAsString;
    _valueIsNumericString = true;
  }
  var newValues = getValues(_value, _valueIsNumericString);
  useMemo9(function() {
    setValues(newValues);
  }, [newValues.formattedValue]);
  useEffect9(function() {
    if (!isNil(defaultValue) && isNil(value) && values.formattedValue !== "") {
      var floatValue = parseFloat(values.numAsString);
      _onValueChange({
        formattedValue: values.formattedValue,
        value: values.numAsString,
        floatValue: isNaN(floatValue) ? void 0 : floatValue
      }, { event: void 0, source: SourceType.props });
    }
  }, []);
  return [values, _onValueChange];
}
function defaultRemoveFormatting(value) {
  return value.replace(/[^0-9]/g, "");
}
function defaultFormat(value) {
  return value;
}
function NumberFormatBase(props) {
  var type = props.type;
  if (type === void 0) type = "text";
  var displayType = props.displayType;
  if (displayType === void 0) displayType = "input";
  var customInput = props.customInput;
  var renderText = props.renderText;
  var getInputRef = props.getInputRef;
  var format2 = props.format;
  if (format2 === void 0) format2 = defaultFormat;
  var removeFormatting2 = props.removeFormatting;
  if (removeFormatting2 === void 0) removeFormatting2 = defaultRemoveFormatting;
  var defaultValue = props.defaultValue;
  var valueIsNumericString = props.valueIsNumericString;
  var onValueChange = props.onValueChange;
  var isAllowed = props.isAllowed;
  var onChange = props.onChange;
  if (onChange === void 0) onChange = noop;
  var onKeyDown = props.onKeyDown;
  if (onKeyDown === void 0) onKeyDown = noop;
  var onMouseUp = props.onMouseUp;
  if (onMouseUp === void 0) onMouseUp = noop;
  var onFocus = props.onFocus;
  if (onFocus === void 0) onFocus = noop;
  var onBlur = props.onBlur;
  if (onBlur === void 0) onBlur = noop;
  var propValue = props.value;
  var getCaretBoundary2 = props.getCaretBoundary;
  if (getCaretBoundary2 === void 0) getCaretBoundary2 = caretUnknownFormatBoundary;
  var isValidInputCharacter = props.isValidInputCharacter;
  if (isValidInputCharacter === void 0) isValidInputCharacter = charIsNumber;
  var isCharacterSame = props.isCharacterSame;
  var otherProps = __rest(props, ["type", "displayType", "customInput", "renderText", "getInputRef", "format", "removeFormatting", "defaultValue", "valueIsNumericString", "onValueChange", "isAllowed", "onChange", "onKeyDown", "onMouseUp", "onFocus", "onBlur", "value", "getCaretBoundary", "isValidInputCharacter", "isCharacterSame"]);
  var ref = useInternalValues(propValue, defaultValue, Boolean(valueIsNumericString), format2, removeFormatting2, onValueChange);
  var ref_0 = ref[0];
  var formattedValue = ref_0.formattedValue;
  var numAsString = ref_0.numAsString;
  var onFormattedValueChange = ref[1];
  var caretPositionBeforeChange = useRef15();
  var lastUpdatedValue = useRef15({ formattedValue, numAsString });
  var _onValueChange = function(values, source) {
    lastUpdatedValue.current = { formattedValue: values.formattedValue, numAsString: values.value };
    onFormattedValueChange(values, source);
  };
  var ref$1 = useState14(false);
  var mounted = ref$1[0];
  var setMounted = ref$1[1];
  var focusedElm = useRef15(null);
  var timeout = useRef15({
    setCaretTimeout: null,
    focusTimeout: null
  });
  useEffect9(function() {
    setMounted(true);
    return function() {
      clearTimeout(timeout.current.setCaretTimeout);
      clearTimeout(timeout.current.focusTimeout);
    };
  }, []);
  var _format = format2;
  var getValueObject = function(formattedValue2, numAsString2) {
    var floatValue = parseFloat(numAsString2);
    return {
      formattedValue: formattedValue2,
      value: numAsString2,
      floatValue: isNaN(floatValue) ? void 0 : floatValue
    };
  };
  var setPatchedCaretPosition = function(el, caretPos, currentValue) {
    if (el.selectionStart === 0 && el.selectionEnd === el.value.length) {
      return;
    }
    setCaretPosition(el, caretPos);
    timeout.current.setCaretTimeout = setTimeout(function() {
      if (el.value === currentValue && el.selectionStart !== caretPos) {
        setCaretPosition(el, caretPos);
      }
    }, 0);
  };
  var correctCaretPosition = function(value, caretPos, direction2) {
    return getCaretPosInBoundary(value, caretPos, getCaretBoundary2(value), direction2);
  };
  var getNewCaretPosition = function(inputValue, newFormattedValue, caretPos) {
    var caretBoundary = getCaretBoundary2(newFormattedValue);
    var updatedCaretPos = getCaretPosition(newFormattedValue, formattedValue, inputValue, caretPos, caretBoundary, isValidInputCharacter, isCharacterSame);
    updatedCaretPos = getCaretPosInBoundary(newFormattedValue, updatedCaretPos, caretBoundary);
    return updatedCaretPos;
  };
  var updateValueAndCaretPosition = function(params) {
    var newFormattedValue = params.formattedValue;
    if (newFormattedValue === void 0) newFormattedValue = "";
    var input = params.input;
    var source = params.source;
    var event = params.event;
    var numAsString2 = params.numAsString;
    var caretPos;
    if (input) {
      var inputValue = params.inputValue || input.value;
      var currentCaretPosition2 = geInputCaretPosition(input);
      input.value = newFormattedValue;
      caretPos = getNewCaretPosition(inputValue, newFormattedValue, currentCaretPosition2);
      if (caretPos !== void 0) {
        setPatchedCaretPosition(input, caretPos, newFormattedValue);
      }
    }
    if (newFormattedValue !== formattedValue) {
      _onValueChange(getValueObject(newFormattedValue, numAsString2), { event, source });
    }
  };
  useEffect9(function() {
    var ref2 = lastUpdatedValue.current;
    var lastFormattedValue = ref2.formattedValue;
    var lastNumAsString = ref2.numAsString;
    if (formattedValue !== lastFormattedValue || numAsString !== lastNumAsString) {
      _onValueChange(getValueObject(formattedValue, numAsString), {
        event: void 0,
        source: SourceType.props
      });
    }
  }, [formattedValue, numAsString]);
  var currentCaretPosition = focusedElm.current ? geInputCaretPosition(focusedElm.current) : void 0;
  var useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect10 : useEffect9;
  useIsomorphicLayoutEffect(function() {
    var input = focusedElm.current;
    if (formattedValue !== lastUpdatedValue.current.formattedValue && input) {
      var caretPos = getNewCaretPosition(lastUpdatedValue.current.formattedValue, formattedValue, currentCaretPosition);
      input.value = formattedValue;
      setPatchedCaretPosition(input, caretPos, formattedValue);
    }
  }, [formattedValue]);
  var formatInputValue = function(inputValue, event, source) {
    var input = event.target;
    var changeRange = caretPositionBeforeChange.current ? findChangedRangeFromCaretPositions(caretPositionBeforeChange.current, input.selectionEnd) : findChangeRange(formattedValue, inputValue);
    var changeMeta = Object.assign(Object.assign({}, changeRange), { lastValue: formattedValue });
    var _numAsString = removeFormatting2(inputValue, changeMeta);
    var _formattedValue = _format(_numAsString);
    _numAsString = removeFormatting2(_formattedValue, void 0);
    if (isAllowed && !isAllowed(getValueObject(_formattedValue, _numAsString))) {
      var input$1 = event.target;
      var currentCaretPosition2 = geInputCaretPosition(input$1);
      var caretPos = getNewCaretPosition(inputValue, formattedValue, currentCaretPosition2);
      input$1.value = formattedValue;
      setPatchedCaretPosition(input$1, caretPos, formattedValue);
      return false;
    }
    updateValueAndCaretPosition({
      formattedValue: _formattedValue,
      numAsString: _numAsString,
      inputValue,
      event,
      source,
      input: event.target
    });
    return true;
  };
  var setCaretPositionInfoBeforeChange = function(el, endOffset) {
    if (endOffset === void 0) endOffset = 0;
    var selectionStart = el.selectionStart;
    var selectionEnd = el.selectionEnd;
    caretPositionBeforeChange.current = { selectionStart, selectionEnd: selectionEnd + endOffset };
  };
  var _onChange = function(e) {
    var el = e.target;
    var inputValue = el.value;
    var changed = formatInputValue(inputValue, e, SourceType.event);
    if (changed) {
      onChange(e);
    }
    caretPositionBeforeChange.current = void 0;
  };
  var _onKeyDown = function(e) {
    var el = e.target;
    var key = e.key;
    var selectionStart = el.selectionStart;
    var selectionEnd = el.selectionEnd;
    var value = el.value;
    if (value === void 0) value = "";
    var expectedCaretPosition;
    if (key === "ArrowLeft" || key === "Backspace") {
      expectedCaretPosition = Math.max(selectionStart - 1, 0);
    } else if (key === "ArrowRight") {
      expectedCaretPosition = Math.min(selectionStart + 1, value.length);
    } else if (key === "Delete") {
      expectedCaretPosition = selectionStart;
    }
    var endOffset = 0;
    if (key === "Delete" && selectionStart === selectionEnd) {
      endOffset = 1;
    }
    var isArrowKey = key === "ArrowLeft" || key === "ArrowRight";
    if (expectedCaretPosition === void 0 || selectionStart !== selectionEnd && !isArrowKey) {
      onKeyDown(e);
      setCaretPositionInfoBeforeChange(el, endOffset);
      return;
    }
    var newCaretPosition = expectedCaretPosition;
    if (isArrowKey) {
      var direction2 = key === "ArrowLeft" ? "left" : "right";
      newCaretPosition = correctCaretPosition(value, expectedCaretPosition, direction2);
      if (newCaretPosition !== expectedCaretPosition) {
        e.preventDefault();
      }
    } else if (key === "Delete" && !isValidInputCharacter(value[expectedCaretPosition])) {
      newCaretPosition = correctCaretPosition(value, expectedCaretPosition, "right");
    } else if (key === "Backspace" && !isValidInputCharacter(value[expectedCaretPosition])) {
      newCaretPosition = correctCaretPosition(value, expectedCaretPosition, "left");
    }
    if (newCaretPosition !== expectedCaretPosition) {
      setPatchedCaretPosition(el, newCaretPosition, value);
    }
    onKeyDown(e);
    setCaretPositionInfoBeforeChange(el, endOffset);
  };
  var _onMouseUp = function(e) {
    var el = e.target;
    var correctCaretPositionIfRequired = function() {
      var selectionStart = el.selectionStart;
      var selectionEnd = el.selectionEnd;
      var value = el.value;
      if (value === void 0) value = "";
      if (selectionStart === selectionEnd) {
        var caretPosition = correctCaretPosition(value, selectionStart);
        if (caretPosition !== selectionStart) {
          setPatchedCaretPosition(el, caretPosition, value);
        }
      }
    };
    correctCaretPositionIfRequired();
    requestAnimationFrame(function() {
      correctCaretPositionIfRequired();
    });
    onMouseUp(e);
    setCaretPositionInfoBeforeChange(el);
  };
  var _onFocus = function(e) {
    if (e.persist) {
      e.persist();
    }
    var el = e.target;
    var currentTarget = e.currentTarget;
    focusedElm.current = el;
    timeout.current.focusTimeout = setTimeout(function() {
      var selectionStart = el.selectionStart;
      var selectionEnd = el.selectionEnd;
      var value = el.value;
      if (value === void 0) value = "";
      var caretPosition = correctCaretPosition(value, selectionStart);
      if (caretPosition !== selectionStart && !(selectionStart === 0 && selectionEnd === value.length)) {
        setPatchedCaretPosition(el, caretPosition, value);
      }
      onFocus(Object.assign(Object.assign({}, e), { currentTarget }));
    }, 0);
  };
  var _onBlur = function(e) {
    focusedElm.current = null;
    clearTimeout(timeout.current.focusTimeout);
    clearTimeout(timeout.current.setCaretTimeout);
    onBlur(e);
  };
  var inputMode = mounted && addInputMode() ? "numeric" : void 0;
  var inputProps = Object.assign({ inputMode }, otherProps, {
    type,
    value: formattedValue,
    onChange: _onChange,
    onKeyDown: _onKeyDown,
    onMouseUp: _onMouseUp,
    onFocus: _onFocus,
    onBlur: _onBlur
  });
  if (displayType === "text") {
    return renderText ? React35.createElement(React35.Fragment, null, renderText(formattedValue, otherProps) || null) : React35.createElement("span", Object.assign({}, otherProps, { ref: getInputRef }), formattedValue);
  } else if (customInput) {
    var CustomInput = customInput;
    return React35.createElement(CustomInput, Object.assign({}, inputProps, { ref: getInputRef }));
  }
  return React35.createElement("input", Object.assign({}, inputProps, { ref: getInputRef }));
}
function format(numStr, props) {
  var decimalScale = props.decimalScale;
  var fixedDecimalScale = props.fixedDecimalScale;
  var prefix = props.prefix;
  if (prefix === void 0) prefix = "";
  var suffix = props.suffix;
  if (suffix === void 0) suffix = "";
  var allowNegative = props.allowNegative;
  var thousandsGroupStyle = props.thousandsGroupStyle;
  if (thousandsGroupStyle === void 0) thousandsGroupStyle = "thousand";
  if (numStr === "" || numStr === "-") {
    return numStr;
  }
  var ref = getSeparators(props);
  var thousandSeparator = ref.thousandSeparator;
  var decimalSeparator = ref.decimalSeparator;
  var hasDecimalSeparator = decimalScale !== 0 && numStr.indexOf(".") !== -1 || decimalScale && fixedDecimalScale;
  var ref$1 = splitDecimal(numStr, allowNegative);
  var beforeDecimal = ref$1.beforeDecimal;
  var afterDecimal = ref$1.afterDecimal;
  var addNegation = ref$1.addNegation;
  if (decimalScale !== void 0) {
    afterDecimal = limitToScale(afterDecimal, decimalScale, !!fixedDecimalScale);
  }
  if (thousandSeparator) {
    beforeDecimal = applyThousandSeparator(beforeDecimal, thousandSeparator, thousandsGroupStyle);
  }
  if (prefix) {
    beforeDecimal = prefix + beforeDecimal;
  }
  if (suffix) {
    afterDecimal = afterDecimal + suffix;
  }
  if (addNegation) {
    beforeDecimal = "-" + beforeDecimal;
  }
  numStr = beforeDecimal + (hasDecimalSeparator && decimalSeparator || "") + afterDecimal;
  return numStr;
}
function getSeparators(props) {
  var decimalSeparator = props.decimalSeparator;
  if (decimalSeparator === void 0) decimalSeparator = ".";
  var thousandSeparator = props.thousandSeparator;
  var allowedDecimalSeparators = props.allowedDecimalSeparators;
  if (thousandSeparator === true) {
    thousandSeparator = ",";
  }
  if (!allowedDecimalSeparators) {
    allowedDecimalSeparators = [decimalSeparator, "."];
  }
  return {
    decimalSeparator,
    thousandSeparator,
    allowedDecimalSeparators
  };
}
function handleNegation(value, allowNegative) {
  if (value === void 0) value = "";
  var negationRegex = new RegExp("(-)");
  var doubleNegationRegex = new RegExp("(-)(.)*(-)");
  var hasNegation = negationRegex.test(value);
  var removeNegation = doubleNegationRegex.test(value);
  value = value.replace(/-/g, "");
  if (hasNegation && !removeNegation && allowNegative) {
    value = "-" + value;
  }
  return value;
}
function getNumberRegex(decimalSeparator, global2) {
  return new RegExp("(^-)|[0-9]|" + escapeRegExp(decimalSeparator), global2 ? "g" : void 0);
}
function isNumericString(val, prefix, suffix) {
  if (val === "") {
    return true;
  }
  return !(prefix === null || prefix === void 0 ? void 0 : prefix.match(/\d/)) && !(suffix === null || suffix === void 0 ? void 0 : suffix.match(/\d/)) && typeof val === "string" && !isNaN(Number(val));
}
function removeFormatting(value, changeMeta, props) {
  var assign;
  if (changeMeta === void 0) changeMeta = getDefaultChangeMeta(value);
  var allowNegative = props.allowNegative;
  var prefix = props.prefix;
  if (prefix === void 0) prefix = "";
  var suffix = props.suffix;
  if (suffix === void 0) suffix = "";
  var decimalScale = props.decimalScale;
  var from = changeMeta.from;
  var to = changeMeta.to;
  var start = to.start;
  var end = to.end;
  var ref = getSeparators(props);
  var allowedDecimalSeparators = ref.allowedDecimalSeparators;
  var decimalSeparator = ref.decimalSeparator;
  var isBeforeDecimalSeparator = value[end] === decimalSeparator;
  if (charIsNumber(value) && (value === prefix || value === suffix) && changeMeta.lastValue === "") {
    return value;
  }
  if (end - start === 1 && allowedDecimalSeparators.indexOf(value[start]) !== -1) {
    var separator = decimalScale === 0 ? "" : decimalSeparator;
    value = value.substring(0, start) + separator + value.substring(start + 1, value.length);
  }
  var stripNegation = function(value2, start2, end2) {
    var hasNegation2 = false;
    var hasDoubleNegation = false;
    if (prefix.startsWith("-")) {
      hasNegation2 = false;
    } else if (value2.startsWith("--")) {
      hasNegation2 = false;
      hasDoubleNegation = true;
    } else if (suffix.startsWith("-") && value2.length === suffix.length) {
      hasNegation2 = false;
    } else if (value2[0] === "-") {
      hasNegation2 = true;
    }
    var charsToRemove = hasNegation2 ? 1 : 0;
    if (hasDoubleNegation) {
      charsToRemove = 2;
    }
    if (charsToRemove) {
      value2 = value2.substring(charsToRemove);
      start2 -= charsToRemove;
      end2 -= charsToRemove;
    }
    return { value: value2, start: start2, end: end2, hasNegation: hasNegation2 };
  };
  var toMetadata = stripNegation(value, start, end);
  var hasNegation = toMetadata.hasNegation;
  assign = toMetadata, value = assign.value, start = assign.start, end = assign.end;
  var ref$1 = stripNegation(changeMeta.lastValue, from.start, from.end);
  var fromStart = ref$1.start;
  var fromEnd = ref$1.end;
  var lastValue = ref$1.value;
  var updatedSuffixPart = value.substring(start, end);
  if (value.length && lastValue.length && (fromStart > lastValue.length - suffix.length || fromEnd < prefix.length) && !(updatedSuffixPart && suffix.startsWith(updatedSuffixPart))) {
    value = lastValue;
  }
  var startIndex = 0;
  if (value.startsWith(prefix)) {
    startIndex += prefix.length;
  } else if (start < prefix.length) {
    startIndex = start;
  }
  value = value.substring(startIndex);
  end -= startIndex;
  var endIndex = value.length;
  var suffixStartIndex = value.length - suffix.length;
  if (value.endsWith(suffix)) {
    endIndex = suffixStartIndex;
  } else if (end > suffixStartIndex) {
    endIndex = end;
  } else if (end > value.length - suffix.length) {
    endIndex = end;
  }
  value = value.substring(0, endIndex);
  value = handleNegation(hasNegation ? "-" + value : value, allowNegative);
  value = (value.match(getNumberRegex(decimalSeparator, true)) || []).join("");
  var firstIndex = value.indexOf(decimalSeparator);
  value = value.replace(new RegExp(escapeRegExp(decimalSeparator), "g"), function(match, index) {
    return index === firstIndex ? "." : "";
  });
  var ref$2 = splitDecimal(value, allowNegative);
  var beforeDecimal = ref$2.beforeDecimal;
  var afterDecimal = ref$2.afterDecimal;
  var addNegation = ref$2.addNegation;
  if (to.end - to.start < from.end - from.start && beforeDecimal === "" && isBeforeDecimalSeparator && !parseFloat(afterDecimal)) {
    value = addNegation ? "-" : "";
  }
  return value;
}
function getCaretBoundary(formattedValue, props) {
  var prefix = props.prefix;
  if (prefix === void 0) prefix = "";
  var suffix = props.suffix;
  if (suffix === void 0) suffix = "";
  var boundaryAry = Array.from({ length: formattedValue.length + 1 }).map(function() {
    return true;
  });
  var hasNegation = formattedValue[0] === "-";
  boundaryAry.fill(false, 0, Math.min(prefix.length + (hasNegation ? 1 : 0), formattedValue.length));
  var valLn = formattedValue.length;
  boundaryAry.fill(false, valLn - suffix.length + 1, valLn + 1);
  return boundaryAry;
}
function validateAndUpdateProps(props) {
  var ref = getSeparators(props);
  var thousandSeparator = ref.thousandSeparator;
  var decimalSeparator = ref.decimalSeparator;
  var prefix = props.prefix;
  if (prefix === void 0) prefix = "";
  var allowNegative = props.allowNegative;
  if (allowNegative === void 0) allowNegative = true;
  if (thousandSeparator === decimalSeparator) {
    throw new Error("\n        Decimal separator can't be same as thousand separator.\n        thousandSeparator: " + thousandSeparator + ' (thousandSeparator = {true} is same as thousandSeparator = ",")\n        decimalSeparator: ' + decimalSeparator + " (default value for decimalSeparator is .)\n     ");
  }
  if (prefix.startsWith("-") && allowNegative) {
    console.error("\n      Prefix can't start with '-' when allowNegative is true.\n      prefix: " + prefix + "\n      allowNegative: " + allowNegative + "\n    ");
    allowNegative = false;
  }
  return Object.assign(Object.assign({}, props), { allowNegative });
}
function useNumericFormat(props) {
  props = validateAndUpdateProps(props);
  var _decimalSeparator = props.decimalSeparator;
  var _allowedDecimalSeparators = props.allowedDecimalSeparators;
  var thousandsGroupStyle = props.thousandsGroupStyle;
  var suffix = props.suffix;
  var allowNegative = props.allowNegative;
  var allowLeadingZeros = props.allowLeadingZeros;
  var onKeyDown = props.onKeyDown;
  if (onKeyDown === void 0) onKeyDown = noop;
  var onBlur = props.onBlur;
  if (onBlur === void 0) onBlur = noop;
  var thousandSeparator = props.thousandSeparator;
  var decimalScale = props.decimalScale;
  var fixedDecimalScale = props.fixedDecimalScale;
  var prefix = props.prefix;
  if (prefix === void 0) prefix = "";
  var defaultValue = props.defaultValue;
  var value = props.value;
  var valueIsNumericString = props.valueIsNumericString;
  var onValueChange = props.onValueChange;
  var restProps = __rest(props, ["decimalSeparator", "allowedDecimalSeparators", "thousandsGroupStyle", "suffix", "allowNegative", "allowLeadingZeros", "onKeyDown", "onBlur", "thousandSeparator", "decimalScale", "fixedDecimalScale", "prefix", "defaultValue", "value", "valueIsNumericString", "onValueChange"]);
  var ref = getSeparators(props);
  var decimalSeparator = ref.decimalSeparator;
  var allowedDecimalSeparators = ref.allowedDecimalSeparators;
  var _format = function(numStr) {
    return format(numStr, props);
  };
  var _removeFormatting = function(inputValue, changeMeta) {
    return removeFormatting(inputValue, changeMeta, props);
  };
  var _value = isNil(value) ? defaultValue : value;
  var _valueIsNumericString = valueIsNumericString !== null && valueIsNumericString !== void 0 ? valueIsNumericString : isNumericString(_value, prefix, suffix);
  if (!isNil(value)) {
    _valueIsNumericString = _valueIsNumericString || typeof value === "number";
  } else if (!isNil(defaultValue)) {
    _valueIsNumericString = _valueIsNumericString || typeof defaultValue === "number";
  }
  var roundIncomingValueToPrecision = function(value2) {
    if (isNotValidValue(value2)) {
      return value2;
    }
    if (typeof value2 === "number") {
      value2 = toNumericString(value2);
    }
    if (_valueIsNumericString && typeof decimalScale === "number") {
      return roundToPrecision(value2, decimalScale, Boolean(fixedDecimalScale));
    }
    return value2;
  };
  var ref$1 = useInternalValues(roundIncomingValueToPrecision(value), roundIncomingValueToPrecision(defaultValue), Boolean(_valueIsNumericString), _format, _removeFormatting, onValueChange);
  var ref$1_0 = ref$1[0];
  var numAsString = ref$1_0.numAsString;
  var formattedValue = ref$1_0.formattedValue;
  var _onValueChange = ref$1[1];
  var _onKeyDown = function(e) {
    var el = e.target;
    var key = e.key;
    var selectionStart = el.selectionStart;
    var selectionEnd = el.selectionEnd;
    var value2 = el.value;
    if (value2 === void 0) value2 = "";
    if ((key === "Backspace" || key === "Delete") && selectionEnd < prefix.length && value2 !== "-") {
      e.preventDefault();
      return;
    }
    if (selectionStart !== selectionEnd) {
      onKeyDown(e);
      return;
    }
    if (key === "Backspace" && value2[0] === "-" && selectionStart === prefix.length + 1 && allowNegative) {
      setCaretPosition(el, 1);
    }
    if (decimalScale && fixedDecimalScale) {
      if (key === "Backspace" && value2[selectionStart - 1] === decimalSeparator) {
        setCaretPosition(el, selectionStart - 1);
        e.preventDefault();
      } else if (key === "Delete" && value2[selectionStart] === decimalSeparator) {
        e.preventDefault();
      }
    }
    if ((allowedDecimalSeparators === null || allowedDecimalSeparators === void 0 ? void 0 : allowedDecimalSeparators.includes(key)) && value2[selectionStart] === decimalSeparator) {
      setCaretPosition(el, selectionStart + 1);
    }
    var _thousandSeparator = thousandSeparator === true ? "," : thousandSeparator;
    if (key === "Backspace" && value2[selectionStart - 1] === _thousandSeparator) {
      setCaretPosition(el, selectionStart - 1);
    }
    if (key === "Delete" && value2[selectionStart] === _thousandSeparator) {
      setCaretPosition(el, selectionStart + 1);
    }
    onKeyDown(e);
  };
  var _onBlur = function(e) {
    var _value2 = numAsString;
    if (!_value2.match(/\d/g)) {
      _value2 = "";
    }
    if (!allowLeadingZeros) {
      _value2 = fixLeadingZero(_value2);
    }
    if (fixedDecimalScale && decimalScale) {
      _value2 = roundToPrecision(_value2, decimalScale, fixedDecimalScale);
    }
    if (_value2 !== numAsString) {
      var formattedValue2 = format(_value2, props);
      _onValueChange({
        formattedValue: formattedValue2,
        value: _value2,
        floatValue: parseFloat(_value2)
      }, {
        event: e,
        source: SourceType.event
      });
    }
    onBlur(e);
  };
  var isValidInputCharacter = function(inputChar) {
    if (inputChar === decimalSeparator) {
      return true;
    }
    return charIsNumber(inputChar);
  };
  var isCharacterSame = function(ref2) {
    var currentValue = ref2.currentValue;
    var lastValue = ref2.lastValue;
    var formattedValue2 = ref2.formattedValue;
    var currentValueIndex = ref2.currentValueIndex;
    var formattedValueIndex = ref2.formattedValueIndex;
    var curChar = currentValue[currentValueIndex];
    var newChar = formattedValue2[formattedValueIndex];
    var typedRange = findChangeRange(lastValue, currentValue);
    var to = typedRange.to;
    var getDecimalSeparatorIndex = function(value2) {
      return _removeFormatting(value2).indexOf(".") + prefix.length;
    };
    if (value === 0 && fixedDecimalScale && decimalScale && currentValue[to.start] === decimalSeparator && getDecimalSeparatorIndex(currentValue) < currentValueIndex && getDecimalSeparatorIndex(formattedValue2) > formattedValueIndex) {
      return false;
    }
    if (currentValueIndex >= to.start && currentValueIndex < to.end && allowedDecimalSeparators && allowedDecimalSeparators.includes(curChar) && newChar === decimalSeparator) {
      return true;
    }
    return curChar === newChar;
  };
  return Object.assign(Object.assign({}, restProps), {
    value: formattedValue,
    valueIsNumericString: false,
    isValidInputCharacter,
    isCharacterSame,
    onValueChange: _onValueChange,
    format: _format,
    removeFormatting: _removeFormatting,
    getCaretBoundary: function(formattedValue2) {
      return getCaretBoundary(formattedValue2, props);
    },
    onKeyDown: _onKeyDown,
    onBlur: _onBlur
  });
}
function NumericFormat(props) {
  var numericFormatProps = useNumericFormat(props);
  return React35.createElement(NumberFormatBase, Object.assign({}, numericFormatProps));
}
var SourceType, findChangeRange, findChangedRangeFromCaretPositions;
var init_react_number_format_es = __esm({
  "node_modules/.pnpm/react-number-format@5.4.5_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/react-number-format/dist/react-number-format.es.js"() {
    (function(SourceType2) {
      SourceType2["event"] = "event";
      SourceType2["props"] = "prop";
    })(SourceType || (SourceType = {}));
    findChangeRange = memoizeOnce(function(prevValue, newValue) {
      var i = 0, j2 = 0;
      var prevLength = prevValue.length;
      var newLength = newValue.length;
      while (prevValue[i] === newValue[i] && i < prevLength) {
        i++;
      }
      while (prevValue[prevLength - 1 - j2] === newValue[newLength - 1 - j2] && newLength - j2 > i && prevLength - j2 > i) {
        j2++;
      }
      return {
        from: { start: i, end: prevLength - j2 },
        to: { start: i, end: newLength - j2 }
      };
    });
    findChangedRangeFromCaretPositions = function(lastCaretPositions, currentCaretPosition) {
      var startPosition = Math.min(lastCaretPositions.selectionStart, currentCaretPosition);
      return {
        from: { start: startPosition, end: lastCaretPositions.selectionEnd },
        to: { start: startPosition, end: currentCaretPosition }
      };
    };
  }
});

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/number-overlay-editor.js
var number_overlay_editor_exports = {};
__export(number_overlay_editor_exports, {
  default: () => number_overlay_editor_default
});
import * as React36 from "react";
function getDecimalSeparator() {
  const numberWithDecimalSeparator = 1.1;
  const result = Intl.NumberFormat()?.formatToParts(numberWithDecimalSeparator)?.find((part) => part.type === "decimal")?.value;
  return result ?? ".";
}
function getThousandSeprator() {
  return getDecimalSeparator() === "." ? "," : ".";
}
var NumberOverlayEditor, number_overlay_editor_default;
var init_number_overlay_editor = __esm({
  "vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/number-overlay-editor.js"() {
    init_number_overlay_editor_style();
    init_react_number_format_es();
    NumberOverlayEditor = (p2) => {
      const { value, onChange, disabled, highlight, validatedSelection, fixedDecimals, allowNegative, thousandSeparator, decimalSeparator } = p2;
      const inputRef = React36.useRef();
      React36.useLayoutEffect(() => {
        if (validatedSelection !== void 0) {
          const range2 = typeof validatedSelection === "number" ? [validatedSelection, null] : validatedSelection;
          inputRef.current?.setSelectionRange(range2[0], range2[1]);
        }
      }, [validatedSelection]);
      return React36.createElement(
        NumberOverlayEditorStyle,
        null,
        React36.createElement(NumericFormat, {
          autoFocus: true,
          getInputRef: inputRef,
          className: "gdg-input",
          onFocus: (e) => e.target.setSelectionRange(highlight ? 0 : e.target.value.length, e.target.value.length),
          disabled: disabled === true,
          decimalScale: fixedDecimals,
          allowNegative,
          thousandSeparator: thousandSeparator ?? getThousandSeprator(),
          decimalSeparator: decimalSeparator ?? getDecimalSeparator(),
          value: Object.is(value, -0) ? "-" : value ?? "",
          // decimalScale={3}
          // prefix={"$"}
          onValueChange: onChange
        })
      );
    };
    number_overlay_editor_default = NumberOverlayEditor;
  }
});

// node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/throttle.js
var require_throttle = __commonJS({
  "node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/throttle.js"(exports, module) {
    var debounce3 = require_debounce();
    var isObject = require_isObject();
    var FUNC_ERROR_TEXT = "Expected a function";
    function throttle2(func, wait, options) {
      var leading = true, trailing = true;
      if (typeof func != "function") {
        throw new TypeError(FUNC_ERROR_TEXT);
      }
      if (isObject(options)) {
        leading = "leading" in options ? !!options.leading : leading;
        trailing = "trailing" in options ? !!options.trailing : trailing;
      }
      return debounce3(func, wait, {
        "leading": leading,
        "maxWait": wait,
        "trailing": trailing
      });
    }
    module.exports = throttle2;
  }
});

// vendor/glide-data-grid/dist/esm/index.js
init_data_grid_types();

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/image-overlay-editor.js
import * as React2 from "react";

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/image-overlay-editor-style.js
init_dist2();
var ImageOverlayEditorStyle = /* @__PURE__ */ styled_default("div")({
  name: "ImageOverlayEditorStyle",
  class: "gdg-i2iowwq",
  propsAsIs: false
});

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/image-overlay-editor.js
var import_react_responsive_carousel = __toESM(require_js(), 1);

// vendor/glide-data-grid/dist/esm/common/utils.js
var import_debounce = __toESM(require_debounce(), 1);
init_support();
import * as React from "react";
function useEventListener(eventName, handler, element, passive, capture = false) {
  const savedHandler = React.useRef();
  savedHandler.current = handler;
  React.useEffect(
    () => {
      if (element === null || element.addEventListener === void 0)
        return;
      const el = element;
      const eventListener = (event) => {
        savedHandler.current?.call(el, event);
      };
      el.addEventListener(eventName, eventListener, { passive, capture });
      return () => {
        el.removeEventListener(eventName, eventListener, { capture });
      };
    },
    [eventName, element, passive, capture]
    // Re-run if eventName or element changes
  );
}
function whenDefined(obj, result) {
  return obj === void 0 ? void 0 : result;
}
var PI = Math.PI;
function degreesToRadians(degrees) {
  return degrees * PI / 180;
}
var getSquareBB = (posX, posY, squareSideLength) => ({
  x1: posX - squareSideLength / 2,
  y1: posY - squareSideLength / 2,
  x2: posX + squareSideLength / 2,
  y2: posY + squareSideLength / 2
});
var getSquareXPosFromAlign = (alignment, containerX, containerWidth, horizontalPadding, squareWidth) => {
  switch (alignment) {
    case "left":
      return Math.floor(containerX) + horizontalPadding + squareWidth / 2;
    case "center":
      return Math.floor(containerX + containerWidth / 2);
    case "right":
      return Math.floor(containerX + containerWidth) - horizontalPadding - squareWidth / 2;
  }
};
var getSquareWidth = (maxSize, containerHeight, verticalPadding) => Math.min(maxSize, containerHeight - verticalPadding * 2);
var pointIsWithinBB = (x2, y2, bb) => bb.x1 <= x2 && x2 <= bb.x2 && bb.y1 <= y2 && y2 <= bb.y2;
var EditPencil = (props) => {
  const fg = props.fgColor ?? "currentColor";
  return React.createElement(
    "svg",
    { viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
    React.createElement("path", { d: "M12.7073 7.05029C7.87391 11.8837 10.4544 9.30322 6.03024 13.7273C5.77392 13.9836 5.58981 14.3071 5.50189 14.6587L4.52521 18.5655C4.38789 19.1148 4.88543 19.6123 5.43472 19.475L9.34146 18.4983C9.69313 18.4104 10.0143 18.2286 10.2706 17.9722L16.9499 11.2929", stroke: fg, strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", fill: "none", vectorEffect: "non-scaling-stroke" }),
    React.createElement("path", { d: "M20.4854 4.92901L19.0712 3.5148C18.2901 2.73375 17.0238 2.73375 16.2428 3.5148L14.475 5.28257C15.5326 7.71912 16.4736 8.6278 18.7176 9.52521L20.4854 7.75744C21.2665 6.97639 21.2665 5.71006 20.4854 4.92901Z", stroke: fg, strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", fill: "none", vectorEffect: "non-scaling-stroke" })
  );
};
var Checkmark = (props) => {
  const fg = props.fgColor ?? "currentColor";
  return React.createElement(
    "svg",
    { viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
    React.createElement("path", { d: "M19 6L10.3802 17L5.34071 11.8758", vectorEffect: "non-scaling-stroke", stroke: fg, strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" })
  );
};
function useDebouncedMemo(factory, deps, time) {
  const [state, setState] = React.useState(factory);
  const mountedRef = React.useRef(true);
  React.useEffect(() => () => {
    mountedRef.current = false;
  }, []);
  const debouncedSetState = React.useRef((0, import_debounce.default)((x2) => {
    if (mountedRef.current) {
      setState(x2);
    }
  }, time));
  React.useLayoutEffect(() => {
    if (mountedRef.current) {
      debouncedSetState.current(() => factory());
    }
  }, deps);
  return state;
}
var rtlRange = "\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC";
var ltrRange = "A-Za-z\xC0-\xD6\xD8-\xF6\xF8-\u02B8\u0300-\u0590\u0800-\u1FFF\u200E\u2C00-\uFB1C\uFE00-\uFE6F\uFEFD-\uFFFF";
var rtl = new RegExp("^[^" + ltrRange + "]*[" + rtlRange + "]");
function direction(value) {
  return rtl.test(value) ? "rtl" : "not-rtl";
}
var scrollbarWidthCache = void 0;
function getScrollBarWidth() {
  if (typeof document === "undefined")
    return 0;
  if (scrollbarWidthCache !== void 0)
    return scrollbarWidthCache;
  const inner = document.createElement("p");
  inner.style.width = "100%";
  inner.style.height = "200px";
  const outer = document.createElement("div");
  outer.id = "testScrollbar";
  outer.style.position = "absolute";
  outer.style.top = "0px";
  outer.style.left = "0px";
  outer.style.visibility = "hidden";
  outer.style.width = "200px";
  outer.style.height = "150px";
  outer.style.overflow = "hidden";
  outer.append(inner);
  document.body.append(outer);
  const w1 = inner.offsetWidth;
  outer.style.overflow = "scroll";
  let w22 = inner.offsetWidth;
  if (w1 === w22) {
    w22 = outer.clientWidth;
  }
  outer.remove();
  scrollbarWidthCache = w1 - w22;
  return scrollbarWidthCache;
}
var empty = Symbol();
function useStateWithReactiveInput(inputState) {
  const inputStateRef = React.useRef([empty, inputState]);
  if (inputStateRef.current[1] !== inputState) {
    inputStateRef.current[0] = inputState;
  }
  inputStateRef.current[1] = inputState;
  const [state, setState] = React.useState(inputState);
  const [, forceRender] = React.useState();
  const setStateOuter = React.useCallback((nv) => {
    const s = inputStateRef.current[0];
    if (s !== empty) {
      nv = typeof nv === "function" ? nv(s) : nv;
      if (nv === s)
        return;
    }
    if (s !== empty)
      forceRender({});
    setState((pv) => {
      if (typeof nv === "function") {
        return nv(s === empty ? pv : s);
      }
      return nv;
    });
    inputStateRef.current[0] = empty;
  }, []);
  const onEmpty = React.useCallback(() => {
    inputStateRef.current[0] = empty;
    forceRender({});
  }, []);
  return [inputStateRef.current[0] === empty ? state : inputStateRef.current[0], setStateOuter, onEmpty];
}
function makeAccessibilityStringForArray(arr) {
  if (arr.length === 0) {
    return "";
  }
  let index = 0;
  let count = 0;
  for (const str of arr) {
    count += str.length;
    if (count > 1e4)
      break;
    index++;
  }
  return arr.slice(0, index).join(", ");
}
function useDeepMemo(value) {
  const ref = React.useRef(value);
  if (!deepEqual(value, ref.current)) {
    ref.current = value;
  }
  return ref.current;
}

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/image-overlay-editor.js
var ImageOverlayEditor = (p2) => {
  const { urls, canWrite, onEditClick, renderImage } = p2;
  const filtered = urls.filter((u) => u !== "");
  if (filtered.length === 0) {
    return null;
  }
  const allowMove = filtered.length > 1;
  return React2.createElement(
    ImageOverlayEditorStyle,
    { "data-testid": "GDG-default-image-overlay-editor" },
    React2.createElement(import_react_responsive_carousel.Carousel, { showArrows: allowMove, showThumbs: false, swipeable: allowMove, emulateTouch: allowMove, infiniteLoop: allowMove }, filtered.map((url) => {
      const innerContent = renderImage?.(url) ?? React2.createElement("img", { draggable: false, src: url });
      return React2.createElement("div", { className: "gdg-centering-container", key: url }, innerContent);
    })),
    canWrite && onEditClick && React2.createElement(
      "button",
      { className: "gdg-edit-icon", onClick: onEditClick },
      React2.createElement(EditPencil, null)
    )
  );
};

// vendor/glide-data-grid/dist/esm/internal/markdown-div/markdown-div.js
import React3 from "react";

// node_modules/.pnpm/marked@16.4.2/node_modules/marked/lib/marked.esm.js
function L() {
  return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
}
var T = L();
function G(l3) {
  T = l3;
}
var E = { exec: () => null };
function d(l3, e = "") {
  let t = typeof l3 == "string" ? l3 : l3.source, n = { replace: (r, i) => {
    let s = typeof i == "string" ? i : i.source;
    return s = s.replace(m.caret, "$1"), t = t.replace(r, s), n;
  }, getRegex: () => new RegExp(t, e) };
  return n;
}
var be = (() => {
  try {
    return !!new RegExp("(?<=1)(?<!1)");
  } catch {
    return false;
  }
})();
var m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceTabs: /^\t+/, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] /, listReplaceTask: /^\[[ xX]\] +/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, unescapeTest: /&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (l3) => new RegExp(`^( {0,3}${l3})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`), hrRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`), fencesBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}(?:\`\`\`|~~~)`), headingBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}#`), htmlBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}<(?:[a-z].*>|!--)`, "i") };
var Re = /^(?:[ \t]*(?:\n|$))+/;
var Te = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var Oe = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var I = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var we = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var F = /(?:[*+-]|\d{1,9}[.)])/;
var ie = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var oe = d(ie).replace(/bull/g, F).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var ye = d(ie).replace(/bull/g, F).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var j = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
var Pe = /^[^\n]+/;
var Q = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
var Se = d(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", Q).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var $e = d(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, F).getRegex();
var v = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var U = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var _e = d("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", U).replace("tag", v).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var ae = d(j).replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex();
var Le = d(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", ae).getRegex();
var K = { blockquote: Le, code: Te, def: Se, fences: Oe, heading: we, hr: I, html: _e, lheading: oe, list: $e, newline: Re, paragraph: ae, table: E, text: Pe };
var re = d("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex();
var Me = { ...K, lheading: ye, table: re, paragraph: d(j).replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", re).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex() };
var ze = { ...K, html: d(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", U).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: E, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: d(j).replace("hr", I).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", oe).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
var Ae = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var Ee = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var le = /^( {2,}|\\)\n(?!\s*$)/;
var Ie = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var D = /[\p{P}\p{S}]/u;
var W = /[\s\p{P}\p{S}]/u;
var ue = /[^\s\p{P}\p{S}]/u;
var Ce = d(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, W).getRegex();
var pe = /(?!~)[\p{P}\p{S}]/u;
var Be = /(?!~)[\s\p{P}\p{S}]/u;
var qe = /(?:[^\s\p{P}\p{S}]|~)/u;
var ve = d(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", be ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
var ce = /^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/;
var De = d(ce, "u").replace(/punct/g, D).getRegex();
var He = d(ce, "u").replace(/punct/g, pe).getRegex();
var he = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var Ze = d(he, "gu").replace(/notPunctSpace/g, ue).replace(/punctSpace/g, W).replace(/punct/g, D).getRegex();
var Ge = d(he, "gu").replace(/notPunctSpace/g, qe).replace(/punctSpace/g, Be).replace(/punct/g, pe).getRegex();
var Ne = d("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, ue).replace(/punctSpace/g, W).replace(/punct/g, D).getRegex();
var Fe = d(/\\(punct)/, "gu").replace(/punct/g, D).getRegex();
var je = d(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var Qe = d(U).replace("(?:-->|$)", "-->").getRegex();
var Ue = d("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Qe).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var q = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+[^`]*?`+(?!`)|[^\[\]\\`])*?/;
var Ke = d(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label", q).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var de = d(/^!?\[(label)\]\[(ref)\]/).replace("label", q).replace("ref", Q).getRegex();
var ke = d(/^!?\[(ref)\](?:\[\])?/).replace("ref", Q).getRegex();
var We = d("reflink|nolink(?!\\()", "g").replace("reflink", de).replace("nolink", ke).getRegex();
var se = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
var X = { _backpedal: E, anyPunctuation: Fe, autolink: je, blockSkip: ve, br: le, code: Ee, del: E, emStrongLDelim: De, emStrongRDelimAst: Ze, emStrongRDelimUnd: Ne, escape: Ae, link: Ke, nolink: ke, punctuation: Ce, reflink: de, reflinkSearch: We, tag: Ue, text: Ie, url: E };
var Xe = { ...X, link: d(/^!?\[(label)\]\((.*?)\)/).replace("label", q).getRegex(), reflink: d(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", q).getRegex() };
var N = { ...X, emStrongRDelimAst: Ge, emStrongLDelim: He, url: d(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", se).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: d(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", se).getRegex() };
var Je = { ...N, br: d(le).replace("{2,}", "*").getRegex(), text: d(N.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
var C = { normal: K, gfm: Me, pedantic: ze };
var M = { normal: X, gfm: N, breaks: Je, pedantic: Xe };
var Ve = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var ge = (l3) => Ve[l3];
function w(l3, e) {
  if (e) {
    if (m.escapeTest.test(l3)) return l3.replace(m.escapeReplace, ge);
  } else if (m.escapeTestNoEncode.test(l3)) return l3.replace(m.escapeReplaceNoEncode, ge);
  return l3;
}
function J(l3) {
  try {
    l3 = encodeURI(l3).replace(m.percentDecode, "%");
  } catch {
    return null;
  }
  return l3;
}
function V(l3, e) {
  let t = l3.replace(m.findPipe, (i, s, a) => {
    let o = false, p2 = s;
    for (; --p2 >= 0 && a[p2] === "\\"; ) o = !o;
    return o ? "|" : " |";
  }), n = t.split(m.splitPipe), r = 0;
  if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) if (n.length > e) n.splice(e);
  else for (; n.length < e; ) n.push("");
  for (; r < n.length; r++) n[r] = n[r].trim().replace(m.slashPipe, "|");
  return n;
}
function z(l3, e, t) {
  let n = l3.length;
  if (n === 0) return "";
  let r = 0;
  for (; r < n; ) {
    let i = l3.charAt(n - r - 1);
    if (i === e && !t) r++;
    else if (i !== e && t) r++;
    else break;
  }
  return l3.slice(0, n - r);
}
function fe(l3, e) {
  if (l3.indexOf(e[1]) === -1) return -1;
  let t = 0;
  for (let n = 0; n < l3.length; n++) if (l3[n] === "\\") n++;
  else if (l3[n] === e[0]) t++;
  else if (l3[n] === e[1] && (t--, t < 0)) return n;
  return t > 0 ? -2 : -1;
}
function me(l3, e, t, n, r) {
  let i = e.href, s = e.title || null, a = l3[1].replace(r.other.outputLinkReplace, "$1");
  n.state.inLink = true;
  let o = { type: l3[0].charAt(0) === "!" ? "image" : "link", raw: t, href: i, title: s, text: a, tokens: n.inlineTokens(a) };
  return n.state.inLink = false, o;
}
function Ye(l3, e, t) {
  let n = l3.match(t.other.indentCodeCompensation);
  if (n === null) return e;
  let r = n[1];
  return e.split(`
`).map((i) => {
    let s = i.match(t.other.beginningSpace);
    if (s === null) return i;
    let [a] = s;
    return a.length >= r.length ? i.slice(r.length) : i;
  }).join(`
`);
}
var y = class {
  options;
  rules;
  lexer;
  constructor(e) {
    this.options = e || T;
  }
  space(e) {
    let t = this.rules.block.newline.exec(e);
    if (t && t[0].length > 0) return { type: "space", raw: t[0] };
  }
  code(e) {
    let t = this.rules.block.code.exec(e);
    if (t) {
      let n = t[0].replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: t[0], codeBlockStyle: "indented", text: this.options.pedantic ? n : z(n, `
`) };
    }
  }
  fences(e) {
    let t = this.rules.block.fences.exec(e);
    if (t) {
      let n = t[0], r = Ye(n, t[3] || "", this.rules);
      return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: r };
    }
  }
  heading(e) {
    let t = this.rules.block.heading.exec(e);
    if (t) {
      let n = t[2].trim();
      if (this.rules.other.endingHash.test(n)) {
        let r = z(n, "#");
        (this.options.pedantic || !r || this.rules.other.endingSpaceChar.test(r)) && (n = r.trim());
      }
      return { type: "heading", raw: t[0], depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
    }
  }
  hr(e) {
    let t = this.rules.block.hr.exec(e);
    if (t) return { type: "hr", raw: z(t[0], `
`) };
  }
  blockquote(e) {
    let t = this.rules.block.blockquote.exec(e);
    if (t) {
      let n = z(t[0], `
`).split(`
`), r = "", i = "", s = [];
      for (; n.length > 0; ) {
        let a = false, o = [], p2;
        for (p2 = 0; p2 < n.length; p2++) if (this.rules.other.blockquoteStart.test(n[p2])) o.push(n[p2]), a = true;
        else if (!a) o.push(n[p2]);
        else break;
        n = n.slice(p2);
        let u = o.join(`
`), c = u.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        r = r ? `${r}
${u}` : u, i = i ? `${i}
${c}` : c;
        let g = this.lexer.state.top;
        if (this.lexer.state.top = true, this.lexer.blockTokens(c, s, true), this.lexer.state.top = g, n.length === 0) break;
        let h = s.at(-1);
        if (h?.type === "code") break;
        if (h?.type === "blockquote") {
          let R2 = h, f = R2.raw + `
` + n.join(`
`), O = this.blockquote(f);
          s[s.length - 1] = O, r = r.substring(0, r.length - R2.raw.length) + O.raw, i = i.substring(0, i.length - R2.text.length) + O.text;
          break;
        } else if (h?.type === "list") {
          let R2 = h, f = R2.raw + `
` + n.join(`
`), O = this.list(f);
          s[s.length - 1] = O, r = r.substring(0, r.length - h.raw.length) + O.raw, i = i.substring(0, i.length - R2.raw.length) + O.raw, n = f.substring(s.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: r, tokens: s, text: i };
    }
  }
  list(e) {
    let t = this.rules.block.list.exec(e);
    if (t) {
      let n = t[1].trim(), r = n.length > 1, i = { type: "list", raw: "", ordered: r, start: r ? +n.slice(0, -1) : "", loose: false, items: [] };
      n = r ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = r ? n : "[*+-]");
      let s = this.rules.other.listItemRegex(n), a = false;
      for (; e; ) {
        let p2 = false, u = "", c = "";
        if (!(t = s.exec(e)) || this.rules.block.hr.test(e)) break;
        u = t[0], e = e.substring(u.length);
        let g = t[2].split(`
`, 1)[0].replace(this.rules.other.listReplaceTabs, (H) => " ".repeat(3 * H.length)), h = e.split(`
`, 1)[0], R2 = !g.trim(), f = 0;
        if (this.options.pedantic ? (f = 2, c = g.trimStart()) : R2 ? f = t[1].length + 1 : (f = t[2].search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, c = g.slice(f), f += t[1].length), R2 && this.rules.other.blankLine.test(h) && (u += h + `
`, e = e.substring(h.length + 1), p2 = true), !p2) {
          let H = this.rules.other.nextBulletRegex(f), ee = this.rules.other.hrRegex(f), te = this.rules.other.fencesBeginRegex(f), ne = this.rules.other.headingBeginRegex(f), xe = this.rules.other.htmlBeginRegex(f);
          for (; e; ) {
            let Z = e.split(`
`, 1)[0], A;
            if (h = Z, this.options.pedantic ? (h = h.replace(this.rules.other.listReplaceNesting, "  "), A = h) : A = h.replace(this.rules.other.tabCharGlobal, "    "), te.test(h) || ne.test(h) || xe.test(h) || H.test(h) || ee.test(h)) break;
            if (A.search(this.rules.other.nonSpaceChar) >= f || !h.trim()) c += `
` + A.slice(f);
            else {
              if (R2 || g.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || te.test(g) || ne.test(g) || ee.test(g)) break;
              c += `
` + h;
            }
            !R2 && !h.trim() && (R2 = true), u += Z + `
`, e = e.substring(Z.length + 1), g = A.slice(f);
          }
        }
        i.loose || (a ? i.loose = true : this.rules.other.doubleBlankLine.test(u) && (a = true));
        let O = null, Y;
        this.options.gfm && (O = this.rules.other.listIsTask.exec(c), O && (Y = O[0] !== "[ ] ", c = c.replace(this.rules.other.listReplaceTask, ""))), i.items.push({ type: "list_item", raw: u, task: !!O, checked: Y, loose: false, text: c, tokens: [] }), i.raw += u;
      }
      let o = i.items.at(-1);
      if (o) o.raw = o.raw.trimEnd(), o.text = o.text.trimEnd();
      else return;
      i.raw = i.raw.trimEnd();
      for (let p2 = 0; p2 < i.items.length; p2++) if (this.lexer.state.top = false, i.items[p2].tokens = this.lexer.blockTokens(i.items[p2].text, []), !i.loose) {
        let u = i.items[p2].tokens.filter((g) => g.type === "space"), c = u.length > 0 && u.some((g) => this.rules.other.anyLine.test(g.raw));
        i.loose = c;
      }
      if (i.loose) for (let p2 = 0; p2 < i.items.length; p2++) i.items[p2].loose = true;
      return i;
    }
  }
  html(e) {
    let t = this.rules.block.html.exec(e);
    if (t) return { type: "html", block: true, raw: t[0], pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: t[0] };
  }
  def(e) {
    let t = this.rules.block.def.exec(e);
    if (t) {
      let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), r = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", i = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
      return { type: "def", tag: n, raw: t[0], href: r, title: i };
    }
  }
  table(e) {
    let t = this.rules.block.table.exec(e);
    if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
    let n = V(t[1]), r = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), i = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], s = { type: "table", raw: t[0], header: [], align: [], rows: [] };
    if (n.length === r.length) {
      for (let a of r) this.rules.other.tableAlignRight.test(a) ? s.align.push("right") : this.rules.other.tableAlignCenter.test(a) ? s.align.push("center") : this.rules.other.tableAlignLeft.test(a) ? s.align.push("left") : s.align.push(null);
      for (let a = 0; a < n.length; a++) s.header.push({ text: n[a], tokens: this.lexer.inline(n[a]), header: true, align: s.align[a] });
      for (let a of i) s.rows.push(V(a, s.header.length).map((o, p2) => ({ text: o, tokens: this.lexer.inline(o), header: false, align: s.align[p2] })));
      return s;
    }
  }
  lheading(e) {
    let t = this.rules.block.lheading.exec(e);
    if (t) return { type: "heading", raw: t[0], depth: t[2].charAt(0) === "=" ? 1 : 2, text: t[1], tokens: this.lexer.inline(t[1]) };
  }
  paragraph(e) {
    let t = this.rules.block.paragraph.exec(e);
    if (t) {
      let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
      return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
    }
  }
  text(e) {
    let t = this.rules.block.text.exec(e);
    if (t) return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) };
  }
  escape(e) {
    let t = this.rules.inline.escape.exec(e);
    if (t) return { type: "escape", raw: t[0], text: t[1] };
  }
  tag(e) {
    let t = this.rules.inline.tag.exec(e);
    if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] };
  }
  link(e) {
    let t = this.rules.inline.link.exec(e);
    if (t) {
      let n = t[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
        if (!this.rules.other.endAngleBracket.test(n)) return;
        let s = z(n.slice(0, -1), "\\");
        if ((n.length - s.length) % 2 === 0) return;
      } else {
        let s = fe(t[2], "()");
        if (s === -2) return;
        if (s > -1) {
          let o = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + s;
          t[2] = t[2].substring(0, s), t[0] = t[0].substring(0, o).trim(), t[3] = "";
        }
      }
      let r = t[2], i = "";
      if (this.options.pedantic) {
        let s = this.rules.other.pedanticHrefTitle.exec(r);
        s && (r = s[1], i = s[3]);
      } else i = t[3] ? t[3].slice(1, -1) : "";
      return r = r.trim(), this.rules.other.startAngleBracket.test(r) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? r = r.slice(1) : r = r.slice(1, -1)), me(t, { href: r && r.replace(this.rules.inline.anyPunctuation, "$1"), title: i && i.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
    }
  }
  reflink(e, t) {
    let n;
    if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
      let r = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), i = t[r.toLowerCase()];
      if (!i) {
        let s = n[0].charAt(0);
        return { type: "text", raw: s, text: s };
      }
      return me(n, i, n[0], this.lexer, this.rules);
    }
  }
  emStrong(e, t, n = "") {
    let r = this.rules.inline.emStrongLDelim.exec(e);
    if (!r || r[3] && n.match(this.rules.other.unicodeAlphaNumeric)) return;
    if (!(r[1] || r[2] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let s = [...r[0]].length - 1, a, o, p2 = s, u = 0, c = r[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (c.lastIndex = 0, t = t.slice(-1 * e.length + s); (r = c.exec(t)) != null; ) {
        if (a = r[1] || r[2] || r[3] || r[4] || r[5] || r[6], !a) continue;
        if (o = [...a].length, r[3] || r[4]) {
          p2 += o;
          continue;
        } else if ((r[5] || r[6]) && s % 3 && !((s + o) % 3)) {
          u += o;
          continue;
        }
        if (p2 -= o, p2 > 0) continue;
        o = Math.min(o, o + p2 + u);
        let g = [...r[0]][0].length, h = e.slice(0, s + r.index + g + o);
        if (Math.min(s, o) % 2) {
          let f = h.slice(1, -1);
          return { type: "em", raw: h, text: f, tokens: this.lexer.inlineTokens(f) };
        }
        let R2 = h.slice(2, -2);
        return { type: "strong", raw: h, text: R2, tokens: this.lexer.inlineTokens(R2) };
      }
    }
  }
  codespan(e) {
    let t = this.rules.inline.code.exec(e);
    if (t) {
      let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), r = this.rules.other.nonSpaceChar.test(n), i = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
      return r && i && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
    }
  }
  br(e) {
    let t = this.rules.inline.br.exec(e);
    if (t) return { type: "br", raw: t[0] };
  }
  del(e) {
    let t = this.rules.inline.del.exec(e);
    if (t) return { type: "del", raw: t[0], text: t[2], tokens: this.lexer.inlineTokens(t[2]) };
  }
  autolink(e) {
    let t = this.rules.inline.autolink.exec(e);
    if (t) {
      let n, r;
      return t[2] === "@" ? (n = t[1], r = "mailto:" + n) : (n = t[1], r = n), { type: "link", raw: t[0], text: n, href: r, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  url(e) {
    let t;
    if (t = this.rules.inline.url.exec(e)) {
      let n, r;
      if (t[2] === "@") n = t[0], r = "mailto:" + n;
      else {
        let i;
        do
          i = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
        while (i !== t[0]);
        n = t[0], t[1] === "www." ? r = "http://" + t[0] : r = t[0];
      }
      return { type: "link", raw: t[0], text: n, href: r, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  inlineText(e) {
    let t = this.rules.inline.text.exec(e);
    if (t) {
      let n = this.lexer.state.inRawBlock;
      return { type: "text", raw: t[0], text: t[0], escaped: n };
    }
  }
};
var x = class l {
  tokens;
  options;
  state;
  tokenizer;
  inlineQueue;
  constructor(e) {
    this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e || T, this.options.tokenizer = this.options.tokenizer || new y(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true };
    let t = { other: m, block: C.normal, inline: M.normal };
    this.options.pedantic ? (t.block = C.pedantic, t.inline = M.pedantic) : this.options.gfm && (t.block = C.gfm, this.options.breaks ? t.inline = M.breaks : t.inline = M.gfm), this.tokenizer.rules = t;
  }
  static get rules() {
    return { block: C, inline: M };
  }
  static lex(e, t) {
    return new l(t).lex(e);
  }
  static lexInline(e, t) {
    return new l(t).inlineTokens(e);
  }
  lex(e) {
    e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
    for (let t = 0; t < this.inlineQueue.length; t++) {
      let n = this.inlineQueue[t];
      this.inlineTokens(n.src, n.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e, t = [], n = false) {
    for (this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, "")); e; ) {
      let r;
      if (this.options.extensions?.block?.some((s) => (r = s.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false)) continue;
      if (r = this.tokenizer.space(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        r.raw.length === 1 && s !== void 0 ? s.raw += `
` : t.push(r);
        continue;
      }
      if (r = this.tokenizer.code(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "paragraph" || s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.at(-1).src = s.text) : t.push(r);
        continue;
      }
      if (r = this.tokenizer.fences(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.heading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.hr(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.blockquote(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.list(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.html(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.def(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "paragraph" || s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.raw, this.inlineQueue.at(-1).src = s.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
        continue;
      }
      if (r = this.tokenizer.table(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.lheading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      let i = e;
      if (this.options.extensions?.startBlock) {
        let s = 1 / 0, a = e.slice(1), o;
        this.options.extensions.startBlock.forEach((p2) => {
          o = p2.call({ lexer: this }, a), typeof o == "number" && o >= 0 && (s = Math.min(s, o));
        }), s < 1 / 0 && s >= 0 && (i = e.substring(0, s + 1));
      }
      if (this.state.top && (r = this.tokenizer.paragraph(i))) {
        let s = t.at(-1);
        n && s?.type === "paragraph" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = s.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
        continue;
      }
      if (r = this.tokenizer.text(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = s.text) : t.push(r);
        continue;
      }
      if (e) {
        let s = "Infinite loop on byte: " + e.charCodeAt(0);
        if (this.options.silent) {
          console.error(s);
          break;
        } else throw new Error(s);
      }
    }
    return this.state.top = true, t;
  }
  inline(e, t = []) {
    return this.inlineQueue.push({ src: e, tokens: t }), t;
  }
  inlineTokens(e, t = []) {
    let n = e, r = null;
    if (this.tokens.links) {
      let o = Object.keys(this.tokens.links);
      if (o.length > 0) for (; (r = this.tokenizer.rules.inline.reflinkSearch.exec(n)) != null; ) o.includes(r[0].slice(r[0].lastIndexOf("[") + 1, -1)) && (n = n.slice(0, r.index) + "[" + "a".repeat(r[0].length - 2) + "]" + n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
    }
    for (; (r = this.tokenizer.rules.inline.anyPunctuation.exec(n)) != null; ) n = n.slice(0, r.index) + "++" + n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    let i;
    for (; (r = this.tokenizer.rules.inline.blockSkip.exec(n)) != null; ) i = r[2] ? r[2].length : 0, n = n.slice(0, r.index + i) + "[" + "a".repeat(r[0].length - i - 2) + "]" + n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
    let s = false, a = "";
    for (; e; ) {
      s || (a = ""), s = false;
      let o;
      if (this.options.extensions?.inline?.some((u) => (o = u.call({ lexer: this }, e, t)) ? (e = e.substring(o.raw.length), t.push(o), true) : false)) continue;
      if (o = this.tokenizer.escape(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.tag(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.link(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.reflink(e, this.tokens.links)) {
        e = e.substring(o.raw.length);
        let u = t.at(-1);
        o.type === "text" && u?.type === "text" ? (u.raw += o.raw, u.text += o.text) : t.push(o);
        continue;
      }
      if (o = this.tokenizer.emStrong(e, n, a)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.codespan(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.br(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.del(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.autolink(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (!this.state.inLink && (o = this.tokenizer.url(e))) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      let p2 = e;
      if (this.options.extensions?.startInline) {
        let u = 1 / 0, c = e.slice(1), g;
        this.options.extensions.startInline.forEach((h) => {
          g = h.call({ lexer: this }, c), typeof g == "number" && g >= 0 && (u = Math.min(u, g));
        }), u < 1 / 0 && u >= 0 && (p2 = e.substring(0, u + 1));
      }
      if (o = this.tokenizer.inlineText(p2)) {
        e = e.substring(o.raw.length), o.raw.slice(-1) !== "_" && (a = o.raw.slice(-1)), s = true;
        let u = t.at(-1);
        u?.type === "text" ? (u.raw += o.raw, u.text += o.text) : t.push(o);
        continue;
      }
      if (e) {
        let u = "Infinite loop on byte: " + e.charCodeAt(0);
        if (this.options.silent) {
          console.error(u);
          break;
        } else throw new Error(u);
      }
    }
    return t;
  }
};
var P = class {
  options;
  parser;
  constructor(e) {
    this.options = e || T;
  }
  space(e) {
    return "";
  }
  code({ text: e, lang: t, escaped: n }) {
    let r = (t || "").match(m.notSpaceStart)?.[0], i = e.replace(m.endingNewline, "") + `
`;
    return r ? '<pre><code class="language-' + w(r) + '">' + (n ? i : w(i, true)) + `</code></pre>
` : "<pre><code>" + (n ? i : w(i, true)) + `</code></pre>
`;
  }
  blockquote({ tokens: e }) {
    return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
  }
  html({ text: e }) {
    return e;
  }
  def(e) {
    return "";
  }
  heading({ tokens: e, depth: t }) {
    return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
  }
  hr(e) {
    return `<hr>
`;
  }
  list(e) {
    let t = e.ordered, n = e.start, r = "";
    for (let a = 0; a < e.items.length; a++) {
      let o = e.items[a];
      r += this.listitem(o);
    }
    let i = t ? "ol" : "ul", s = t && n !== 1 ? ' start="' + n + '"' : "";
    return "<" + i + s + `>
` + r + "</" + i + `>
`;
  }
  listitem(e) {
    let t = "";
    if (e.task) {
      let n = this.checkbox({ checked: !!e.checked });
      e.loose ? e.tokens[0]?.type === "paragraph" ? (e.tokens[0].text = n + " " + e.tokens[0].text, e.tokens[0].tokens && e.tokens[0].tokens.length > 0 && e.tokens[0].tokens[0].type === "text" && (e.tokens[0].tokens[0].text = n + " " + w(e.tokens[0].tokens[0].text), e.tokens[0].tokens[0].escaped = true)) : e.tokens.unshift({ type: "text", raw: n + " ", text: n + " ", escaped: true }) : t += n + " ";
    }
    return t += this.parser.parse(e.tokens, !!e.loose), `<li>${t}</li>
`;
  }
  checkbox({ checked: e }) {
    return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox">';
  }
  paragraph({ tokens: e }) {
    return `<p>${this.parser.parseInline(e)}</p>
`;
  }
  table(e) {
    let t = "", n = "";
    for (let i = 0; i < e.header.length; i++) n += this.tablecell(e.header[i]);
    t += this.tablerow({ text: n });
    let r = "";
    for (let i = 0; i < e.rows.length; i++) {
      let s = e.rows[i];
      n = "";
      for (let a = 0; a < s.length; a++) n += this.tablecell(s[a]);
      r += this.tablerow({ text: n });
    }
    return r && (r = `<tbody>${r}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + r + `</table>
`;
  }
  tablerow({ text: e }) {
    return `<tr>
${e}</tr>
`;
  }
  tablecell(e) {
    let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
    return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
  }
  strong({ tokens: e }) {
    return `<strong>${this.parser.parseInline(e)}</strong>`;
  }
  em({ tokens: e }) {
    return `<em>${this.parser.parseInline(e)}</em>`;
  }
  codespan({ text: e }) {
    return `<code>${w(e, true)}</code>`;
  }
  br(e) {
    return "<br>";
  }
  del({ tokens: e }) {
    return `<del>${this.parser.parseInline(e)}</del>`;
  }
  link({ href: e, title: t, tokens: n }) {
    let r = this.parser.parseInline(n), i = J(e);
    if (i === null) return r;
    e = i;
    let s = '<a href="' + e + '"';
    return t && (s += ' title="' + w(t) + '"'), s += ">" + r + "</a>", s;
  }
  image({ href: e, title: t, text: n, tokens: r }) {
    r && (n = this.parser.parseInline(r, this.parser.textRenderer));
    let i = J(e);
    if (i === null) return w(n);
    e = i;
    let s = `<img src="${e}" alt="${n}"`;
    return t && (s += ` title="${w(t)}"`), s += ">", s;
  }
  text(e) {
    return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : w(e.text);
  }
};
var $ = class {
  strong({ text: e }) {
    return e;
  }
  em({ text: e }) {
    return e;
  }
  codespan({ text: e }) {
    return e;
  }
  del({ text: e }) {
    return e;
  }
  html({ text: e }) {
    return e;
  }
  text({ text: e }) {
    return e;
  }
  link({ text: e }) {
    return "" + e;
  }
  image({ text: e }) {
    return "" + e;
  }
  br() {
    return "";
  }
};
var b = class l2 {
  options;
  renderer;
  textRenderer;
  constructor(e) {
    this.options = e || T, this.options.renderer = this.options.renderer || new P(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new $();
  }
  static parse(e, t) {
    return new l2(t).parse(e);
  }
  static parseInline(e, t) {
    return new l2(t).parseInline(e);
  }
  parse(e, t = true) {
    let n = "";
    for (let r = 0; r < e.length; r++) {
      let i = e[r];
      if (this.options.extensions?.renderers?.[i.type]) {
        let a = i, o = this.options.extensions.renderers[a.type].call({ parser: this }, a);
        if (o !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(a.type)) {
          n += o || "";
          continue;
        }
      }
      let s = i;
      switch (s.type) {
        case "space": {
          n += this.renderer.space(s);
          continue;
        }
        case "hr": {
          n += this.renderer.hr(s);
          continue;
        }
        case "heading": {
          n += this.renderer.heading(s);
          continue;
        }
        case "code": {
          n += this.renderer.code(s);
          continue;
        }
        case "table": {
          n += this.renderer.table(s);
          continue;
        }
        case "blockquote": {
          n += this.renderer.blockquote(s);
          continue;
        }
        case "list": {
          n += this.renderer.list(s);
          continue;
        }
        case "html": {
          n += this.renderer.html(s);
          continue;
        }
        case "def": {
          n += this.renderer.def(s);
          continue;
        }
        case "paragraph": {
          n += this.renderer.paragraph(s);
          continue;
        }
        case "text": {
          let a = s, o = this.renderer.text(a);
          for (; r + 1 < e.length && e[r + 1].type === "text"; ) a = e[++r], o += `
` + this.renderer.text(a);
          t ? n += this.renderer.paragraph({ type: "paragraph", raw: o, text: o, tokens: [{ type: "text", raw: o, text: o, escaped: true }] }) : n += o;
          continue;
        }
        default: {
          let a = 'Token with "' + s.type + '" type was not found.';
          if (this.options.silent) return console.error(a), "";
          throw new Error(a);
        }
      }
    }
    return n;
  }
  parseInline(e, t = this.renderer) {
    let n = "";
    for (let r = 0; r < e.length; r++) {
      let i = e[r];
      if (this.options.extensions?.renderers?.[i.type]) {
        let a = this.options.extensions.renderers[i.type].call({ parser: this }, i);
        if (a !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(i.type)) {
          n += a || "";
          continue;
        }
      }
      let s = i;
      switch (s.type) {
        case "escape": {
          n += t.text(s);
          break;
        }
        case "html": {
          n += t.html(s);
          break;
        }
        case "link": {
          n += t.link(s);
          break;
        }
        case "image": {
          n += t.image(s);
          break;
        }
        case "strong": {
          n += t.strong(s);
          break;
        }
        case "em": {
          n += t.em(s);
          break;
        }
        case "codespan": {
          n += t.codespan(s);
          break;
        }
        case "br": {
          n += t.br(s);
          break;
        }
        case "del": {
          n += t.del(s);
          break;
        }
        case "text": {
          n += t.text(s);
          break;
        }
        default: {
          let a = 'Token with "' + s.type + '" type was not found.';
          if (this.options.silent) return console.error(a), "";
          throw new Error(a);
        }
      }
    }
    return n;
  }
};
var S = class {
  options;
  block;
  constructor(e) {
    this.options = e || T;
  }
  static passThroughHooks = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
  static passThroughHooksRespectAsync = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"]);
  preprocess(e) {
    return e;
  }
  postprocess(e) {
    return e;
  }
  processAllTokens(e) {
    return e;
  }
  emStrongMask(e) {
    return e;
  }
  provideLexer() {
    return this.block ? x.lex : x.lexInline;
  }
  provideParser() {
    return this.block ? b.parse : b.parseInline;
  }
};
var B = class {
  defaults = L();
  options = this.setOptions;
  parse = this.parseMarkdown(true);
  parseInline = this.parseMarkdown(false);
  Parser = b;
  Renderer = P;
  TextRenderer = $;
  Lexer = x;
  Tokenizer = y;
  Hooks = S;
  constructor(...e) {
    this.use(...e);
  }
  walkTokens(e, t) {
    let n = [];
    for (let r of e) switch (n = n.concat(t.call(this, r)), r.type) {
      case "table": {
        let i = r;
        for (let s of i.header) n = n.concat(this.walkTokens(s.tokens, t));
        for (let s of i.rows) for (let a of s) n = n.concat(this.walkTokens(a.tokens, t));
        break;
      }
      case "list": {
        let i = r;
        n = n.concat(this.walkTokens(i.items, t));
        break;
      }
      default: {
        let i = r;
        this.defaults.extensions?.childTokens?.[i.type] ? this.defaults.extensions.childTokens[i.type].forEach((s) => {
          let a = i[s].flat(1 / 0);
          n = n.concat(this.walkTokens(a, t));
        }) : i.tokens && (n = n.concat(this.walkTokens(i.tokens, t)));
      }
    }
    return n;
  }
  use(...e) {
    let t = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return e.forEach((n) => {
      let r = { ...n };
      if (r.async = this.defaults.async || r.async || false, n.extensions && (n.extensions.forEach((i) => {
        if (!i.name) throw new Error("extension name required");
        if ("renderer" in i) {
          let s = t.renderers[i.name];
          s ? t.renderers[i.name] = function(...a) {
            let o = i.renderer.apply(this, a);
            return o === false && (o = s.apply(this, a)), o;
          } : t.renderers[i.name] = i.renderer;
        }
        if ("tokenizer" in i) {
          if (!i.level || i.level !== "block" && i.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
          let s = t[i.level];
          s ? s.unshift(i.tokenizer) : t[i.level] = [i.tokenizer], i.start && (i.level === "block" ? t.startBlock ? t.startBlock.push(i.start) : t.startBlock = [i.start] : i.level === "inline" && (t.startInline ? t.startInline.push(i.start) : t.startInline = [i.start]));
        }
        "childTokens" in i && i.childTokens && (t.childTokens[i.name] = i.childTokens);
      }), r.extensions = t), n.renderer) {
        let i = this.defaults.renderer || new P(this.defaults);
        for (let s in n.renderer) {
          if (!(s in i)) throw new Error(`renderer '${s}' does not exist`);
          if (["options", "parser"].includes(s)) continue;
          let a = s, o = n.renderer[a], p2 = i[a];
          i[a] = (...u) => {
            let c = o.apply(i, u);
            return c === false && (c = p2.apply(i, u)), c || "";
          };
        }
        r.renderer = i;
      }
      if (n.tokenizer) {
        let i = this.defaults.tokenizer || new y(this.defaults);
        for (let s in n.tokenizer) {
          if (!(s in i)) throw new Error(`tokenizer '${s}' does not exist`);
          if (["options", "rules", "lexer"].includes(s)) continue;
          let a = s, o = n.tokenizer[a], p2 = i[a];
          i[a] = (...u) => {
            let c = o.apply(i, u);
            return c === false && (c = p2.apply(i, u)), c;
          };
        }
        r.tokenizer = i;
      }
      if (n.hooks) {
        let i = this.defaults.hooks || new S();
        for (let s in n.hooks) {
          if (!(s in i)) throw new Error(`hook '${s}' does not exist`);
          if (["options", "block"].includes(s)) continue;
          let a = s, o = n.hooks[a], p2 = i[a];
          S.passThroughHooks.has(s) ? i[a] = (u) => {
            if (this.defaults.async && S.passThroughHooksRespectAsync.has(s)) return (async () => {
              let g = await o.call(i, u);
              return p2.call(i, g);
            })();
            let c = o.call(i, u);
            return p2.call(i, c);
          } : i[a] = (...u) => {
            if (this.defaults.async) return (async () => {
              let g = await o.apply(i, u);
              return g === false && (g = await p2.apply(i, u)), g;
            })();
            let c = o.apply(i, u);
            return c === false && (c = p2.apply(i, u)), c;
          };
        }
        r.hooks = i;
      }
      if (n.walkTokens) {
        let i = this.defaults.walkTokens, s = n.walkTokens;
        r.walkTokens = function(a) {
          let o = [];
          return o.push(s.call(this, a)), i && (o = o.concat(i.call(this, a))), o;
        };
      }
      this.defaults = { ...this.defaults, ...r };
    }), this;
  }
  setOptions(e) {
    return this.defaults = { ...this.defaults, ...e }, this;
  }
  lexer(e, t) {
    return x.lex(e, t ?? this.defaults);
  }
  parser(e, t) {
    return b.parse(e, t ?? this.defaults);
  }
  parseMarkdown(e) {
    return (n, r) => {
      let i = { ...r }, s = { ...this.defaults, ...i }, a = this.onError(!!s.silent, !!s.async);
      if (this.defaults.async === true && i.async === false) return a(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof n > "u" || n === null) return a(new Error("marked(): input parameter is undefined or null"));
      if (typeof n != "string") return a(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
      if (s.hooks && (s.hooks.options = s, s.hooks.block = e), s.async) return (async () => {
        let o = s.hooks ? await s.hooks.preprocess(n) : n, u = await (s.hooks ? await s.hooks.provideLexer() : e ? x.lex : x.lexInline)(o, s), c = s.hooks ? await s.hooks.processAllTokens(u) : u;
        s.walkTokens && await Promise.all(this.walkTokens(c, s.walkTokens));
        let h = await (s.hooks ? await s.hooks.provideParser() : e ? b.parse : b.parseInline)(c, s);
        return s.hooks ? await s.hooks.postprocess(h) : h;
      })().catch(a);
      try {
        s.hooks && (n = s.hooks.preprocess(n));
        let p2 = (s.hooks ? s.hooks.provideLexer() : e ? x.lex : x.lexInline)(n, s);
        s.hooks && (p2 = s.hooks.processAllTokens(p2)), s.walkTokens && this.walkTokens(p2, s.walkTokens);
        let c = (s.hooks ? s.hooks.provideParser() : e ? b.parse : b.parseInline)(p2, s);
        return s.hooks && (c = s.hooks.postprocess(c)), c;
      } catch (o) {
        return a(o);
      }
    };
  }
  onError(e, t) {
    return (n) => {
      if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
        let r = "<p>An error occurred:</p><pre>" + w(n.message + "", true) + "</pre>";
        return t ? Promise.resolve(r) : r;
      }
      if (t) return Promise.reject(n);
      throw n;
    };
  }
};
var _ = new B();
function k(l3, e) {
  return _.parse(l3, e);
}
k.options = k.setOptions = function(l3) {
  return _.setOptions(l3), k.defaults = _.defaults, G(k.defaults), k;
};
k.getDefaults = L;
k.defaults = T;
k.use = function(...l3) {
  return _.use(...l3), k.defaults = _.defaults, G(k.defaults), k;
};
k.walkTokens = function(l3, e) {
  return _.walkTokens(l3, e);
};
k.parseInline = _.parseInline;
k.Parser = b;
k.parser = b.parse;
k.Renderer = P;
k.TextRenderer = $;
k.Lexer = x;
k.lexer = x.lex;
k.Tokenizer = y;
k.Hooks = S;
k.parse = k;
var Zt = k.options;
var Gt = k.setOptions;
var Nt = k.use;
var Ft = k.walkTokens;
var jt = k.parseInline;
var Ut = b.parse;
var Kt = x.lex;

// vendor/glide-data-grid/dist/esm/internal/markdown-div/private/markdown-container.js
init_dist2();
var MarkdownContainer = /* @__PURE__ */ styled_default("div")({
  name: "MarkdownContainer",
  class: "gdg-mnuv029",
  propsAsIs: false
});

// vendor/glide-data-grid/dist/esm/internal/markdown-div/markdown-div.js
var MarkdownDiv = class extends React3.PureComponent {
  targetElement = null;
  renderMarkdownIntoDiv() {
    const { targetElement, props } = this;
    if (targetElement === null)
      return;
    const { contents, createNode } = props;
    const innerHTML = k(contents);
    const childRange = document.createRange();
    childRange.selectNodeContents(targetElement);
    childRange.deleteContents();
    let newChild = createNode?.(innerHTML);
    if (newChild === void 0) {
      const childDoc = document.createElement("template");
      childDoc.innerHTML = innerHTML;
      newChild = childDoc.content;
    }
    targetElement.append(newChild);
    const tags = targetElement.getElementsByTagName("a");
    for (const tag of tags) {
      tag.target = "_blank";
      tag.rel = "noreferrer noopener";
    }
  }
  containerRefHook = (element) => {
    this.targetElement = element;
    this.renderMarkdownIntoDiv();
  };
  render() {
    this.renderMarkdownIntoDiv();
    return React3.createElement(MarkdownContainer, { ref: this.containerRefHook });
  }
};

// vendor/glide-data-grid/dist/esm/internal/growing-entry/growing-entry.js
import * as React4 from "react";

// vendor/glide-data-grid/dist/esm/internal/growing-entry/growing-entry-style.js
init_dist2();
var InputBox = /* @__PURE__ */ styled_default("textarea")({
  name: "InputBox",
  class: "gdg-izpuzkl",
  propsAsIs: false
});
var ShadowBox = /* @__PURE__ */ styled_default("div")({
  name: "ShadowBox",
  class: "gdg-s69h75o",
  propsAsIs: false
});
var GrowingEntryStyle = /* @__PURE__ */ styled_default("div")({
  name: "GrowingEntryStyle",
  class: "gdg-g1y0xocz",
  propsAsIs: false
});

// vendor/glide-data-grid/dist/esm/internal/growing-entry/growing-entry.js
init_support();
var globalInputID = 0;
var GrowingEntry = (props) => {
  const { placeholder, value, onKeyDown, highlight, altNewline, validatedSelection, ...rest } = props;
  const { onChange, className } = rest;
  const inputRef = React4.useRef(null);
  const useText = value ?? "";
  assert(onChange !== void 0, "GrowingEntry must be a controlled input area");
  const [inputID] = React4.useState(() => "input-box-" + (globalInputID = (globalInputID + 1) % 1e7));
  React4.useEffect(() => {
    const ta = inputRef.current;
    if (ta === null)
      return;
    if (ta.disabled)
      return;
    const length = useText.toString().length;
    ta.focus();
    ta.setSelectionRange(highlight ? 0 : length, length);
  }, []);
  React4.useLayoutEffect(() => {
    if (validatedSelection !== void 0) {
      const range2 = typeof validatedSelection === "number" ? [validatedSelection, null] : validatedSelection;
      inputRef.current?.setSelectionRange(range2[0], range2[1]);
    }
  }, [validatedSelection]);
  const onKeyDownInner = React4.useCallback((e) => {
    if (e.key === "Enter" && e.shiftKey && altNewline === true) {
      return;
    }
    onKeyDown?.(e);
  }, [altNewline, onKeyDown]);
  return React4.createElement(
    GrowingEntryStyle,
    { className: "gdg-growing-entry" },
    React4.createElement(ShadowBox, { className }, useText + "\n"),
    React4.createElement(InputBox, { ...rest, className: (className ?? "") + " gdg-input", id: inputID, ref: inputRef, onKeyDown: onKeyDownInner, value: useText, placeholder, dir: "auto" })
  );
};

// vendor/glide-data-grid/dist/esm/index.js
init_color_parser();

// vendor/glide-data-grid/dist/esm/internal/data-grid/render/data-grid-lib.js
import React5 from "react";

// node_modules/.pnpm/canvas-hypertxt@1.0.3/node_modules/canvas-hypertxt/dist/js/index.js
var d2 = /* @__PURE__ */ new Map();
var b2 = /* @__PURE__ */ new Map();
var z2 = /* @__PURE__ */ new Map();
function v2() {
  d2.clear(), z2.clear(), b2.clear();
}
function w2(l3, s, e, c, t) {
  var n, r, o;
  let f = 0, a = {};
  for (let i of l3) f += (n = e.get(i)) != null ? n : t, a[i] = ((r = a[i]) != null ? r : 0) + 1;
  let g = s - f;
  for (let i of Object.keys(a)) {
    let m2 = a[i], u = (o = e.get(i)) != null ? o : t, h = u * m2 / f, M2 = g * h * c / m2, C2 = u + M2;
    e.set(i, C2);
  }
}
function R(l3, s) {
  var n;
  let e = /* @__PURE__ */ new Map(), c = 0;
  for (let r of "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890,.-+=?") {
    let o = l3.measureText(r).width;
    e.set(r, o), c += o;
  }
  let t = c / e.size, f = 3, a = (s / t + f) / (f + 1), g = e.keys();
  for (let r of g) e.set(r, ((n = e.get(r)) != null ? n : t) * a);
  return e;
}
function p(l3, s, e, c) {
  var g, n;
  let t = b2.get(e);
  if (c && t !== void 0 && t.count > 2e4) {
    let r = z2.get(e);
    if (r === void 0 && (r = R(l3, t.size), z2.set(e, r)), t.count > 5e5) {
      let i = 0;
      for (let m2 of s) i += (g = r.get(m2)) != null ? g : t.size;
      return i * 1.01;
    }
    let o = l3.measureText(s);
    return w2(s, o.width, r, Math.max(0.05, 1 - t.count / 2e5), t.size), b2.set(e, { count: t.count + s.length, size: t.size }), o.width;
  }
  let f = l3.measureText(s), a = f.width / s.length;
  if (((n = t == null ? void 0 : t.count) != null ? n : 0) > 2e4) return f.width;
  if (t === void 0) b2.set(e, { count: s.length, size: a });
  else {
    let r = a - t.size, o = s.length / (t.count + s.length), i = t.size + r * o;
    b2.set(e, { count: t.count + s.length, size: i });
  }
  return f.width;
}
function T2(l3, s, e, c, t, f, a, g) {
  if (s.length <= 1) return s.length;
  if (t < e) return -1;
  let n = Math.floor(e / t * f), r = p(l3, s.slice(0, Math.max(0, n)), c, a), o = g == null ? void 0 : g(s);
  if (r !== e) if (r < e) {
    for (; r < e; ) n++, r = p(l3, s.slice(0, Math.max(0, n)), c, a);
    n--;
  } else for (; r > e; ) {
    let i = o !== void 0 ? 0 : s.lastIndexOf(" ", n - 1);
    i > 0 ? n = i : n--, r = p(l3, s.slice(0, Math.max(0, n)), c, a);
  }
  if (s[n] !== " ") {
    let i = 0;
    if (o === void 0) i = s.lastIndexOf(" ", n);
    else for (let m2 of o) {
      if (m2 > n) break;
      i = m2;
    }
    i > 0 && (n = i);
  }
  return n;
}
function _2(l3, s, e, c, t, f) {
  let a = `${s}_${e}_${c}px`, g = d2.get(a);
  if (g !== void 0) return g;
  if (c <= 0) return [];
  let n = [], r = s.split(`
`), o = b2.get(e), i = o === void 0 ? s.length : c / o.size * 1.5, m2 = t && o !== void 0 && o.count > 2e4;
  for (let u of r) {
    let h = p(l3, u.slice(0, Math.max(0, i)), e, m2), M2 = Math.min(u.length, i);
    if (h <= c) n.push(u);
    else {
      for (; h > c; ) {
        let C2 = T2(l3, u, c, e, h, M2, m2, f), k2 = u.slice(0, Math.max(0, C2));
        u = u.slice(k2.length), n.push(k2), h = p(l3, u.slice(0, Math.max(0, i)), e, m2), M2 = Math.min(u.length, i);
      }
      h > 0 && n.push(u);
    }
  }
  return n = n.map((u, h) => h === 0 ? u.trimEnd() : u.trim()), d2.set(a, n), d2.size > 500 && d2.delete(d2.keys().next().value), n;
}

// vendor/glide-data-grid/dist/esm/internal/data-grid/render/data-grid-lib.js
function useMappedColumns(columns, freezeColumns) {
  return React5.useMemo(() => columns.map((c, i) => ({
    group: c.group,
    grow: c.grow,
    hasMenu: c.hasMenu,
    icon: c.icon,
    id: c.id,
    menuIcon: c.menuIcon,
    overlayIcon: c.overlayIcon,
    sourceIndex: i,
    sticky: i < freezeColumns,
    indicatorIcon: c.indicatorIcon,
    style: c.style,
    themeOverride: c.themeOverride,
    title: c.title,
    trailingRowOptions: c.trailingRowOptions,
    width: c.width,
    growOffset: c.growOffset,
    rowMarker: c.rowMarker,
    rowMarkerChecked: c.rowMarkerChecked,
    headerRowMarkerTheme: c.headerRowMarkerTheme,
    headerRowMarkerAlwaysVisible: c.headerRowMarkerAlwaysVisible,
    headerRowMarkerDisabled: c.headerRowMarkerDisabled
  })), [columns, freezeColumns]);
}
function gridSelectionHasItem(sel, item) {
  const [col, row] = item;
  if (sel.columns.hasIndex(col) || sel.rows.hasIndex(row))
    return true;
  if (sel.current !== void 0) {
    if (itemsAreEqual(sel.current.cell, item))
      return true;
    const toCheck = [sel.current.range, ...sel.current.rangeStack];
    for (const r of toCheck) {
      if (col >= r.x && col < r.x + r.width && row >= r.y && row < r.y + r.height)
        return true;
    }
  }
  return false;
}
function isGroupEqual(left, right) {
  return (left ?? "") === (right ?? "");
}
function cellIsSelected(location, cell, selection) {
  if (selection.current === void 0)
    return false;
  if (location[1] !== selection.current.cell[1])
    return false;
  if (cell.span === void 0) {
    return selection.current.cell[0] === location[0];
  }
  return selection.current.cell[0] >= cell.span[0] && selection.current.cell[0] <= cell.span[1];
}
function itemIsInRect(location, rect) {
  const [x2, y2] = location;
  return x2 >= rect.x && x2 < rect.x + rect.width && y2 >= rect.y && y2 < rect.y + rect.height;
}
function itemsAreEqual(a, b3) {
  return a?.[0] === b3?.[0] && a?.[1] === b3?.[1];
}
function rectBottomRight(rect) {
  return [rect.x + rect.width - 1, rect.y + rect.height - 1];
}
function cellIsInRect(location, cell, rect) {
  const startX = rect.x;
  const endX = rect.x + rect.width - 1;
  const startY = rect.y;
  const endY = rect.y + rect.height - 1;
  const [cellCol, cellRow] = location;
  if (cellRow < startY || cellRow > endY)
    return false;
  if (cell.span === void 0) {
    return cellCol >= startX && cellCol <= endX;
  }
  const [spanStart, spanEnd] = cell.span;
  return spanStart >= startX && spanStart <= endX || spanEnd >= startX && spanStart <= endX || spanStart < startX && spanEnd > endX;
}
function cellIsInRange(location, cell, selection, includeSingleSelection) {
  let result = 0;
  if (selection.current === void 0)
    return result;
  const range2 = selection.current.range;
  if ((includeSingleSelection || range2.height * range2.width > 1) && cellIsInRect(location, cell, range2)) {
    result++;
  }
  for (const r of selection.current.rangeStack) {
    if (cellIsInRect(location, cell, r)) {
      result++;
    }
  }
  return result;
}
function remapForDnDState(columns, dndState) {
  let mappedCols = columns;
  if (dndState !== void 0) {
    let writable = [...columns];
    const temp = mappedCols[dndState.src];
    if (dndState.src > dndState.dest) {
      writable.splice(dndState.src, 1);
      writable.splice(dndState.dest, 0, temp);
    } else {
      writable.splice(dndState.dest + 1, 0, temp);
      writable.splice(dndState.src, 1);
    }
    writable = writable.map((c, i) => ({
      ...c,
      sticky: columns[i].sticky
    }));
    mappedCols = writable;
  }
  return mappedCols;
}
function getStickyWidth(columns, dndState) {
  let result = 0;
  const remapped = remapForDnDState(columns, dndState);
  for (let i = 0; i < remapped.length; i++) {
    const c = remapped[i];
    if (c.sticky)
      result += c.width;
    else
      break;
  }
  return result;
}
function getFreezeTrailingHeight(rows, freezeTrailingRows, getRowHeight) {
  if (typeof getRowHeight === "number") {
    return freezeTrailingRows * getRowHeight;
  } else {
    let result = 0;
    for (let i = rows - freezeTrailingRows; i < rows; i++) {
      result += getRowHeight(i);
    }
    return result;
  }
}
function getEffectiveColumns(columns, cellXOffset, width, dndState, tx) {
  const mappedCols = remapForDnDState(columns, dndState);
  const sticky = [];
  for (const c of mappedCols) {
    if (c.sticky) {
      sticky.push(c);
    } else {
      break;
    }
  }
  if (sticky.length > 0) {
    for (const c of sticky) {
      width -= c.width;
    }
  }
  let endIndex = cellXOffset;
  let curX = tx ?? 0;
  while (curX <= width && endIndex < mappedCols.length) {
    curX += mappedCols[endIndex].width;
    endIndex++;
  }
  for (let i = cellXOffset; i < endIndex; i++) {
    const c = mappedCols[i];
    if (!c.sticky) {
      sticky.push(c);
    }
  }
  return sticky;
}
function getColumnIndexForX(targetX, effectiveColumns, translateX) {
  let x2 = 0;
  for (const c of effectiveColumns) {
    const cx3 = c.sticky ? x2 : x2 + (translateX ?? 0);
    if (targetX <= cx3 + c.width) {
      return c.sourceIndex;
    }
    x2 += c.width;
  }
  return -1;
}
function getRowIndexForY(targetY, height, hasGroups, headerHeight, groupHeaderHeight, rows, rowHeight, cellYOffset, translateY, freezeTrailingRows) {
  const totalHeaderHeight = headerHeight + groupHeaderHeight;
  if (hasGroups && targetY <= groupHeaderHeight)
    return -2;
  if (targetY <= totalHeaderHeight)
    return -1;
  let y2 = height;
  for (let fr = 0; fr < freezeTrailingRows; fr++) {
    const row = rows - 1 - fr;
    const rh = typeof rowHeight === "number" ? rowHeight : rowHeight(row);
    y2 -= rh;
    if (targetY >= y2) {
      return row;
    }
  }
  const effectiveRows = rows - freezeTrailingRows;
  const ty = targetY - (translateY ?? 0);
  if (typeof rowHeight === "number") {
    const target = Math.floor((ty - totalHeaderHeight) / rowHeight) + cellYOffset;
    if (target >= effectiveRows)
      return void 0;
    return target;
  } else {
    let curY = totalHeaderHeight;
    for (let i = cellYOffset; i < effectiveRows; i++) {
      const rh = rowHeight(i);
      if (ty <= curY + rh)
        return i;
      curY += rh;
    }
    return void 0;
  }
}
var metricsSize = 0;
var metricsCache = {};
var isSSR = typeof window === "undefined";
async function clearCacheOnLoad() {
  if (isSSR || document?.fonts?.ready === void 0)
    return;
  await document.fonts.ready;
  metricsSize = 0;
  metricsCache = {};
  v2();
}
void clearCacheOnLoad();
function makeCacheKey(s, ctx, baseline, font) {
  return `${s}_${font ?? ctx?.font}_${baseline}`;
}
function measureTextCached(s, ctx, font, baseline = "middle") {
  const key = makeCacheKey(s, ctx, baseline, font);
  let metrics = metricsCache[key];
  if (metrics === void 0) {
    metrics = ctx.measureText(s);
    metricsCache[key] = metrics;
    metricsSize++;
  }
  if (metricsSize > 1e4) {
    metricsCache = {};
    metricsSize = 0;
  }
  return metrics;
}
function getMeasuredTextCache(s, font) {
  const key = makeCacheKey(s, void 0, "middle", font);
  return metricsCache[key];
}
function getMiddleCenterBias(ctx, font) {
  if (typeof font !== "string") {
    font = font.baseFontFull;
  }
  return getMiddleCenterBiasInner(ctx, font);
}
function loadMetric(ctx, baseline) {
  const sample = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  ctx.save();
  ctx.textBaseline = baseline;
  const result = ctx.measureText(sample);
  ctx.restore();
  return result;
}
var biasCache = [];
function getMiddleCenterBiasInner(ctx, font) {
  for (const x2 of biasCache) {
    if (x2.key === font)
      return x2.val;
  }
  const alphabeticMetrics = loadMetric(ctx, "alphabetic");
  const middleMetrics = loadMetric(ctx, "middle");
  const bias = -(middleMetrics.actualBoundingBoxDescent - alphabeticMetrics.actualBoundingBoxDescent) + alphabeticMetrics.actualBoundingBoxAscent / 2;
  biasCache.push({
    key: font,
    val: bias
  });
  return bias;
}
function drawLastUpdateUnderlay(args, lastUpdate, frameTime, lastPrep, isLastCol, isLastRow) {
  const { ctx, rect, theme } = args;
  let progress = Number.MAX_SAFE_INTEGER;
  const animTime = 500;
  if (lastUpdate !== void 0) {
    progress = frameTime - lastUpdate;
    if (progress < animTime) {
      const fade = 1 - progress / animTime;
      ctx.globalAlpha = fade;
      ctx.fillStyle = theme.bgSearchResult;
      ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - (isLastCol ? 2 : 1), rect.height - (isLastRow ? 2 : 1));
      ctx.globalAlpha = 1;
      if (lastPrep !== void 0) {
        lastPrep.fillStyle = theme.bgSearchResult;
      }
    }
  }
  return progress < animTime;
}
function prepTextCell(args, lastPrep, overrideColor) {
  const { ctx, theme } = args;
  const result = lastPrep ?? {};
  const newFill = overrideColor ?? theme.textDark;
  if (newFill !== result.fillStyle) {
    ctx.fillStyle = newFill;
    result.fillStyle = newFill;
  }
  return result;
}
function drawTextCellExternal(args, data, contentAlign, allowWrapping, hyperWrapping) {
  const { rect, ctx, theme } = args;
  ctx.fillStyle = theme.textDark;
  drawTextCell({
    ctx,
    rect,
    theme
  }, data, contentAlign, allowWrapping, hyperWrapping);
}
function drawSingleTextLine(ctx, data, x2, y2, w3, h, bias, theme, contentAlign) {
  if (contentAlign === "right") {
    ctx.fillText(data, x2 + w3 - (theme.cellHorizontalPadding + 0.5), y2 + h / 2 + bias);
  } else if (contentAlign === "center") {
    ctx.fillText(data, x2 + w3 / 2, y2 + h / 2 + bias);
  } else {
    ctx.fillText(data, x2 + theme.cellHorizontalPadding + 0.5, y2 + h / 2 + bias);
  }
}
function getEmHeight(ctx, fontStyle) {
  const textMetrics = measureTextCached("ABCi09jgqpy", ctx, fontStyle);
  return textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
}
function truncateString(data, w3) {
  if (data.includes("\n")) {
    data = data.split(/\r?\n/, 1)[0];
  }
  const max = w3 / 4;
  if (data.length > max) {
    data = data.slice(0, max);
  }
  return data;
}
function drawMultiLineText(ctx, data, x2, y2, w3, h, bias, theme, contentAlign, hyperWrapping) {
  const fontStyle = theme.baseFontFull;
  const split = _2(ctx, data, fontStyle, w3 - theme.cellHorizontalPadding * 2, hyperWrapping ?? false);
  const emHeight = getEmHeight(ctx, fontStyle);
  const lineHeight = theme.lineHeight * emHeight;
  const actualHeight = emHeight + lineHeight * (split.length - 1);
  const mustClip = actualHeight + theme.cellVerticalPadding > h;
  if (mustClip) {
    ctx.save();
    ctx.rect(x2, y2, w3, h);
    ctx.clip();
  }
  const optimalY = y2 + h / 2 - actualHeight / 2;
  let drawY = Math.max(y2 + theme.cellVerticalPadding, optimalY);
  for (const line of split) {
    drawSingleTextLine(ctx, line, x2, drawY, w3, emHeight, bias, theme, contentAlign);
    drawY += lineHeight;
    if (drawY > y2 + h)
      break;
  }
  if (mustClip) {
    ctx.restore();
  }
}
function drawTextCell(args, data, contentAlign, allowWrapping, hyperWrapping) {
  const { ctx, rect, theme } = args;
  const { x: x2, y: y2, width: w3, height: h } = rect;
  allowWrapping = allowWrapping ?? false;
  if (!allowWrapping) {
    data = truncateString(data, w3);
  }
  const bias = getMiddleCenterBias(ctx, theme);
  const isRtl = direction(data) === "rtl";
  if (contentAlign === void 0 && isRtl) {
    contentAlign = "right";
  }
  if (isRtl) {
    ctx.direction = "rtl";
  }
  if (data.length > 0) {
    let changed = false;
    if (contentAlign === "right") {
      ctx.textAlign = "right";
      changed = true;
    } else if (contentAlign !== void 0 && contentAlign !== "left") {
      ctx.textAlign = contentAlign;
      changed = true;
    }
    if (!allowWrapping) {
      drawSingleTextLine(ctx, data, x2, y2, w3, h, bias, theme, contentAlign);
    } else {
      drawMultiLineText(ctx, data, x2, y2, w3, h, bias, theme, contentAlign, hyperWrapping);
    }
    if (changed) {
      ctx.textAlign = "start";
    }
    if (isRtl) {
      ctx.direction = "inherit";
    }
  }
}
function roundedRect(ctx, x2, y2, width, height, radius) {
  if (typeof radius === "number") {
    radius = { tl: radius, tr: radius, br: radius, bl: radius };
  }
  radius = {
    tl: Math.max(0, Math.min(radius.tl, height / 2, width / 2)),
    tr: Math.max(0, Math.min(radius.tr, height / 2, width / 2)),
    bl: Math.max(0, Math.min(radius.bl, height / 2, width / 2)),
    br: Math.max(0, Math.min(radius.br, height / 2, width / 2))
  };
  ctx.moveTo(x2 + radius.tl, y2);
  ctx.arcTo(x2 + width, y2, x2 + width, y2 + radius.tr, radius.tr);
  ctx.arcTo(x2 + width, y2 + height, x2 + width - radius.br, y2 + height, radius.br);
  ctx.arcTo(x2, y2 + height, x2, y2 + height - radius.bl, radius.bl);
  ctx.arcTo(x2, y2, x2 + radius.tl, y2, radius.tl);
}
function drawMenuDots(ctx, dotsX, dotsY) {
  const radius = 1.25;
  ctx.arc(dotsX, dotsY - radius * 3.5, radius, 0, 2 * Math.PI, false);
  ctx.arc(dotsX, dotsY, radius, 0, 2 * Math.PI, false);
  ctx.arc(dotsX, dotsY + radius * 3.5, radius, 0, 2 * Math.PI, false);
}
function roundedPoly(ctx, points, radiusAll) {
  const asVec = function(p2, pp) {
    const vx = pp.x - p2.x;
    const vy = pp.y - p2.y;
    const vlen = Math.sqrt(vx * vx + vy * vy);
    const vnx = vx / vlen;
    const vny = vy / vlen;
    return {
      x: vx,
      y: pp.y - p2.y,
      len: vlen,
      nx: vnx,
      ny: vny,
      ang: Math.atan2(vny, vnx)
    };
  };
  let radius;
  const len = points.length;
  let p1 = points[len - 1];
  for (let i = 0; i < len; i++) {
    let p2 = points[i % len];
    const p3 = points[(i + 1) % len];
    const v1 = asVec(p2, p1);
    const v22 = asVec(p2, p3);
    const sinA = v1.nx * v22.ny - v1.ny * v22.nx;
    const sinA90 = v1.nx * v22.nx - v1.ny * -v22.ny;
    let angle = Math.asin(sinA < -1 ? -1 : sinA > 1 ? 1 : sinA);
    let radDirection = 1;
    let drawDirection = false;
    if (sinA90 < 0) {
      if (angle < 0) {
        angle = Math.PI + angle;
      } else {
        angle = Math.PI - angle;
        radDirection = -1;
        drawDirection = true;
      }
    } else {
      if (angle > 0) {
        radDirection = -1;
        drawDirection = true;
      }
    }
    radius = p2.radius !== void 0 ? p2.radius : radiusAll;
    const halfAngle = angle / 2;
    let lenOut = Math.abs(Math.cos(halfAngle) * radius / Math.sin(halfAngle));
    let cRadius;
    if (lenOut > Math.min(v1.len / 2, v22.len / 2)) {
      lenOut = Math.min(v1.len / 2, v22.len / 2);
      cRadius = Math.abs(lenOut * Math.sin(halfAngle) / Math.cos(halfAngle));
    } else {
      cRadius = radius;
    }
    let x2 = p2.x + v22.nx * lenOut;
    let y2 = p2.y + v22.ny * lenOut;
    x2 += -v22.ny * cRadius * radDirection;
    y2 += v22.nx * cRadius * radDirection;
    ctx.arc(x2, y2, cRadius, v1.ang + Math.PI / 2 * radDirection, v22.ang - Math.PI / 2 * radDirection, drawDirection);
    p1 = p2;
    p2 = p3;
  }
  ctx.closePath();
}
function computeBounds(col, row, width, height, groupHeaderHeight, totalHeaderHeight, cellXOffset, cellYOffset, translateX, translateY, rows, freezeColumns, freezeTrailingRows, mappedColumns, rowHeight) {
  const result = {
    x: 0,
    y: totalHeaderHeight + translateY,
    width: 0,
    height: 0
  };
  if (col >= mappedColumns.length || row >= rows || row < -2 || col < 0) {
    return result;
  }
  const headerHeight = totalHeaderHeight - groupHeaderHeight;
  if (col >= freezeColumns) {
    const dir = cellXOffset > col ? -1 : 1;
    const freezeWidth = getStickyWidth(mappedColumns);
    result.x += freezeWidth + translateX;
    for (let i = cellXOffset; i !== col; i += dir) {
      result.x += mappedColumns[dir === 1 ? i : i - 1].width * dir;
    }
  } else {
    for (let i = 0; i < col; i++) {
      result.x += mappedColumns[i].width;
    }
  }
  result.width = mappedColumns[col].width + 1;
  if (row === -1) {
    result.y = groupHeaderHeight;
    result.height = headerHeight;
  } else if (row === -2) {
    result.y = 0;
    result.height = groupHeaderHeight;
    let start = col;
    const group = mappedColumns[col].group;
    const sticky = mappedColumns[col].sticky;
    while (start > 0 && isGroupEqual(mappedColumns[start - 1].group, group) && mappedColumns[start - 1].sticky === sticky) {
      const c = mappedColumns[start - 1];
      result.x -= c.width;
      result.width += c.width;
      start--;
    }
    let end = col;
    while (end + 1 < mappedColumns.length && isGroupEqual(mappedColumns[end + 1].group, group) && mappedColumns[end + 1].sticky === sticky) {
      const c = mappedColumns[end + 1];
      result.width += c.width;
      end++;
    }
    if (!sticky) {
      const freezeWidth = getStickyWidth(mappedColumns);
      const clip = result.x - freezeWidth;
      if (clip < 0) {
        result.x -= clip;
        result.width += clip;
      }
      if (result.x + result.width > width) {
        result.width = width - result.x;
      }
    }
  } else if (row >= rows - freezeTrailingRows) {
    let dy = rows - row;
    result.y = height;
    while (dy > 0) {
      const r = row + dy - 1;
      result.height = typeof rowHeight === "number" ? rowHeight : rowHeight(r);
      result.y -= result.height;
      dy--;
    }
    result.height += 1;
  } else {
    const dir = cellYOffset > row ? -1 : 1;
    if (typeof rowHeight === "number") {
      const delta = row - cellYOffset;
      result.y += delta * rowHeight;
    } else {
      for (let r = cellYOffset; r !== row; r += dir) {
        result.y += rowHeight(r) * dir;
      }
    }
    result.height = (typeof rowHeight === "number" ? rowHeight : rowHeight(row)) + 1;
  }
  return result;
}

// vendor/glide-data-grid/dist/esm/common/render-state-provider.js
init_support();
var rowShift = 1 << 21;
function packColRowToNumber(col, row) {
  return (row + 2) * rowShift + col;
}
function unpackCol(packed) {
  return packed % rowShift;
}
function unpackRow(packed) {
  return Math.floor(packed / rowShift) - 2;
}
function unpackNumberToColRow(packed) {
  const col = unpackCol(packed);
  const row = unpackRow(packed);
  return [col, row];
}
var WindowingTrackerBase = class {
  visibleWindow = {
    x: 0,
    y: 0,
    width: 0,
    height: 0
  };
  freezeCols = 0;
  freezeRows = [];
  isInWindow = (packed) => {
    const col = unpackCol(packed);
    const row = unpackRow(packed);
    const w3 = this.visibleWindow;
    const colInWindow = col >= w3.x && col <= w3.x + w3.width || col < this.freezeCols;
    const rowInWindow = row >= w3.y && row <= w3.y + w3.height || this.freezeRows.includes(row);
    return colInWindow && rowInWindow;
  };
  setWindow(newWindow, freezeCols, freezeRows) {
    if (this.visibleWindow.x === newWindow.x && this.visibleWindow.y === newWindow.y && this.visibleWindow.width === newWindow.width && this.visibleWindow.height === newWindow.height && this.freezeCols === freezeCols && deepEqual(this.freezeRows, freezeRows))
      return;
    this.visibleWindow = newWindow;
    this.freezeCols = freezeCols;
    this.freezeRows = freezeRows;
    this.clearOutOfWindow();
  }
};
var RenderStateProvider = class extends WindowingTrackerBase {
  cache = /* @__PURE__ */ new Map();
  setValue = (location, state) => {
    this.cache.set(packColRowToNumber(location[0], location[1]), state);
  };
  getValue = (location) => {
    return this.cache.get(packColRowToNumber(location[0], location[1]));
  };
  clearOutOfWindow = () => {
    for (const [key] of this.cache.entries()) {
      if (!this.isInWindow(key)) {
        this.cache.delete(key);
      }
    }
  };
};

// vendor/glide-data-grid/dist/esm/internal/data-grid/cell-set.js
var CellSet = class {
  cells;
  constructor(items = []) {
    this.cells = new Set(items.map((x2) => packColRowToNumber(x2[0], x2[1])));
  }
  add(cell) {
    this.cells.add(packColRowToNumber(cell[0], cell[1]));
  }
  has(cell) {
    if (cell === void 0)
      return false;
    return this.cells.has(packColRowToNumber(cell[0], cell[1]));
  }
  remove(cell) {
    this.cells.delete(packColRowToNumber(cell[0], cell[1]));
  }
  clear() {
    this.cells.clear();
  }
  get size() {
    return this.cells.size;
  }
  hasHeader() {
    for (const cellNumber of this.cells) {
      const row = unpackRow(cellNumber);
      if (row < 0)
        return true;
    }
    return false;
  }
  hasItemInRectangle(rect) {
    for (let row = rect.y; row < rect.y + rect.height; row++) {
      for (let col = rect.x; col < rect.x + rect.width; col++) {
        if (this.cells.has(packColRowToNumber(col, row))) {
          return true;
        }
      }
    }
    return false;
  }
  hasItemInRegion(rect) {
    for (const r of rect) {
      if (this.hasItemInRectangle(r)) {
        return true;
      }
    }
    return false;
  }
  *values() {
    for (const cellNumber of this.cells) {
      yield unpackNumberToColRow(cellNumber);
    }
  }
};

// vendor/glide-data-grid/dist/esm/index.js
init_styles();

// vendor/glide-data-grid/dist/esm/data-editor/use-column-sizer.js
init_data_grid_types();
import * as React7 from "react";
var defaultSize = 150;
function measureCell(ctx, cell, theme, getCellRenderer) {
  const r = getCellRenderer(cell);
  return r?.measure?.(ctx, cell, theme) ?? defaultSize;
}
function measureColumn(ctx, theme, c, colIndex, selectedData, minColumnWidth, maxColumnWidth, removeOutliers, getCellRenderer) {
  let max = 0;
  const sizes = selectedData === void 0 ? [] : selectedData.map((row) => {
    const r = measureCell(ctx, row[colIndex], theme, getCellRenderer);
    max = Math.max(max, r);
    return r;
  });
  if (sizes.length > 5 && removeOutliers) {
    max = 0;
    let sum = 0;
    for (const size of sizes) {
      sum += size;
    }
    const average = sum / sizes.length;
    for (let i = 0; i < sizes.length; i++) {
      if (sizes[i] >= average * 2) {
        sizes[i] = 0;
      } else {
        max = Math.max(max, sizes[i]);
      }
    }
  }
  const currentFont = ctx.font;
  ctx.font = theme.headerFontFull;
  max = Math.max(max, ctx.measureText(c.title).width + theme.cellHorizontalPadding * 2 + (c.icon === void 0 ? 0 : 28));
  ctx.font = currentFont;
  const final = Math.max(Math.ceil(minColumnWidth), Math.min(Math.floor(maxColumnWidth), Math.ceil(max)));
  return {
    ...c,
    width: final
  };
}
function useColumnSizer(columns, rows, getCellsForSelection, clientWidth, minColumnWidth, maxColumnWidth, theme, getCellRenderer, abortController) {
  const rowsRef = React7.useRef(rows);
  const getCellsForSelectionRef = React7.useRef(getCellsForSelection);
  const themeRef = React7.useRef(theme);
  rowsRef.current = rows;
  getCellsForSelectionRef.current = getCellsForSelection;
  themeRef.current = theme;
  const [canvas, ctx] = React7.useMemo(() => {
    if (typeof window === "undefined")
      return [null, null];
    const offscreen = document.createElement("canvas");
    offscreen.style["display"] = "none";
    offscreen.style["opacity"] = "0";
    offscreen.style["position"] = "fixed";
    return [offscreen, offscreen.getContext("2d", { alpha: false })];
  }, []);
  React7.useLayoutEffect(() => {
    if (canvas)
      document.documentElement.append(canvas);
    return () => {
      canvas?.remove();
    };
  }, [canvas]);
  const memoMap = React7.useRef({});
  const lastColumns = React7.useRef();
  const [selectedData, setSelectionData] = React7.useState();
  React7.useLayoutEffect(() => {
    const getCells = getCellsForSelectionRef.current;
    if (getCells === void 0 || columns.every(isSizedGridColumn))
      return;
    let computeRows = Math.max(1, 10 - Math.floor(columns.length / 1e4));
    let tailRows = 0;
    if (computeRows < rowsRef.current && computeRows > 1) {
      computeRows--;
      tailRows = 1;
    }
    const computeArea = {
      x: 0,
      y: 0,
      width: columns.length,
      height: Math.min(rowsRef.current, computeRows)
    };
    const tailComputeArea = {
      x: 0,
      y: rowsRef.current - 1,
      width: columns.length,
      height: 1
    };
    const fn = async () => {
      const getResult = getCells(computeArea, abortController.signal);
      const tailGetResult = tailRows > 0 ? getCells(tailComputeArea, abortController.signal) : void 0;
      let toSet;
      if (typeof getResult === "object") {
        toSet = getResult;
      } else {
        toSet = await resolveCellsThunk(getResult);
      }
      if (tailGetResult !== void 0) {
        if (typeof tailGetResult === "object") {
          toSet = [...toSet, ...tailGetResult];
        } else {
          toSet = [...toSet, ...await resolveCellsThunk(tailGetResult)];
        }
      }
      lastColumns.current = columns;
      setSelectionData(toSet);
    };
    void fn();
  }, [abortController.signal, columns]);
  return React7.useMemo(() => {
    const getRaw = () => {
      if (columns.every(isSizedGridColumn)) {
        return columns;
      }
      if (ctx === null) {
        return columns.map((c) => {
          if (isSizedGridColumn(c))
            return c;
          return {
            ...c,
            width: defaultSize
          };
        });
      }
      ctx.font = themeRef.current.baseFontFull;
      return columns.map((c, colIndex) => {
        if (isSizedGridColumn(c))
          return c;
        if (memoMap.current[c.id] !== void 0) {
          return {
            ...c,
            width: memoMap.current[c.id]
          };
        }
        if (selectedData === void 0 || lastColumns.current !== columns || c.id === void 0) {
          return {
            ...c,
            width: defaultSize
          };
        }
        const r = measureColumn(ctx, theme, c, colIndex, selectedData, minColumnWidth, maxColumnWidth, true, getCellRenderer);
        memoMap.current[c.id] = r.width;
        return r;
      });
    };
    let result = getRaw();
    let totalWidth = 0;
    let totalGrow = 0;
    const distribute = [];
    for (const [i, c] of result.entries()) {
      totalWidth += c.width;
      if (c.grow !== void 0 && c.grow > 0) {
        totalGrow += c.grow;
        distribute.push(i);
      }
    }
    if (totalWidth < clientWidth && distribute.length > 0) {
      const writeable = [...result];
      const extra = clientWidth - totalWidth;
      let remaining = extra;
      for (let di = 0; di < distribute.length; di++) {
        const i = distribute[di];
        const weighted = (result[i].grow ?? 0) / totalGrow;
        const toAdd = di === distribute.length - 1 ? remaining : Math.min(remaining, Math.floor(extra * weighted));
        writeable[i] = {
          ...result[i],
          growOffset: toAdd,
          width: result[i].width + toAdd
        };
        remaining -= toAdd;
      }
      result = writeable;
    }
    return {
      sizedColumns: result,
      nonGrowWidth: totalWidth
    };
  }, [clientWidth, columns, ctx, selectedData, theme, minColumnWidth, maxColumnWidth, getCellRenderer]);
}

// vendor/glide-data-grid/dist/esm/data-editor-all.js
import * as React42 from "react";

// vendor/glide-data-grid/dist/esm/data-editor/data-editor.js
init_support();
var import_clamp4 = __toESM(require_clamp(), 1);
var import_uniq = __toESM(require_uniq(), 1);
var import_flatten = __toESM(require_flatten(), 1);
var import_range2 = __toESM(require_range(), 1);
var import_debounce2 = __toESM(require_debounce(), 1);
init_data_grid_types();
import * as React27 from "react";

// vendor/glide-data-grid/dist/esm/internal/data-grid-search/data-grid-search.js
init_data_grid_types();
import * as React13 from "react";

// vendor/glide-data-grid/dist/esm/internal/scrolling-data-grid/scrolling-data-grid.js
import * as React12 from "react";

// vendor/glide-data-grid/dist/esm/internal/data-grid-dnd/data-grid-dnd.js
var import_clamp3 = __toESM(require_clamp(), 1);
import * as React10 from "react";

// vendor/glide-data-grid/dist/esm/internal/data-grid/data-grid.js
import * as React9 from "react";
init_data_grid_types();

// vendor/glide-data-grid/dist/esm/internal/data-grid/sprites.js
var iconHead = `<svg width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">`;
var headerRowID = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `
    ${iconHead}<rect x="2" y="2" width="16" height="16" rx="2" fill="${bg}"/><path d="M15.75 4h-1.5a.25.25 0 0 0-.177.074L9.308 8.838a3.75 3.75 0 1 0 1.854 1.854l1.155-1.157.967.322a.5.5 0 0 0 .65-.55l-.18-1.208.363-.363.727.331a.5.5 0 0 0 .69-.59l-.254-.904.647-.647A.25.25 0 0 0 16 5.75v-1.5a.25.25 0 0 0-.25-.25zM7.5 13.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z" fill="${fg}"/></svg>`;
};
var headerCode = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `
    ${iconHead}<rect x="2" y="2" width="16" height="16" rx="4" fill="${bg}"/><path d="m12.223 13.314 3.052-2.826a.65.65 0 0 0 0-.984l-3.052-2.822c-.27-.25-.634-.242-.865.022-.232.263-.206.636.056.882l2.601 2.41-2.601 2.41c-.262.245-.288.619-.056.882.231.263.595.277.865.026Zm-4.444.005c.266.25.634.241.866-.027.231-.263.206-.636-.06-.882L5.983 10l2.602-2.405c.266-.25.291-.62.06-.887-.232-.263-.596-.272-.866-.022L4.723 9.51a.653.653 0 0 0 0 .983l3.056 2.827Z" fill="${fg}"/></svg>`;
};
var headerNumber = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `${iconHead}
    <path d="M16.22 2H3.78C2.8 2 2 2.8 2 3.78v12.44C2 17.2 2.8 18 3.78 18h12.44c.98 0 1.77-.8 1.77-1.78L18 3.78C18 2.8 17.2 2 16.22 2z" fill="${bg}"/>
    <path d="M6.52 12.78H5.51V8.74l-1.33.47v-.87l2.29-.83h.05v5.27zm5.2 0H8.15v-.69l1.7-1.83a6.38 6.38 0 0 0 .34-.4c.09-.11.16-.22.22-.32s.1-.19.12-.27a.9.9 0 0 0 0-.56.63.63 0 0 0-.15-.23.58.58 0 0 0-.22-.15.75.75 0 0 0-.29-.05c-.27 0-.48.08-.62.23a.95.95 0 0 0-.2.65H8.03c0-.24.04-.46.13-.67a1.67 1.67 0 0 1 .97-.91c.23-.1.49-.14.77-.14.26 0 .5.04.7.11.21.08.38.18.52.32.14.13.25.3.32.48a1.74 1.74 0 0 1 .03 1.13 2.05 2.05 0 0 1-.24.47 4.16 4.16 0 0 1-.35.47l-.47.5-1 1.05h2.32v.8zm1.8-3.08h.55c.28 0 .48-.06.61-.2a.76.76 0 0 0 .2-.55.8.8 0 0 0-.05-.28.56.56 0 0 0-.13-.22.6.6 0 0 0-.23-.15.93.93 0 0 0-.32-.05.92.92 0 0 0-.29.05.72.72 0 0 0-.23.12.57.57 0 0 0-.21.46H12.4a1.3 1.3 0 0 1 .5-1.04c.15-.13.33-.23.54-.3a2.48 2.48 0 0 1 1.4 0c.2.06.4.15.55.28.15.13.27.28.36.47.08.19.13.4.13.65a1.15 1.15 0 0 1-.2.65 1.36 1.36 0 0 1-.58.49c.15.05.28.12.38.2a1.14 1.14 0 0 1 .43.62c.03.13.05.26.05.4 0 .25-.05.47-.14.66a1.42 1.42 0 0 1-.4.49c-.16.13-.35.23-.58.3a2.51 2.51 0 0 1-.73.1c-.22 0-.44-.03-.65-.09a1.8 1.8 0 0 1-.57-.28 1.43 1.43 0 0 1-.4-.47 1.41 1.41 0 0 1-.15-.66h1a.66.66 0 0 0 .22.5.87.87 0 0 0 .58.2c.25 0 .45-.07.6-.2a.71.71 0 0 0 .21-.56.97.97 0 0 0-.06-.36.61.61 0 0 0-.18-.25.74.74 0 0 0-.28-.15 1.33 1.33 0 0 0-.37-.04h-.55V9.7z" fill="${fg}"/>
  </svg>`;
};
var headerString = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `${iconHead}
  <path d="M16.222 2H3.778C2.8 2 2 2.8 2 3.778v12.444C2 17.2 2.8 18 3.778 18h12.444c.978 0 1.77-.8 1.77-1.778L18 3.778C18 2.8 17.2 2 16.222 2z" fill="${bg}"/>
  <path d="M8.182 12.4h3.636l.655 1.6H14l-3.454-8H9.455L6 14h1.527l.655-1.6zM10 7.44l1.36 3.651H8.64L10 7.441z" fill="${fg}"/>
</svg>`;
};
var headerBoolean = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `${iconHead}
    <path
        d="M16.2222 2H3.77778C2.8 2 2 2.8 2 3.77778V16.2222C2 17.2 2.8 18 3.77778 18H16.2222C17.2 18 17.9911 17.2 17.9911 16.2222L18 3.77778C18 2.8 17.2 2 16.2222 2Z"
        fill="${bg}"
    />
    <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M7.66667 6.66669C5.73368 6.66669 4.16667 8.15907 4.16667 10C4.16667 11.841 5.73368 13.3334 7.66667 13.3334H12.3333C14.2663 13.3334 15.8333 11.841 15.8333 10C15.8333 8.15907 14.2663 6.66669 12.3333 6.66669H7.66667ZM12.5 12.5C13.8807 12.5 15 11.3807 15 10C15 8.61931 13.8807 7.50002 12.5 7.50002C11.1193 7.50002 10 8.61931 10 10C10 11.3807 11.1193 12.5 12.5 12.5Z"
        fill="${fg}"
    />
</svg>`;
};
var headerUri = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `${iconHead}
<path d="M16.222 2H3.778C2.8 2 2 2.8 2 3.778v12.444C2 17.2 2.8 18 3.778 18h12.444c.978 0 1.77-.8 1.77-1.778L18 3.778C18 2.8 17.2 2 16.222 2z" fill="${bg}"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M10.29 4.947a3.368 3.368 0 014.723.04 3.375 3.375 0 01.041 4.729l-.009.009-1.596 1.597a3.367 3.367 0 01-5.081-.364.71.71 0 011.136-.85 1.95 1.95 0 002.942.21l1.591-1.593a1.954 1.954 0 00-.027-2.733 1.95 1.95 0 00-2.732-.027l-.91.907a.709.709 0 11-1.001-1.007l.915-.911.007-.007z" fill="${fg}"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M6.55 8.678a3.368 3.368 0 015.082.364.71.71 0 01-1.136.85 1.95 1.95 0 00-2.942-.21l-1.591 1.593a1.954 1.954 0 00.027 2.733 1.95 1.95 0 002.73.028l.906-.906a.709.709 0 111.003 1.004l-.91.91-.008.01a3.368 3.368 0 01-4.724-.042 3.375 3.375 0 01-.041-4.728l.009-.009L6.55 8.678z" fill="${fg}"/>
</svg>
  `;
};
var renameIcon = (props) => {
  const bg = props.bgColor;
  return `${iconHead}
    <path stroke="${bg}" stroke-width="2" d="M12 3v14"/>
    <path stroke="${bg}" stroke-width="2" stroke-linecap="round" d="M10 4h4m-4 12h4"/>
    <path d="M11 14h4a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-4v2h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4v2ZM9.5 8H5a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h4.5v2H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h4.5v2Z" fill="${bg}"/>
  </svg>
`;
};
var headerAudioUri = headerUri;
var headerVideoUri = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `${iconHead}
  <path d="M16.222 2H3.778C2.8 2 2 2.8 2 3.778v12.444C2 17.2 2.8 18 3.778 18h12.444c.978 0 1.77-.8 1.77-1.778L18 3.778C18 2.8 17.2 2 16.222 2z" fill="${bg}"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M7 13.138a.5.5 0 00.748.434l5.492-3.138a.5.5 0 000-.868L7.748 6.427A.5.5 0 007 6.862v6.276z" fill="${fg}"/>
</svg>`;
};
var headerEmoji = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `
    ${iconHead}
    <path d="M10 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 9.17A4.17 4.17 0 0 1 5.83 10 4.17 4.17 0 0 1 10 5.83 4.17 4.17 0 0 1 14.17 10 4.17 4.17 0 0 1 10 14.17z" fill="${fg}"/>
    <path d="M8.33 8.21a.83.83 0 1 0-.03 1.67.83.83 0 0 0 .03-1.67zm3.34 0a.83.83 0 1 0-.04 1.67.83.83 0 0 0 .04-1.67z" fill="${fg}"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M14.53 13.9a2.82 2.82 0 0 1-5.06 0l.77-.38a1.97 1.97 0 0 0 3.52 0l.77.39z" fill="${fg}"/>
    <path d="M16.22 2H3.78C2.8 2 2 2.8 2 3.78v12.44C2 17.2 2.8 18 3.78 18h12.44c.98 0 1.77-.8 1.77-1.78L18 3.78C18 2.8 17.2 2 16.22 2z" fill="${bg}"/>
    <path d="M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 11a5 5 0 1 1 .01-10.01A5 5 0 0 1 10 15z" fill="${fg}"/>
    <path d="M8 7.86a1 1 0 1 0-.04 2 1 1 0 0 0 .04-2zm4 0a1 1 0 1 0-.04 2 1 1 0 0 0 .04-2z" fill="${fg}"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M12.53 11.9a2.82 2.82 0 0 1-5.06 0l.77-.38a1.97 1.97 0 0 0 3.52 0l.77.39z" fill="${fg}"/>
  </svg>`;
};
var headerImage = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `${iconHead}
  <path d="M16.222 2H3.778C2.8 2 2 2.8 2 3.778v12.444C2 17.2 2.8 18 3.778 18h12.444c.978 0 1.77-.8 1.77-1.778L18 3.778C18 2.8 17.2 2 16.222 2z" fill="${bg}"/>
  <path opacity=".5" fill-rule="evenodd" clip-rule="evenodd" d="M12.499 10.801a.5.5 0 01.835 0l2.698 4.098a.5.5 0 01-.418.775H10.22a.5.5 0 01-.417-.775l2.697-4.098z" fill="${fg}"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M8.07 8.934a.5.5 0 01.824 0l4.08 5.958a.5.5 0 01-.412.782h-8.16a.5.5 0 01-.413-.782l4.08-5.958zM13.75 8.333a2.083 2.083 0 100-4.166 2.083 2.083 0 000 4.166z" fill="${fg}"/>
</svg>`;
};
var headerPhone = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `
    ${iconHead}
    <path fill="${fg}" d="M3 3h14v14H3z"/>
    <path d="M16.22 2H3.78C2.8 2 2 2.8 2 3.78v12.44C2 17.2 2.8 18 3.78 18h12.44c.98 0 1.77-.8 1.77-1.78L18 3.78C18 2.8 17.2 2 16.22 2zm-7.24 9.78h1.23c.15 0 .27.06.36.18l.98 1.28a.43.43 0 0 1-.05.58l-1.2 1.21a.45.45 0 0 1-.6.04A6.72 6.72 0 0 1 7.33 10c0-.61.1-1.2.25-1.78a6.68 6.68 0 0 1 2.12-3.3.44.44 0 0 1 .6.04l1.2 1.2c.16.17.18.42.05.59l-.98 1.29a.43.43 0 0 1-.36.17H8.98A5.38 5.38 0 0 0 8.67 10c0 .62.11 1.23.3 1.79z" fill="${bg}"/>
  </svg>`;
};
var headerMarkdown = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `
    ${iconHead}
    <path d="M16.22 2H3.78C2.8 2 2 2.8 2 3.78v12.44C2 17.2 2.8 18 3.78 18h12.44c.98 0 1.77-.8 1.77-1.78L18 3.78C18 2.8 17.2 2 16.22 2z" fill="${bg}"/>
    <path d="m13.49 13.15-2.32-3.27h1.4V7h1.86v2.88h1.4l-2.34 3.27zM11 13H9v-3l-1.5 1.92L6 10v3H4V7h2l1.5 2L9 7h2v6z" fill="${fg}"/>
  </svg>`;
};
var headerDate = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `${iconHead}
  <path d="M16.222 2H3.778C2.8 2 2 2.8 2 3.778v12.444C2 17.2 2.8 18 3.778 18h12.444c.978 0 1.77-.8 1.77-1.778L18 3.778C18 2.8 17.2 2 16.222 2z" fill="${bg}"/>
  <path d="M14.8 4.182h-.6V3H13v1.182H7V3H5.8v1.182h-.6c-.66 0-1.2.532-1.2 1.182v9.454C4 15.468 4.54 16 5.2 16h9.6c.66 0 1.2-.532 1.2-1.182V5.364c0-.65-.54-1.182-1.2-1.182zm0 10.636H5.2V7.136h9.6v7.682z" fill="${fg}"/>
</svg>`;
};
var headerTime = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `
    ${iconHead}
    <path d="M16.22 2H3.78C2.8 2 2 2.8 2 3.78v12.44C2 17.2 2.8 18 3.78 18h12.44c.98 0 1.77-.8 1.77-1.78L18 3.78C18 2.8 17.2 2 16.22 2z" fill="${bg}"/>
    <path d="M10 4a6 6 0 0 0-6 6 6 6 0 0 0 6 6 6 6 0 0 0 6-6 6 6 0 0 0-6-6zm0 10.8A4.8 4.8 0 0 1 5.2 10a4.8 4.8 0 1 1 4.8 4.8z" fill="${fg}"/>
    <path d="M10 7H9v3.93L12.5 13l.5-.8-3-1.76V7z" fill="${fg}"/>
  </svg>`;
};
var headerEmail = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `${iconHead}
  <rect x="2" y="2" width="16" height="16" rx="2" fill="${bg}"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M10 8.643a1.357 1.357 0 100 2.714 1.357 1.357 0 000-2.714zM7.357 10a2.643 2.643 0 115.286 0 2.643 2.643 0 01-5.286 0z" fill="${fg}"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M7.589 4.898A5.643 5.643 0 0115.643 10v.5a2.143 2.143 0 01-4.286 0V8a.643.643 0 011.286 0v2.5a.857.857 0 001.714 0V10a4.357 4.357 0 10-1.708 3.46.643.643 0 01.782 1.02 5.643 5.643 0 11-5.842-9.582z" fill="${fg}"/>
</svg>`;
};
var headerReference = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `
    ${iconHead}
    <rect x="2" y="8" width="10" height="8" rx="2" fill="${bg}"/>
    <rect x="8" y="4" width="10" height="8" rx="2" fill="${bg}"/>
    <path d="M10.68 7.73V6l2.97 3.02-2.97 3.02v-1.77c-2.13 0-3.62.7-4.68 2.2.43-2.15 1.7-4.31 4.68-4.74z" fill="${fg}"/>
  </svg>`;
};
var headerIfThenElse = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `${iconHead}
  <path fill="${fg}" d="M4 3h12v14H4z"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M3.6 2A1.6 1.6 0 002 3.6v12.8A1.6 1.6 0 003.6 18h12.8a1.6 1.6 0 001.6-1.6V3.6A1.6 1.6 0 0016.4 2H3.6zm11.3 10.8a.7.7 0 01.7.7v1.4a.7.7 0 01-.7.7h-1.4a.7.7 0 01-.7-.7v-1.4a.7.7 0 01.6-.693.117.117 0 00.1-.115V10.35a.117.117 0 00-.117-.116h-2.8a.117.117 0 00-.117.116v2.333c0 .064.053.117.117.117h.117a.7.7 0 01.7.7v1.4a.7.7 0 01-.7.7H9.3a.7.7 0 01-.7-.7v-1.4a.7.7 0 01.7-.7h.117a.117.117 0 00.117-.117V10.35a.117.117 0 00-.117-.117h-2.8a.117.117 0 00-.117.117v2.342c0 .058.042.106.1.115a.7.7 0 01.6.693v1.4a.7.7 0 01-.7.7H5.1a.7.7 0 01-.7-.7v-1.4a.7.7 0 01.7-.7h.35a.116.116 0 00.116-.117v-2.45c0-.515.418-.933.934-.933h2.917a.117.117 0 00.117-.117V6.85a.117.117 0 00-.117-.116h-2.45a.7.7 0 01-.7-.7V5.1a.7.7 0 01.7-.7h6.067a.7.7 0 01.7.7v.934a.7.7 0 01-.7.7h-2.45a.117.117 0 00-.118.116v2.333c0 .064.053.117.117.117H13.5c.516 0 .934.418.934.934v2.45c0 .063.052.116.116.116h.35z" fill="${bg}"/>
</svg>`;
};
var headerSingleValue = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `
    ${iconHead}
    <rect x="2" y="2" width="16" height="16" rx="2" fill="${bg}"/>
    <path d="M9.98 13.33c.45 0 .74-.3.73-.75l-.01-.1-.16-1.67 1.45 1.05a.81.81 0 0 0 .5.18c.37 0 .72-.32.72-.76 0-.3-.17-.54-.49-.68l-1.63-.77 1.63-.77c.32-.14.49-.37.49-.67 0-.45-.34-.76-.71-.76a.81.81 0 0 0-.5.18l-1.47 1.03.16-1.74.01-.08c.01-.46-.27-.76-.72-.76-.46 0-.76.32-.75.76l.01.08.16 1.74-1.47-1.03a.77.77 0 0 0-.5-.18.74.74 0 0 0-.72.76c0 .3.17.53.49.67l1.63.77-1.62.77c-.32.14-.5.37-.5.68 0 .44.35.75.72.75a.78.78 0 0 0 .5-.17L9.4 10.8l-.16 1.68v.09c-.02.44.28.75.74.75z" fill="${fg}"/>
  </svg>`;
};
var headerLookup = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `
    ${iconHead}
    <rect x="2" y="2" width="16" height="16" rx="2" fill="${bg}"/>
    <path d="M8 5.83H5.83a.83.83 0 0 0 0 1.67h1.69A4.55 4.55 0 0 1 8 5.83zm-.33 3.34H5.83a.83.83 0 0 0 0 1.66h2.72a4.57 4.57 0 0 1-.88-1.66zM5.83 12.5a.83.83 0 0 0 0 1.67h7.5a.83.83 0 1 0 0-1.67h-7.5zm8.8-2.9a3.02 3.02 0 0 0 .46-1.6c0-1.66-1.32-3-2.94-3C10.52 5 9.2 6.34 9.2 8s1.31 3 2.93 3c.58 0 1.11-.17 1.56-.47l2.04 2.08.93-.94-2.04-2.08zm-2.48.07c-.9 0-1.63-.75-1.63-1.67s.73-1.67 1.63-1.67c.9 0 1.63.75 1.63 1.67s-.73 1.67-1.63 1.67z" fill="${fg}"/>
  </svg>`;
};
var headerTextTemplate = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `${iconHead}
  <rect x="2" y="2" width="16" height="16" rx="2" fill="${bg}"/>
  <path d="M7.676 4.726V3l2.976 3.021-2.976 3.022v-1.77c-2.125 0-3.613.69-4.676 2.201.425-2.158 1.7-4.316 4.676-4.748zM10.182 14.4h3.636l.655 1.6H16l-3.454-8h-1.091L8 16h1.527l.655-1.6zM12 9.44l1.36 3.65h-2.72L12 9.44z" fill="${fg}"/>
</svg>`;
};
var headerMath = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `${iconHead}
  <rect x="2" y="2" width="16" height="16" rx="2" fill="${bg}"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M4.167 5.417a.833.833 0 100 1.666h4.166a.833.833 0 100-1.666H4.167z" fill="${fg}"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M7.083 4.167a.833.833 0 10-1.666 0v4.166a.833.833 0 101.666 0V4.167zM11.667 5.417a.833.833 0 100 1.666h4.166a.833.833 0 100-1.666h-4.166zM5.367 11.688a.833.833 0 00-1.179 1.179l2.947 2.946a.833.833 0 001.178-1.178l-2.946-2.947z" fill="${fg}"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M8.313 12.867a.833.833 0 10-1.178-1.179l-2.947 2.947a.833.833 0 101.179 1.178l2.946-2.946z" fill="${fg}"/>
  <path d="M10.833 12.5c0-.46.373-.833.834-.833h4.166a.833.833 0 110 1.666h-4.166a.833.833 0 01-.834-.833zM10.833 15c0-.46.373-.833.834-.833h4.166a.833.833 0 110 1.666h-4.166a.833.833 0 01-.834-.833z" fill="${fg}"/>
</svg>`;
};
var headerRollup = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `
    ${iconHead}
    <path d="M16.22 2H3.78C2.8 2 2 2.8 2 3.78v12.44C2 17.2 2.8 18 3.78 18h12.44c.98 0 1.77-.8 1.77-1.78L18 3.78C18 2.8 17.2 2 16.22 2z" fill="${bg}"/>
    <path d="M10 8.84a1.16 1.16 0 1 0 0 2.32 1.16 1.16 0 0 0 0-2.32zm3.02 3.61a3.92 3.92 0 0 0 .78-3.28.49.49 0 1 0-.95.2c.19.87-.02 1.78-.58 2.47a2.92 2.92 0 1 1-4.13-4.08 2.94 2.94 0 0 1 2.43-.62.49.49 0 1 0 .17-.96 3.89 3.89 0 1 0 2.28 6.27zM10 4.17a5.84 5.84 0 0 0-5.44 7.93.49.49 0 1 0 .9-.35 4.86 4.86 0 1 1 2.5 2.67.49.49 0 1 0-.4.88c.76.35 1.6.54 2.44.53a5.83 5.83 0 0 0 0-11.66zm3.02 3.5a.7.7 0 1 0-1.4 0 .7.7 0 0 0 1.4 0zm-6.97 5.35a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4z" fill="${fg}"/>
  </svg>`;
};
var headerJoinStrings = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `${iconHead}
  <rect x="2" y="2" width="16" height="16" rx="2" fill="${bg}"/>
  <path d="M12.4 13.565c1.865-.545 3.645-2.083 3.645-4.396 0-1.514-.787-2.604-2.071-2.604C12.69 6.565 12 7.63 12 8.939c1.114.072 1.865.726 1.865 1.683 0 .933-.8 1.647-1.84 2.023l.375.92zM4 5h6v2H4zM4 9h5v2H4zM4 13h4v2H4z" fill="${fg}"/>
</svg>`;
};
var headerSplitString = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `
    ${iconHead}
    <rect x="2" y="2" width="16" height="16" rx="2" fill="${bg}"/>
    <path d="M12.4 13.56c1.86-.54 3.65-2.08 3.65-4.4 0-1.5-.8-2.6-2.08-2.6S12 7.64 12 8.95c1.11.07 1.86.73 1.86 1.68 0 .94-.8 1.65-1.83 2.03l.37.91zM4 5h6v2H4zm0 4h5v2H4zm0 4h4v2H4z" fill="${fg}"/>
  </svg>`;
};
var headerGeoDistance = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `${iconHead}
  <path d="M16.222 2H3.778C2.8 2 2 2.8 2 3.778v12.444C2 17.2 2.8 18 3.778 18h12.444c.978 0 1.77-.8 1.77-1.778L18 3.778C18 2.8 17.2 2 16.222 2z" fill="${bg}"/>
  <path d="M10 7a1 1 0 100-2v2zm0 6a1 1 0 100 2v-2zm0-8H7v2h3V5zm-3 6h5V9H7v2zm5 2h-2v2h2v-2zm1-1a1 1 0 01-1 1v2a3 3 0 003-3h-2zm-1-1a1 1 0 011 1h2a3 3 0 00-3-3v2zM4 8a3 3 0 003 3V9a1 1 0 01-1-1H4zm3-3a3 3 0 00-3 3h2a1 1 0 011-1V5z" fill="${fg}"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M4.856 12.014a.5.5 0 00-.712.702L5.409 14l-1.265 1.284a.5.5 0 00.712.702l1.255-1.274 1.255 1.274a.5.5 0 00.712-.702L6.813 14l1.265-1.284a.5.5 0 00-.712-.702L6.11 13.288l-1.255-1.274zM12.856 4.014a.5.5 0 00-.712.702L13.409 6l-1.265 1.284a.5.5 0 10.712.702l1.255-1.274 1.255 1.274a.5.5 0 10.712-.702L14.813 6l1.265-1.284a.5.5 0 00-.712-.702L14.11 5.288l-1.255-1.274z" fill="${fg}"/>
</svg>`;
};
var headerArray = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `${iconHead}
  <rect x="2" y="2" width="16" height="16" rx="2" fill="${bg}"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M14.25 7.25a.75.75 0 000-1.5h-6.5a.75.75 0 100 1.5h6.5zM15 10a.75.75 0 01-.75.75h-6.5a.75.75 0 010-1.5h6.5A.75.75 0 0115 10zm-.75 4.25a.75.75 0 000-1.5h-6.5a.75.75 0 000 1.5h6.5zm-8.987-7a.75.75 0 100-1.5.75.75 0 000 1.5zm.75 2.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm-.75 4.25a.75.75 0 100-1.5.75.75 0 000 1.5z" fill="${fg}"/>
</svg>`;
};
var rowOwnerOverlay = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `
    <svg width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 15v1h14v-2.5c0-.87-.44-1.55-.98-2.04a6.19 6.19 0 0 0-1.9-1.14 12.1 12.1 0 0 0-2.48-.67A4 4 0 1 0 5 6a4 4 0 0 0 2.36 3.65c-.82.13-1.7.36-2.48.67-.69.28-1.37.65-1.9 1.13A2.8 2.8 0 0 0 2 13.5V15z" fill="${bg}" stroke="${fg}" stroke-width="2"/>
  </svg>`;
};
var protectedColumnOverlay = (props) => {
  const fg = props.fgColor;
  const bg = props.bgColor;
  return `
    <svg width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.43 6.04v-.18a3.86 3.86 0 0 0-7.72 0v.18A2.15 2.15 0 0 0 3 8.14v5.72C3 15.04 3.96 16 5.14 16H12c1.18 0 2.14-.96 2.14-2.14V8.14c0-1.03-.73-1.9-1.71-2.1zM7.86 6v-.14a.71.71 0 1 1 1.43 0V6H7.86z" fill="${bg}" stroke="${fg}" stroke-width="2"/>
  </svg>
`;
};
var sprites = {
  headerRowID,
  headerNumber,
  headerCode,
  headerString,
  headerBoolean,
  headerAudioUri,
  headerVideoUri,
  headerEmoji,
  headerImage,
  headerUri,
  headerPhone,
  headerMarkdown,
  headerDate,
  headerTime,
  headerEmail,
  headerReference,
  headerIfThenElse,
  headerSingleValue,
  headerLookup,
  headerTextTemplate,
  headerMath,
  headerRollup,
  headerJoinStrings,
  headerSplitString,
  headerGeoDistance,
  headerArray,
  rowOwnerOverlay,
  protectedColumnOverlay,
  renameIcon
};

// vendor/glide-data-grid/dist/esm/internal/data-grid/data-grid-sprites.js
function getColors(variant, theme) {
  if (variant === "normal") {
    return [theme.bgIconHeader, theme.fgIconHeader];
  } else if (variant === "selected") {
    return ["white", theme.accentColor];
  } else {
    return [theme.accentColor, theme.bgHeader];
  }
}
var SpriteManager = class {
  onSettled;
  spriteMap = /* @__PURE__ */ new Map();
  headerIcons;
  inFlight = 0;
  constructor(headerIcons, onSettled) {
    this.onSettled = onSettled;
    this.headerIcons = headerIcons ?? {};
  }
  drawSprite(sprite, variant, ctx, x2, y2, size, theme, alpha = 1) {
    const [bgColor, fgColor] = getColors(variant, theme);
    const rSize = size * Math.ceil(window.devicePixelRatio);
    const key = `${bgColor}_${fgColor}_${rSize}_${sprite}`;
    let spriteCanvas = this.spriteMap.get(key);
    if (spriteCanvas === void 0) {
      const spriteCb = this.headerIcons[sprite];
      if (spriteCb === void 0)
        return;
      spriteCanvas = document.createElement("canvas");
      const spriteCtx = spriteCanvas.getContext("2d");
      if (spriteCtx === null)
        return;
      const imgSource = new Image();
      imgSource.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(spriteCb({ fgColor, bgColor }))}`;
      this.spriteMap.set(key, spriteCanvas);
      const promise = imgSource.decode();
      if (promise === void 0)
        return;
      this.inFlight++;
      promise.then(() => {
        spriteCtx.drawImage(imgSource, 0, 0, rSize, rSize);
      }).finally(() => {
        this.inFlight--;
        if (this.inFlight === 0) {
          this.onSettled();
        }
      });
    } else {
      if (alpha < 1) {
        ctx.globalAlpha = alpha;
      }
      ctx.drawImage(spriteCanvas, 0, 0, rSize, rSize, x2, y2, size, size);
      if (alpha < 1) {
        ctx.globalAlpha = 1;
      }
    }
  }
};

// vendor/glide-data-grid/dist/esm/internal/data-grid/data-grid.js
var import_clamp2 = __toESM(require_clamp(), 1);
var import_range = __toESM(require_range(), 1);

// vendor/glide-data-grid/dist/esm/internal/data-grid/render/data-grid-render.js
init_color_parser();
init_support();

// vendor/glide-data-grid/dist/esm/internal/data-grid/render/data-grid-render.walk.js
function getSkipPoint(drawRegions) {
  if (drawRegions.length === 0)
    return void 0;
  let drawRegionsLowestY;
  for (const dr of drawRegions) {
    drawRegionsLowestY = Math.min(drawRegionsLowestY ?? dr.y, dr.y);
  }
  return drawRegionsLowestY;
}
function walkRowsInCol(startRow, drawY, height, rows, getRowHeight, freezeTrailingRows, hasAppendRow, skipToY, cb) {
  skipToY = skipToY ?? drawY;
  let y2 = drawY;
  let row = startRow;
  const rowEnd = rows - freezeTrailingRows;
  let didBreak = false;
  while (y2 < height && row < rowEnd) {
    const rh = getRowHeight(row);
    if (y2 + rh > skipToY && cb(y2, row, rh, false, hasAppendRow && row === rows - 1) === true) {
      didBreak = true;
      break;
    }
    y2 += rh;
    row++;
  }
  if (didBreak)
    return;
  y2 = height;
  for (let fr = 0; fr < freezeTrailingRows; fr++) {
    row = rows - 1 - fr;
    const rh = getRowHeight(row);
    y2 -= rh;
    cb(y2, row, rh, true, hasAppendRow && row === rows - 1);
  }
}
function walkColumns(effectiveCols, cellYOffset, translateX, translateY, totalHeaderHeight, cb) {
  let x2 = 0;
  let clipX = 0;
  const drawY = totalHeaderHeight + translateY;
  for (const c of effectiveCols) {
    const drawX = c.sticky ? clipX : x2 + translateX;
    if (cb(c, drawX, drawY, c.sticky ? 0 : clipX, cellYOffset) === true) {
      break;
    }
    x2 += c.width;
    clipX += c.sticky ? c.width : 0;
  }
}
function walkGroups(effectiveCols, width, translateX, groupHeaderHeight, cb) {
  let x2 = 0;
  let clipX = 0;
  for (let index = 0; index < effectiveCols.length; index++) {
    const startCol = effectiveCols[index];
    let end = index + 1;
    let boxWidth = startCol.width;
    if (startCol.sticky) {
      clipX += boxWidth;
    }
    while (end < effectiveCols.length && isGroupEqual(effectiveCols[end].group, startCol.group) && effectiveCols[end].sticky === effectiveCols[index].sticky) {
      const endCol = effectiveCols[end];
      boxWidth += endCol.width;
      end++;
      index++;
      if (endCol.sticky) {
        clipX += endCol.width;
      }
    }
    const t = startCol.sticky ? 0 : translateX;
    const localX = x2 + t;
    const delta = startCol.sticky ? 0 : Math.max(0, clipX - localX);
    const w3 = Math.min(boxWidth - delta, width - (localX + delta));
    cb([startCol.sourceIndex, effectiveCols[end - 1].sourceIndex], startCol.group ?? "", localX + delta, 0, w3, groupHeaderHeight);
    x2 += boxWidth;
  }
}
function getSpanBounds(span, cellX, cellY, cellW, cellH, column, allColumns) {
  const [startCol, endCol] = span;
  let frozenRect;
  let contentRect;
  const firstNonSticky = allColumns.find((x2) => !x2.sticky)?.sourceIndex ?? 0;
  if (endCol > firstNonSticky) {
    const renderFromCol = Math.max(startCol, firstNonSticky);
    let tempX = cellX;
    let tempW = cellW;
    for (let x2 = column.sourceIndex - 1; x2 >= renderFromCol; x2--) {
      tempX -= allColumns[x2].width;
      tempW += allColumns[x2].width;
    }
    for (let x2 = column.sourceIndex + 1; x2 <= endCol; x2++) {
      tempW += allColumns[x2].width;
    }
    contentRect = {
      x: tempX,
      y: cellY,
      width: tempW,
      height: cellH
    };
  }
  if (firstNonSticky > startCol) {
    const renderToCol = Math.min(endCol, firstNonSticky - 1);
    let tempX = cellX;
    let tempW = cellW;
    for (let x2 = column.sourceIndex - 1; x2 >= startCol; x2--) {
      tempX -= allColumns[x2].width;
      tempW += allColumns[x2].width;
    }
    for (let x2 = column.sourceIndex + 1; x2 <= renderToCol; x2++) {
      tempW += allColumns[x2].width;
    }
    frozenRect = {
      x: tempX,
      y: cellY,
      width: tempW,
      height: cellH
    };
  }
  return [frozenRect, contentRect];
}

// vendor/glide-data-grid/dist/esm/internal/data-grid/render/data-grid-render.cells.js
init_data_grid_types();
init_styles();
init_color_parser();

// vendor/glide-data-grid/dist/esm/common/math.js
function getClosestRect(rect, px, py, allowedDirections) {
  if (allowedDirections === "any")
    return combineRects(rect, { x: px, y: py, width: 1, height: 1 });
  if (allowedDirections === "vertical")
    px = rect.x;
  if (allowedDirections === "horizontal")
    py = rect.y;
  if (itemIsInRect([px, py], rect)) {
    return void 0;
  }
  const distanceToLeft = px - rect.x;
  const distanceToRight = rect.x + rect.width - px;
  const distanceToTop = py - rect.y + 1;
  const distanceToBottom = rect.y + rect.height - py;
  const minDistance = Math.min(allowedDirections === "vertical" ? Number.MAX_SAFE_INTEGER : distanceToLeft, allowedDirections === "vertical" ? Number.MAX_SAFE_INTEGER : distanceToRight, allowedDirections === "horizontal" ? Number.MAX_SAFE_INTEGER : distanceToTop, allowedDirections === "horizontal" ? Number.MAX_SAFE_INTEGER : distanceToBottom);
  if (minDistance === distanceToBottom) {
    return { x: rect.x, y: rect.y + rect.height, width: rect.width, height: py - rect.y - rect.height + 1 };
  } else if (minDistance === distanceToTop) {
    return { x: rect.x, y: py, width: rect.width, height: rect.y - py };
  } else if (minDistance === distanceToRight) {
    return { x: rect.x + rect.width, y: rect.y, width: px - rect.x - rect.width + 1, height: rect.height };
  } else {
    return { x: px, y: rect.y, width: rect.x - px, height: rect.height };
  }
}
function intersectRect(x1, y1, w1, h1, x2, y2, w22, h2) {
  return x1 <= x2 + w22 && x2 <= x1 + w1 && y1 <= y2 + h2 && y2 <= y1 + h1;
}
function pointInRect(rect, x2, y2) {
  return x2 >= rect.x && x2 <= rect.x + rect.width && y2 >= rect.y && y2 <= rect.y + rect.height;
}
function combineRects(a, b3) {
  const x2 = Math.min(a.x, b3.x);
  const y2 = Math.min(a.y, b3.y);
  const width = Math.max(a.x + a.width, b3.x + b3.width) - x2;
  const height = Math.max(a.y + a.height, b3.y + b3.height) - y2;
  return { x: x2, y: y2, width, height };
}
function rectContains(a, b3) {
  return a.x <= b3.x && a.y <= b3.y && a.x + a.width >= b3.x + b3.width && a.y + a.height >= b3.y + b3.height;
}
function hugRectToTarget(rect, width, height, mod) {
  if (rect.x > width || rect.y > height || rect.x < 0 && rect.y < 0 && rect.x + rect.width > width && rect.y + rect.height > height) {
    return void 0;
  }
  if (rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height) {
    return rect;
  }
  const leftMax = -4;
  const topMax = -4;
  const rightMax = width + 4;
  const bottomMax = height + 4;
  const leftOverflow = leftMax - rect.x;
  const rightOverflow = rect.x + rect.width - rightMax;
  const topOverflow = topMax - rect.y;
  const bottomOverflow = rect.y + rect.height - bottomMax;
  const left = leftOverflow > 0 ? rect.x + Math.floor(leftOverflow / mod) * mod : rect.x;
  const right = rightOverflow > 0 ? rect.x + rect.width - Math.floor(rightOverflow / mod) * mod : rect.x + rect.width;
  const top = topOverflow > 0 ? rect.y + Math.floor(topOverflow / mod) * mod : rect.y;
  const bottom = bottomOverflow > 0 ? rect.y + rect.height - Math.floor(bottomOverflow / mod) * mod : rect.y + rect.height;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
function splitRectIntoRegions(rect, splitIndicies, width, height, splitLocations) {
  const [lSplit, tSplit, rSplit, bSplit] = splitIndicies;
  const [lClip, tClip, rClip, bClip] = splitLocations;
  const { x: inX, y: inY, width: inW, height: inH } = rect;
  const result = [];
  if (inW <= 0 || inH <= 0)
    return result;
  const inRight = inX + inW;
  const inBottom = inY + inH;
  const isOverLeft = inX < lSplit;
  const isOverTop = inY < tSplit;
  const isOverRight = inX + inW > rSplit;
  const isOverBottom = inY + inH > bSplit;
  const isOverCenterVert = inX >= lSplit && inX < rSplit || inRight > lSplit && inRight <= rSplit || inX < lSplit && inRight > rSplit;
  const isOverCenterHoriz = inY >= tSplit && inY < bSplit || inBottom > tSplit && inBottom <= bSplit || inY < tSplit && inBottom > bSplit;
  const isOverCenter = isOverCenterVert && isOverCenterHoriz;
  if (isOverCenter) {
    const x2 = Math.max(inX, lSplit);
    const y2 = Math.max(inY, tSplit);
    const right = Math.min(inRight, rSplit);
    const bottom = Math.min(inBottom, bSplit);
    result.push({
      rect: { x: x2, y: y2, width: right - x2, height: bottom - y2 },
      clip: {
        x: lClip,
        y: tClip,
        width: rClip - lClip + 1,
        height: bClip - tClip + 1
      }
    });
  }
  if (isOverLeft && isOverTop) {
    const x2 = inX;
    const y2 = inY;
    const right = Math.min(inRight, lSplit);
    const bottom = Math.min(inBottom, tSplit);
    result.push({
      rect: {
        x: x2,
        y: y2,
        width: right - x2,
        height: bottom - y2
      },
      clip: {
        x: 0,
        y: 0,
        width: lClip + 1,
        height: tClip + 1
      }
    });
  }
  if (isOverTop && isOverCenterVert) {
    const x2 = Math.max(inX, lSplit);
    const y2 = inY;
    const right = Math.min(inRight, rSplit);
    const bottom = Math.min(inBottom, tSplit);
    result.push({
      rect: {
        x: x2,
        y: y2,
        width: right - x2,
        height: bottom - y2
      },
      clip: {
        x: lClip,
        y: 0,
        width: rClip - lClip + 1,
        height: tClip + 1
      }
    });
  }
  if (isOverTop && isOverRight) {
    const x2 = Math.max(inX, rSplit);
    const y2 = inY;
    const right = inRight;
    const bottom = Math.min(inBottom, tSplit);
    result.push({
      rect: {
        x: x2,
        y: y2,
        width: right - x2,
        height: bottom - y2
      },
      clip: {
        x: rClip,
        y: 0,
        width: width - rClip + 1,
        height: tClip + 1
      }
    });
  }
  if (isOverLeft && isOverCenterHoriz) {
    const x2 = inX;
    const y2 = Math.max(inY, tSplit);
    const right = Math.min(inRight, lSplit);
    const bottom = Math.min(inBottom, bSplit);
    result.push({
      rect: {
        x: x2,
        y: y2,
        width: right - x2,
        height: bottom - y2
      },
      clip: {
        x: 0,
        y: tClip,
        width: lClip + 1,
        height: bClip - tClip + 1
      }
    });
  }
  if (isOverRight && isOverCenterHoriz) {
    const x2 = Math.max(inX, rSplit);
    const y2 = Math.max(inY, tSplit);
    const right = inRight;
    const bottom = Math.min(inBottom, bSplit);
    result.push({
      rect: {
        x: x2,
        y: y2,
        width: right - x2,
        height: bottom - y2
      },
      clip: {
        x: rClip,
        y: tClip,
        width: width - rClip + 1,
        height: bClip - tClip + 1
      }
    });
  }
  if (isOverLeft && isOverBottom) {
    const x2 = inX;
    const y2 = Math.max(inY, bSplit);
    const right = Math.min(inRight, lSplit);
    const bottom = inBottom;
    result.push({
      rect: {
        x: x2,
        y: y2,
        width: right - x2,
        height: bottom - y2
      },
      clip: {
        x: 0,
        y: bClip,
        width: lClip + 1,
        height: height - bClip + 1
      }
    });
  }
  if (isOverBottom && isOverCenterVert) {
    const x2 = Math.max(inX, lSplit);
    const y2 = Math.max(inY, bSplit);
    const right = Math.min(inRight, rSplit);
    const bottom = inBottom;
    result.push({
      rect: {
        x: x2,
        y: y2,
        width: right - x2,
        height: bottom - y2
      },
      clip: {
        x: lClip,
        y: bClip,
        width: rClip - lClip + 1,
        height: height - bClip + 1
      }
    });
  }
  if (isOverRight && isOverBottom) {
    const x2 = Math.max(inX, rSplit);
    const y2 = Math.max(inY, bSplit);
    const right = inRight;
    const bottom = inBottom;
    result.push({
      rect: {
        x: x2,
        y: y2,
        width: right - x2,
        height: bottom - y2
      },
      clip: {
        x: rClip,
        y: bClip,
        width: width - rClip + 1,
        height: height - bClip + 1
      }
    });
  }
  return result;
}

// vendor/glide-data-grid/dist/esm/internal/data-grid/render/data-grid-render.cells.js
var loadingCell = {
  kind: GridCellKind.Loading,
  allowOverlay: false
};
function drawCells(ctx, effectiveColumns, allColumns, height, totalHeaderHeight, translateX, translateY, cellYOffset, rows, getRowHeight, getCellContent, getGroupDetails, getRowThemeOverride, disabledRows, isFocused, drawFocus, freezeTrailingRows, hasAppendRow, drawRegions, damage, selection, prelightCells, highlightRegions, imageLoader, spriteManager, hoverValues, hoverInfo, drawCellCallback, hyperWrapping, outerTheme, enqueue, renderStateProvider, getCellRenderer, overrideCursor, minimumCellWidth) {
  let toDraw = damage?.size ?? Number.MAX_SAFE_INTEGER;
  const frameTime = performance.now();
  let font = outerTheme.baseFontFull;
  ctx.font = font;
  const deprepArg = { ctx };
  const cellIndex = [0, 0];
  const freezeTrailingRowsHeight = freezeTrailingRows > 0 ? getFreezeTrailingHeight(rows, freezeTrailingRows, getRowHeight) : 0;
  let result;
  let handledSpans = void 0;
  const skipPoint = getSkipPoint(drawRegions);
  walkColumns(effectiveColumns, cellYOffset, translateX, translateY, totalHeaderHeight, (c, drawX, colDrawStartY, clipX, startRow) => {
    const diff = Math.max(0, clipX - drawX);
    const colDrawX = drawX + diff;
    const colDrawY = totalHeaderHeight + 1;
    const colWidth = c.width - diff;
    const colHeight = height - totalHeaderHeight - 1;
    if (drawRegions.length > 0) {
      let found = false;
      for (let i = 0; i < drawRegions.length; i++) {
        const dr = drawRegions[i];
        if (intersectRect(colDrawX, colDrawY, colWidth, colHeight, dr.x, dr.y, dr.width, dr.height)) {
          found = true;
          break;
        }
      }
      if (!found)
        return;
    }
    const reclip = () => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(colDrawX, colDrawY, colWidth, colHeight);
      ctx.clip();
    };
    const colSelected = selection.columns.hasIndex(c.sourceIndex);
    const groupTheme = getGroupDetails(c.group ?? "").overrideTheme;
    const colTheme = c.themeOverride === void 0 && groupTheme === void 0 ? outerTheme : mergeAndRealizeTheme(outerTheme, groupTheme, c.themeOverride);
    const colFont = colTheme.baseFontFull;
    if (colFont !== font) {
      font = colFont;
      ctx.font = colFont;
    }
    reclip();
    let prepResult = void 0;
    walkRowsInCol(startRow, colDrawStartY, height, rows, getRowHeight, freezeTrailingRows, hasAppendRow, skipPoint, (drawY, row, rh, isSticky, isTrailingRow) => {
      if (row < 0)
        return;
      cellIndex[0] = c.sourceIndex;
      cellIndex[1] = row;
      if (damage !== void 0 && !damage.has(cellIndex)) {
        return;
      }
      if (drawRegions.length > 0) {
        let found = false;
        for (let i = 0; i < drawRegions.length; i++) {
          const dr = drawRegions[i];
          if (intersectRect(drawX, drawY, c.width, rh, dr.x, dr.y, dr.width, dr.height)) {
            found = true;
            break;
          }
        }
        if (!found)
          return;
      }
      const rowSelected = selection.rows.hasIndex(row);
      const rowDisabled = disabledRows.hasIndex(row);
      const cell = row < rows ? getCellContent(cellIndex) : loadingCell;
      let cellX = drawX;
      let cellWidth = c.width;
      let drawingSpan = false;
      let skipContents = false;
      if (cell.span !== void 0) {
        const [startCol, endCol] = cell.span;
        const spanKey = `${row},${startCol},${endCol},${c.sticky}`;
        if (handledSpans === void 0)
          handledSpans = /* @__PURE__ */ new Set();
        if (!handledSpans.has(spanKey)) {
          const areas = getSpanBounds(cell.span, drawX, drawY, c.width, rh, c, allColumns);
          const area = c.sticky ? areas[0] : areas[1];
          if (!c.sticky && areas[0] !== void 0) {
            skipContents = true;
          }
          if (area !== void 0) {
            cellX = area.x;
            cellWidth = area.width;
            handledSpans.add(spanKey);
            ctx.restore();
            prepResult = void 0;
            ctx.save();
            ctx.beginPath();
            const d3 = Math.max(0, clipX - area.x);
            ctx.rect(area.x + d3, drawY, area.width - d3, rh);
            if (result === void 0) {
              result = [];
            }
            result.push({
              x: area.x + d3,
              y: drawY,
              width: area.width - d3,
              height: rh
            });
            ctx.clip();
            drawingSpan = true;
          }
        } else {
          toDraw--;
          return;
        }
      }
      const rowTheme = getRowThemeOverride?.(row);
      const trailingTheme = isTrailingRow && c.trailingRowOptions?.themeOverride !== void 0 ? c.trailingRowOptions?.themeOverride : void 0;
      const theme = cell.themeOverride === void 0 && rowTheme === void 0 && trailingTheme === void 0 ? colTheme : mergeAndRealizeTheme(colTheme, rowTheme, trailingTheme, cell.themeOverride);
      ctx.beginPath();
      const isSelected = cellIsSelected(cellIndex, cell, selection);
      let accentCount = cellIsInRange(cellIndex, cell, selection, drawFocus);
      const spanIsHighlighted = cell.span !== void 0 && selection.columns.some(
        (index) => cell.span !== void 0 && index >= cell.span[0] && index <= cell.span[1]
        //alloc
      );
      if (isSelected && !isFocused && drawFocus) {
        accentCount = 0;
      } else if (isSelected && drawFocus) {
        accentCount = Math.max(accentCount, 1);
      }
      if (spanIsHighlighted) {
        accentCount++;
      }
      if (!isSelected) {
        if (rowSelected)
          accentCount++;
        if (colSelected && !isTrailingRow)
          accentCount++;
      }
      const bgCell = cell.kind === GridCellKind.Protected ? theme.bgCellMedium : theme.bgCell;
      let fill;
      if (isSticky || bgCell !== outerTheme.bgCell) {
        fill = blend(bgCell, fill);
      }
      if (accentCount > 0 || rowDisabled) {
        if (rowDisabled) {
          fill = blend(theme.bgHeader, fill);
        }
        for (let i = 0; i < accentCount; i++) {
          fill = blend(theme.accentLight, fill);
        }
      } else if (prelightCells !== void 0) {
        for (const pre of prelightCells) {
          if (pre[0] === c.sourceIndex && pre[1] === row) {
            fill = blend(theme.bgSearchResult, fill);
            break;
          }
        }
      }
      if (highlightRegions !== void 0) {
        for (let i = 0; i < highlightRegions.length; i++) {
          const region = highlightRegions[i];
          const r = region.range;
          if (region.style !== "solid-outline" && r.x <= c.sourceIndex && c.sourceIndex < r.x + r.width && r.y <= row && row < r.y + r.height) {
            fill = blend(region.color, fill);
          }
        }
      }
      let didDamageClip = false;
      if (damage !== void 0) {
        const top = drawY + 1;
        const bottom = isSticky ? top + rh - 1 : Math.min(top + rh - 1, height - freezeTrailingRowsHeight);
        const h = bottom - top;
        if (h !== rh - 1 || cellX + 1 <= clipX) {
          didDamageClip = true;
          ctx.save();
          ctx.beginPath();
          ctx.rect(cellX + 1, top, cellWidth - 1, h);
          ctx.clip();
        }
        fill = fill === void 0 ? theme.bgCell : blend(fill, theme.bgCell);
      }
      const isLastColumn = c.sourceIndex === allColumns.length - 1;
      const isLastRow = row === rows - 1;
      if (fill !== void 0) {
        ctx.fillStyle = fill;
        if (prepResult !== void 0) {
          prepResult.fillStyle = fill;
        }
        if (damage !== void 0) {
          ctx.fillRect(cellX + 1, drawY + 1, cellWidth - (isLastColumn ? 2 : 1), rh - (isLastRow ? 2 : 1));
        } else {
          ctx.fillRect(cellX, drawY, cellWidth, rh);
        }
      }
      if (cell.style === "faded") {
        ctx.globalAlpha = 0.6;
      }
      let hoverValue;
      for (let i = 0; i < hoverValues.length; i++) {
        const hv = hoverValues[i];
        if (hv.item[0] === c.sourceIndex && hv.item[1] === row) {
          hoverValue = hv;
          break;
        }
      }
      if (cellWidth > minimumCellWidth && !skipContents) {
        const cellFont = theme.baseFontFull;
        if (cellFont !== font) {
          ctx.font = cellFont;
          font = cellFont;
        }
        prepResult = drawCell(ctx, cell, c.sourceIndex, row, isLastColumn, isLastRow, cellX, drawY, cellWidth, rh, accentCount > 0, theme, fill ?? theme.bgCell, imageLoader, spriteManager, hoverValue?.hoverAmount ?? 0, hoverInfo, hyperWrapping, frameTime, drawCellCallback, prepResult, enqueue, renderStateProvider, getCellRenderer, overrideCursor);
      }
      if (didDamageClip) {
        ctx.restore();
      }
      if (cell.style === "faded") {
        ctx.globalAlpha = 1;
      }
      toDraw--;
      if (drawingSpan) {
        ctx.restore();
        prepResult?.deprep?.(deprepArg);
        prepResult = void 0;
        reclip();
        font = colFont;
        ctx.font = colFont;
      }
      return toDraw <= 0;
    });
    ctx.restore();
    return toDraw <= 0;
  });
  return result;
}
var allocatedItem = [0, 0];
var reusableRect = { x: 0, y: 0, width: 0, height: 0 };
var drawState = [void 0, () => void 0];
var animationFrameRequested = false;
function animRequest() {
  animationFrameRequested = true;
}
function drawCell(ctx, cell, col, row, isLastCol, isLastRow, x2, y2, w3, h, highlighted, theme, finalCellFillColor, imageLoader, spriteManager, hoverAmount, hoverInfo, hyperWrapping, frameTime, drawCellCallback, lastPrep, enqueue, renderStateProvider, getCellRenderer, overrideCursor) {
  let hoverX;
  let hoverY;
  if (hoverInfo !== void 0 && hoverInfo[0][0] === col && hoverInfo[0][1] === row) {
    hoverX = hoverInfo[1][0];
    hoverY = hoverInfo[1][1];
  }
  let result = void 0;
  allocatedItem[0] = col;
  allocatedItem[1] = row;
  reusableRect.x = x2;
  reusableRect.y = y2;
  reusableRect.width = w3;
  reusableRect.height = h;
  drawState[0] = renderStateProvider.getValue(allocatedItem);
  drawState[1] = (val) => renderStateProvider.setValue(allocatedItem, val);
  animationFrameRequested = false;
  const args = {
    //alloc
    ctx,
    theme,
    col,
    row,
    cell,
    rect: reusableRect,
    highlighted,
    cellFillColor: finalCellFillColor,
    hoverAmount,
    frameTime,
    hoverX,
    drawState,
    hoverY,
    imageLoader,
    spriteManager,
    hyperWrapping,
    overrideCursor: hoverX !== void 0 ? overrideCursor : void 0,
    requestAnimationFrame: animRequest
  };
  const needsAnim = drawLastUpdateUnderlay(args, cell.lastUpdated, frameTime, lastPrep, isLastCol, isLastRow);
  const r = getCellRenderer(cell);
  if (r !== void 0) {
    if (lastPrep?.renderer !== r) {
      lastPrep?.deprep?.(args);
      lastPrep = void 0;
    }
    const partialPrepResult = r.drawPrep?.(args, lastPrep);
    if (drawCellCallback !== void 0 && !isInnerOnlyCell(args.cell)) {
      drawCellCallback(args, () => r.draw(args, cell));
    } else {
      r.draw(args, cell);
    }
    result = partialPrepResult === void 0 ? void 0 : {
      deprep: partialPrepResult?.deprep,
      fillStyle: partialPrepResult?.fillStyle,
      font: partialPrepResult?.font,
      renderer: r
    };
  }
  if (needsAnim || animationFrameRequested)
    enqueue?.(allocatedItem);
  return result;
}

// vendor/glide-data-grid/dist/esm/internal/data-grid/render/data-grid-render.header.js
init_styles();
init_color_parser();
init_data_grid_types();

// vendor/glide-data-grid/dist/esm/internal/data-grid/render/draw-checkbox.js
init_support();
init_data_grid_types();
function drawCheckbox(ctx, theme, checked, x2, y2, width, height, highlighted, hoverX = -20, hoverY = -20, maxSize = void 0, alignment = "center", style = "square") {
  const centerY = Math.floor(y2 + height / 2);
  const rectBordRadius = style === "circle" ? 1e4 : theme.roundingRadius ?? 4;
  let checkBoxWidth = getSquareWidth(maxSize ?? theme.checkboxMaxSize, height, theme.cellVerticalPadding);
  let checkBoxHalfWidth = checkBoxWidth / 2;
  const posX = getSquareXPosFromAlign(alignment, x2, width, theme.cellHorizontalPadding, checkBoxWidth);
  const bb = getSquareBB(posX, centerY, checkBoxWidth);
  const hovered = pointIsWithinBB(x2 + hoverX, y2 + hoverY, bb);
  switch (checked) {
    case true: {
      ctx.beginPath();
      roundedRect(ctx, posX - checkBoxWidth / 2, centerY - checkBoxWidth / 2, checkBoxWidth, checkBoxWidth, rectBordRadius);
      if (style === "circle") {
        checkBoxHalfWidth *= 0.8;
        checkBoxWidth *= 0.8;
      }
      ctx.fillStyle = highlighted ? theme.accentColor : theme.textMedium;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(posX - checkBoxHalfWidth + checkBoxWidth / 4.23, centerY - checkBoxHalfWidth + checkBoxWidth / 1.97);
      ctx.lineTo(posX - checkBoxHalfWidth + checkBoxWidth / 2.42, centerY - checkBoxHalfWidth + checkBoxWidth / 1.44);
      ctx.lineTo(posX - checkBoxHalfWidth + checkBoxWidth / 1.29, centerY - checkBoxHalfWidth + checkBoxWidth / 3.25);
      ctx.strokeStyle = theme.bgCell;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = 1.9;
      ctx.stroke();
      break;
    }
    case BooleanEmpty:
    case false: {
      ctx.beginPath();
      roundedRect(ctx, posX - checkBoxWidth / 2 + 0.5, centerY - checkBoxWidth / 2 + 0.5, checkBoxWidth - 1, checkBoxWidth - 1, rectBordRadius);
      ctx.lineWidth = 1;
      ctx.strokeStyle = hovered ? theme.textDark : theme.textMedium;
      ctx.stroke();
      break;
    }
    case BooleanIndeterminate: {
      ctx.beginPath();
      roundedRect(ctx, posX - checkBoxWidth / 2, centerY - checkBoxWidth / 2, checkBoxWidth, checkBoxWidth, rectBordRadius);
      ctx.fillStyle = hovered ? theme.textMedium : theme.textLight;
      ctx.fill();
      if (style === "circle") {
        checkBoxHalfWidth *= 0.8;
        checkBoxWidth *= 0.8;
      }
      ctx.beginPath();
      ctx.moveTo(posX - checkBoxWidth / 3, centerY);
      ctx.lineTo(posX + checkBoxWidth / 3, centerY);
      ctx.strokeStyle = theme.bgCell;
      ctx.lineCap = "round";
      ctx.lineWidth = 1.9;
      ctx.stroke();
      break;
    }
    default:
      assertNever(checked);
  }
}

// vendor/glide-data-grid/dist/esm/internal/data-grid/render/data-grid-render.header.js
function drawGridHeaders(ctx, effectiveCols, enableGroups, hovered, width, translateX, headerHeight, groupHeaderHeight, dragAndDropState, isResizing, selection, outerTheme, spriteManager, hoverValues, verticalBorder, getGroupDetails, damage, drawHeaderCallback, touchMode) {
  const totalHeaderHeight = headerHeight + groupHeaderHeight;
  if (totalHeaderHeight <= 0)
    return;
  ctx.fillStyle = outerTheme.bgHeader;
  ctx.fillRect(0, 0, width, totalHeaderHeight);
  const hCol = hovered?.[0]?.[0];
  const hRow = hovered?.[0]?.[1];
  const hPosX = hovered?.[1]?.[0];
  const hPosY = hovered?.[1]?.[1];
  const font = outerTheme.headerFontFull;
  ctx.font = font;
  walkColumns(effectiveCols, 0, translateX, 0, totalHeaderHeight, (c, x2, _y, clipX) => {
    if (damage !== void 0 && !damage.has([c.sourceIndex, -1]))
      return;
    const diff = Math.max(0, clipX - x2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x2 + diff, groupHeaderHeight, c.width - diff, headerHeight);
    ctx.clip();
    const groupTheme = getGroupDetails(c.group ?? "").overrideTheme;
    const theme = c.themeOverride === void 0 && groupTheme === void 0 ? outerTheme : mergeAndRealizeTheme(outerTheme, groupTheme, c.themeOverride);
    if (theme.bgHeader !== outerTheme.bgHeader) {
      ctx.fillStyle = theme.bgHeader;
      ctx.fill();
    }
    if (theme !== outerTheme) {
      ctx.font = theme.headerFontFull;
    }
    const selected = selection.columns.hasIndex(c.sourceIndex);
    const noHover = dragAndDropState !== void 0 || isResizing || c.headerRowMarkerDisabled === true;
    const hoveredBoolean = !noHover && hRow === -1 && hCol === c.sourceIndex;
    const hover = noHover ? 0 : hoverValues.find((s) => s.item[0] === c.sourceIndex && s.item[1] === -1)?.hoverAmount ?? 0;
    const hasSelectedCell = selection?.current !== void 0 && selection.current.cell[0] === c.sourceIndex;
    const bgFillStyle = selected ? theme.accentColor : hasSelectedCell ? theme.bgHeaderHasFocus : theme.bgHeader;
    const y2 = enableGroups ? groupHeaderHeight : 0;
    const xOffset = c.sourceIndex === 0 ? 0 : 1;
    if (selected) {
      ctx.fillStyle = bgFillStyle;
      ctx.fillRect(x2 + xOffset, y2, c.width - xOffset, headerHeight);
    } else if (hasSelectedCell || hover > 0) {
      ctx.beginPath();
      ctx.rect(x2 + xOffset, y2, c.width - xOffset, headerHeight);
      if (hasSelectedCell) {
        ctx.fillStyle = theme.bgHeaderHasFocus;
        ctx.fill();
      }
      if (hover > 0) {
        ctx.globalAlpha = hover;
        ctx.fillStyle = theme.bgHeaderHovered;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    drawHeader(ctx, x2, y2, c.width, headerHeight, c, selected, theme, hoveredBoolean, hoveredBoolean ? hPosX : void 0, hoveredBoolean ? hPosY : void 0, hasSelectedCell, hover, spriteManager, drawHeaderCallback, touchMode);
    ctx.restore();
  });
  if (enableGroups) {
    drawGroups(ctx, effectiveCols, width, translateX, groupHeaderHeight, hovered, outerTheme, spriteManager, hoverValues, verticalBorder, getGroupDetails, damage);
  }
}
function drawGroups(ctx, effectiveCols, width, translateX, groupHeaderHeight, hovered, theme, spriteManager, _hoverValues, verticalBorder, getGroupDetails, damage) {
  const xPad = 8;
  const [hCol, hRow] = hovered?.[0] ?? [];
  let finalX = 0;
  walkGroups(effectiveCols, width, translateX, groupHeaderHeight, (span, groupName, x2, y2, w3, h) => {
    if (damage !== void 0 && !damage.hasItemInRectangle({
      x: span[0],
      y: -2,
      width: span[1] - span[0] + 1,
      height: 1
    }))
      return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x2, y2, w3, h);
    ctx.clip();
    const group = getGroupDetails(groupName);
    const groupTheme = group?.overrideTheme === void 0 ? theme : mergeAndRealizeTheme(theme, group.overrideTheme);
    const isHovered = hRow === -2 && hCol !== void 0 && hCol >= span[0] && hCol <= span[1];
    const fillColor = isHovered ? groupTheme.bgGroupHeaderHovered ?? groupTheme.bgHeaderHovered : groupTheme.bgGroupHeader ?? groupTheme.bgHeader;
    if (fillColor !== theme.bgHeader) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    ctx.fillStyle = groupTheme.textGroupHeader ?? groupTheme.textHeader;
    if (group !== void 0) {
      let drawX = x2;
      if (group.icon !== void 0) {
        spriteManager.drawSprite(group.icon, "normal", ctx, drawX + xPad, (groupHeaderHeight - 20) / 2, 20, groupTheme);
        drawX += 26;
      }
      ctx.fillText(group.name, drawX + xPad, groupHeaderHeight / 2 + getMiddleCenterBias(ctx, theme.headerFontFull));
      if (group.actions !== void 0 && isHovered) {
        const actionBoxes = getActionBoundsForGroup({ x: x2, y: y2, width: w3, height: h }, group.actions);
        ctx.beginPath();
        const fadeStartX = actionBoxes[0].x - 10;
        const fadeWidth = x2 + w3 - fadeStartX;
        ctx.rect(fadeStartX, 0, fadeWidth, groupHeaderHeight);
        const grad = ctx.createLinearGradient(fadeStartX, 0, fadeStartX + fadeWidth, 0);
        const trans = withAlpha(fillColor, 0);
        grad.addColorStop(0, trans);
        grad.addColorStop(10 / fadeWidth, fillColor);
        grad.addColorStop(1, fillColor);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.globalAlpha = 0.6;
        const [mouseX, mouseY] = hovered?.[1] ?? [-1, -1];
        for (let i = 0; i < group.actions.length; i++) {
          const action = group.actions[i];
          const box = actionBoxes[i];
          const actionHovered = pointInRect(box, mouseX + x2, mouseY);
          if (actionHovered) {
            ctx.globalAlpha = 1;
          }
          spriteManager.drawSprite(action.icon, "normal", ctx, box.x + box.width / 2 - 10, box.y + box.height / 2 - 10, 20, groupTheme);
          if (actionHovered) {
            ctx.globalAlpha = 0.6;
          }
        }
        ctx.globalAlpha = 1;
      }
    }
    if (x2 !== 0 && verticalBorder(span[0])) {
      ctx.beginPath();
      ctx.moveTo(x2 + 0.5, 0);
      ctx.lineTo(x2 + 0.5, groupHeaderHeight);
      ctx.strokeStyle = theme.borderColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
    finalX = x2 + w3;
  });
  ctx.beginPath();
  ctx.moveTo(finalX + 0.5, 0);
  ctx.lineTo(finalX + 0.5, groupHeaderHeight);
  ctx.moveTo(0, groupHeaderHeight + 0.5);
  ctx.lineTo(width, groupHeaderHeight + 0.5);
  ctx.strokeStyle = theme.borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();
}
var menuButtonSize = 30;
function getHeaderMenuBounds(x2, y2, width, height, isRtl) {
  if (isRtl)
    return { x: x2, y: y2, width: menuButtonSize, height: Math.min(menuButtonSize, height) };
  return {
    x: x2 + width - menuButtonSize,
    // right align
    y: Math.max(y2, y2 + height / 2 - menuButtonSize / 2),
    // center vertically
    width: menuButtonSize,
    height: Math.min(menuButtonSize, height)
  };
}
function getActionBoundsForGroup(box, actions) {
  const result = [];
  let x2 = box.x + box.width - 26 * actions.length;
  const y2 = box.y + box.height / 2 - 13;
  const height = 26;
  const width = 26;
  for (let i = 0; i < actions.length; i++) {
    result.push({
      x: x2,
      y: y2,
      width,
      height
    });
    x2 += 26;
  }
  return result;
}
function flipHorizontal(toFlip, mirrorX, isRTL) {
  if (!isRTL || toFlip === void 0)
    return toFlip;
  toFlip.x = mirrorX - (toFlip.x - mirrorX) - toFlip.width;
  return toFlip;
}
function computeHeaderLayout(ctx, c, x2, y2, width, height, theme, isRTL) {
  const xPad = theme.cellHorizontalPadding;
  const headerIconSize = theme.headerIconSize;
  const menuBounds = getHeaderMenuBounds(x2, y2, width, height, false);
  let drawX = x2 + xPad;
  const iconBounds = c.icon === void 0 ? void 0 : {
    x: drawX,
    y: y2 + (height - headerIconSize) / 2,
    width: headerIconSize,
    height: headerIconSize
  };
  const iconOverlayBounds = iconBounds === void 0 || c.overlayIcon === void 0 ? void 0 : {
    x: iconBounds.x + 9,
    y: iconBounds.y + 6,
    width: 18,
    height: 18
  };
  if (iconBounds !== void 0) {
    drawX += Math.ceil(headerIconSize * 1.3);
  }
  const textBounds = {
    x: drawX,
    y: y2,
    width: width - drawX,
    height
  };
  let indicatorIconBounds = void 0;
  if (c.indicatorIcon !== void 0) {
    const textWidth = ctx === void 0 ? getMeasuredTextCache(c.title, theme.headerFontFull)?.width ?? 0 : measureTextCached(c.title, ctx, theme.headerFontFull).width;
    textBounds.width = textWidth;
    drawX += textWidth + xPad;
    indicatorIconBounds = {
      x: drawX,
      y: y2 + (height - headerIconSize) / 2,
      width: headerIconSize,
      height: headerIconSize
    };
  }
  const mirrorPoint = x2 + width / 2;
  return {
    menuBounds: flipHorizontal(menuBounds, mirrorPoint, isRTL),
    iconBounds: flipHorizontal(iconBounds, mirrorPoint, isRTL),
    iconOverlayBounds: flipHorizontal(iconOverlayBounds, mirrorPoint, isRTL),
    textBounds: flipHorizontal(textBounds, mirrorPoint, isRTL),
    indicatorIconBounds: flipHorizontal(indicatorIconBounds, mirrorPoint, isRTL)
  };
}
function drawHeaderInner(ctx, x2, y2, width, height, c, selected, theme, isHovered, posX, posY, hoverAmount, spriteManager, touchMode, isRtl, headerLayout) {
  if (c.rowMarker !== void 0 && c.headerRowMarkerDisabled !== true) {
    const checked = c.rowMarkerChecked;
    if (checked !== true && c.headerRowMarkerAlwaysVisible !== true) {
      ctx.globalAlpha = hoverAmount;
    }
    const markerTheme = c.headerRowMarkerTheme !== void 0 ? mergeAndRealizeTheme(theme, c.headerRowMarkerTheme) : theme;
    drawCheckbox(ctx, markerTheme, checked, x2, y2, width, height, false, void 0, void 0, theme.checkboxMaxSize, "center", c.rowMarker);
    if (checked !== true && c.headerRowMarkerAlwaysVisible !== true) {
      ctx.globalAlpha = 1;
    }
    return;
  }
  const fillStyle = selected ? theme.textHeaderSelected : theme.textHeader;
  const shouldDrawMenu = c.hasMenu === true && (isHovered || touchMode && selected) && headerLayout.menuBounds !== void 0;
  if (c.icon !== void 0 && headerLayout.iconBounds !== void 0) {
    let variant = selected ? "selected" : "normal";
    if (c.style === "highlight") {
      variant = selected ? "selected" : "special";
    }
    spriteManager.drawSprite(c.icon, variant, ctx, headerLayout.iconBounds.x, headerLayout.iconBounds.y, headerLayout.iconBounds.width, theme);
    if (c.overlayIcon !== void 0 && headerLayout.iconOverlayBounds !== void 0) {
      spriteManager.drawSprite(c.overlayIcon, selected ? "selected" : "special", ctx, headerLayout.iconOverlayBounds.x, headerLayout.iconOverlayBounds.y, headerLayout.iconOverlayBounds.width, theme);
    }
  }
  if (shouldDrawMenu && width > 35) {
    const fadeWidth = 35;
    const fadeStart = isRtl ? fadeWidth : width - fadeWidth;
    const fadeEnd = isRtl ? fadeWidth * 0.7 : width - fadeWidth * 0.7;
    const fadeStartPercent = fadeStart / width;
    const fadeEndPercent = fadeEnd / width;
    const grad = ctx.createLinearGradient(x2, 0, x2 + width, 0);
    const trans = withAlpha(fillStyle, 0);
    grad.addColorStop(isRtl ? 1 : 0, fillStyle);
    grad.addColorStop(fadeStartPercent, fillStyle);
    grad.addColorStop(fadeEndPercent, trans);
    grad.addColorStop(isRtl ? 0 : 1, trans);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = fillStyle;
  }
  if (isRtl) {
    ctx.textAlign = "right";
  }
  if (headerLayout.textBounds !== void 0) {
    ctx.fillText(c.title, isRtl ? headerLayout.textBounds.x + headerLayout.textBounds.width : headerLayout.textBounds.x, y2 + height / 2 + getMiddleCenterBias(ctx, theme.headerFontFull));
  }
  if (isRtl) {
    ctx.textAlign = "left";
  }
  if (c.indicatorIcon !== void 0 && headerLayout.indicatorIconBounds !== void 0 && (!shouldDrawMenu || !intersectRect(headerLayout.menuBounds.x, headerLayout.menuBounds.y, headerLayout.menuBounds.width, headerLayout.menuBounds.height, headerLayout.indicatorIconBounds.x, headerLayout.indicatorIconBounds.y, headerLayout.indicatorIconBounds.width, headerLayout.indicatorIconBounds.height))) {
    let variant = selected ? "selected" : "normal";
    if (c.style === "highlight") {
      variant = selected ? "selected" : "special";
    }
    spriteManager.drawSprite(c.indicatorIcon, variant, ctx, headerLayout.indicatorIconBounds.x, headerLayout.indicatorIconBounds.y, headerLayout.indicatorIconBounds.width, theme);
  }
  if (shouldDrawMenu && headerLayout.menuBounds !== void 0) {
    const menuBounds = headerLayout.menuBounds;
    const hovered = posX !== void 0 && posY !== void 0 && pointInRect(menuBounds, posX + x2, posY + y2);
    if (!hovered) {
      ctx.globalAlpha = 0.7;
    }
    if (c.menuIcon === void 0 || c.menuIcon === GridColumnMenuIcon.Triangle) {
      ctx.beginPath();
      const triangleX = menuBounds.x + menuBounds.width / 2 - 5.5;
      const triangleY = menuBounds.y + menuBounds.height / 2 - 3;
      roundedPoly(ctx, [
        {
          x: triangleX,
          y: triangleY
        },
        {
          x: triangleX + 11,
          y: triangleY
        },
        {
          x: triangleX + 5.5,
          y: triangleY + 6
        }
      ], 1);
      ctx.fillStyle = fillStyle;
      ctx.fill();
    } else if (c.menuIcon === GridColumnMenuIcon.Dots) {
      ctx.beginPath();
      const dotsX = menuBounds.x + menuBounds.width / 2;
      const dotsY = menuBounds.y + menuBounds.height / 2;
      drawMenuDots(ctx, dotsX, dotsY);
      ctx.fillStyle = fillStyle;
      ctx.fill();
    } else {
      const iconX = menuBounds.x + (menuBounds.width - theme.headerIconSize) / 2;
      const iconY = menuBounds.y + (menuBounds.height - theme.headerIconSize) / 2;
      spriteManager.drawSprite(c.menuIcon, "normal", ctx, iconX, iconY, theme.headerIconSize, theme);
    }
    if (!hovered) {
      ctx.globalAlpha = 1;
    }
  }
}
function drawHeader(ctx, x2, y2, width, height, c, selected, theme, isHovered, posX, posY, hasSelectedCell, hoverAmount, spriteManager, drawHeaderCallback, touchMode) {
  const isRtl = direction(c.title) === "rtl";
  const headerLayout = computeHeaderLayout(ctx, c, x2, y2, width, height, theme, isRtl);
  if (drawHeaderCallback !== void 0) {
    drawHeaderCallback({
      ctx,
      theme,
      rect: { x: x2, y: y2, width, height },
      column: c,
      columnIndex: c.sourceIndex,
      isSelected: selected,
      hoverAmount,
      isHovered,
      hasSelectedCell,
      spriteManager,
      menuBounds: headerLayout?.menuBounds ?? { x: 0, y: 0, height: 0, width: 0 },
      hoverX: posX,
      hoverY: posY
    }, () => drawHeaderInner(ctx, x2, y2, width, height, c, selected, theme, isHovered, posX, posY, hoverAmount, spriteManager, touchMode, isRtl, headerLayout));
  } else {
    drawHeaderInner(ctx, x2, y2, width, height, c, selected, theme, isHovered, posX, posY, hoverAmount, spriteManager, touchMode, isRtl, headerLayout);
  }
}

// vendor/glide-data-grid/dist/esm/internal/data-grid/render/data-grid-render.lines.js
var import_groupBy = __toESM(require_groupBy(), 1);
init_styles();
init_color_parser();
function drawBlanks(ctx, effectiveColumns, allColumns, width, height, totalHeaderHeight, translateX, translateY, cellYOffset, rows, getRowHeight, getRowTheme, selectedRows, disabledRows, freezeTrailingRows, hasAppendRow, drawRegions, damage, theme) {
  if (damage !== void 0 || effectiveColumns[effectiveColumns.length - 1] !== allColumns[effectiveColumns.length - 1])
    return;
  const skipPoint = getSkipPoint(drawRegions);
  walkColumns(effectiveColumns, cellYOffset, translateX, translateY, totalHeaderHeight, (c, drawX, colDrawY, clipX, startRow) => {
    if (c !== effectiveColumns[effectiveColumns.length - 1])
      return;
    drawX += c.width;
    const x2 = Math.max(drawX, clipX);
    if (x2 > width)
      return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x2, totalHeaderHeight + 1, 1e4, height - totalHeaderHeight - 1);
    ctx.clip();
    walkRowsInCol(startRow, colDrawY, height, rows, getRowHeight, freezeTrailingRows, hasAppendRow, skipPoint, (drawY, row, rh, isSticky) => {
      if (!isSticky && drawRegions.length > 0 && !drawRegions.some((dr) => intersectRect(drawX, drawY, 1e4, rh, dr.x, dr.y, dr.width, dr.height))) {
        return;
      }
      const rowSelected = selectedRows.hasIndex(row);
      const rowDisabled = disabledRows.hasIndex(row);
      ctx.beginPath();
      const rowTheme = getRowTheme?.(row);
      const blankTheme = rowTheme === void 0 ? theme : mergeAndRealizeTheme(theme, rowTheme);
      if (blankTheme.bgCell !== theme.bgCell) {
        ctx.fillStyle = blankTheme.bgCell;
        ctx.fillRect(drawX, drawY, 1e4, rh);
      }
      if (rowDisabled) {
        ctx.fillStyle = blankTheme.bgHeader;
        ctx.fillRect(drawX, drawY, 1e4, rh);
      }
      if (rowSelected) {
        ctx.fillStyle = blankTheme.accentLight;
        ctx.fillRect(drawX, drawY, 1e4, rh);
      }
    });
    ctx.restore();
  });
}
function overdrawStickyBoundaries(ctx, effectiveCols, width, height, freezeTrailingRows, rows, verticalBorder, getRowHeight, theme) {
  let drawFreezeBorder = false;
  for (const c of effectiveCols) {
    if (c.sticky)
      continue;
    drawFreezeBorder = verticalBorder(c.sourceIndex);
    break;
  }
  const hColor = theme.horizontalBorderColor ?? theme.borderColor;
  const vColor = theme.borderColor;
  const drawX = drawFreezeBorder ? getStickyWidth(effectiveCols) : 0;
  let vStroke;
  if (drawX !== 0) {
    vStroke = blendCache(vColor, theme.bgCell);
    ctx.beginPath();
    ctx.moveTo(drawX + 0.5, 0);
    ctx.lineTo(drawX + 0.5, height);
    ctx.strokeStyle = vStroke;
    ctx.stroke();
  }
  if (freezeTrailingRows > 0) {
    const hStroke = vColor === hColor && vStroke !== void 0 ? vStroke : blendCache(hColor, theme.bgCell);
    const h = getFreezeTrailingHeight(rows, freezeTrailingRows, getRowHeight);
    ctx.beginPath();
    ctx.moveTo(0, height - h + 0.5);
    ctx.lineTo(width, height - h + 0.5);
    ctx.strokeStyle = hStroke;
    ctx.stroke();
  }
}
var getMinMaxXY = (drawRegions, width, height) => {
  let minX = 0;
  let maxX = width;
  let minY = 0;
  let maxY = height;
  if (drawRegions !== void 0 && drawRegions.length > 0) {
    minX = Number.MAX_SAFE_INTEGER;
    minY = Number.MAX_SAFE_INTEGER;
    maxX = Number.MIN_SAFE_INTEGER;
    maxY = Number.MIN_SAFE_INTEGER;
    for (const r of drawRegions) {
      minX = Math.min(minX, r.x - 1);
      maxX = Math.max(maxX, r.x + r.width + 1);
      minY = Math.min(minY, r.y - 1);
      maxY = Math.max(maxY, r.y + r.height + 1);
    }
  }
  return { minX, maxX, minY, maxY };
};
function drawExtraRowThemes(ctx, effectiveCols, cellYOffset, translateX, translateY, width, height, drawRegions, totalHeaderHeight, getRowHeight, getRowThemeOverride, verticalBorder, freezeTrailingRows, rows, theme) {
  const bgCell = theme.bgCell;
  const { minX, maxX, minY, maxY } = getMinMaxXY(drawRegions, width, height);
  const toDraw = [];
  const freezeY = height - getFreezeTrailingHeight(rows, freezeTrailingRows, getRowHeight);
  let y2 = totalHeaderHeight;
  let row = cellYOffset;
  let extraRowsStartY = 0;
  while (y2 + translateY < freezeY) {
    const ty = y2 + translateY;
    const rh = getRowHeight(row);
    if (ty >= minY && ty <= maxY - 1) {
      const rowTheme = getRowThemeOverride?.(row);
      const rowThemeBgCell = rowTheme?.bgCell;
      const needDraw = rowThemeBgCell !== void 0 && rowThemeBgCell !== bgCell && row >= rows - freezeTrailingRows;
      if (needDraw) {
        toDraw.push({
          x: minX,
          y: ty,
          w: maxX - minX,
          h: rh,
          color: rowThemeBgCell
        });
      }
    }
    y2 += rh;
    if (row < rows - freezeTrailingRows)
      extraRowsStartY = y2;
    row++;
  }
  let x2 = 0;
  const h = Math.min(freezeY, maxY) - extraRowsStartY;
  if (h > 0) {
    for (let index = 0; index < effectiveCols.length; index++) {
      const c = effectiveCols[index];
      if (c.width === 0)
        continue;
      const tx = c.sticky ? x2 : x2 + translateX;
      const colThemeBgCell = c.themeOverride?.bgCell;
      if (colThemeBgCell !== void 0 && colThemeBgCell !== bgCell && tx >= minX && tx <= maxX && verticalBorder(index + 1)) {
        toDraw.push({
          x: tx,
          y: extraRowsStartY,
          w: c.width,
          h,
          color: colThemeBgCell
        });
      }
      x2 += c.width;
    }
  }
  if (toDraw.length === 0)
    return;
  let color;
  ctx.beginPath();
  for (let i = toDraw.length - 1; i >= 0; i--) {
    const r = toDraw[i];
    if (color === void 0) {
      color = r.color;
    } else if (r.color !== color) {
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      color = r.color;
    }
    ctx.rect(r.x, r.y, r.w, r.h);
  }
  if (color !== void 0) {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.beginPath();
}
function drawGridLines(ctx, effectiveCols, cellYOffset, translateX, translateY, width, height, drawRegions, spans, groupHeaderHeight, totalHeaderHeight, getRowHeight, getRowThemeOverride, verticalBorder, freezeTrailingRows, rows, theme, verticalOnly = false) {
  if (spans !== void 0) {
    ctx.beginPath();
    ctx.save();
    ctx.rect(0, 0, width, height);
    for (const span of spans) {
      ctx.rect(span.x + 1, span.y + 1, span.width - 1, span.height - 1);
    }
    ctx.clip("evenodd");
  }
  const hColor = theme.horizontalBorderColor ?? theme.borderColor;
  const vColor = theme.borderColor;
  const { minX, maxX, minY, maxY } = getMinMaxXY(drawRegions, width, height);
  const toDraw = [];
  ctx.beginPath();
  let x2 = 0.5;
  for (let index = 0; index < effectiveCols.length; index++) {
    const c = effectiveCols[index];
    if (c.width === 0)
      continue;
    x2 += c.width;
    const tx = c.sticky ? x2 : x2 + translateX;
    if (tx >= minX && tx <= maxX && verticalBorder(index + 1)) {
      toDraw.push({
        x1: tx,
        y1: Math.max(groupHeaderHeight, minY),
        x2: tx,
        y2: Math.min(height, maxY),
        color: vColor
      });
    }
  }
  let freezeY = height + 0.5;
  for (let i = rows - freezeTrailingRows; i < rows; i++) {
    const rh = getRowHeight(i);
    freezeY -= rh;
    toDraw.push({ x1: minX, y1: freezeY, x2: maxX, y2: freezeY, color: hColor });
  }
  if (verticalOnly !== true) {
    let y2 = totalHeaderHeight + 0.5;
    let row = cellYOffset;
    const target = freezeY;
    while (y2 + translateY < target) {
      const ty = y2 + translateY;
      if (ty >= minY && ty <= maxY - 1) {
        const rowTheme = getRowThemeOverride?.(row);
        toDraw.push({
          x1: minX,
          y1: ty,
          x2: maxX,
          y2: ty,
          color: rowTheme?.horizontalBorderColor ?? rowTheme?.borderColor ?? hColor
        });
      }
      y2 += getRowHeight(row);
      row++;
    }
  }
  const groups = (0, import_groupBy.default)(toDraw, (line) => line.color);
  for (const g of Object.keys(groups)) {
    ctx.strokeStyle = g;
    for (const line of groups[g]) {
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
    }
    ctx.stroke();
    ctx.beginPath();
  }
  if (spans !== void 0) {
    ctx.restore();
  }
}

// vendor/glide-data-grid/dist/esm/internal/data-grid/render/data-grid-render.blit.js
init_support();
function blitLastFrame(ctx, blitSource, blitSourceScroll, targetScroll, last, cellXOffset, cellYOffset, translateX, translateY, freezeTrailingRows, width, height, rows, totalHeaderHeight, dpr, mappedColumns, effectiveCols, getRowHeight, doubleBuffer) {
  const drawRegions = [];
  ctx.imageSmoothingEnabled = false;
  const minY = Math.min(last.cellYOffset, cellYOffset);
  const maxY = Math.max(last.cellYOffset, cellYOffset);
  let deltaY = 0;
  if (typeof getRowHeight === "number") {
    deltaY += (maxY - minY) * getRowHeight;
  } else {
    for (let i = minY; i < maxY; i++) {
      deltaY += getRowHeight(i);
    }
  }
  if (cellYOffset > last.cellYOffset) {
    deltaY = -deltaY;
  }
  deltaY += translateY - last.translateY;
  const minX = Math.min(last.cellXOffset, cellXOffset);
  const maxX = Math.max(last.cellXOffset, cellXOffset);
  let deltaX = 0;
  for (let i = minX; i < maxX; i++) {
    deltaX += mappedColumns[i].width;
  }
  if (cellXOffset > last.cellXOffset) {
    deltaX = -deltaX;
  }
  deltaX += translateX - last.translateX;
  const stickyWidth = getStickyWidth(effectiveCols);
  if (deltaX !== 0 && deltaY !== 0) {
    return {
      regions: []
    };
  }
  const freezeTrailingRowsHeight = freezeTrailingRows > 0 ? getFreezeTrailingHeight(rows, freezeTrailingRows, getRowHeight) : 0;
  const blitWidth = width - stickyWidth - Math.abs(deltaX);
  const blitHeight = height - totalHeaderHeight - freezeTrailingRowsHeight - Math.abs(deltaY) - 1;
  if (blitWidth > 150 && blitHeight > 150) {
    const args = {
      sx: 0,
      sy: 0,
      sw: width * dpr,
      sh: height * dpr,
      dx: 0,
      dy: 0,
      dw: width * dpr,
      dh: height * dpr
    };
    if (deltaY > 0) {
      args.sy = (totalHeaderHeight + 1) * dpr;
      args.sh = blitHeight * dpr;
      args.dy = (deltaY + totalHeaderHeight + 1) * dpr;
      args.dh = blitHeight * dpr;
      drawRegions.push({
        x: 0,
        y: totalHeaderHeight,
        width,
        height: deltaY + 1
      });
    } else if (deltaY < 0) {
      args.sy = (-deltaY + totalHeaderHeight + 1) * dpr;
      args.sh = blitHeight * dpr;
      args.dy = (totalHeaderHeight + 1) * dpr;
      args.dh = blitHeight * dpr;
      drawRegions.push({
        x: 0,
        y: height + deltaY - freezeTrailingRowsHeight,
        width,
        height: -deltaY + freezeTrailingRowsHeight
      });
    }
    if (deltaX > 0) {
      args.sx = stickyWidth * dpr;
      args.sw = blitWidth * dpr;
      args.dx = (deltaX + stickyWidth) * dpr;
      args.dw = blitWidth * dpr;
      drawRegions.push({
        x: stickyWidth - 1,
        y: 0,
        width: deltaX + 2,
        // extra width to account for first col not drawing a left side border
        height
      });
    } else if (deltaX < 0) {
      args.sx = (stickyWidth - deltaX) * dpr;
      args.sw = blitWidth * dpr;
      args.dx = stickyWidth * dpr;
      args.dw = blitWidth * dpr;
      drawRegions.push({
        x: width + deltaX,
        y: 0,
        width: -deltaX,
        height
      });
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (doubleBuffer) {
      if (stickyWidth > 0 && deltaX !== 0 && deltaY === 0 && (targetScroll === void 0 || blitSourceScroll?.[1] !== false)) {
        const w3 = stickyWidth * dpr;
        const h = height * dpr;
        ctx.drawImage(blitSource, 0, 0, w3, h, 0, 0, w3, h);
      }
      if (freezeTrailingRowsHeight > 0 && deltaX === 0 && deltaY !== 0 && (targetScroll === void 0 || blitSourceScroll?.[0] !== false)) {
        const y2 = (height - freezeTrailingRowsHeight) * dpr;
        const w3 = width * dpr;
        const h = freezeTrailingRowsHeight * dpr;
        ctx.drawImage(blitSource, 0, y2, w3, h, 0, y2, w3, h);
      }
    }
    ctx.drawImage(blitSource, args.sx, args.sy, args.sw, args.sh, args.dx, args.dy, args.dw, args.dh);
    ctx.scale(dpr, dpr);
  }
  ctx.imageSmoothingEnabled = true;
  return {
    regions: drawRegions
  };
}
function blitResizedCol(last, cellXOffset, cellYOffset, translateX, translateY, width, height, totalHeaderHeight, effectiveCols, resizedIndex) {
  const drawRegions = [];
  if (cellXOffset !== last.cellXOffset || cellYOffset !== last.cellYOffset || translateX !== last.translateX || translateY !== last.translateY) {
    return drawRegions;
  }
  walkColumns(effectiveCols, cellYOffset, translateX, translateY, totalHeaderHeight, (c, drawX, _drawY, clipX) => {
    if (c.sourceIndex === resizedIndex) {
      const x2 = Math.max(drawX, clipX) + 1;
      drawRegions.push({
        x: x2,
        y: 0,
        width: width - x2,
        height
      });
      return true;
    }
  });
  return drawRegions;
}
function computeCanBlit(current, last) {
  if (last === void 0)
    return false;
  if (current.width !== last.width || current.height !== last.height || current.theme !== last.theme || current.headerHeight !== last.headerHeight || current.rowHeight !== last.rowHeight || current.rows !== last.rows || current.freezeColumns !== last.freezeColumns || current.getRowThemeOverride !== last.getRowThemeOverride || current.isFocused !== last.isFocused || current.isResizing !== last.isResizing || current.verticalBorder !== last.verticalBorder || current.getCellContent !== last.getCellContent || current.highlightRegions !== last.highlightRegions || current.selection !== last.selection || current.dragAndDropState !== last.dragAndDropState || current.prelightCells !== last.prelightCells || current.touchMode !== last.touchMode || current.maxScaleFactor !== last.maxScaleFactor) {
    return false;
  }
  if (current.mappedColumns !== last.mappedColumns) {
    if (current.mappedColumns.length > 100 || current.mappedColumns.length !== last.mappedColumns.length) {
      return false;
    }
    let resized;
    for (let i = 0; i < current.mappedColumns.length; i++) {
      const curCol = current.mappedColumns[i];
      const lastCol = last.mappedColumns[i];
      if (deepEqual(curCol, lastCol))
        continue;
      if (resized !== void 0)
        return false;
      if (curCol.width === lastCol.width)
        return false;
      const { width, ...curRest } = curCol;
      const { width: lastWidth, ...lastRest } = lastCol;
      if (!deepEqual(curRest, lastRest))
        return false;
      resized = i;
    }
    if (resized === void 0) {
      return true;
    }
    return resized;
  }
  return true;
}

// vendor/glide-data-grid/dist/esm/internal/data-grid/render/data-grid.render.rings.js
init_data_grid_types();
init_color_parser();
function drawHighlightRings(ctx, width, height, cellXOffset, cellYOffset, translateX, translateY, mappedColumns, freezeColumns, headerHeight, groupHeaderHeight, rowHeight, freezeTrailingRows, rows, allHighlightRegions, theme) {
  const highlightRegions = allHighlightRegions?.filter((x2) => x2.style !== "no-outline");
  if (highlightRegions === void 0 || highlightRegions.length === 0)
    return void 0;
  const freezeLeft = getStickyWidth(mappedColumns);
  const freezeBottom = getFreezeTrailingHeight(rows, freezeTrailingRows, rowHeight);
  const splitIndicies = [freezeColumns, 0, mappedColumns.length, rows - freezeTrailingRows];
  const splitLocations = [freezeLeft, 0, width, height - freezeBottom];
  const drawRects = highlightRegions.map((h) => {
    const r = h.range;
    const style = h.style ?? "dashed";
    return splitRectIntoRegions(r, splitIndicies, width, height, splitLocations).map((arg) => {
      const rect = arg.rect;
      const topLeftBounds = computeBounds(rect.x, rect.y, width, height, groupHeaderHeight, headerHeight + groupHeaderHeight, cellXOffset, cellYOffset, translateX, translateY, rows, freezeColumns, freezeTrailingRows, mappedColumns, rowHeight);
      const bottomRightBounds = rect.width === 1 && rect.height === 1 ? topLeftBounds : computeBounds(rect.x + rect.width - 1, rect.y + rect.height - 1, width, height, groupHeaderHeight, headerHeight + groupHeaderHeight, cellXOffset, cellYOffset, translateX, translateY, rows, freezeColumns, freezeTrailingRows, mappedColumns, rowHeight);
      if (rect.x + rect.width >= mappedColumns.length) {
        bottomRightBounds.width -= 1;
      }
      if (rect.y + rect.height >= rows) {
        bottomRightBounds.height -= 1;
      }
      return {
        color: h.color,
        style,
        clip: arg.clip,
        rect: hugRectToTarget({
          x: topLeftBounds.x,
          y: topLeftBounds.y,
          width: bottomRightBounds.x + bottomRightBounds.width - topLeftBounds.x,
          height: bottomRightBounds.y + bottomRightBounds.height - topLeftBounds.y
        }, width, height, 8)
      };
    });
  });
  const drawCb = () => {
    ctx.lineWidth = 1;
    let dashed = false;
    for (const dr of drawRects) {
      for (const s of dr) {
        if (s?.rect !== void 0 && intersectRect(0, 0, width, height, s.rect.x, s.rect.y, s.rect.width, s.rect.height)) {
          const wasDashed = dashed;
          const needsClip = !rectContains(s.clip, s.rect);
          ctx.beginPath();
          if (needsClip) {
            ctx.save();
            ctx.rect(s.clip.x, s.clip.y, s.clip.width, s.clip.height);
            ctx.clip();
          }
          if (s.style === "dashed" && !dashed) {
            ctx.setLineDash([5, 3]);
            dashed = true;
          } else if ((s.style === "solid" || s.style === "solid-outline") && dashed) {
            ctx.setLineDash([]);
            dashed = false;
          }
          ctx.strokeStyle = s.style === "solid-outline" ? blend(blend(s.color, theme.borderColor), theme.bgCell) : withAlpha(s.color, 1);
          ctx.closePath();
          ctx.strokeRect(s.rect.x + 0.5, s.rect.y + 0.5, s.rect.width - 1, s.rect.height - 1);
          if (needsClip) {
            ctx.restore();
            dashed = wasDashed;
          }
        }
      }
    }
    if (dashed) {
      ctx.setLineDash([]);
    }
  };
  drawCb();
  return drawCb;
}
function drawColumnResizeOutline(ctx, yOffset, xOffset, height, style) {
  ctx.beginPath();
  ctx.moveTo(yOffset, xOffset);
  ctx.lineTo(yOffset, height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = style;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
function drawFillHandle(ctx, width, height, cellYOffset, translateX, translateY, effectiveCols, allColumns, theme, totalHeaderHeight, selectedCell, getRowHeight, getCellContent, freezeTrailingRows, hasAppendRow, fillHandle, rows) {
  if (selectedCell.current === void 0)
    return void 0;
  const drawFill = fillHandle !== false && fillHandle !== void 0;
  if (!drawFill)
    return void 0;
  const fill = typeof fillHandle === "object" ? { ...DEFAULT_FILL_HANDLE, ...fillHandle } : DEFAULT_FILL_HANDLE;
  const range2 = selectedCell.current.range;
  const currentItem = selectedCell.current.cell;
  const fillHandleTarget = [range2.x + range2.width - 1, range2.y + range2.height - 1];
  if (currentItem[1] >= rows && fillHandleTarget[1] >= rows)
    return void 0;
  const mustDraw = effectiveCols.some((c) => c.sourceIndex === currentItem[0] || c.sourceIndex === fillHandleTarget[0]);
  if (!mustDraw)
    return void 0;
  const [targetCol, targetRow] = selectedCell.current.cell;
  const cell = getCellContent(selectedCell.current.cell);
  const targetColSpan = cell.span ?? [targetCol, targetCol];
  const isStickyRow = targetRow >= rows - freezeTrailingRows;
  const stickRowHeight = freezeTrailingRows > 0 && !isStickyRow ? getFreezeTrailingHeight(rows, freezeTrailingRows, getRowHeight) - 1 : 0;
  const fillHandleRow = fillHandleTarget[1];
  let drawHandleCb = void 0;
  walkColumns(effectiveCols, cellYOffset, translateX, translateY, totalHeaderHeight, (col, drawX, colDrawY, clipX, startRow) => {
    clipX;
    if (col.sticky && targetCol > col.sourceIndex)
      return;
    const isBeforeTarget = col.sourceIndex < targetColSpan[0];
    const isAfterTarget = col.sourceIndex > targetColSpan[1];
    const isFillHandleCol = col.sourceIndex === fillHandleTarget[0];
    if (!isFillHandleCol && (isBeforeTarget || isAfterTarget)) {
      return;
    }
    walkRowsInCol(startRow, colDrawY, height, rows, getRowHeight, freezeTrailingRows, hasAppendRow, void 0, (drawY, row, rh) => {
      if (row !== targetRow && row !== fillHandleRow)
        return;
      let cellX = drawX;
      let cellWidth = col.width;
      if (cell.span !== void 0) {
        const areas = getSpanBounds(cell.span, drawX, drawY, col.width, rh, col, allColumns);
        const area = col.sticky ? areas[0] : areas[1];
        if (area !== void 0) {
          cellX = area.x;
          cellWidth = area.width;
        }
      }
      const doHandle = row === fillHandleRow && isFillHandleCol && drawFill;
      if (doHandle) {
        drawHandleCb = () => {
          if (clipX > cellX && !col.sticky) {
            ctx.beginPath();
            ctx.rect(clipX, 0, width - clipX, height);
            ctx.clip();
          }
          const size = fill.size;
          const half = size / 2;
          const hx = cellX + cellWidth + fill.offsetX - half + 0.5;
          const hy = drawY + rh + fill.offsetY - half + 0.5;
          ctx.beginPath();
          if (fill.shape === "circle") {
            ctx.arc(hx + half, hy + half, half, 0, Math.PI * 2);
          } else {
            ctx.rect(hx, hy, size, size);
          }
          ctx.fillStyle = col.themeOverride?.accentColor ?? theme.accentColor;
          ctx.fill();
          if (fill.outline > 0) {
            ctx.lineWidth = fill.outline;
            ctx.strokeStyle = theme.bgCell;
            if (fill.shape === "circle") {
              ctx.beginPath();
              ctx.arc(hx + half, hy + half, half + fill.outline / 2, 0, Math.PI * 2);
              ctx.stroke();
            } else {
              ctx.strokeRect(hx - fill.outline / 2, hy - fill.outline / 2, size + fill.outline, size + fill.outline);
            }
          }
        };
      }
      return drawHandleCb !== void 0;
    });
    return drawHandleCb !== void 0;
  });
  if (drawHandleCb === void 0)
    return void 0;
  const result = () => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, totalHeaderHeight, width, height - totalHeaderHeight - stickRowHeight);
    ctx.clip();
    drawHandleCb?.();
    ctx.restore();
  };
  result();
  return result;
}

// vendor/glide-data-grid/dist/esm/internal/data-grid/render/data-grid-render.js
function clipHeaderDamage(ctx, effectiveColumns, width, groupHeaderHeight, totalHeaderHeight, translateX, translateY, cellYOffset, damage) {
  if (damage === void 0 || damage.size === 0)
    return;
  ctx.beginPath();
  walkGroups(effectiveColumns, width, translateX, groupHeaderHeight, (span, _group, x2, y2, w3, h) => {
    const hasItemInSpan = damage.hasItemInRectangle({
      x: span[0],
      y: -2,
      width: span[1] - span[0] + 1,
      height: 1
    });
    if (hasItemInSpan) {
      ctx.rect(x2, y2, w3, h);
    }
  });
  walkColumns(effectiveColumns, cellYOffset, translateX, translateY, totalHeaderHeight, (c, drawX, _colDrawY, clipX) => {
    const diff = Math.max(0, clipX - drawX);
    const finalX = drawX + diff + 1;
    const finalWidth = c.width - diff - 1;
    if (damage.has([c.sourceIndex, -1])) {
      ctx.rect(finalX, groupHeaderHeight, finalWidth, totalHeaderHeight - groupHeaderHeight);
    }
  });
  ctx.clip();
}
function getLastRow(effectiveColumns, height, totalHeaderHeight, translateX, translateY, cellYOffset, rows, getRowHeight, freezeTrailingRows, hasAppendRow) {
  let result = 0;
  walkColumns(effectiveColumns, cellYOffset, translateX, translateY, totalHeaderHeight, (_c, __drawX, colDrawY, _clipX, startRow) => {
    walkRowsInCol(startRow, colDrawY, height, rows, getRowHeight, freezeTrailingRows, hasAppendRow, void 0, (_drawY, row, _rh, isSticky) => {
      if (!isSticky) {
        result = Math.max(row, result);
      }
    });
    return true;
  });
  return result;
}
function drawGrid(arg, lastArg) {
  const { canvasCtx, headerCanvasCtx, width, height, cellXOffset, cellYOffset, translateX, translateY, mappedColumns, enableGroups, freezeColumns, dragAndDropState, theme, drawFocus, headerHeight, groupHeaderHeight, disabledRows, rowHeight, verticalBorder, overrideCursor, isResizing, selection, fillHandle, freezeTrailingRows, rows, getCellContent, getGroupDetails, getRowThemeOverride, isFocused, drawHeaderCallback, prelightCells, drawCellCallback, highlightRegions, resizeCol, imageLoader, lastBlitData, hoverValues, hyperWrapping, hoverInfo, spriteManager, maxScaleFactor, hasAppendRow, touchMode, enqueue, renderStateProvider, getCellRenderer, renderStrategy, bufferACtx, bufferBCtx, damage, minimumCellWidth, resizeIndicator } = arg;
  if (width === 0 || height === 0)
    return;
  const doubleBuffer = renderStrategy === "double-buffer";
  const dpr = Math.min(maxScaleFactor, Math.ceil(window.devicePixelRatio ?? 1));
  const canBlit = renderStrategy !== "direct" && computeCanBlit(arg, lastArg);
  const canvas = canvasCtx.canvas;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
  }
  const overlayCanvas = headerCanvasCtx.canvas;
  const totalHeaderHeight = enableGroups ? groupHeaderHeight + headerHeight : headerHeight;
  const overlayHeight = totalHeaderHeight + 1;
  if (overlayCanvas.width !== width * dpr || overlayCanvas.height !== overlayHeight * dpr) {
    overlayCanvas.width = width * dpr;
    overlayCanvas.height = overlayHeight * dpr;
    overlayCanvas.style.width = width + "px";
    overlayCanvas.style.height = overlayHeight + "px";
  }
  const bufferA = bufferACtx.canvas;
  const bufferB = bufferBCtx.canvas;
  if (doubleBuffer && (bufferA.width !== width * dpr || bufferA.height !== height * dpr)) {
    bufferA.width = width * dpr;
    bufferA.height = height * dpr;
    if (lastBlitData.current !== void 0)
      lastBlitData.current.aBufferScroll = void 0;
  }
  if (doubleBuffer && (bufferB.width !== width * dpr || bufferB.height !== height * dpr)) {
    bufferB.width = width * dpr;
    bufferB.height = height * dpr;
    if (lastBlitData.current !== void 0)
      lastBlitData.current.bBufferScroll = void 0;
  }
  const last = lastBlitData.current;
  if (canBlit === true && cellXOffset === last?.cellXOffset && cellYOffset === last?.cellYOffset && translateX === last?.translateX && translateY === last?.translateY)
    return;
  let mainCtx = null;
  if (doubleBuffer) {
    mainCtx = canvasCtx;
  }
  const overlayCtx = headerCanvasCtx;
  let targetCtx;
  if (!doubleBuffer) {
    targetCtx = canvasCtx;
  } else if (damage !== void 0) {
    targetCtx = last?.lastBuffer === "b" ? bufferBCtx : bufferACtx;
  } else {
    targetCtx = last?.lastBuffer === "b" ? bufferACtx : bufferBCtx;
  }
  const targetBuffer = targetCtx.canvas;
  const blitSource = doubleBuffer ? targetBuffer === bufferA ? bufferB : bufferA : canvas;
  const getRowHeight = typeof rowHeight === "number" ? () => rowHeight : rowHeight;
  overlayCtx.save();
  targetCtx.save();
  overlayCtx.beginPath();
  targetCtx.beginPath();
  overlayCtx.textBaseline = "middle";
  targetCtx.textBaseline = "middle";
  if (dpr !== 1) {
    overlayCtx.scale(dpr, dpr);
    targetCtx.scale(dpr, dpr);
  }
  const effectiveCols = getEffectiveColumns(mappedColumns, cellXOffset, width, dragAndDropState, translateX);
  let drawRegions = [];
  const mustDrawFocusOnHeader = drawFocus && selection.current?.cell[1] === cellYOffset && translateY === 0;
  let mustDrawHighlightRingsOnHeader = false;
  if (highlightRegions !== void 0) {
    for (const r of highlightRegions) {
      if (r.style !== "no-outline" && r.range.y === cellYOffset && translateY === 0) {
        mustDrawHighlightRingsOnHeader = true;
        break;
      }
    }
  }
  const drawHeaderTexture = () => {
    drawGridHeaders(overlayCtx, effectiveCols, enableGroups, hoverInfo, width, translateX, headerHeight, groupHeaderHeight, dragAndDropState, isResizing, selection, theme, spriteManager, hoverValues, verticalBorder, getGroupDetails, damage, drawHeaderCallback, touchMode);
    drawGridLines(overlayCtx, effectiveCols, cellYOffset, translateX, translateY, width, height, void 0, void 0, groupHeaderHeight, totalHeaderHeight, getRowHeight, getRowThemeOverride, verticalBorder, freezeTrailingRows, rows, theme, true);
    overlayCtx.beginPath();
    overlayCtx.moveTo(0, overlayHeight - 0.5);
    overlayCtx.lineTo(width, overlayHeight - 0.5);
    overlayCtx.strokeStyle = blend(theme.headerBottomBorderColor ?? theme.horizontalBorderColor ?? theme.borderColor, theme.bgHeader);
    overlayCtx.stroke();
    if (mustDrawHighlightRingsOnHeader) {
      drawHighlightRings(overlayCtx, width, height, cellXOffset, cellYOffset, translateX, translateY, mappedColumns, freezeColumns, headerHeight, groupHeaderHeight, rowHeight, freezeTrailingRows, rows, highlightRegions, theme);
    }
    if (mustDrawFocusOnHeader) {
      drawFillHandle(overlayCtx, width, height, cellYOffset, translateX, translateY, effectiveCols, mappedColumns, theme, totalHeaderHeight, selection, getRowHeight, getCellContent, freezeTrailingRows, hasAppendRow, fillHandle, rows);
    }
  };
  if (damage !== void 0) {
    const viewRegionWidth = effectiveCols[effectiveCols.length - 1].sourceIndex + 1;
    const damageInView = damage.hasItemInRegion([
      {
        x: cellXOffset,
        y: -2,
        width: viewRegionWidth,
        height: 2
      },
      {
        x: cellXOffset,
        y: cellYOffset,
        width: viewRegionWidth,
        height: 300
      },
      {
        x: 0,
        y: cellYOffset,
        width: freezeColumns,
        height: 300
      },
      {
        x: 0,
        y: -2,
        width: freezeColumns,
        height: 2
      },
      {
        x: cellXOffset,
        y: rows - freezeTrailingRows,
        width: viewRegionWidth,
        height: freezeTrailingRows,
        when: freezeTrailingRows > 0
      }
    ]);
    const doDamage = (ctx) => {
      drawCells(ctx, effectiveCols, mappedColumns, height, totalHeaderHeight, translateX, translateY, cellYOffset, rows, getRowHeight, getCellContent, getGroupDetails, getRowThemeOverride, disabledRows, isFocused, drawFocus, freezeTrailingRows, hasAppendRow, drawRegions, damage, selection, prelightCells, highlightRegions, imageLoader, spriteManager, hoverValues, hoverInfo, drawCellCallback, hyperWrapping, theme, enqueue, renderStateProvider, getCellRenderer, overrideCursor, minimumCellWidth);
      const selectionCurrent = selection.current;
      if (fillHandle !== false && fillHandle !== void 0 && drawFocus && selectionCurrent !== void 0 && damage.has(rectBottomRight(selectionCurrent.range))) {
        drawFillHandle(ctx, width, height, cellYOffset, translateX, translateY, effectiveCols, mappedColumns, theme, totalHeaderHeight, selection, getRowHeight, getCellContent, freezeTrailingRows, hasAppendRow, fillHandle, rows);
      }
    };
    if (damageInView) {
      doDamage(targetCtx);
      if (mainCtx !== null) {
        mainCtx.save();
        mainCtx.scale(dpr, dpr);
        mainCtx.textBaseline = "middle";
        doDamage(mainCtx);
        mainCtx.restore();
      }
      const doHeaders = damage.hasHeader();
      if (doHeaders) {
        clipHeaderDamage(overlayCtx, effectiveCols, width, groupHeaderHeight, totalHeaderHeight, translateX, translateY, cellYOffset, damage);
        drawHeaderTexture();
      }
    }
    targetCtx.restore();
    overlayCtx.restore();
    return;
  }
  if (canBlit !== true || cellXOffset !== last?.cellXOffset || translateX !== last?.translateX || mustDrawFocusOnHeader !== last?.mustDrawFocusOnHeader || mustDrawHighlightRingsOnHeader !== last?.mustDrawHighlightRingsOnHeader) {
    drawHeaderTexture();
  }
  if (canBlit === true) {
    assert(blitSource !== void 0 && last !== void 0);
    const { regions } = blitLastFrame(targetCtx, blitSource, blitSource === bufferA ? last.aBufferScroll : last.bBufferScroll, blitSource === bufferA ? last.bBufferScroll : last.aBufferScroll, last, cellXOffset, cellYOffset, translateX, translateY, freezeTrailingRows, width, height, rows, totalHeaderHeight, dpr, mappedColumns, effectiveCols, rowHeight, doubleBuffer);
    drawRegions = regions;
  } else if (canBlit !== false) {
    assert(last !== void 0);
    const resizedCol = canBlit;
    drawRegions = blitResizedCol(last, cellXOffset, cellYOffset, translateX, translateY, width, height, totalHeaderHeight, effectiveCols, resizedCol);
  }
  overdrawStickyBoundaries(targetCtx, effectiveCols, width, height, freezeTrailingRows, rows, verticalBorder, getRowHeight, theme);
  const highlightRedraw = drawHighlightRings(targetCtx, width, height, cellXOffset, cellYOffset, translateX, translateY, mappedColumns, freezeColumns, headerHeight, groupHeaderHeight, rowHeight, freezeTrailingRows, rows, highlightRegions, theme);
  const focusRedraw = drawFocus ? drawFillHandle(targetCtx, width, height, cellYOffset, translateX, translateY, effectiveCols, mappedColumns, theme, totalHeaderHeight, selection, getRowHeight, getCellContent, freezeTrailingRows, hasAppendRow, fillHandle, rows) : void 0;
  targetCtx.fillStyle = theme.bgCell;
  if (drawRegions.length > 0) {
    targetCtx.beginPath();
    for (const r of drawRegions) {
      targetCtx.rect(r.x, r.y, r.width, r.height);
    }
    targetCtx.clip();
    targetCtx.fill();
    targetCtx.beginPath();
  } else {
    targetCtx.fillRect(0, 0, width, height);
  }
  const spans = drawCells(targetCtx, effectiveCols, mappedColumns, height, totalHeaderHeight, translateX, translateY, cellYOffset, rows, getRowHeight, getCellContent, getGroupDetails, getRowThemeOverride, disabledRows, isFocused, drawFocus, freezeTrailingRows, hasAppendRow, drawRegions, damage, selection, prelightCells, highlightRegions, imageLoader, spriteManager, hoverValues, hoverInfo, drawCellCallback, hyperWrapping, theme, enqueue, renderStateProvider, getCellRenderer, overrideCursor, minimumCellWidth);
  drawBlanks(targetCtx, effectiveCols, mappedColumns, width, height, totalHeaderHeight, translateX, translateY, cellYOffset, rows, getRowHeight, getRowThemeOverride, selection.rows, disabledRows, freezeTrailingRows, hasAppendRow, drawRegions, damage, theme);
  drawExtraRowThemes(targetCtx, effectiveCols, cellYOffset, translateX, translateY, width, height, drawRegions, totalHeaderHeight, getRowHeight, getRowThemeOverride, verticalBorder, freezeTrailingRows, rows, theme);
  drawGridLines(targetCtx, effectiveCols, cellYOffset, translateX, translateY, width, height, drawRegions, spans, groupHeaderHeight, totalHeaderHeight, getRowHeight, getRowThemeOverride, verticalBorder, freezeTrailingRows, rows, theme);
  highlightRedraw?.();
  focusRedraw?.();
  if (isResizing && resizeIndicator !== "none") {
    walkColumns(effectiveCols, 0, translateX, 0, totalHeaderHeight, (c, x2) => {
      if (c.sourceIndex === resizeCol) {
        drawColumnResizeOutline(overlayCtx, x2 + c.width, 0, totalHeaderHeight + 1, blend(theme.resizeIndicatorColor ?? theme.accentLight, theme.bgHeader));
        if (resizeIndicator === "full") {
          drawColumnResizeOutline(targetCtx, x2 + c.width, totalHeaderHeight, height, blend(theme.resizeIndicatorColor ?? theme.accentLight, theme.bgCell));
        }
        return true;
      }
      return false;
    });
  }
  if (mainCtx !== null) {
    mainCtx.fillStyle = theme.bgCell;
    mainCtx.fillRect(0, 0, width, height);
    mainCtx.drawImage(targetCtx.canvas, 0, 0);
  }
  const lastRowDrawn = getLastRow(effectiveCols, height, totalHeaderHeight, translateX, translateY, cellYOffset, rows, getRowHeight, freezeTrailingRows, hasAppendRow);
  imageLoader?.setWindow({
    x: cellXOffset,
    y: cellYOffset,
    width: effectiveCols.length,
    height: lastRowDrawn - cellYOffset
  }, freezeColumns, Array.from({ length: freezeTrailingRows }, (_3, i) => rows - 1 - i));
  const scrollX = last !== void 0 && (cellXOffset !== last.cellXOffset || translateX !== last.translateX);
  const scrollY = last !== void 0 && (cellYOffset !== last.cellYOffset || translateY !== last.translateY);
  lastBlitData.current = {
    cellXOffset,
    cellYOffset,
    translateX,
    translateY,
    mustDrawFocusOnHeader,
    mustDrawHighlightRingsOnHeader,
    lastBuffer: doubleBuffer ? targetBuffer === bufferA ? "a" : "b" : void 0,
    aBufferScroll: targetBuffer === bufferA ? [scrollX, scrollY] : last?.aBufferScroll,
    bBufferScroll: targetBuffer === bufferB ? [scrollX, scrollY] : last?.bBufferScroll
  };
  targetCtx.restore();
  overlayCtx.restore();
}

// vendor/glide-data-grid/dist/esm/internal/data-grid/animation-manager.js
var import_clamp = __toESM(require_clamp(), 1);
var hoverTime = 80;
function easeOutCubic(x2) {
  const x1 = x2 - 1;
  return x1 * x1 * x1 + 1;
}
var AnimationManager = class {
  callback;
  constructor(callback) {
    this.callback = callback;
  }
  currentHoveredItem = void 0;
  leavingItems = [];
  lastAnimationTime;
  addToLeavingItems = (item) => {
    const isAlreadyLeaving = this.leavingItems.some((i) => itemsAreEqual(i.item, item.item));
    if (isAlreadyLeaving) {
      return;
    }
    this.leavingItems.push(item);
  };
  /**
   * @returns the hover amount of the item, if it was leaving (0 if not).
   */
  removeFromLeavingItems = (item) => {
    const leavingItem = this.leavingItems.find((e) => itemsAreEqual(e.item, item));
    this.leavingItems = this.leavingItems.filter((i) => i !== leavingItem);
    return leavingItem?.hoverAmount ?? 0;
  };
  cleanUpLeavingElements = () => {
    this.leavingItems = this.leavingItems.filter((i) => i.hoverAmount > 0);
  };
  shouldStep = () => {
    const hasLeavingItems = this.leavingItems.length > 0;
    const currentHoveredIsAnimating = this.currentHoveredItem !== void 0 && this.currentHoveredItem.hoverAmount < 1;
    return hasLeavingItems || currentHoveredIsAnimating;
  };
  getAnimatingItems = () => {
    if (this.currentHoveredItem !== void 0) {
      return [...this.leavingItems, this.currentHoveredItem];
    }
    return this.leavingItems.map((x2) => ({ ...x2, hoverAmount: easeOutCubic(x2.hoverAmount) }));
  };
  step = (timestamp) => {
    if (this.lastAnimationTime === void 0) {
      this.lastAnimationTime = timestamp;
    } else {
      const step = timestamp - this.lastAnimationTime;
      const delta = step / hoverTime;
      for (const item of this.leavingItems) {
        item.hoverAmount = (0, import_clamp.default)(item.hoverAmount - delta, 0, 1);
      }
      if (this.currentHoveredItem !== void 0) {
        this.currentHoveredItem.hoverAmount = (0, import_clamp.default)(this.currentHoveredItem.hoverAmount + delta, 0, 1);
      }
      const animating = this.getAnimatingItems();
      this.callback(animating);
      this.cleanUpLeavingElements();
    }
    if (this.shouldStep()) {
      this.lastAnimationTime = timestamp;
      window.requestAnimationFrame(this.step);
    } else {
      this.lastAnimationTime = void 0;
    }
  };
  setHovered = (item) => {
    if (itemsAreEqual(this.currentHoveredItem?.item, item)) {
      return;
    }
    if (this.currentHoveredItem !== void 0) {
      this.addToLeavingItems(this.currentHoveredItem);
    }
    if (item !== void 0) {
      const hoverAmount = this.removeFromLeavingItems(item);
      this.currentHoveredItem = {
        item,
        hoverAmount
      };
    } else {
      this.currentHoveredItem = void 0;
    }
    if (this.lastAnimationTime === void 0) {
      window.requestAnimationFrame(this.step);
    }
  };
};

// vendor/glide-data-grid/dist/esm/common/browser-detect.js
var Lazy = class {
  fn;
  val;
  constructor(fn) {
    this.fn = fn;
  }
  get value() {
    return this.val ?? (this.val = this.fn());
  }
};
function lazy(fn) {
  return new Lazy(fn);
}
var browserIsFirefox = lazy(() => window.navigator.userAgent.includes("Firefox"));
var browserIsSafari = lazy(() => window.navigator.userAgent.includes("Mac OS") && window.navigator.userAgent.includes("Safari") && !window.navigator.userAgent.includes("Chrome"));
var browserIsOSX = lazy(() => window.navigator.platform.toLowerCase().startsWith("mac"));

// vendor/glide-data-grid/dist/esm/internal/data-grid/use-animation-queue.js
import * as React8 from "react";
function useAnimationQueue(draw) {
  const queue = React8.useRef([]);
  const seq = React8.useRef(0);
  const drawRef = React8.useRef(draw);
  drawRef.current = draw;
  const loop = React8.useCallback(() => {
    const requeue = () => window.requestAnimationFrame(fn);
    const fn = () => {
      const toDraw = queue.current.map(unpackNumberToColRow);
      queue.current = [];
      drawRef.current(new CellSet(toDraw));
      if (queue.current.length > 0) {
        seq.current++;
      } else {
        seq.current = 0;
      }
    };
    window.requestAnimationFrame(seq.current > 600 ? requeue : fn);
  }, []);
  return React8.useCallback((item) => {
    if (queue.current.length === 0)
      loop();
    const packed = packColRowToNumber(item[0], item[1]);
    if (queue.current.includes(packed))
      return;
    queue.current.push(packed);
  }, [loop]);
}

// vendor/glide-data-grid/dist/esm/internal/data-grid/data-grid.js
init_support();

// vendor/glide-data-grid/dist/esm/internal/data-grid/event-args.js
var headerKind = "header";
var groupHeaderKind = "group-header";
var outOfBoundsKind = "out-of-bounds";
var OutOfBoundsRegionAxis;
(function(OutOfBoundsRegionAxis2) {
  OutOfBoundsRegionAxis2[OutOfBoundsRegionAxis2["Start"] = -2] = "Start";
  OutOfBoundsRegionAxis2[OutOfBoundsRegionAxis2["StartPadding"] = -1] = "StartPadding";
  OutOfBoundsRegionAxis2[OutOfBoundsRegionAxis2["Center"] = 0] = "Center";
  OutOfBoundsRegionAxis2[OutOfBoundsRegionAxis2["EndPadding"] = 1] = "EndPadding";
  OutOfBoundsRegionAxis2[OutOfBoundsRegionAxis2["End"] = 2] = "End";
})(OutOfBoundsRegionAxis || (OutOfBoundsRegionAxis = {}));
function mouseEventArgsAreEqual(args, other) {
  if (args === other)
    return true;
  if (args?.kind === "out-of-bounds") {
    return args?.kind === other?.kind && args?.location[0] === other?.location[0] && args?.location[1] === other?.location[1] && args?.region[0] === other?.region[0] && args?.region[1] === other?.region[1];
  }
  return args?.kind === other?.kind && args?.location[0] === other?.location[0] && args?.location[1] === other?.location[1];
}

// vendor/glide-data-grid/dist/esm/internal/data-grid/data-grid.js
var getRowData = (cell, getCellRenderer) => {
  if (cell.kind === GridCellKind.Custom)
    return cell.copyData;
  const r = getCellRenderer?.(cell);
  return r?.getAccessibilityString(cell) ?? "";
};
var DataGrid = (p2, forwardedRef) => {
  const { width, height, accessibilityHeight, columns, cellXOffset: cellXOffsetReal, cellYOffset, headerHeight, fillHandle = false, groupHeaderHeight, rowHeight, rows, getCellContent, getRowThemeOverride, onHeaderMenuClick, onHeaderIndicatorClick, enableGroups, isFilling, onCanvasFocused, onCanvasBlur, isFocused, selection, freezeColumns, onContextMenu, freezeTrailingRows, fixedShadowX = true, fixedShadowY = true, drawFocusRing, onMouseDown, onMouseUp, onMouseMoveRaw, onMouseMove, onItemHovered, dragAndDropState, firstColAccessible, onKeyDown, onKeyUp, highlightRegions, canvasRef, onDragStart, onDragEnd, eventTargetRef, isResizing, resizeColumn: resizeCol, isDragging, isDraggable = false, allowResize, disabledRows, hasAppendRow, getGroupDetails, theme, prelightCells, headerIcons, verticalBorder, drawCell: drawCellCallback, drawHeader: drawHeaderCallback, onCellFocused, onDragOverCell, onDrop, onDragLeave, imageWindowLoader, smoothScrollX = false, smoothScrollY = false, experimental, getCellRenderer, resizeIndicator = "full" } = p2;
  const translateX = p2.translateX ?? 0;
  const translateY = p2.translateY ?? 0;
  const cellXOffset = Math.max(freezeColumns, Math.min(columns.length - 1, cellXOffsetReal));
  const ref = React9.useRef(null);
  const windowEventTargetRef = React9.useRef(experimental?.eventTarget ?? window);
  const windowEventTarget = windowEventTargetRef.current;
  const imageLoader = imageWindowLoader;
  const damageRegion = React9.useRef();
  const [scrolling, setScrolling] = React9.useState(false);
  const hoverValues = React9.useRef([]);
  const lastBlitData = React9.useRef();
  const [hoveredItemInfo, setHoveredItemInfo] = React9.useState();
  const [hoveredOnEdge, setHoveredOnEdge] = React9.useState();
  const overlayRef = React9.useRef(null);
  const [drawCursorOverride, setDrawCursorOverride] = React9.useState();
  const [lastWasTouch, setLastWasTouch] = React9.useState(false);
  const lastWasTouchRef = React9.useRef(lastWasTouch);
  lastWasTouchRef.current = lastWasTouch;
  const spriteManager = React9.useMemo(() => new SpriteManager(headerIcons, () => {
    lastArgsRef.current = void 0;
    lastDrawRef.current();
  }), [headerIcons]);
  const totalHeaderHeight = enableGroups ? groupHeaderHeight + headerHeight : headerHeight;
  const scrollingStopRef = React9.useRef(-1);
  const enableFirefoxRescaling = (experimental?.enableFirefoxRescaling ?? false) && browserIsFirefox.value;
  const enableSafariRescaling = (experimental?.enableSafariRescaling ?? false) && browserIsSafari.value;
  React9.useLayoutEffect(() => {
    if (window.devicePixelRatio === 1 || !enableFirefoxRescaling && !enableSafariRescaling)
      return;
    if (scrollingStopRef.current !== -1) {
      setScrolling(true);
    }
    window.clearTimeout(scrollingStopRef.current);
    scrollingStopRef.current = window.setTimeout(() => {
      setScrolling(false);
      scrollingStopRef.current = -1;
    }, 200);
  }, [cellYOffset, cellXOffset, translateX, translateY, enableFirefoxRescaling, enableSafariRescaling]);
  const mappedColumns = useMappedColumns(columns, freezeColumns);
  const stickyX = React9.useMemo(() => fixedShadowX ? getStickyWidth(mappedColumns, dragAndDropState) : 0, [mappedColumns, dragAndDropState, fixedShadowX]);
  const getBoundsForItem = React9.useCallback((canvas, col, row) => {
    const rect = canvas.getBoundingClientRect();
    if (col >= mappedColumns.length || row >= rows) {
      return void 0;
    }
    const scale = rect.width / width;
    const result = computeBounds(col, row, width, height, groupHeaderHeight, totalHeaderHeight, cellXOffset, cellYOffset, translateX, translateY, rows, freezeColumns, freezeTrailingRows, mappedColumns, rowHeight);
    if (scale !== 1) {
      result.x *= scale;
      result.y *= scale;
      result.width *= scale;
      result.height *= scale;
    }
    result.x += rect.x;
    result.y += rect.y;
    return result;
  }, [
    width,
    height,
    groupHeaderHeight,
    totalHeaderHeight,
    cellXOffset,
    cellYOffset,
    translateX,
    translateY,
    rows,
    freezeColumns,
    freezeTrailingRows,
    mappedColumns,
    rowHeight
  ]);
  const getMouseArgsForPosition = React9.useCallback((canvas, posX, posY, ev) => {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / width;
    const x2 = (posX - rect.left) / scale;
    const y2 = (posY - rect.top) / scale;
    const edgeDetectionBuffer = 5;
    const effectiveCols = getEffectiveColumns(mappedColumns, cellXOffset, width, void 0, translateX);
    let button = 0;
    let buttons = 0;
    const isMouse = typeof PointerEvent !== "undefined" && ev instanceof PointerEvent && ev.pointerType === "mouse" || typeof MouseEvent !== "undefined" && ev instanceof MouseEvent;
    const isTouch = typeof PointerEvent !== "undefined" && ev instanceof PointerEvent && ev.pointerType === "touch" || typeof TouchEvent !== "undefined" && ev instanceof TouchEvent;
    if (isMouse) {
      button = ev.button;
      buttons = ev.buttons;
    }
    const col = getColumnIndexForX(x2, effectiveCols, translateX);
    const row = getRowIndexForY(y2, height, enableGroups, headerHeight, groupHeaderHeight, rows, rowHeight, cellYOffset, translateY, freezeTrailingRows);
    const shiftKey = ev?.shiftKey === true;
    const ctrlKey = ev?.ctrlKey === true;
    const metaKey = ev?.metaKey === true;
    const scrollEdge = [
      x2 < 0 ? -1 : width < x2 ? 1 : 0,
      y2 < totalHeaderHeight ? -1 : height < y2 ? 1 : 0
    ];
    let result;
    if (col === -1 || y2 < 0 || x2 < 0 || row === void 0 || x2 > width || y2 > height) {
      const horizontal = x2 > width ? 1 : x2 < 0 ? -1 : 0;
      const vertical = y2 > height ? 1 : y2 < 0 ? -1 : 0;
      let innerHorizontal = horizontal * 2;
      let innerVertical = vertical * 2;
      if (horizontal === 0)
        innerHorizontal = col === -1 ? OutOfBoundsRegionAxis.EndPadding : OutOfBoundsRegionAxis.Center;
      if (vertical === 0)
        innerVertical = row === void 0 ? OutOfBoundsRegionAxis.EndPadding : OutOfBoundsRegionAxis.Center;
      let isEdge = false;
      if (col === -1 && row === -1) {
        const b3 = getBoundsForItem(canvas, mappedColumns.length - 1, -1);
        assert(b3 !== void 0);
        isEdge = posX < b3.x + b3.width + edgeDetectionBuffer;
      }
      const isMaybeScrollbar = x2 > width && x2 < width + getScrollBarWidth() || y2 > height && y2 < height + getScrollBarWidth();
      result = {
        kind: outOfBoundsKind,
        location: [col !== -1 ? col : x2 < 0 ? 0 : mappedColumns.length - 1, row ?? rows - 1],
        region: [innerHorizontal, innerVertical],
        shiftKey,
        ctrlKey,
        metaKey,
        isEdge,
        isTouch,
        button,
        buttons,
        scrollEdge,
        isMaybeScrollbar
      };
    } else if (row <= -1) {
      let bounds = getBoundsForItem(canvas, col, row);
      assert(bounds !== void 0);
      let isEdge = bounds !== void 0 && bounds.x + bounds.width - posX <= edgeDetectionBuffer;
      const previousCol = col - 1;
      if (posX - bounds.x <= edgeDetectionBuffer && previousCol >= 0) {
        isEdge = true;
        bounds = getBoundsForItem(canvas, previousCol, row);
        assert(bounds !== void 0);
        result = {
          kind: enableGroups && row === -2 ? groupHeaderKind : headerKind,
          location: [previousCol, row],
          bounds,
          group: mappedColumns[previousCol].group ?? "",
          isEdge,
          shiftKey,
          ctrlKey,
          metaKey,
          isTouch,
          localEventX: posX - bounds.x,
          localEventY: posY - bounds.y,
          button,
          buttons,
          scrollEdge
        };
      } else {
        result = {
          kind: enableGroups && row === -2 ? groupHeaderKind : headerKind,
          group: mappedColumns[col].group ?? "",
          location: [col, row],
          bounds,
          isEdge,
          shiftKey,
          ctrlKey,
          metaKey,
          isTouch,
          localEventX: posX - bounds.x,
          localEventY: posY - bounds.y,
          button,
          buttons,
          scrollEdge
        };
      }
    } else {
      const bounds = getBoundsForItem(canvas, col, row);
      assert(bounds !== void 0);
      const isEdge = bounds !== void 0 && bounds.x + bounds.width - posX < edgeDetectionBuffer;
      let isFillHandle = false;
      const drawFill = fillHandle !== false && fillHandle !== void 0;
      if (drawFill && selection.current !== void 0) {
        const fill = typeof fillHandle === "object" ? { ...DEFAULT_FILL_HANDLE, ...fillHandle } : DEFAULT_FILL_HANDLE;
        const fillHandleClickSize = fill.size;
        const half = fillHandleClickSize / 2;
        const fillHandleLocation = rectBottomRight(selection.current.range);
        const fillBounds = getBoundsForItem(canvas, fillHandleLocation[0], fillHandleLocation[1]);
        if (fillBounds !== void 0) {
          const centerX = fillBounds.x + fillBounds.width + fill.offsetX - half + 0.5;
          const centerY = fillBounds.y + fillBounds.height + fill.offsetY - half + 0.5;
          isFillHandle = Math.abs(centerX - posX) < fillHandleClickSize && Math.abs(centerY - posY) < fillHandleClickSize;
        }
      }
      result = {
        kind: "cell",
        location: [col, row],
        bounds,
        isEdge,
        shiftKey,
        ctrlKey,
        isFillHandle,
        metaKey,
        isTouch,
        localEventX: posX - bounds.x,
        localEventY: posY - bounds.y,
        button,
        buttons,
        scrollEdge
      };
    }
    return result;
  }, [
    width,
    mappedColumns,
    cellXOffset,
    translateX,
    height,
    enableGroups,
    headerHeight,
    groupHeaderHeight,
    rows,
    rowHeight,
    cellYOffset,
    translateY,
    freezeTrailingRows,
    getBoundsForItem,
    fillHandle,
    selection,
    totalHeaderHeight
  ]);
  const [hoveredItem] = hoveredItemInfo ?? [];
  const enqueueRef = React9.useRef(() => {
  });
  const hoverInfoRef = React9.useRef(hoveredItemInfo);
  hoverInfoRef.current = hoveredItemInfo;
  const [bufferACtx, bufferBCtx] = React9.useMemo(() => {
    const a = document.createElement("canvas");
    const b3 = document.createElement("canvas");
    a.style["display"] = "none";
    a.style["opacity"] = "0";
    a.style["position"] = "fixed";
    b3.style["display"] = "none";
    b3.style["opacity"] = "0";
    b3.style["position"] = "fixed";
    return [a.getContext("2d", { alpha: false }), b3.getContext("2d", { alpha: false })];
  }, []);
  React9.useLayoutEffect(() => {
    if (bufferACtx === null || bufferBCtx === null)
      return;
    document.documentElement.append(bufferACtx.canvas);
    document.documentElement.append(bufferBCtx.canvas);
    return () => {
      bufferACtx.canvas.remove();
      bufferBCtx.canvas.remove();
    };
  }, [bufferACtx, bufferBCtx]);
  const renderStateProvider = React9.useMemo(() => new RenderStateProvider(), []);
  const maxDPR = enableFirefoxRescaling && scrolling ? 1 : enableSafariRescaling && scrolling ? 2 : 5;
  const minimumCellWidth = experimental?.disableMinimumCellWidth === true ? 1 : 10;
  const lastArgsRef = React9.useRef();
  const canvasCtx = React9.useRef(null);
  const overlayCtx = React9.useRef(null);
  const draw = React9.useCallback(() => {
    const canvas = ref.current;
    const overlay = overlayRef.current;
    if (canvas === null || overlay === null)
      return;
    if (canvasCtx.current === null) {
      canvasCtx.current = canvas.getContext("2d", { alpha: false });
      canvas.width = 0;
      canvas.height = 0;
    }
    if (overlayCtx.current === null) {
      overlayCtx.current = overlay.getContext("2d", { alpha: false });
      overlay.width = 0;
      overlay.height = 0;
    }
    if (canvasCtx.current === null || overlayCtx.current === null || bufferACtx === null || bufferBCtx === null) {
      return;
    }
    let didOverride = false;
    const overrideCursor = (cursor2) => {
      didOverride = true;
      setDrawCursorOverride(cursor2);
    };
    const last = lastArgsRef.current;
    const current = {
      headerCanvasCtx: overlayCtx.current,
      canvasCtx: canvasCtx.current,
      bufferACtx,
      bufferBCtx,
      width,
      height,
      cellXOffset,
      cellYOffset,
      translateX: Math.round(translateX),
      translateY: Math.round(translateY),
      mappedColumns,
      enableGroups,
      freezeColumns,
      dragAndDropState,
      theme,
      headerHeight,
      groupHeaderHeight,
      disabledRows: disabledRows ?? CompactSelection.empty(),
      rowHeight,
      verticalBorder,
      isResizing,
      resizeCol,
      isFocused,
      selection,
      fillHandle,
      drawCellCallback,
      hasAppendRow,
      overrideCursor,
      maxScaleFactor: maxDPR,
      freezeTrailingRows,
      rows,
      drawFocus: drawFocusRing,
      getCellContent,
      getGroupDetails: getGroupDetails ?? ((name) => ({ name })),
      getRowThemeOverride,
      drawHeaderCallback,
      prelightCells,
      highlightRegions,
      imageLoader,
      lastBlitData,
      damage: damageRegion.current,
      hoverValues: hoverValues.current,
      hoverInfo: hoverInfoRef.current,
      spriteManager,
      scrolling,
      hyperWrapping: experimental?.hyperWrapping ?? false,
      touchMode: lastWasTouch,
      enqueue: enqueueRef.current,
      renderStateProvider,
      renderStrategy: experimental?.renderStrategy ?? (browserIsSafari.value ? "double-buffer" : "single-buffer"),
      getCellRenderer,
      minimumCellWidth,
      resizeIndicator
    };
    if (current.damage === void 0) {
      lastArgsRef.current = current;
      drawGrid(current, last);
    } else {
      drawGrid(current, void 0);
    }
    if (!didOverride && (current.damage === void 0 || current.damage.has(hoverInfoRef?.current?.[0]))) {
      setDrawCursorOverride(void 0);
    }
  }, [
    bufferACtx,
    bufferBCtx,
    width,
    height,
    cellXOffset,
    cellYOffset,
    translateX,
    translateY,
    mappedColumns,
    enableGroups,
    freezeColumns,
    dragAndDropState,
    theme,
    headerHeight,
    groupHeaderHeight,
    disabledRows,
    rowHeight,
    verticalBorder,
    isResizing,
    hasAppendRow,
    resizeCol,
    isFocused,
    selection,
    fillHandle,
    freezeTrailingRows,
    rows,
    drawFocusRing,
    maxDPR,
    getCellContent,
    getGroupDetails,
    getRowThemeOverride,
    drawCellCallback,
    drawHeaderCallback,
    prelightCells,
    highlightRegions,
    imageLoader,
    spriteManager,
    scrolling,
    experimental?.hyperWrapping,
    experimental?.renderStrategy,
    lastWasTouch,
    renderStateProvider,
    getCellRenderer,
    minimumCellWidth,
    resizeIndicator
  ]);
  const lastDrawRef = React9.useRef(draw);
  React9.useLayoutEffect(() => {
    draw();
    lastDrawRef.current = draw;
  }, [draw]);
  React9.useLayoutEffect(() => {
    const fn = async () => {
      if (document?.fonts?.ready === void 0)
        return;
      await document.fonts.ready;
      lastArgsRef.current = void 0;
      lastDrawRef.current();
    };
    void fn();
  }, []);
  const damageInternal = React9.useCallback((locations) => {
    damageRegion.current = locations;
    lastDrawRef.current();
    damageRegion.current = void 0;
  }, []);
  const enqueue = useAnimationQueue(damageInternal);
  enqueueRef.current = enqueue;
  const damage = React9.useCallback((cells) => {
    damageInternal(new CellSet(cells.map((x2) => x2.cell)));
  }, [damageInternal]);
  imageLoader.setCallback(damageInternal);
  const [overFill, setOverFill] = React9.useState(false);
  const [hCol, hRow] = hoveredItem ?? [];
  const headerHovered = hCol !== void 0 && hRow === -1 && hCol >= 0 && hCol < mappedColumns.length && mappedColumns[hCol].headerRowMarkerDisabled !== true;
  const groupHeaderHovered = hCol !== void 0 && hRow === -2;
  let clickableInnerCellHovered = false;
  let editableBoolHovered = false;
  let cursorOverride = drawCursorOverride;
  if (cursorOverride === void 0 && hCol !== void 0 && hRow !== void 0 && hRow > -1 && hRow < rows) {
    const cell = getCellContent([hCol, hRow], true);
    clickableInnerCellHovered = cell.kind === InnerGridCellKind.NewRow || cell.kind === InnerGridCellKind.Marker && cell.markerKind !== "number";
    editableBoolHovered = cell.kind === GridCellKind.Boolean && booleanCellIsEditable(cell);
    cursorOverride = cell.cursor;
  }
  const canDrag = hoveredOnEdge ?? false;
  const cursor = isDragging ? "grabbing" : canDrag || isResizing ? "col-resize" : overFill || isFilling ? "crosshair" : cursorOverride !== void 0 ? cursorOverride : headerHovered || clickableInnerCellHovered || editableBoolHovered || groupHeaderHovered ? "pointer" : "default";
  const style = React9.useMemo(() => ({
    // width,
    // height,
    contain: "strict",
    display: "block",
    cursor
  }), [cursor]);
  const lastSetCursor = React9.useRef("default");
  const target = eventTargetRef?.current;
  if (target !== null && target !== void 0 && lastSetCursor.current !== style.cursor) {
    target.style.cursor = lastSetCursor.current = style.cursor;
  }
  const groupHeaderActionForEvent = React9.useCallback((group, bounds, localEventX, localEventY) => {
    if (getGroupDetails === void 0)
      return void 0;
    const groupDesc = getGroupDetails(group);
    if (groupDesc.actions !== void 0) {
      const boxes = getActionBoundsForGroup(bounds, groupDesc.actions);
      for (const [i, box] of boxes.entries()) {
        if (pointInRect(box, localEventX + bounds.x, localEventY + box.y)) {
          return groupDesc.actions[i];
        }
      }
    }
    return void 0;
  }, [getGroupDetails]);
  const isOverHeaderElement = React9.useCallback((canvas, col, clientX, clientY) => {
    const header = mappedColumns[col];
    if (!isDragging && !isResizing && !(hoveredOnEdge ?? false)) {
      const headerBounds = getBoundsForItem(canvas, col, -1);
      assert(headerBounds !== void 0);
      const headerLayout = computeHeaderLayout(void 0, header, headerBounds.x, headerBounds.y, headerBounds.width, headerBounds.height, theme, direction(header.title) === "rtl");
      if (header.hasMenu === true && headerLayout.menuBounds !== void 0 && pointInRect(headerLayout.menuBounds, clientX, clientY)) {
        return {
          area: "menu",
          bounds: headerLayout.menuBounds
        };
      } else if (header.indicatorIcon !== void 0 && headerLayout.indicatorIconBounds !== void 0 && pointInRect(headerLayout.indicatorIconBounds, clientX, clientY)) {
        return {
          area: "indicator",
          bounds: headerLayout.indicatorIconBounds
        };
      }
    }
    return void 0;
  }, [mappedColumns, getBoundsForItem, hoveredOnEdge, isDragging, isResizing, theme]);
  const downTime = React9.useRef(0);
  const downPosition = React9.useRef();
  const mouseDown = React9.useRef(false);
  const onPointerDown = React9.useCallback((ev) => {
    const canvas = ref.current;
    const eventTarget = eventTargetRef?.current;
    if (canvas === null || ev.target !== canvas && ev.target !== eventTarget)
      return;
    mouseDown.current = true;
    const clientX = ev.clientX;
    const clientY = ev.clientY;
    if (ev.target === eventTarget && eventTarget !== null) {
      const bounds = eventTarget.getBoundingClientRect();
      if (clientX > bounds.right || clientY > bounds.bottom)
        return;
    }
    const args = getMouseArgsForPosition(canvas, clientX, clientY, ev);
    downPosition.current = args.location;
    if (args.isTouch) {
      downTime.current = Date.now();
    }
    if (lastWasTouchRef.current !== args.isTouch) {
      setLastWasTouch(args.isTouch);
    }
    if (args.kind === headerKind && isOverHeaderElement(canvas, args.location[0], clientX, clientY) !== void 0) {
      return;
    } else if (args.kind === groupHeaderKind) {
      const action = groupHeaderActionForEvent(args.group, args.bounds, args.localEventX, args.localEventY);
      if (action !== void 0) {
        return;
      }
    }
    onMouseDown?.(args);
    if (!args.isTouch && isDraggable !== true && isDraggable !== args.kind && args.button < 3 && args.button !== 1) {
      ev.preventDefault();
    }
  }, [
    eventTargetRef,
    isDraggable,
    getMouseArgsForPosition,
    groupHeaderActionForEvent,
    isOverHeaderElement,
    onMouseDown
  ]);
  useEventListener("pointerdown", onPointerDown, windowEventTarget, false);
  const lastUpTime = React9.useRef(0);
  const onPointerUp = React9.useCallback((ev) => {
    const lastUpTimeValue = lastUpTime.current;
    lastUpTime.current = Date.now();
    const canvas = ref.current;
    mouseDown.current = false;
    if (onMouseUp === void 0 || canvas === null)
      return;
    const eventTarget = eventTargetRef?.current;
    const isOutside = ev.target !== canvas && ev.target !== eventTarget;
    const clientX = ev.clientX;
    const clientY = ev.clientY;
    const canCancel = ev.pointerType === "mouse" ? ev.button < 3 : true;
    let args = getMouseArgsForPosition(canvas, clientX, clientY, ev);
    if (args.isTouch && downTime.current !== 0 && Date.now() - downTime.current > 500) {
      args = {
        ...args,
        isLongTouch: true
      };
    }
    if (lastUpTimeValue !== 0 && Date.now() - lastUpTimeValue < (args.isTouch ? 1e3 : 500)) {
      args = {
        ...args,
        isDoubleClick: true
      };
    }
    if (lastWasTouchRef.current !== args.isTouch) {
      setLastWasTouch(args.isTouch);
    }
    if (!isOutside && ev.cancelable && canCancel) {
      ev.preventDefault();
    }
    const [col] = args.location;
    const headerBounds = isOverHeaderElement(canvas, col, clientX, clientY);
    if (args.kind === headerKind && headerBounds !== void 0) {
      if (args.button !== 0 || downPosition.current?.[0] !== col || downPosition.current?.[1] !== -1) {
        onMouseUp(args, true);
      }
      return;
    } else if (args.kind === groupHeaderKind) {
      const action = groupHeaderActionForEvent(args.group, args.bounds, args.localEventX, args.localEventY);
      if (action !== void 0) {
        if (args.button === 0) {
          action.onClick(args);
        }
        return;
      }
    }
    onMouseUp(args, isOutside);
  }, [onMouseUp, eventTargetRef, getMouseArgsForPosition, isOverHeaderElement, groupHeaderActionForEvent]);
  useEventListener("pointerup", onPointerUp, windowEventTarget, false);
  const onClickImpl = React9.useCallback((ev) => {
    const canvas = ref.current;
    if (canvas === null)
      return;
    const eventTarget = eventTargetRef?.current;
    const isOutside = ev.target !== canvas && ev.target !== eventTarget;
    let clientX;
    let clientY;
    let canCancel = true;
    if (ev instanceof MouseEvent) {
      clientX = ev.clientX;
      clientY = ev.clientY;
      canCancel = ev.button < 3;
    } else {
      clientX = ev.changedTouches[0].clientX;
      clientY = ev.changedTouches[0].clientY;
    }
    const args = getMouseArgsForPosition(canvas, clientX, clientY, ev);
    if (lastWasTouchRef.current !== args.isTouch) {
      setLastWasTouch(args.isTouch);
    }
    if (!isOutside && ev.cancelable && canCancel) {
      ev.preventDefault();
    }
    const [col] = args.location;
    if (args.kind === headerKind) {
      const headerBounds = isOverHeaderElement(canvas, col, clientX, clientY);
      if (headerBounds !== void 0 && args.button === 0 && downPosition.current?.[0] === col && downPosition.current?.[1] === -1) {
        if (headerBounds.area === "menu") {
          onHeaderMenuClick?.(col, headerBounds.bounds);
        } else if (headerBounds.area === "indicator") {
          onHeaderIndicatorClick?.(col, headerBounds.bounds);
        }
      }
    }
  }, [eventTargetRef, getMouseArgsForPosition, isOverHeaderElement, onHeaderMenuClick, onHeaderIndicatorClick]);
  useEventListener("click", onClickImpl, windowEventTarget, false);
  const onContextMenuImpl = React9.useCallback((ev) => {
    const canvas = ref.current;
    const eventTarget = eventTargetRef?.current;
    if (canvas === null || ev.target !== canvas && ev.target !== eventTarget || onContextMenu === void 0)
      return;
    const args = getMouseArgsForPosition(canvas, ev.clientX, ev.clientY, ev);
    onContextMenu(args, () => {
      if (ev.cancelable)
        ev.preventDefault();
    });
  }, [eventTargetRef, getMouseArgsForPosition, onContextMenu]);
  useEventListener("contextmenu", onContextMenuImpl, eventTargetRef?.current ?? null, false);
  const onAnimationFrame = React9.useCallback((values) => {
    damageRegion.current = new CellSet(values.map((x2) => x2.item));
    hoverValues.current = values;
    lastDrawRef.current();
    damageRegion.current = void 0;
  }, []);
  const animManagerValue = React9.useMemo(() => new AnimationManager(onAnimationFrame), [onAnimationFrame]);
  const animationManager = React9.useRef(animManagerValue);
  animationManager.current = animManagerValue;
  React9.useLayoutEffect(() => {
    const am = animationManager.current;
    if (hoveredItem === void 0 || hoveredItem[1] < 0) {
      am.setHovered(hoveredItem);
      return;
    }
    const cell = getCellContent(hoveredItem, true);
    const r = getCellRenderer(cell);
    const cellNeedsHover = r === void 0 && cell.kind === GridCellKind.Custom || r?.needsHover !== void 0 && (typeof r.needsHover === "boolean" ? r.needsHover : r.needsHover(cell));
    am.setHovered(cellNeedsHover ? hoveredItem : void 0);
  }, [getCellContent, getCellRenderer, hoveredItem]);
  const hoveredRef = React9.useRef();
  const onPointerMove = React9.useCallback((ev) => {
    const canvas = ref.current;
    if (canvas === null)
      return;
    const eventTarget = eventTargetRef?.current;
    const isIndirect = ev.target !== canvas && ev.target !== eventTarget;
    const args = getMouseArgsForPosition(canvas, ev.clientX, ev.clientY, ev);
    if (args.kind !== "out-of-bounds" && isIndirect && !mouseDown.current && !args.isTouch) {
      return;
    }
    const maybeSetHoveredInfo = (newVal, needPosition) => {
      setHoveredItemInfo((cv) => {
        if (cv === newVal)
          return cv;
        if (cv?.[0][0] === newVal?.[0][0] && cv?.[0][1] === newVal?.[0][1] && (cv?.[1][0] === newVal?.[1][0] && cv?.[1][1] === newVal?.[1][1] || !needPosition)) {
          return cv;
        }
        return newVal;
      });
    };
    if (!mouseEventArgsAreEqual(args, hoveredRef.current)) {
      setDrawCursorOverride(void 0);
      onItemHovered?.(args);
      maybeSetHoveredInfo(args.kind === outOfBoundsKind ? void 0 : [args.location, [args.localEventX, args.localEventY]], true);
      hoveredRef.current = args;
    } else if (args.kind === "cell" || args.kind === headerKind || args.kind === groupHeaderKind) {
      let needsDamageCell = false;
      let needsHoverPosition = true;
      if (args.kind === "cell") {
        const toCheck = getCellContent(args.location);
        const rendererNeeds = getCellRenderer(toCheck)?.needsHoverPosition;
        needsHoverPosition = rendererNeeds ?? toCheck.kind === GridCellKind.Custom;
        needsDamageCell = needsHoverPosition;
      } else {
        needsDamageCell = true;
      }
      const newInfo = [args.location, [args.localEventX, args.localEventY]];
      maybeSetHoveredInfo(newInfo, needsHoverPosition);
      hoverInfoRef.current = newInfo;
      if (needsDamageCell) {
        damageInternal(new CellSet([args.location]));
      }
    }
    const notRowMarkerCol = args.location[0] >= (firstColAccessible ? 0 : 1);
    setHoveredOnEdge(args.kind === headerKind && args.isEdge && notRowMarkerCol && allowResize === true);
    setOverFill(args.kind === "cell" && args.isFillHandle);
    onMouseMoveRaw?.(ev);
    onMouseMove(args);
  }, [
    eventTargetRef,
    getMouseArgsForPosition,
    firstColAccessible,
    allowResize,
    onMouseMoveRaw,
    onMouseMove,
    onItemHovered,
    getCellContent,
    getCellRenderer,
    damageInternal
  ]);
  useEventListener("pointermove", onPointerMove, windowEventTarget, true);
  const onKeyDownImpl = React9.useCallback((event) => {
    const canvas = ref.current;
    if (canvas === null)
      return;
    let bounds;
    let location = void 0;
    if (selection.current !== void 0) {
      bounds = getBoundsForItem(canvas, selection.current.cell[0], selection.current.cell[1]);
      location = selection.current.cell;
    }
    onKeyDown?.({
      bounds,
      stopPropagation: () => event.stopPropagation(),
      preventDefault: () => event.preventDefault(),
      cancel: () => void 0,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      key: event.key,
      keyCode: event.keyCode,
      rawEvent: event,
      location
    });
  }, [onKeyDown, selection, getBoundsForItem]);
  const onKeyUpImpl = React9.useCallback((event) => {
    const canvas = ref.current;
    if (canvas === null)
      return;
    let bounds;
    let location = void 0;
    if (selection.current !== void 0) {
      bounds = getBoundsForItem(canvas, selection.current.cell[0], selection.current.cell[1]);
      location = selection.current.cell;
    }
    onKeyUp?.({
      bounds,
      stopPropagation: () => event.stopPropagation(),
      preventDefault: () => event.preventDefault(),
      cancel: () => void 0,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      key: event.key,
      keyCode: event.keyCode,
      rawEvent: event,
      location
    });
  }, [onKeyUp, selection, getBoundsForItem]);
  const refImpl = React9.useCallback((instance) => {
    ref.current = instance;
    if (canvasRef !== void 0) {
      canvasRef.current = instance;
    }
    if (experimental?.eventTarget) {
      windowEventTargetRef.current = experimental.eventTarget;
    } else if (instance === null) {
      windowEventTargetRef.current = window;
    } else {
      const docRoot = instance.getRootNode();
      if (docRoot === document)
        windowEventTargetRef.current = window;
      windowEventTargetRef.current = docRoot;
    }
  }, [canvasRef, experimental?.eventTarget]);
  const onDragStartImpl = React9.useCallback((event) => {
    const canvas = ref.current;
    if (canvas === null || isDraggable === false || isResizing) {
      event.preventDefault();
      return;
    }
    let dragMime;
    let dragData;
    const args = getMouseArgsForPosition(canvas, event.clientX, event.clientY);
    if (isDraggable !== true && args.kind !== isDraggable) {
      event.preventDefault();
      return;
    }
    const setData = (mime, payload) => {
      dragMime = mime;
      dragData = payload;
    };
    let dragImage;
    let dragImageX;
    let dragImageY;
    const setDragImage = (image, x2, y2) => {
      dragImage = image;
      dragImageX = x2;
      dragImageY = y2;
    };
    let prevented = false;
    onDragStart?.({
      ...args,
      setData,
      setDragImage,
      preventDefault: () => prevented = true,
      defaultPrevented: () => prevented
    });
    if (!prevented && dragMime !== void 0 && dragData !== void 0 && event.dataTransfer !== null) {
      event.dataTransfer.setData(dragMime, dragData);
      event.dataTransfer.effectAllowed = "copyLink";
      if (dragImage !== void 0 && dragImageX !== void 0 && dragImageY !== void 0) {
        event.dataTransfer.setDragImage(dragImage, dragImageX, dragImageY);
      } else {
        const [col, row] = args.location;
        if (row !== void 0) {
          const offscreen = document.createElement("canvas");
          const boundsForDragTarget = getBoundsForItem(canvas, col, row);
          assert(boundsForDragTarget !== void 0);
          const dpr = Math.ceil(window.devicePixelRatio ?? 1);
          offscreen.width = boundsForDragTarget.width * dpr;
          offscreen.height = boundsForDragTarget.height * dpr;
          const ctx = offscreen.getContext("2d");
          if (ctx !== null) {
            ctx.scale(dpr, dpr);
            ctx.textBaseline = "middle";
            if (row === -1) {
              ctx.font = theme.headerFontFull;
              ctx.fillStyle = theme.bgHeader;
              ctx.fillRect(0, 0, offscreen.width, offscreen.height);
              drawHeader(ctx, 0, 0, boundsForDragTarget.width, boundsForDragTarget.height, mappedColumns[col], false, theme, false, void 0, void 0, false, 0, spriteManager, drawHeaderCallback, false);
            } else {
              ctx.font = theme.baseFontFull;
              ctx.fillStyle = theme.bgCell;
              ctx.fillRect(0, 0, offscreen.width, offscreen.height);
              drawCell(ctx, getCellContent([col, row]), 0, row, false, false, 0, 0, boundsForDragTarget.width, boundsForDragTarget.height, false, theme, theme.bgCell, imageLoader, spriteManager, 1, void 0, false, 0, void 0, void 0, void 0, renderStateProvider, getCellRenderer, () => void 0);
            }
          }
          offscreen.style.left = "-100%";
          offscreen.style.position = "absolute";
          offscreen.style.width = `${boundsForDragTarget.width}px`;
          offscreen.style.height = `${boundsForDragTarget.height}px`;
          document.body.append(offscreen);
          event.dataTransfer.setDragImage(offscreen, boundsForDragTarget.width / 2, boundsForDragTarget.height / 2);
          window.setTimeout(() => {
            offscreen.remove();
          }, 0);
        }
      }
    } else {
      event.preventDefault();
    }
  }, [
    isDraggable,
    isResizing,
    getMouseArgsForPosition,
    onDragStart,
    getBoundsForItem,
    theme,
    mappedColumns,
    spriteManager,
    drawHeaderCallback,
    getCellContent,
    imageLoader,
    renderStateProvider,
    getCellRenderer
  ]);
  useEventListener("dragstart", onDragStartImpl, eventTargetRef?.current ?? null, false, false);
  const activeDropTarget = React9.useRef();
  const onDragOverImpl = React9.useCallback((event) => {
    const canvas = ref.current;
    if (onDrop !== void 0) {
      event.preventDefault();
    }
    if (canvas === null || onDragOverCell === void 0) {
      return;
    }
    const args = getMouseArgsForPosition(canvas, event.clientX, event.clientY);
    const [rawCol, row] = args.location;
    const col = rawCol - (firstColAccessible ? 0 : 1);
    const [activeCol, activeRow] = activeDropTarget.current ?? [];
    if (activeCol !== col || activeRow !== row) {
      activeDropTarget.current = [col, row];
      onDragOverCell([col, row], event.dataTransfer);
    }
  }, [firstColAccessible, getMouseArgsForPosition, onDragOverCell, onDrop]);
  useEventListener("dragover", onDragOverImpl, eventTargetRef?.current ?? null, false, false);
  const onDragEndImpl = React9.useCallback(() => {
    activeDropTarget.current = void 0;
    onDragEnd?.();
  }, [onDragEnd]);
  useEventListener("dragend", onDragEndImpl, eventTargetRef?.current ?? null, false, false);
  const onDropImpl = React9.useCallback((event) => {
    const canvas = ref.current;
    if (canvas === null || onDrop === void 0) {
      return;
    }
    event.preventDefault();
    const args = getMouseArgsForPosition(canvas, event.clientX, event.clientY);
    const [rawCol, row] = args.location;
    const col = rawCol - (firstColAccessible ? 0 : 1);
    onDrop([col, row], event.dataTransfer);
  }, [firstColAccessible, getMouseArgsForPosition, onDrop]);
  useEventListener("drop", onDropImpl, eventTargetRef?.current ?? null, false, false);
  const onDragLeaveImpl = React9.useCallback(() => {
    onDragLeave?.();
  }, [onDragLeave]);
  useEventListener("dragleave", onDragLeaveImpl, eventTargetRef?.current ?? null, false, false);
  const selectionRef = React9.useRef(selection);
  selectionRef.current = selection;
  const focusRef = React9.useRef(null);
  const focusElement = React9.useCallback((el) => {
    if (ref.current === null || !ref.current.contains(document.activeElement))
      return;
    if (el === null && selectionRef.current.current !== void 0) {
      canvasRef?.current?.focus({
        preventScroll: true
      });
    } else if (el !== null) {
      el.focus({
        preventScroll: true
      });
    }
    focusRef.current = el;
  }, [canvasRef]);
  React9.useImperativeHandle(forwardedRef, () => ({
    focus: () => {
      const el = focusRef.current;
      if (el === null || !document.contains(el)) {
        canvasRef?.current?.focus({
          preventScroll: true
        });
      } else {
        el.focus({
          preventScroll: true
        });
      }
    },
    getBounds: (col, row) => {
      if (canvasRef === void 0 || canvasRef.current === null) {
        return void 0;
      }
      return getBoundsForItem(canvasRef.current, col ?? 0, row ?? -1);
    },
    damage,
    getMouseArgsForPosition: (posX, posY, ev) => {
      if (canvasRef === void 0 || canvasRef.current === null) {
        return void 0;
      }
      return getMouseArgsForPosition(canvasRef.current, posX, posY, ev);
    }
  }), [canvasRef, damage, getBoundsForItem, getMouseArgsForPosition]);
  const lastFocusedSubdomNode = React9.useRef();
  const accessibilityTree = useDebouncedMemo(() => {
    if (width < 50 || experimental?.disableAccessibilityTree === true)
      return null;
    let effectiveCols = getEffectiveColumns(mappedColumns, cellXOffset, width, dragAndDropState, translateX);
    const colOffset = firstColAccessible ? 0 : -1;
    if (!firstColAccessible && effectiveCols[0]?.sourceIndex === 0) {
      effectiveCols = effectiveCols.slice(1);
    }
    const [fCol, fRow] = selection.current?.cell ?? [];
    const range2 = selection.current?.range;
    const visibleCols = effectiveCols.map((c) => c.sourceIndex);
    const visibleRows = (0, import_range.default)(cellYOffset, Math.min(rows, cellYOffset + accessibilityHeight));
    if (fCol !== void 0 && fRow !== void 0 && !(visibleCols.includes(fCol) && visibleRows.includes(fRow))) {
      focusElement(null);
    }
    return React9.createElement(
      "table",
      { key: "access-tree", role: "grid", "aria-rowcount": rows + 1, "aria-multiselectable": "true", "aria-colcount": mappedColumns.length + colOffset },
      React9.createElement(
        "thead",
        { role: "rowgroup" },
        React9.createElement("tr", { role: "row", "aria-rowindex": 1 }, effectiveCols.map((c) => React9.createElement("th", { role: "columnheader", "aria-selected": selection.columns.hasIndex(c.sourceIndex), "aria-colindex": c.sourceIndex + 1 + colOffset, tabIndex: -1, onFocus: (e) => {
          if (e.target === focusRef.current)
            return;
          return onCellFocused?.([c.sourceIndex, -1]);
        }, key: c.sourceIndex }, c.title)))
      ),
      React9.createElement("tbody", { role: "rowgroup" }, visibleRows.map((row) => React9.createElement("tr", { role: "row", "aria-selected": selection.rows.hasIndex(row), key: row, "aria-rowindex": row + 2 }, effectiveCols.map((c) => {
        const col = c.sourceIndex;
        const key = packColRowToNumber(col, row);
        const focused = fCol === col && fRow === row;
        const selected = range2 !== void 0 && col >= range2.x && col < range2.x + range2.width && row >= range2.y && row < range2.y + range2.height;
        const id = `glide-cell-${col}-${row}`;
        const location = [col, row];
        const cellContent = getCellContent(location, true);
        return React9.createElement("td", { key, role: "gridcell", "aria-colindex": col + 1 + colOffset, "aria-selected": selected, "aria-readonly": isInnerOnlyCell(cellContent) || !isReadWriteCell(cellContent), id, "data-testid": id, onClick: () => {
          const canvas = canvasRef?.current;
          if (canvas === null || canvas === void 0)
            return;
          return onKeyDown?.({
            bounds: getBoundsForItem(canvas, col, row),
            cancel: () => void 0,
            preventDefault: () => void 0,
            stopPropagation: () => void 0,
            ctrlKey: false,
            key: "Enter",
            keyCode: 13,
            metaKey: false,
            shiftKey: false,
            altKey: false,
            rawEvent: void 0,
            location
          });
        }, onFocusCapture: (e) => {
          if (e.target === focusRef.current || lastFocusedSubdomNode.current?.[0] === col && lastFocusedSubdomNode.current?.[1] === row)
            return;
          lastFocusedSubdomNode.current = location;
          return onCellFocused?.(location);
        }, ref: focused ? focusElement : void 0, tabIndex: -1 }, getRowData(cellContent, getCellRenderer));
      }))))
    );
  }, [
    width,
    mappedColumns,
    cellXOffset,
    dragAndDropState,
    translateX,
    rows,
    cellYOffset,
    accessibilityHeight,
    selection,
    focusElement,
    getCellContent,
    canvasRef,
    onKeyDown,
    getBoundsForItem,
    onCellFocused
  ], 200);
  const opacityX = freezeColumns === 0 || !fixedShadowX ? 0 : cellXOffset > freezeColumns ? 1 : (0, import_clamp2.default)(-translateX / 100, 0, 1);
  const absoluteOffsetY = -cellYOffset * 32 + translateY;
  const opacityY = !fixedShadowY ? 0 : (0, import_clamp2.default)(-absoluteOffsetY / 100, 0, 1);
  const stickyShadow = React9.useMemo(() => {
    if (!opacityX && !opacityY) {
      return null;
    }
    const styleX = {
      position: "absolute",
      top: 0,
      left: stickyX,
      width: width - stickyX,
      height,
      opacity: opacityX,
      pointerEvents: "none",
      transition: !smoothScrollX ? "opacity 0.2s" : void 0,
      boxShadow: "inset 13px 0 10px -13px rgba(0, 0, 0, 0.2)"
    };
    const styleY = {
      position: "absolute",
      top: totalHeaderHeight,
      left: 0,
      width,
      height,
      opacity: opacityY,
      pointerEvents: "none",
      transition: !smoothScrollY ? "opacity 0.2s" : void 0,
      boxShadow: "inset 0 13px 10px -13px rgba(0, 0, 0, 0.2)"
    };
    return React9.createElement(
      React9.Fragment,
      null,
      opacityX > 0 && React9.createElement("div", { id: "shadow-x", style: styleX }),
      opacityY > 0 && React9.createElement("div", { id: "shadow-y", style: styleY })
    );
  }, [opacityX, opacityY, stickyX, width, smoothScrollX, totalHeaderHeight, height, smoothScrollY]);
  const overlayStyle = React9.useMemo(() => ({
    position: "absolute",
    top: 0,
    left: 0
  }), []);
  return React9.createElement(
    React9.Fragment,
    null,
    React9.createElement("canvas", { "data-testid": "data-grid-canvas", tabIndex: 0, onKeyDown: onKeyDownImpl, onKeyUp: onKeyUpImpl, onFocus: onCanvasFocused, onBlur: onCanvasBlur, ref: refImpl, style }, accessibilityTree),
    React9.createElement("canvas", { ref: overlayRef, style: overlayStyle }),
    stickyShadow
  );
};
var data_grid_default = React9.memo(React9.forwardRef(DataGrid));

// vendor/glide-data-grid/dist/esm/internal/data-grid-dnd/data-grid-dnd.js
function offsetColumnSize(column, width, min, max) {
  return (0, import_clamp3.default)(Math.round(width - (column.growOffset ?? 0)), Math.ceil(min), Math.floor(max));
}
var DataGridDnd = (p2) => {
  const [resizeColStartX, setResizeColStartX] = React10.useState();
  const [resizeCol, setResizeCol] = React10.useState();
  const [dragCol, setDragCol] = React10.useState();
  const [dropCol, setDropCol] = React10.useState();
  const [dragColActive, setDragColActive] = React10.useState(false);
  const [dragStartX, setDragStartX] = React10.useState();
  const [dragRow, setDragRow] = React10.useState();
  const [dropRow, setDropRow] = React10.useState();
  const [dragRowActive, setDragRowActive] = React10.useState(false);
  const [dragStartY, setDragStartY] = React10.useState();
  const { onHeaderMenuClick, onHeaderIndicatorClick, getCellContent, onColumnMoved, onColumnResize, onColumnResizeStart, onColumnResizeEnd, gridRef, maxColumnWidth, minColumnWidth, onRowMoved, lockColumns, onColumnProposeMove, onMouseDown, onMouseUp, onItemHovered, onDragStart, canvasRef } = p2;
  const canResize = (onColumnResize ?? onColumnResizeEnd ?? onColumnResizeStart) !== void 0;
  const { columns, selection } = p2;
  const selectedColumns = selection.columns;
  const onItemHoveredImpl = React10.useCallback((args) => {
    const [col, row] = args.location;
    if (dragCol !== void 0 && dropCol !== col && col >= lockColumns) {
      setDragColActive(true);
      setDropCol(col);
    } else if (dragRow !== void 0 && row !== void 0) {
      setDragRowActive(true);
      setDropRow(Math.max(0, row));
    } else if (resizeCol === void 0 && !dragColActive && !dragRowActive) {
      onItemHovered?.(args);
    }
  }, [dragCol, dragRow, dropCol, onItemHovered, lockColumns, resizeCol, dragColActive, dragRowActive]);
  const canDragCol = onColumnMoved !== void 0;
  const onMouseDownImpl = React10.useCallback((args) => {
    if (args.button === 0) {
      const [col, row] = args.location;
      if (args.kind === "out-of-bounds" && args.isEdge && canResize) {
        const bounds = gridRef?.current?.getBounds(columns.length - 1, -1);
        if (bounds !== void 0) {
          setResizeColStartX(bounds.x);
          setResizeCol(columns.length - 1);
        }
      } else if (args.kind === "header" && col >= lockColumns) {
        const canvas = canvasRef?.current;
        if (args.isEdge && canResize && canvas) {
          setResizeColStartX(args.bounds.x);
          setResizeCol(col);
          const rect = canvas.getBoundingClientRect();
          const scale = rect.width / canvas.offsetWidth;
          const width = args.bounds.width / scale;
          onColumnResizeStart?.(columns[col], width, col, width + (columns[col].growOffset ?? 0));
        } else if (args.kind === "header" && canDragCol) {
          setDragStartX(args.bounds.x);
          setDragCol(col);
        }
      } else if (args.kind === "cell" && lockColumns > 0 && col === 0 && row !== void 0 && onRowMoved !== void 0) {
        setDragStartY(args.bounds.y);
        setDragRow(row);
      }
    }
    onMouseDown?.(args);
  }, [onMouseDown, canResize, lockColumns, onRowMoved, gridRef, columns, canDragCol, onColumnResizeStart, canvasRef]);
  const onHeaderMenuClickMangled = React10.useCallback((col, screenPosition) => {
    if (dragColActive || dragRowActive)
      return;
    onHeaderMenuClick?.(col, screenPosition);
  }, [dragColActive, dragRowActive, onHeaderMenuClick]);
  const onHeaderIndicatorClickMangled = React10.useCallback((col, screenPosition) => {
    if (dragColActive || dragRowActive)
      return;
    onHeaderIndicatorClick?.(col, screenPosition);
  }, [dragColActive, dragRowActive, onHeaderIndicatorClick]);
  const lastResizeWidthRef = React10.useRef(-1);
  const clearAll = React10.useCallback(() => {
    lastResizeWidthRef.current = -1;
    setDragRow(void 0);
    setDropRow(void 0);
    setDragStartY(void 0);
    setDragRowActive(false);
    setDragCol(void 0);
    setDropCol(void 0);
    setDragStartX(void 0);
    setDragColActive(false);
    setResizeCol(void 0);
    setResizeColStartX(void 0);
  }, []);
  const onMouseUpImpl = React10.useCallback((args, isOutside) => {
    if (args.button === 0) {
      if (resizeCol !== void 0) {
        if (selectedColumns?.hasIndex(resizeCol) === true) {
          for (const c of selectedColumns) {
            if (c === resizeCol)
              continue;
            const col = columns[c];
            const newSize = offsetColumnSize(col, lastResizeWidthRef.current, minColumnWidth, maxColumnWidth);
            onColumnResize?.(col, newSize, c, newSize + (col.growOffset ?? 0));
          }
        }
        const ns = offsetColumnSize(columns[resizeCol], lastResizeWidthRef.current, minColumnWidth, maxColumnWidth);
        onColumnResizeEnd?.(columns[resizeCol], ns, resizeCol, ns + (columns[resizeCol].growOffset ?? 0));
        if (selectedColumns.hasIndex(resizeCol)) {
          for (const c of selectedColumns) {
            if (c === resizeCol)
              continue;
            const col = columns[c];
            const s = offsetColumnSize(col, lastResizeWidthRef.current, minColumnWidth, maxColumnWidth);
            onColumnResizeEnd?.(col, s, c, s + (col.growOffset ?? 0));
          }
        }
      }
      clearAll();
      if (dragCol !== void 0 && dropCol !== void 0 && onColumnProposeMove?.(dragCol, dropCol) !== false) {
        onColumnMoved?.(dragCol, dropCol);
      }
      if (dragRow !== void 0 && dropRow !== void 0) {
        onRowMoved?.(dragRow, dropRow);
      }
    }
    onMouseUp?.(args, isOutside);
  }, [
    onMouseUp,
    resizeCol,
    dragCol,
    dropCol,
    dragRow,
    dropRow,
    selectedColumns,
    onColumnResizeEnd,
    columns,
    minColumnWidth,
    maxColumnWidth,
    onColumnResize,
    onColumnMoved,
    onRowMoved,
    clearAll,
    onColumnProposeMove
  ]);
  const dragOffset = React10.useMemo(() => {
    if (dragCol === void 0 || dropCol === void 0)
      return void 0;
    if (dragCol === dropCol)
      return void 0;
    if (onColumnProposeMove?.(dragCol, dropCol) === false)
      return void 0;
    return {
      src: dragCol,
      dest: dropCol
    };
  }, [dragCol, dropCol, onColumnProposeMove]);
  const onMouseMove = React10.useCallback((event) => {
    const canvas = canvasRef?.current;
    if (dragCol !== void 0 && dragStartX !== void 0) {
      const diff = Math.abs(event.clientX - dragStartX);
      if (diff > 20) {
        setDragColActive(true);
      }
    } else if (dragRow !== void 0 && dragStartY !== void 0) {
      const diff = Math.abs(event.clientY - dragStartY);
      if (diff > 20) {
        setDragRowActive(true);
      }
    } else if (resizeCol !== void 0 && resizeColStartX !== void 0 && canvas) {
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width / canvas.offsetWidth;
      const newWidth = (event.clientX - resizeColStartX) / scale;
      const column = columns[resizeCol];
      const ns = offsetColumnSize(column, newWidth, minColumnWidth, maxColumnWidth);
      onColumnResize?.(column, ns, resizeCol, ns + (column.growOffset ?? 0));
      lastResizeWidthRef.current = newWidth;
      if (selectedColumns?.first() === resizeCol) {
        for (const c of selectedColumns) {
          if (c === resizeCol)
            continue;
          const col = columns[c];
          const s = offsetColumnSize(col, lastResizeWidthRef.current, minColumnWidth, maxColumnWidth);
          onColumnResize?.(col, s, c, s + (col.growOffset ?? 0));
        }
      }
    }
  }, [
    dragCol,
    dragStartX,
    dragRow,
    dragStartY,
    resizeCol,
    resizeColStartX,
    columns,
    minColumnWidth,
    maxColumnWidth,
    onColumnResize,
    selectedColumns,
    canvasRef
  ]);
  const getMangledCellContent = React10.useCallback((cell, forceStrict) => {
    if (dragRow === void 0 || dropRow === void 0)
      return getCellContent(cell, forceStrict);
    let [col, row] = cell;
    if (row === dropRow) {
      row = dragRow;
    } else {
      if (row > dropRow)
        row -= 1;
      if (row >= dragRow)
        row += 1;
    }
    return getCellContent([col, row], forceStrict);
  }, [dragRow, dropRow, getCellContent]);
  const onDragStartImpl = React10.useCallback((args) => {
    onDragStart?.(args);
    if (!args.defaultPrevented()) {
      clearAll();
    }
  }, [clearAll, onDragStart]);
  return React10.createElement(data_grid_default, { accessibilityHeight: p2.accessibilityHeight, canvasRef: p2.canvasRef, cellXOffset: p2.cellXOffset, cellYOffset: p2.cellYOffset, columns: p2.columns, disabledRows: p2.disabledRows, drawFocusRing: p2.drawFocusRing, drawHeader: p2.drawHeader, drawCell: p2.drawCell, enableGroups: p2.enableGroups, eventTargetRef: p2.eventTargetRef, experimental: p2.experimental, fillHandle: p2.fillHandle, firstColAccessible: p2.firstColAccessible, fixedShadowX: p2.fixedShadowX, fixedShadowY: p2.fixedShadowY, freezeColumns: p2.freezeColumns, getCellRenderer: p2.getCellRenderer, getGroupDetails: p2.getGroupDetails, getRowThemeOverride: p2.getRowThemeOverride, groupHeaderHeight: p2.groupHeaderHeight, headerHeight: p2.headerHeight, headerIcons: p2.headerIcons, height: p2.height, highlightRegions: p2.highlightRegions, imageWindowLoader: p2.imageWindowLoader, resizeColumn: resizeCol, isDraggable: p2.isDraggable, isFilling: p2.isFilling, isFocused: p2.isFocused, onCanvasBlur: p2.onCanvasBlur, onCanvasFocused: p2.onCanvasFocused, onCellFocused: p2.onCellFocused, onContextMenu: p2.onContextMenu, onDragEnd: p2.onDragEnd, onDragLeave: p2.onDragLeave, onDragOverCell: p2.onDragOverCell, onDrop: p2.onDrop, onKeyDown: p2.onKeyDown, onKeyUp: p2.onKeyUp, onMouseMove: p2.onMouseMove, prelightCells: p2.prelightCells, rowHeight: p2.rowHeight, rows: p2.rows, selection: p2.selection, smoothScrollX: p2.smoothScrollX, smoothScrollY: p2.smoothScrollY, theme: p2.theme, freezeTrailingRows: p2.freezeTrailingRows, hasAppendRow: p2.hasAppendRow, translateX: p2.translateX, translateY: p2.translateY, resizeIndicator: p2.resizeIndicator, verticalBorder: p2.verticalBorder, width: p2.width, getCellContent: getMangledCellContent, isResizing: resizeCol !== void 0, onHeaderMenuClick: onHeaderMenuClickMangled, onHeaderIndicatorClick: onHeaderIndicatorClickMangled, isDragging: dragColActive, onItemHovered: onItemHoveredImpl, onDragStart: onDragStartImpl, onMouseDown: onMouseDownImpl, allowResize: canResize, onMouseUp: onMouseUpImpl, dragAndDropState: dragOffset, onMouseMoveRaw: onMouseMove, ref: gridRef });
};
var data_grid_dnd_default = DataGridDnd;

// vendor/glide-data-grid/dist/esm/internal/scrolling-data-grid/infinite-scroller.js
init_dist2();
import * as React11 from "react";

// vendor/glide-data-grid/dist/esm/common/resize-detector.js
import { useLayoutEffect as useLayoutEffect5, useState as useState6, useRef as useRef7 } from "react";
function useResizeDetector(initialSize) {
  const ref = useRef7(null);
  const [size, setSize] = useState6({
    width: initialSize?.[0],
    height: initialSize?.[1]
  });
  useLayoutEffect5(() => {
    const resizeCallback = (entries) => {
      for (const entry of entries) {
        const { width, height } = entry && entry.contentRect || {};
        setSize((cv) => cv.width === width && cv.height === height ? cv : { width, height });
      }
    };
    const resizeObserver = new window.ResizeObserver(resizeCallback);
    if (ref.current) {
      resizeObserver.observe(ref.current, void 0);
    }
    return () => {
      resizeObserver.disconnect();
    };
  }, [ref.current]);
  return { ref, ...size };
}

// vendor/glide-data-grid/dist/esm/internal/scrolling-data-grid/use-kinetic-scroll.js
import { useEffect as useEffect3, useRef as useRef8 } from "react";
var useKineticScroll = (isEnabled, callback, targetScroller) => {
  const rafId = useRef8(null);
  const isTouching = useRef8(null);
  const lastScrollPosition = useRef8(null);
  const sameCount = useRef8(0);
  const callbackRef = useRef8(callback);
  callbackRef.current = callback;
  const scrollEl = targetScroller.current;
  useEffect3(() => {
    const handleScroll = () => {
      if (isTouching.current === false && scrollEl !== null) {
        const currentScrollPosition = [scrollEl.scrollLeft, scrollEl.scrollTop];
        if (lastScrollPosition.current?.[0] === currentScrollPosition[0] && lastScrollPosition.current?.[1] === currentScrollPosition[1]) {
          if (sameCount.current > 10) {
            lastScrollPosition.current = null;
            isTouching.current = null;
            return;
          } else {
            sameCount.current++;
          }
        } else {
          sameCount.current = 0;
          callbackRef.current(currentScrollPosition[0], currentScrollPosition[1]);
          lastScrollPosition.current = currentScrollPosition;
        }
        rafId.current = window.setTimeout(handleScroll, 1e3 / 120);
      }
    };
    const startTouch = () => {
      isTouching.current = true;
      lastScrollPosition.current = null;
      if (rafId.current !== null) {
        window.clearTimeout(rafId.current);
        rafId.current = null;
      }
    };
    const endTouch = (event) => {
      if (event.touches.length === 0) {
        isTouching.current = false;
        sameCount.current = 0;
        rafId.current = window.setTimeout(handleScroll, 1e3 / 120);
      }
    };
    if (isEnabled && scrollEl !== null) {
      const element = scrollEl;
      element.addEventListener("touchstart", startTouch);
      element.addEventListener("touchend", endTouch);
      return () => {
        element.removeEventListener("touchstart", startTouch);
        element.removeEventListener("touchend", endTouch);
        if (rafId.current !== null) {
          window.clearTimeout(rafId.current);
        }
      };
    }
  }, [isEnabled, scrollEl]);
};
var use_kinetic_scroll_default = useKineticScroll;

// vendor/glide-data-grid/dist/esm/internal/scrolling-data-grid/infinite-scroller.js
var _exp = () => (p2) => p2.isSafari ? "scroll" : "auto";
var ScrollRegionStyle = /* @__PURE__ */ styled_default("div")({
  name: "ScrollRegionStyle",
  class: "gdg-s1dgczr6",
  propsAsIs: false,
  vars: {
    "s1dgczr6-0": [_exp()]
  }
});
var BROWSER_MAX_DIV_HEIGHT = 33554400;
var MAX_PADDER_SEGMENT_HEIGHT = 5e6;
function useTouchUpDelayed(delay) {
  const [hasTouches, setHasTouches] = React11.useState(false);
  const safeWindow = typeof window === "undefined" ? null : window;
  const cbTimer = React11.useRef(0);
  useEventListener("touchstart", React11.useCallback(() => {
    window.clearTimeout(cbTimer.current);
    setHasTouches(true);
  }, []), safeWindow, true, false);
  useEventListener("touchend", React11.useCallback((e) => {
    if (e.touches.length === 0) {
      cbTimer.current = window.setTimeout(() => setHasTouches(false), delay);
    }
  }, [delay]), safeWindow, true, false);
  return hasTouches;
}
var InfiniteScroller = (p2) => {
  const {
    children,
    clientHeight,
    scrollHeight,
    scrollWidth,
    update,
    draggable,
    className,
    preventDiagonalScrolling = false,
    paddingBottom = 0,
    paddingRight = 0,
    rightElement,
    rightElementProps,
    kineticScrollPerfHack = false,
    scrollRef,
    initialSize
  } = p2;
  const padders = [];
  const rightElementSticky = rightElementProps?.sticky ?? false;
  const rightElementFill = rightElementProps?.fill ?? false;
  const virtualScrollY = React11.useRef(0);
  const lastScrollY = React11.useRef(0);
  const scroller = React11.useRef(null);
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  const lastDpr = React11.useRef(dpr);
  React11.useEffect(() => {
    if (lastDpr.current !== dpr) {
      virtualScrollY.current = 0;
      lastScrollY.current = 0;
      lastDpr.current = dpr;
      const el = scroller.current;
      if (el !== null) {
        onScrollRef.current(el.scrollLeft, el.scrollTop);
      }
    }
  }, [dpr]);
  const lastScrollPosition = React11.useRef({
    scrollLeft: 0,
    scrollTop: 0,
    lockDirection: void 0
  });
  const rightWrapRef = React11.useRef(null);
  const hasTouches = useTouchUpDelayed(200);
  const [isIdle, setIsIdle] = React11.useState(true);
  const idleTimer = React11.useRef(0);
  React11.useLayoutEffect(() => {
    if (!isIdle || hasTouches || lastScrollPosition.current.lockDirection === void 0) return;
    const el = scroller.current;
    if (el === null) return;
    const [lx, ly] = lastScrollPosition.current.lockDirection;
    if (lx !== void 0) {
      el.scrollLeft = lx;
    } else if (ly !== void 0) {
      el.scrollTop = ly;
    }
    lastScrollPosition.current.lockDirection = void 0;
  }, [hasTouches, isIdle]);
  const onScroll = React11.useCallback((scrollLeft, scrollTop) => {
    const el = scroller.current;
    if (el === null) return;
    scrollTop = scrollTop ?? el.scrollTop;
    scrollLeft = scrollLeft ?? el.scrollLeft;
    const lastScrollTop = lastScrollPosition.current.scrollTop;
    const lastScrollLeft = lastScrollPosition.current.scrollLeft;
    const dx = scrollLeft - lastScrollLeft;
    const dy = scrollTop - lastScrollTop;
    if (hasTouches && dx !== 0 && dy !== 0 && (Math.abs(dx) > 3 || Math.abs(dy) > 3) && preventDiagonalScrolling && lastScrollPosition.current.lockDirection === void 0) {
      lastScrollPosition.current.lockDirection = Math.abs(dx) < Math.abs(dy) ? [lastScrollLeft, void 0] : [void 0, lastScrollTop];
    }
    const lock = lastScrollPosition.current.lockDirection;
    scrollLeft = lock?.[0] ?? scrollLeft;
    scrollTop = lock?.[1] ?? scrollTop;
    lastScrollPosition.current.scrollLeft = scrollLeft;
    lastScrollPosition.current.scrollTop = scrollTop;
    const cWidth = el.clientWidth;
    const cHeight = el.clientHeight;
    const newY = scrollTop;
    const delta = lastScrollY.current - newY;
    const scrollableHeight = el.scrollHeight - cHeight;
    lastScrollY.current = newY;
    let virtualY;
    if (scrollableHeight > 0 && scrollHeight > el.scrollHeight + 5) {
      if (Math.abs(delta) > 2e3 || newY === 0 || newY === scrollableHeight) {
        const scrollProgress = Math.max(0, Math.min(1, newY / scrollableHeight));
        const virtualScrollableHeight = scrollHeight - cHeight;
        virtualY = scrollProgress * virtualScrollableHeight;
        virtualScrollY.current = virtualY;
      } else {
        virtualScrollY.current -= delta;
        virtualY = virtualScrollY.current;
      }
    } else {
      virtualY = newY;
      virtualScrollY.current = virtualY;
    }
    virtualY = Math.max(0, Math.min(virtualY, scrollHeight - cHeight));
    virtualScrollY.current = virtualY;
    if (lock !== void 0) {
      window.clearTimeout(idleTimer.current);
      setIsIdle(false);
      idleTimer.current = window.setTimeout(() => setIsIdle(true), 200);
    }
    update({
      x: scrollLeft,
      y: virtualY,
      width: cWidth - paddingRight,
      height: cHeight - paddingBottom,
      paddingRight: rightWrapRef.current?.clientWidth ?? 0
    });
  }, [paddingBottom, paddingRight, scrollHeight, update, preventDiagonalScrolling, hasTouches]);
  use_kinetic_scroll_default(kineticScrollPerfHack && browserIsSafari.value, onScroll, scroller);
  const onScrollRef = React11.useRef(onScroll);
  onScrollRef.current = onScroll;
  const lastProps = React11.useRef();
  const didFirstScroll = React11.useRef(false);
  React11.useLayoutEffect(() => {
    if (didFirstScroll.current) onScroll();
    else didFirstScroll.current = true;
  }, [onScroll, paddingBottom, paddingRight]);
  const setRefs = React11.useCallback((instance) => {
    scroller.current = instance;
    if (scrollRef !== void 0) {
      scrollRef.current = instance;
    }
  }, [scrollRef]);
  let key = 0;
  let h = 0;
  const effectiveScrollHeight = Math.min(scrollHeight, BROWSER_MAX_DIV_HEIGHT);
  padders.push(React11.createElement("div", {
    key: key++,
    style: {
      width: scrollWidth,
      height: 0
    }
  }));
  while (h < effectiveScrollHeight) {
    const toAdd = Math.min(MAX_PADDER_SEGMENT_HEIGHT, effectiveScrollHeight - h);
    padders.push(React11.createElement("div", {
      key: key++,
      style: {
        width: 0,
        height: toAdd
      }
    }));
    h += toAdd;
  }
  const {
    ref,
    width,
    height
  } = useResizeDetector(initialSize);
  if (typeof window !== "undefined" && (lastProps.current?.height !== height || lastProps.current?.width !== width)) {
    window.setTimeout(() => onScrollRef.current(), 0);
    lastProps.current = {
      width,
      height
    };
  }
  if ((width ?? 0) === 0 || (height ?? 0) === 0) return React11.createElement("div", {
    ref
  });
  return React11.createElement("div", {
    ref
  }, React11.createElement(ScrollRegionStyle, {
    isSafari: browserIsSafari.value
  }, React11.createElement("div", {
    className: "dvn-underlay"
  }, children), React11.createElement("div", {
    ref: setRefs,
    style: lastProps.current,
    draggable,
    onDragStart: (e) => {
      if (!draggable) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    className: "dvn-scroller " + (className ?? ""),
    onScroll: () => onScroll()
  }, React11.createElement("div", {
    className: "dvn-scroll-inner" + (rightElement === void 0 ? " dvn-hidden" : "")
  }, React11.createElement("div", {
    className: "dvn-stack"
  }, padders), rightElement !== void 0 && React11.createElement(React11.Fragment, null, !rightElementFill && React11.createElement("div", {
    className: "dvn-spacer"
  }), React11.createElement("div", {
    ref: rightWrapRef,
    style: {
      height,
      maxHeight: clientHeight - Math.ceil(dpr % 1),
      position: "sticky",
      top: 0,
      paddingLeft: 1,
      marginBottom: -40,
      marginRight: paddingRight,
      flexGrow: rightElementFill ? 1 : void 0,
      right: rightElementSticky ? paddingRight ?? 0 : void 0,
      pointerEvents: "auto"
    }
  }, rightElement))))));
};

// vendor/glide-data-grid/dist/esm/internal/scrolling-data-grid/scrolling-data-grid.js
var GridScroller = (p2) => {
  const { columns, rows, rowHeight, headerHeight, groupHeaderHeight, enableGroups, freezeColumns, experimental, nonGrowWidth, clientSize, className, onVisibleRegionChanged, scrollRef, preventDiagonalScrolling, rightElement, rightElementProps, overscrollX, overscrollY, initialSize, smoothScrollX = false, smoothScrollY = false, isDraggable } = p2;
  const { paddingRight, paddingBottom } = experimental ?? {};
  const [clientWidth, clientHeight] = clientSize;
  const last = React12.useRef();
  const lastX = React12.useRef();
  const lastY = React12.useRef();
  const lastSize = React12.useRef();
  const width = nonGrowWidth + Math.max(0, overscrollX ?? 0);
  let height = enableGroups ? headerHeight + groupHeaderHeight : headerHeight;
  if (typeof rowHeight === "number") {
    height += rows * rowHeight;
  } else {
    for (let r = 0; r < rows; r++) {
      height += rowHeight(r);
    }
  }
  if (overscrollY !== void 0) {
    height += overscrollY;
  }
  const lastArgs = React12.useRef();
  const processArgs = React12.useCallback(() => {
    if (lastArgs.current === void 0)
      return;
    const args = { ...lastArgs.current };
    let x2 = 0;
    let tx = args.x < 0 ? -args.x : 0;
    let cellRight = 0;
    let cellX = 0;
    args.x = args.x < 0 ? 0 : args.x;
    let stickyColWidth = 0;
    for (let i = 0; i < freezeColumns; i++) {
      stickyColWidth += columns[i].width;
    }
    for (const c of columns) {
      const cx3 = x2 - stickyColWidth;
      if (args.x >= cx3 + c.width) {
        x2 += c.width;
        cellX++;
        cellRight++;
      } else if (args.x > cx3) {
        x2 += c.width;
        if (smoothScrollX) {
          tx += cx3 - args.x;
        } else {
          cellX++;
        }
        cellRight++;
      } else if (args.x + args.width > cx3) {
        x2 += c.width;
        cellRight++;
      } else {
        break;
      }
    }
    let ty = 0;
    let cellY = 0;
    let cellBottom = 0;
    if (typeof rowHeight === "number") {
      if (smoothScrollY) {
        cellY = Math.floor(args.y / rowHeight);
        ty = cellY * rowHeight - args.y;
      } else {
        cellY = Math.ceil(args.y / rowHeight);
      }
      cellBottom = Math.ceil(args.height / rowHeight) + cellY;
      if (ty < 0)
        cellBottom++;
    } else {
      let y2 = 0;
      for (let row = 0; row < rows; row++) {
        const rh = rowHeight(row);
        const cy = y2 + (smoothScrollY ? 0 : rh / 2);
        if (args.y >= y2 + rh) {
          y2 += rh;
          cellY++;
          cellBottom++;
        } else if (args.y > cy) {
          y2 += rh;
          if (smoothScrollY) {
            ty += cy - args.y;
          } else {
            cellY++;
          }
          cellBottom++;
        } else if (args.y + args.height > rh / 2 + y2) {
          y2 += rh;
          cellBottom++;
        } else {
          break;
        }
      }
    }
    cellY = Math.max(0, Math.min(cellY, rows - 1));
    cellBottom = Math.max(cellY, Math.min(cellBottom, rows));
    const rect = {
      x: cellX,
      y: cellY,
      width: cellRight - cellX,
      height: cellBottom - cellY
    };
    const oldRect = last.current;
    if (oldRect === void 0 || oldRect.y !== rect.y || oldRect.x !== rect.x || oldRect.height !== rect.height || oldRect.width !== rect.width || lastX.current !== tx || lastY.current !== ty || args.width !== lastSize.current?.[0] || args.height !== lastSize.current?.[1]) {
      onVisibleRegionChanged?.({
        x: cellX,
        y: cellY,
        width: cellRight - cellX,
        height: cellBottom - cellY
      }, args.width, args.height, args.paddingRight ?? 0, tx, ty);
      last.current = rect;
      lastX.current = tx;
      lastY.current = ty;
      lastSize.current = [args.width, args.height];
    }
  }, [columns, rowHeight, rows, onVisibleRegionChanged, freezeColumns, smoothScrollX, smoothScrollY]);
  const onScrollUpdate = React12.useCallback((args) => {
    lastArgs.current = args;
    processArgs();
  }, [processArgs]);
  React12.useEffect(() => {
    processArgs();
  }, [processArgs]);
  return React12.createElement(
    InfiniteScroller,
    { scrollRef, className, kineticScrollPerfHack: experimental?.kineticScrollPerfHack, preventDiagonalScrolling, draggable: isDraggable === true || typeof isDraggable === "string", scrollWidth: width + (paddingRight ?? 0), scrollHeight: height + (paddingBottom ?? 0), clientHeight, rightElement, paddingBottom, paddingRight, rightElementProps, update: onScrollUpdate, initialSize },
    React12.createElement(data_grid_dnd_default, { eventTargetRef: scrollRef, width: clientWidth, height: clientHeight, accessibilityHeight: p2.accessibilityHeight, canvasRef: p2.canvasRef, cellXOffset: p2.cellXOffset, cellYOffset: p2.cellYOffset, columns: p2.columns, disabledRows: p2.disabledRows, enableGroups: p2.enableGroups, fillHandle: p2.fillHandle, firstColAccessible: p2.firstColAccessible, fixedShadowX: p2.fixedShadowX, fixedShadowY: p2.fixedShadowY, freezeColumns: p2.freezeColumns, getCellContent: p2.getCellContent, getCellRenderer: p2.getCellRenderer, getGroupDetails: p2.getGroupDetails, getRowThemeOverride: p2.getRowThemeOverride, groupHeaderHeight: p2.groupHeaderHeight, headerHeight: p2.headerHeight, highlightRegions: p2.highlightRegions, imageWindowLoader: p2.imageWindowLoader, isFilling: p2.isFilling, isFocused: p2.isFocused, lockColumns: p2.lockColumns, maxColumnWidth: p2.maxColumnWidth, minColumnWidth: p2.minColumnWidth, onHeaderMenuClick: p2.onHeaderMenuClick, onHeaderIndicatorClick: p2.onHeaderIndicatorClick, onMouseMove: p2.onMouseMove, prelightCells: p2.prelightCells, rowHeight: p2.rowHeight, rows: p2.rows, selection: p2.selection, theme: p2.theme, freezeTrailingRows: p2.freezeTrailingRows, hasAppendRow: p2.hasAppendRow, translateX: p2.translateX, translateY: p2.translateY, onColumnProposeMove: p2.onColumnProposeMove, verticalBorder: p2.verticalBorder, drawFocusRing: p2.drawFocusRing, drawHeader: p2.drawHeader, drawCell: p2.drawCell, experimental: p2.experimental, gridRef: p2.gridRef, headerIcons: p2.headerIcons, isDraggable: p2.isDraggable, onCanvasBlur: p2.onCanvasBlur, onCanvasFocused: p2.onCanvasFocused, onCellFocused: p2.onCellFocused, onColumnMoved: p2.onColumnMoved, onColumnResize: p2.onColumnResize, onColumnResizeEnd: p2.onColumnResizeEnd, onColumnResizeStart: p2.onColumnResizeStart, onContextMenu: p2.onContextMenu, onDragEnd: p2.onDragEnd, onDragLeave: p2.onDragLeave, onDragOverCell: p2.onDragOverCell, onDragStart: p2.onDragStart, onDrop: p2.onDrop, onItemHovered: p2.onItemHovered, onKeyDown: p2.onKeyDown, onKeyUp: p2.onKeyUp, onMouseDown: p2.onMouseDown, onMouseUp: p2.onMouseUp, onRowMoved: p2.onRowMoved, smoothScrollX: p2.smoothScrollX, smoothScrollY: p2.smoothScrollY, resizeIndicator: p2.resizeIndicator })
  );
};
var scrolling_data_grid_default = GridScroller;

// vendor/glide-data-grid/dist/esm/internal/data-grid-search/data-grid-search-style.js
init_dist2();
var SearchWrapper = /* @__PURE__ */ styled_default("div")({
  name: "SearchWrapper",
  class: "gdg-seveqep",
  propsAsIs: false
});

// vendor/glide-data-grid/dist/esm/internal/data-grid-search/data-grid-search.js
init_support();
var upArrow = React13.createElement(
  "svg",
  { className: "button-icon", viewBox: "0 0 512 512" },
  React13.createElement("path", { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "48", d: "M112 244l144-144 144 144M256 120v292" })
);
var downArrow = React13.createElement(
  "svg",
  { className: "button-icon", viewBox: "0 0 512 512" },
  React13.createElement("path", { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "48", d: "M112 268l144 144 144-144M256 392V100" })
);
var closeX = React13.createElement(
  "svg",
  { className: "button-icon", viewBox: "0 0 512 512" },
  React13.createElement("path", { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "32", d: "M368 368L144 144M368 144L144 368" })
);
var targetSearchTimeMS = 10;
var DataGridSearch = (p2) => {
  const { canvasRef, cellYOffset, rows, columns, searchInputRef, searchValue, searchResults: searchResultsIn, onSearchValueChange, getCellsForSelection, onSearchResultsChanged, showSearch = false, onSearchClose } = p2;
  const [searchID] = React13.useState(() => "search-box-" + Math.round(Math.random() * 1e3));
  const [searchStringInner, setSearchStringInner] = React13.useState("");
  const searchString = searchValue ?? searchStringInner;
  const setSearchString = React13.useCallback((newVal) => {
    setSearchStringInner(newVal);
    onSearchValueChange?.(newVal);
  }, [onSearchValueChange]);
  const [searchStatus, setSearchStatus] = React13.useState();
  const searchStatusRef = React13.useRef(searchStatus);
  searchStatusRef.current = searchStatus;
  React13.useEffect(() => {
    if (searchResultsIn === void 0)
      return;
    if (searchResultsIn.length > 0) {
      setSearchStatus((cv) => ({
        rowsSearched: rows,
        results: searchResultsIn.length,
        selectedIndex: cv?.selectedIndex ?? -1
      }));
    } else {
      setSearchStatus(void 0);
    }
  }, [rows, searchResultsIn]);
  const abortControllerRef = React13.useRef();
  if (abortControllerRef.current === void 0)
    abortControllerRef.current = new AbortController();
  const searchHandle = React13.useRef();
  const [searchResultsInner, setSearchResultsInner] = React13.useState([]);
  const searchResults = searchResultsIn ?? searchResultsInner;
  const cancelSearch = React13.useCallback(() => {
    if (searchHandle.current !== void 0) {
      window.cancelAnimationFrame(searchHandle.current);
      searchHandle.current = void 0;
    }
    if (abortControllerRef.current !== void 0) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
  }, []);
  const cellYOffsetRef = React13.useRef(cellYOffset);
  cellYOffsetRef.current = cellYOffset;
  const beginSearch = React13.useCallback((str) => {
    const regex = new RegExp(str.replace(/([$()*+.?[\\\]^{|}-])/g, "\\$1"), "i");
    let startY = cellYOffsetRef.current;
    let searchStride = Math.min(10, rows);
    let rowsSearched = 0;
    setSearchStatus(void 0);
    setSearchResultsInner([]);
    const runningResult = [];
    const tick = async () => {
      if (getCellsForSelection === void 0)
        return;
      const tStart = performance.now();
      const rowsLeft = rows - rowsSearched;
      let data = getCellsForSelection({
        x: 0,
        y: startY,
        width: columns.length,
        height: Math.min(searchStride, rowsLeft, rows - startY)
      }, abortControllerRef.current.signal);
      if (typeof data === "function") {
        data = await data();
      }
      let added = false;
      for (const [row, d3] of data.entries()) {
        for (const [col, cell] of d3.entries()) {
          let testString;
          switch (cell.kind) {
            case GridCellKind.Text:
            case GridCellKind.Number:
              testString = cell.displayData;
              break;
            case GridCellKind.Uri:
            case GridCellKind.Markdown:
              testString = cell.data;
              break;
            case GridCellKind.Boolean:
              testString = typeof cell.data === "boolean" ? cell.data.toString() : void 0;
              break;
            case GridCellKind.Image:
            case GridCellKind.Bubble:
              testString = cell.data.join("\u{1F433}");
              break;
            case GridCellKind.Custom:
              testString = cell.copyData;
              break;
          }
          if (testString !== void 0 && regex.test(testString)) {
            runningResult.push([col, row + startY]);
            added = true;
          }
        }
      }
      const tEnd = performance.now();
      if (added) {
        setSearchResultsInner([...runningResult]);
      }
      rowsSearched += data.length;
      assert(rowsSearched <= rows);
      const selectedIndex = searchStatusRef.current?.selectedIndex ?? -1;
      setSearchStatus({
        results: runningResult.length,
        rowsSearched,
        selectedIndex
      });
      onSearchResultsChanged?.(runningResult, selectedIndex);
      if (startY + searchStride >= rows) {
        startY = 0;
      } else {
        startY += searchStride;
      }
      const tElapsed = tEnd - tStart;
      const rounded = Math.max(tElapsed, 1);
      const scalar = targetSearchTimeMS / rounded;
      searchStride = Math.ceil(searchStride * scalar);
      if (rowsSearched < rows && runningResult.length < 1e3) {
        searchHandle.current = window.requestAnimationFrame(tick);
      }
    };
    cancelSearch();
    searchHandle.current = window.requestAnimationFrame(tick);
  }, [cancelSearch, columns.length, getCellsForSelection, onSearchResultsChanged, rows]);
  const onClose = React13.useCallback(() => {
    onSearchClose?.();
    setSearchStatus(void 0);
    setSearchResultsInner([]);
    onSearchResultsChanged?.([], -1);
    cancelSearch();
    canvasRef?.current?.focus();
  }, [cancelSearch, canvasRef, onSearchClose, onSearchResultsChanged]);
  const onSearchChange = React13.useCallback((event) => {
    setSearchString(event.target.value);
    if (searchResultsIn !== void 0)
      return;
    if (event.target.value === "") {
      setSearchStatus(void 0);
      setSearchResultsInner([]);
      cancelSearch();
    } else {
      beginSearch(event.target.value);
    }
  }, [beginSearch, cancelSearch, setSearchString, searchResultsIn]);
  React13.useEffect(() => {
    if (searchInputRef.current === null)
      return;
    setSearchString("");
    setSearchStatus(void 0);
    if (searchResultsInner.length > 0) {
      setSearchResultsInner([]);
      onSearchResultsChanged?.([], -1);
    }
    if (showSearch) {
      searchInputRef.current.focus({ preventScroll: true });
    } else {
      cancelSearch();
    }
  }, [showSearch, searchInputRef]);
  const onNext = React13.useCallback((ev) => {
    ev?.stopPropagation?.();
    if (searchStatus === void 0 || searchStatus.results === 0)
      return;
    const newIndex = (searchStatus.selectedIndex + 1) % searchStatus.results;
    setSearchStatus({
      ...searchStatus,
      selectedIndex: newIndex
    });
    onSearchResultsChanged?.(searchResults, newIndex);
  }, [searchStatus, onSearchResultsChanged, searchResults]);
  const onPrev = React13.useCallback((ev) => {
    ev?.stopPropagation?.();
    if (searchStatus === void 0 || searchStatus.results === 0)
      return;
    let newIndex = (searchStatus.selectedIndex - 1) % searchStatus.results;
    if (newIndex < 0)
      newIndex += searchStatus.results;
    setSearchStatus({
      ...searchStatus,
      selectedIndex: newIndex
    });
    onSearchResultsChanged?.(searchResults, newIndex);
  }, [onSearchResultsChanged, searchResults, searchStatus]);
  const onSearchKeyDown = React13.useCallback((event) => {
    if ((event.ctrlKey || event.metaKey) && event.nativeEvent.code === "KeyF" || event.key === "Escape") {
      onClose();
      event.stopPropagation();
      event.preventDefault();
    } else if (event.key === "Enter") {
      if (event.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
    }
  }, [onClose, onNext, onPrev]);
  React13.useEffect(() => {
    return () => {
      cancelSearch();
    };
  }, [cancelSearch]);
  const [isAnimatingOut, setIsAnimatingOut] = React13.useState(false);
  React13.useEffect(() => {
    if (showSearch) {
      setIsAnimatingOut(true);
    } else {
      const timeoutId = setTimeout(() => setIsAnimatingOut(false), 150);
      return () => clearTimeout(timeoutId);
    }
  }, [showSearch]);
  const searchbox = React13.useMemo(() => {
    if (!showSearch && !isAnimatingOut) {
      return null;
    }
    let resultString;
    if (searchStatus !== void 0) {
      resultString = searchStatus.results >= 1e3 ? `over 1000` : `${searchStatus.results} result${searchStatus.results !== 1 ? "s" : ""}`;
      if (searchStatus.selectedIndex >= 0) {
        resultString = `${searchStatus.selectedIndex + 1} of ${resultString}`;
      }
    }
    const cancelEvent = (ev) => {
      ev.stopPropagation();
    };
    const rowsSearchedProgress = rows > 0 ? Math.floor((searchStatus?.rowsSearched ?? 0) / rows * 100) : 0;
    const progressStyle = {
      width: `${rowsSearchedProgress}%`
    };
    return React13.createElement(
      SearchWrapper,
      { className: "gdg-search-bar" + (showSearch ? "" : " out"), onMouseDown: cancelEvent, onMouseMove: cancelEvent, onMouseUp: cancelEvent, onClick: cancelEvent },
      React13.createElement(
        "div",
        { className: "gdg-search-bar-inner" },
        React13.createElement("input", { id: searchID, "aria-hidden": !showSearch, "data-testid": "search-input", ref: searchInputRef, onChange: onSearchChange, value: searchString, tabIndex: showSearch ? void 0 : -1, onKeyDownCapture: onSearchKeyDown }),
        React13.createElement("button", { type: "button", "aria-label": "Previous Result", "aria-hidden": !showSearch, tabIndex: showSearch ? void 0 : -1, onClick: onPrev, disabled: (searchStatus?.results ?? 0) === 0 }, upArrow),
        React13.createElement("button", { type: "button", "aria-label": "Next Result", "aria-hidden": !showSearch, tabIndex: showSearch ? void 0 : -1, onClick: onNext, disabled: (searchStatus?.results ?? 0) === 0 }, downArrow),
        onSearchClose !== void 0 && React13.createElement("button", { type: "button", "aria-label": "Close Search", "aria-hidden": !showSearch, "data-testid": "search-close-button", tabIndex: showSearch ? void 0 : -1, onClick: onClose }, closeX)
      ),
      searchStatus !== void 0 ? React13.createElement(
        React13.Fragment,
        null,
        React13.createElement(
          "div",
          { className: "gdg-search-status" },
          React13.createElement("div", { "data-testid": "search-result-area" }, resultString)
        ),
        React13.createElement("div", { className: "gdg-search-progress", style: progressStyle })
      ) : React13.createElement(
        "div",
        { className: "gdg-search-status" },
        React13.createElement("label", { htmlFor: searchID }, "Type to search")
      )
    );
  }, [
    showSearch,
    isAnimatingOut,
    searchStatus,
    rows,
    searchID,
    searchInputRef,
    onSearchChange,
    searchString,
    onSearchKeyDown,
    onPrev,
    onNext,
    onSearchClose,
    onClose
  ]);
  return React13.createElement(
    React13.Fragment,
    null,
    React13.createElement(scrolling_data_grid_default, { prelightCells: searchResults, accessibilityHeight: p2.accessibilityHeight, canvasRef: p2.canvasRef, cellXOffset: p2.cellXOffset, cellYOffset: p2.cellYOffset, className: p2.className, clientSize: p2.clientSize, columns: p2.columns, disabledRows: p2.disabledRows, enableGroups: p2.enableGroups, fillHandle: p2.fillHandle, firstColAccessible: p2.firstColAccessible, nonGrowWidth: p2.nonGrowWidth, fixedShadowX: p2.fixedShadowX, fixedShadowY: p2.fixedShadowY, freezeColumns: p2.freezeColumns, getCellContent: p2.getCellContent, getCellRenderer: p2.getCellRenderer, getGroupDetails: p2.getGroupDetails, getRowThemeOverride: p2.getRowThemeOverride, groupHeaderHeight: p2.groupHeaderHeight, headerHeight: p2.headerHeight, highlightRegions: p2.highlightRegions, imageWindowLoader: p2.imageWindowLoader, initialSize: p2.initialSize, isFilling: p2.isFilling, isFocused: p2.isFocused, lockColumns: p2.lockColumns, maxColumnWidth: p2.maxColumnWidth, minColumnWidth: p2.minColumnWidth, onHeaderMenuClick: p2.onHeaderMenuClick, onHeaderIndicatorClick: p2.onHeaderIndicatorClick, onMouseMove: p2.onMouseMove, onVisibleRegionChanged: p2.onVisibleRegionChanged, overscrollX: p2.overscrollX, overscrollY: p2.overscrollY, preventDiagonalScrolling: p2.preventDiagonalScrolling, rightElement: p2.rightElement, rightElementProps: p2.rightElementProps, rowHeight: p2.rowHeight, rows: p2.rows, scrollRef: p2.scrollRef, selection: p2.selection, theme: p2.theme, freezeTrailingRows: p2.freezeTrailingRows, hasAppendRow: p2.hasAppendRow, translateX: p2.translateX, translateY: p2.translateY, verticalBorder: p2.verticalBorder, onColumnProposeMove: p2.onColumnProposeMove, drawFocusRing: p2.drawFocusRing, drawCell: p2.drawCell, drawHeader: p2.drawHeader, experimental: p2.experimental, gridRef: p2.gridRef, headerIcons: p2.headerIcons, isDraggable: p2.isDraggable, onCanvasBlur: p2.onCanvasBlur, onCanvasFocused: p2.onCanvasFocused, onCellFocused: p2.onCellFocused, onColumnMoved: p2.onColumnMoved, onColumnResize: p2.onColumnResize, onColumnResizeEnd: p2.onColumnResizeEnd, onColumnResizeStart: p2.onColumnResizeStart, onContextMenu: p2.onContextMenu, onDragEnd: p2.onDragEnd, onDragLeave: p2.onDragLeave, onDragOverCell: p2.onDragOverCell, onDragStart: p2.onDragStart, onDrop: p2.onDrop, onItemHovered: p2.onItemHovered, onKeyDown: p2.onKeyDown, onKeyUp: p2.onKeyUp, onMouseDown: p2.onMouseDown, onMouseUp: p2.onMouseUp, onRowMoved: p2.onRowMoved, smoothScrollX: p2.smoothScrollX, smoothScrollY: p2.smoothScrollY, resizeIndicator: p2.resizeIndicator }),
    searchbox
  );
};
var data_grid_search_default = DataGridSearch;

// vendor/glide-data-grid/dist/esm/data-editor/data-editor.js
init_styles();

// vendor/glide-data-grid/dist/esm/data-editor/group-rename.js
init_dist2();
init_click_outside_container();
import React15 from "react";
var _exp2 = () => (p2) => Math.max(16, p2.targetHeight - 10);
var RenameInput = /* @__PURE__ */ styled_default("input")({
  name: "RenameInput",
  class: "gdg-r17m35ur",
  propsAsIs: false,
  vars: {
    "r17m35ur-0": [_exp2(), "px"]
  }
});
var GroupRename = (p2) => {
  const {
    bounds,
    group,
    onClose,
    canvasBounds,
    onFinish
  } = p2;
  const [value, setValue] = React15.useState(group);
  return React15.createElement(ClickOutsideContainer, {
    style: {
      position: "absolute",
      left: bounds.x - canvasBounds.left + 1,
      top: bounds.y - canvasBounds.top,
      width: bounds.width - 2,
      height: bounds.height
    },
    className: "gdg-c1tqibwd",
    onClickOutside: onClose
  }, React15.createElement(RenameInput, {
    targetHeight: bounds.height,
    "data-testid": "group-rename-input",
    value,
    onBlur: onClose,
    onFocus: (e) => e.target.setSelectionRange(0, value.length),
    onChange: (e) => setValue(e.target.value),
    onKeyDown: (e) => {
      if (e.key === "Enter") {
        onFinish(value);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    autoFocus: true
  }));
};

// vendor/glide-data-grid/dist/esm/common/is-hotkey.js
function checkKey(key, args) {
  if (key === void 0)
    return false;
  if (key.length > 1 && key.startsWith("_")) {
    const keycode = Number.parseInt(key.slice(1));
    return keycode === args.keyCode;
  }
  if (key.length === 1 && key >= "a" && key <= "z") {
    return key.toUpperCase().codePointAt(0) === args.keyCode;
  }
  return key === args.key;
}
function isHotkey(hotkey, args, details) {
  const result = isHotkeyInner(hotkey, args);
  if (result)
    details.didMatch = true;
  return result;
}
function isHotkeyInner(hotkey, args) {
  if (hotkey.length === 0)
    return false;
  if (hotkey.includes("|")) {
    const parts = hotkey.split("|");
    for (const part of parts) {
      if (isHotkeyInner(part, args))
        return true;
    }
    return false;
  }
  let wantCtrl = false;
  let wantShift = false;
  let wantAlt = false;
  let wantMeta = false;
  const split = hotkey.split("+");
  const key = split.pop();
  if (!checkKey(key, args))
    return false;
  if (split[0] === "any")
    return true;
  for (const accel of split) {
    switch (accel) {
      case "ctrl":
        wantCtrl = true;
        break;
      case "shift":
        wantShift = true;
        break;
      case "alt":
        wantAlt = true;
        break;
      case "meta":
        wantMeta = true;
        break;
      case "primary":
        if (browserIsOSX.value) {
          wantMeta = true;
        } else {
          wantCtrl = true;
        }
        break;
    }
  }
  return args.altKey === wantAlt && args.ctrlKey === wantCtrl && args.shiftKey === wantShift && args.metaKey === wantMeta;
}

// vendor/glide-data-grid/dist/esm/internal/data-grid/use-selection-behavior.js
init_data_grid_types();
import React16 from "react";
function useSelectionBehavior(gridSelection, setGridSelection, rangeBehavior, columnBehavior, rowBehavior, rangeSelect, rangeSelectionColumnSpanning) {
  const setCurrent = React16.useCallback((value, expand, append, trigger) => {
    if ((rangeSelect === "cell" || rangeSelect === "multi-cell") && value !== void 0) {
      value = {
        ...value,
        range: {
          x: value.cell[0],
          y: value.cell[1],
          width: 1,
          height: 1
        }
      };
    }
    if (!rangeSelectionColumnSpanning && value !== void 0 && value.range.width > 1) {
      value = {
        ...value,
        range: {
          ...value.range,
          width: 1,
          x: value.cell[0]
        }
      };
    }
    const rangeMixable = rangeBehavior === "mixed" && (append || trigger === "drag") || rangeBehavior === "additive";
    const allowColumnCoSelect = (columnBehavior === "mixed" || columnBehavior === "additive") && rangeMixable;
    const allowRowCoSelect = (rowBehavior === "mixed" || rowBehavior === "additive") && rangeMixable;
    let newVal = {
      current: value === void 0 ? void 0 : {
        ...value,
        rangeStack: trigger === "drag" ? gridSelection.current?.rangeStack ?? [] : []
      },
      columns: allowColumnCoSelect ? gridSelection.columns : CompactSelection.empty(),
      rows: allowRowCoSelect ? gridSelection.rows : CompactSelection.empty()
    };
    const addLastRange = append && (rangeSelect === "multi-rect" || rangeSelect === "multi-cell");
    if (addLastRange && newVal.current !== void 0 && gridSelection.current !== void 0) {
      newVal = {
        ...newVal,
        current: {
          ...newVal.current,
          rangeStack: [...gridSelection.current.rangeStack, gridSelection.current.range]
        }
      };
    }
    setGridSelection(newVal, expand);
  }, [
    columnBehavior,
    gridSelection,
    rangeBehavior,
    rangeSelect,
    rangeSelectionColumnSpanning,
    rowBehavior,
    setGridSelection
  ]);
  const setSelectedRows = React16.useCallback((newRows, append, allowMixed) => {
    newRows = newRows ?? gridSelection.rows;
    if (append !== void 0) {
      newRows = newRows.add(append);
    }
    let newVal;
    if (rowBehavior === "exclusive" && newRows.length > 0) {
      newVal = {
        current: void 0,
        columns: CompactSelection.empty(),
        rows: newRows
      };
    } else {
      const rangeMixed = allowMixed && rangeBehavior === "mixed" || rangeBehavior === "additive";
      const columnMixed = allowMixed && columnBehavior === "mixed" || columnBehavior === "additive";
      const current = !rangeMixed ? void 0 : gridSelection.current;
      newVal = {
        current,
        columns: columnMixed ? gridSelection.columns : CompactSelection.empty(),
        rows: newRows
      };
    }
    setGridSelection(newVal, false);
  }, [columnBehavior, gridSelection, rangeBehavior, rowBehavior, setGridSelection]);
  const setSelectedColumns = React16.useCallback((newCols, append, allowMixed) => {
    newCols = newCols ?? gridSelection.columns;
    if (append !== void 0) {
      newCols = newCols.add(append);
    }
    let newVal;
    if (columnBehavior === "exclusive" && newCols.length > 0) {
      newVal = {
        current: void 0,
        rows: CompactSelection.empty(),
        columns: newCols
      };
    } else {
      const rangeMixed = allowMixed && rangeBehavior === "mixed" || rangeBehavior === "additive";
      const rowMixed = allowMixed && rowBehavior === "mixed" || rowBehavior === "additive";
      const current = !rangeMixed ? void 0 : gridSelection.current;
      newVal = {
        current,
        rows: rowMixed ? gridSelection.rows : CompactSelection.empty(),
        columns: newCols
      };
    }
    setGridSelection(newVal, false);
  }, [columnBehavior, gridSelection, rangeBehavior, rowBehavior, setGridSelection]);
  return [setCurrent, setSelectedRows, setSelectedColumns];
}

// vendor/glide-data-grid/dist/esm/data-editor/use-cells-for-selection.js
init_data_grid_types();
import * as React17 from "react";
function useCellsForSelection(getCellsForSelectionIn, getCellContent, rowMarkerOffset, abortController, rows) {
  const getCellsForSelectionDirectWhenValid = React17.useCallback((rect) => {
    if (getCellsForSelectionIn === true) {
      const result = [];
      for (let y2 = rect.y; y2 < rect.y + rect.height; y2++) {
        const row = [];
        for (let x2 = rect.x; x2 < rect.x + rect.width; x2++) {
          if (x2 < 0 || y2 >= rows) {
            row.push({
              kind: GridCellKind.Loading,
              allowOverlay: false
            });
          } else {
            row.push(getCellContent([x2, y2]));
          }
        }
        result.push(row);
      }
      return result;
    }
    return getCellsForSelectionIn?.(rect, abortController.signal) ?? [];
  }, [abortController.signal, getCellContent, getCellsForSelectionIn, rows]);
  const getCellsForSelectionDirect = getCellsForSelectionIn !== void 0 ? getCellsForSelectionDirectWhenValid : void 0;
  const getCellsForSelectionMangled = React17.useCallback((rect) => {
    if (getCellsForSelectionDirect === void 0)
      return [];
    const newRect = {
      ...rect,
      x: rect.x - rowMarkerOffset
    };
    if (newRect.x < 0) {
      newRect.x = 0;
      newRect.width--;
      const r = getCellsForSelectionDirect(newRect, abortController.signal);
      if (typeof r === "function") {
        return async () => (
          // eslint-disable-next-line unicorn/no-await-expression-member
          (await r()).map((row) => [
            { kind: GridCellKind.Loading, allowOverlay: false },
            ...row
          ])
        );
      }
      return r.map((row) => [{ kind: GridCellKind.Loading, allowOverlay: false }, ...row]);
    }
    return getCellsForSelectionDirect(newRect, abortController.signal);
  }, [abortController.signal, getCellsForSelectionDirect, rowMarkerOffset]);
  const getCellsForSelection = getCellsForSelectionIn !== void 0 ? getCellsForSelectionMangled : void 0;
  return [getCellsForSelection, getCellsForSelectionDirect];
}

// vendor/glide-data-grid/dist/esm/data-editor/copy-paste.js
init_support();
init_data_grid_types();
function convertCellToBuffer(cell) {
  if (cell.copyData !== void 0) {
    return {
      formatted: cell.copyData,
      rawValue: cell.copyData,
      format: "string",
      // Do not escape the copy value if it was explicitly specified via copyData:
      doNotEscape: true
    };
  }
  switch (cell.kind) {
    case GridCellKind.Boolean:
      return {
        formatted: cell.data === true ? "TRUE" : cell.data === false ? "FALSE" : cell.data === BooleanIndeterminate ? "INDETERMINATE" : "",
        rawValue: cell.data,
        format: "boolean"
      };
    case GridCellKind.Custom:
      return {
        formatted: cell.copyData,
        rawValue: cell.copyData,
        format: "string"
      };
    case GridCellKind.Image:
    case GridCellKind.Bubble:
      return {
        formatted: cell.data,
        rawValue: cell.data,
        format: "string-array"
      };
    case GridCellKind.Drilldown:
      return {
        formatted: cell.data.map((x2) => x2.text),
        rawValue: cell.data.map((x2) => x2.text),
        format: "string-array"
      };
    case GridCellKind.Text:
      return {
        formatted: cell.displayData ?? cell.data,
        rawValue: cell.data,
        format: "string"
      };
    case GridCellKind.Uri:
      return {
        formatted: cell.displayData ?? cell.data,
        rawValue: cell.data,
        format: "url"
      };
    case GridCellKind.Markdown:
    case GridCellKind.RowID:
      return {
        formatted: cell.data,
        rawValue: cell.data,
        format: "string"
      };
    case GridCellKind.Number:
      return {
        formatted: cell.displayData,
        rawValue: cell.data,
        format: "number"
      };
    case GridCellKind.Loading:
      return {
        formatted: "#LOADING",
        rawValue: "",
        format: "string"
      };
    case GridCellKind.Protected:
      return {
        formatted: "************",
        rawValue: "",
        format: "string"
      };
    default:
      assertNever(cell);
  }
}
function createBufferFromGridCells(cells, columnIndexes) {
  const copyBuffer = cells.map((row, index) => {
    const mappedIndex = columnIndexes[index];
    return row.map((cell) => {
      if (cell.span !== void 0 && cell.span[0] !== mappedIndex)
        return {
          formatted: "",
          rawValue: "",
          format: "string"
        };
      return convertCellToBuffer(cell);
    });
  });
  return copyBuffer;
}
function escapeIfNeeded(str, withComma) {
  if ((withComma ? /[\t\n",]/ : /[\t\n"]/).test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function createTextBuffer(copyBuffer) {
  const lines = [];
  for (const row of copyBuffer) {
    const line = [];
    for (const cell of row) {
      if (cell.format === "url") {
        line.push(cell.rawValue?.toString() ?? "");
      } else if (cell.format === "string-array") {
        line.push(cell.formatted.map((x2) => escapeIfNeeded(x2, true)).join(","));
      } else {
        line.push(cell.doNotEscape === true ? cell.formatted : escapeIfNeeded(cell.formatted, false));
      }
    }
    lines.push(line.join("	"));
  }
  return lines.join("\n");
}
function formatHtmlTextContent(text) {
  return text.replace(/\t/g, "    ").replace(/ {2,}/g, (match) => "<span> </span>".repeat(match.length));
}
function formatHtmlAttributeContent(attrText) {
  return '"' + attrText.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '"';
}
function restoreHtmlEntities(str) {
  return str.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function createHtmlBuffer(copyBuffer) {
  const lines = [];
  lines.push(`<style type="text/css"><!--br {mso-data-placement:same-cell;}--></style>`, "<table><tbody>");
  for (const row of copyBuffer) {
    lines.push("<tr>");
    for (const cell of row) {
      const formatStr = `gdg-format="${cell.format}"`;
      if (cell.format === "url") {
        lines.push(`<td ${formatStr}><a href="${cell.rawValue}">${formatHtmlTextContent(cell.formatted)}</a></td>`);
      } else {
        if (cell.format === "string-array") {
          lines.push(`<td ${formatStr}><ol>${cell.formatted.map((x2, ind) => `<li gdg-raw-value=${formatHtmlAttributeContent(cell.rawValue[ind])}>` + formatHtmlTextContent(x2) + "</li>").join("")}</ol></td>`);
        } else {
          lines.push(`<td gdg-raw-value=${formatHtmlAttributeContent(cell.rawValue?.toString() ?? "")} ${formatStr}>${formatHtmlTextContent(cell.formatted)}</td>`);
        }
      }
    }
    lines.push("</tr>");
  }
  lines.push("</tbody></table>");
  return lines.join("");
}
function getCopyBufferContents(cells, columnIndexes) {
  const copyBuffer = createBufferFromGridCells(cells, columnIndexes);
  const textPlain = createTextBuffer(copyBuffer);
  const textHtml = createHtmlBuffer(copyBuffer);
  return {
    textPlain,
    textHtml
  };
}
function decodeHTML(html) {
  const fragment = document.createElement("html");
  fragment.innerHTML = html.replace(/&nbsp;/g, " ");
  const tableEl = fragment.querySelector("table");
  if (tableEl === null)
    return void 0;
  const walkEl = [tableEl];
  const result = [];
  let current;
  while (walkEl.length > 0) {
    const el = walkEl.pop();
    if (el === void 0)
      break;
    if (el instanceof HTMLTableElement || el.nodeName === "TBODY") {
      walkEl.push(...[...el.children].reverse());
    } else if (el instanceof HTMLTableRowElement) {
      if (current !== void 0) {
        result.push(current);
      }
      current = [];
      walkEl.push(...[...el.children].reverse());
    } else if (el instanceof HTMLTableCellElement) {
      const clone = el.cloneNode(true);
      const firstTagIsPara = clone.children.length === 1 && clone.children[0].nodeName === "P";
      const para = firstTagIsPara ? clone.children[0] : null;
      const isAppleNumbers = para?.children.length === 1 && para.children[0].nodeName === "FONT";
      const brs = clone.querySelectorAll("br");
      for (const br of brs) {
        br.replaceWith("\n");
      }
      const attributeValue = clone.getAttribute("gdg-raw-value");
      const formatValue = clone.getAttribute("gdg-format") ?? "string";
      if (clone.querySelector("a") !== null) {
        current?.push({
          // raw value is the href
          rawValue: clone.querySelector("a")?.getAttribute("href") ?? "",
          formatted: clone.textContent ?? "",
          format: formatValue
        });
      } else if (clone.querySelector("ol") !== null) {
        const rawValues = clone.querySelectorAll("li");
        current?.push({
          rawValue: [...rawValues].map((x2) => x2.getAttribute("gdg-raw-value") ?? ""),
          formatted: [...rawValues].map((x2) => x2.textContent ?? ""),
          format: "string-array"
        });
      } else if (attributeValue !== null) {
        current?.push({
          rawValue: restoreHtmlEntities(attributeValue),
          formatted: clone.textContent ?? "",
          format: formatValue
        });
      } else {
        let textContent = clone.textContent ?? "";
        if (isAppleNumbers) {
          textContent = textContent.replace(/\n(?!\n)/g, "");
        }
        current?.push({
          rawValue: textContent ?? "",
          formatted: textContent ?? "",
          format: formatValue
        });
      }
    }
  }
  if (current !== void 0) {
    result.push(current);
  }
  return result;
}

// vendor/glide-data-grid/dist/esm/data-editor/data-editor-fns.js
function expandSelection(newVal, getCellsForSelection, rowMarkerOffset, spanRangeBehavior, abortController) {
  const origVal = newVal;
  if (spanRangeBehavior === "allowPartial" || newVal.current === void 0 || getCellsForSelection === void 0)
    return newVal;
  let isFilled = false;
  do {
    if (newVal?.current === void 0)
      break;
    const r = newVal.current?.range;
    const cells = [];
    if (r.width > 2) {
      const leftCells = getCellsForSelection({
        x: r.x,
        y: r.y,
        width: 1,
        height: r.height
      }, abortController.signal);
      if (typeof leftCells === "function") {
        return origVal;
      }
      cells.push(...leftCells);
      const rightCells = getCellsForSelection({
        x: r.x + r.width - 1,
        y: r.y,
        width: 1,
        height: r.height
      }, abortController.signal);
      if (typeof rightCells === "function") {
        return origVal;
      }
      cells.push(...rightCells);
    } else {
      const rCells = getCellsForSelection({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height
      }, abortController.signal);
      if (typeof rCells === "function") {
        return origVal;
      }
      cells.push(...rCells);
    }
    let left = r.x - rowMarkerOffset;
    let right = r.x + r.width - 1 - rowMarkerOffset;
    for (const row of cells) {
      for (const cell of row) {
        if (cell.span === void 0)
          continue;
        left = Math.min(cell.span[0], left);
        right = Math.max(cell.span[1], right);
      }
    }
    if (left === r.x - rowMarkerOffset && right === r.x + r.width - 1 - rowMarkerOffset) {
      isFilled = true;
    } else {
      newVal = {
        current: {
          cell: newVal.current.cell ?? [0, 0],
          range: {
            x: left + rowMarkerOffset,
            y: r.y,
            width: right - left + 1,
            height: r.height
          },
          rangeStack: newVal.current.rangeStack
        },
        columns: newVal.columns,
        rows: newVal.rows
      };
    }
  } while (!isFilled);
  return newVal;
}
function descape(s) {
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/""/g, '"');
  }
  return s;
}
function unquote(str) {
  let State;
  (function(State2) {
    State2[State2["None"] = 0] = "None";
    State2[State2["inString"] = 1] = "inString";
    State2[State2["inStringPostQuote"] = 2] = "inStringPostQuote";
  })(State || (State = {}));
  const result = [];
  let current = [];
  let start = 0;
  let state = State.None;
  str = str.replace(/\r\n/g, "\n");
  let index = 0;
  for (const char of str) {
    switch (state) {
      case State.None:
        if (char === "	" || char === "\n") {
          current.push(str.slice(start, index));
          start = index + 1;
          if (char === "\n") {
            result.push(current);
            current = [];
          }
        } else if (char === `"`) {
          state = State.inString;
        }
        break;
      case State.inString:
        if (char === `"`) {
          state = State.inStringPostQuote;
        }
        break;
      case State.inStringPostQuote:
        if (char === '"') {
          state = State.inString;
        } else if (char === "	" || char === "\n") {
          current.push(descape(str.slice(start, index)));
          start = index + 1;
          if (char === "\n") {
            result.push(current);
            current = [];
          }
          state = State.None;
        } else {
          state = State.None;
        }
        break;
    }
    index++;
  }
  if (start < str.length) {
    current.push(descape(str.slice(start, str.length)));
  }
  result.push(current);
  return result.map((r) => r.map((c) => ({ rawValue: c, formatted: c, format: "string" })));
}
function copyToClipboard(cells, columnIndexes, e) {
  const copyBuffer = getCopyBufferContents(cells, columnIndexes);
  const copyWithWriteText = (s) => {
    void window.navigator.clipboard?.writeText(s);
  };
  const copyWithWrite = (s, html) => {
    if (window.navigator.clipboard?.write === void 0)
      return false;
    void window.navigator.clipboard.write([
      new ClipboardItem({
        // eslint-disable-next-line sonarjs/no-duplicate-string
        "text/plain": new Blob([s], { type: "text/plain" }),
        "text/html": new Blob([html], {
          type: "text/html"
        })
      })
    ]);
    return true;
  };
  const copyWithClipboardData = (s, html) => {
    try {
      if (e === void 0 || e.clipboardData === null)
        throw new Error("No clipboard data");
      e?.clipboardData?.setData("text/plain", s);
      e?.clipboardData?.setData("text/html", html);
    } catch {
      if (!copyWithWrite(s, html)) {
        copyWithWriteText(s);
      }
    }
  };
  if (window.navigator.clipboard?.write !== void 0 || e?.clipboardData !== void 0) {
    void copyWithClipboardData(copyBuffer.textPlain, copyBuffer.textHtml);
  } else {
    void copyWithWriteText(copyBuffer.textPlain);
  }
  e?.preventDefault();
}
function toggleBoolean(data) {
  return data !== true;
}

// vendor/glide-data-grid/dist/esm/internal/data-editor-container/data-grid-container.js
init_dist2();
import * as React18 from "react";
function toCss(x2) {
  if (typeof x2 === "string") return x2;
  return `${x2}px`;
}
var _exp3 = () => (p2) => p2.innerWidth;
var _exp22 = () => (p2) => p2.innerHeight;
var Wrapper = /* @__PURE__ */ styled_default("div")({
  name: "Wrapper",
  class: "gdg-wmyidgi",
  propsAsIs: false,
  vars: {
    "wmyidgi-0": [_exp3()],
    "wmyidgi-1": [_exp22()]
  }
});
var DataEditorContainer = (p2) => {
  const {
    inWidth,
    inHeight,
    children,
    ...rest
  } = p2;
  return React18.createElement(Wrapper, {
    innerHeight: toCss(inHeight),
    innerWidth: toCss(inWidth),
    ...rest
  }, children);
};

// vendor/glide-data-grid/dist/esm/data-editor/use-autoscroll.js
import React19 from "react";
var maxPxPerMs = 2;
var msToFullSpeed = 1300;
function useAutoscroll(scrollDirection, scrollRef, onScroll) {
  const speedScalar = React19.useRef(0);
  const [xDir, yDir] = scrollDirection ?? [0, 0];
  React19.useEffect(() => {
    if (xDir === 0 && yDir === 0) {
      speedScalar.current = 0;
      return;
    }
    let cancelled = false;
    let lastTime = 0;
    const scrollFn = (curTime) => {
      if (cancelled)
        return;
      if (lastTime === 0) {
        lastTime = curTime;
      } else {
        const step = curTime - lastTime;
        speedScalar.current = Math.min(1, speedScalar.current + step / msToFullSpeed);
        const motion = speedScalar.current ** 1.618 * step * maxPxPerMs;
        scrollRef.current?.scrollBy(xDir * motion, yDir * motion);
        lastTime = curTime;
        onScroll?.();
      }
      window.requestAnimationFrame(scrollFn);
    };
    window.requestAnimationFrame(scrollFn);
    return () => {
      cancelled = true;
    };
  }, [scrollRef, xDir, yDir, onScroll]);
}

// vendor/glide-data-grid/dist/esm/data-editor/use-rem-adjuster.js
init_styles();
import React20 from "react";
function useRemAdjuster({ rowHeight: rowHeightIn, headerHeight: headerHeightIn, groupHeaderHeight: groupHeaderHeightIn, theme: themeIn, overscrollX: overscrollXIn, overscrollY: overscrollYIn, scaleToRem, remSize }) {
  const [rowHeight, headerHeight, groupHeaderHeight, theme, overscrollX, overscrollY] = React20.useMemo(() => {
    if (!scaleToRem || remSize === 16)
      return [rowHeightIn, headerHeightIn, groupHeaderHeightIn, themeIn, overscrollXIn, overscrollYIn];
    const scaler = remSize / 16;
    const rh = rowHeightIn;
    const bt = getDataEditorTheme();
    return [
      typeof rh === "number" ? rh * scaler : (n) => Math.ceil(rh(n) * scaler),
      Math.ceil(headerHeightIn * scaler),
      Math.ceil(groupHeaderHeightIn * scaler),
      {
        ...themeIn,
        headerIconSize: (themeIn?.headerIconSize ?? bt.headerIconSize) * scaler,
        cellHorizontalPadding: (themeIn?.cellHorizontalPadding ?? bt.cellHorizontalPadding) * scaler,
        cellVerticalPadding: (themeIn?.cellVerticalPadding ?? bt.cellVerticalPadding) * scaler
      },
      Math.ceil((overscrollXIn ?? 0) * scaler),
      Math.ceil((overscrollYIn ?? 0) * scaler)
    ];
  }, [groupHeaderHeightIn, headerHeightIn, overscrollXIn, overscrollYIn, remSize, rowHeightIn, scaleToRem, themeIn]);
  return { rowHeight, headerHeight, groupHeaderHeight, theme, overscrollX, overscrollY };
}

// vendor/glide-data-grid/dist/esm/data-editor/data-editor.js
init_color_parser();

// vendor/glide-data-grid/dist/esm/data-editor/data-editor-keybindings.js
import React21 from "react";
var keybindingDefaults = {
  downFill: false,
  rightFill: false,
  clear: true,
  closeOverlay: true,
  acceptOverlayDown: true,
  acceptOverlayUp: true,
  acceptOverlayLeft: true,
  acceptOverlayRight: true,
  copy: true,
  paste: true,
  cut: true,
  search: false,
  delete: true,
  activateCell: true,
  scrollToSelectedCell: true,
  goToFirstCell: true,
  goToFirstColumn: true,
  goToFirstRow: true,
  goToLastCell: true,
  goToLastColumn: true,
  goToLastRow: true,
  goToNextPage: true,
  goToPreviousPage: true,
  selectToFirstCell: true,
  selectToFirstColumn: true,
  selectToFirstRow: true,
  selectToLastCell: true,
  selectToLastColumn: true,
  selectToLastRow: true,
  selectAll: true,
  selectRow: true,
  selectColumn: true,
  goUpCell: true,
  goRightCell: true,
  goDownCell: true,
  goLeftCell: true,
  goUpCellRetainSelection: true,
  goRightCellRetainSelection: true,
  goDownCellRetainSelection: true,
  goLeftCellRetainSelection: true,
  selectGrowUp: true,
  selectGrowRight: true,
  selectGrowDown: true,
  selectGrowLeft: true
};
function realizeKeybind(keybind, defaultVal) {
  if (keybind === true)
    return defaultVal;
  if (keybind === false)
    return "";
  return keybind;
}
function realizeKeybinds(keybinds) {
  const isOSX = browserIsOSX.value;
  return {
    activateCell: realizeKeybind(keybinds.activateCell, " |Enter|shift+Enter"),
    clear: realizeKeybind(keybinds.clear, "any+Escape"),
    closeOverlay: realizeKeybind(keybinds.closeOverlay, "any+Escape"),
    acceptOverlayDown: realizeKeybind(keybinds.acceptOverlayDown, "Enter"),
    acceptOverlayUp: realizeKeybind(keybinds.acceptOverlayUp, "shift+Enter"),
    acceptOverlayLeft: realizeKeybind(keybinds.acceptOverlayLeft, "shift+Tab"),
    acceptOverlayRight: realizeKeybind(keybinds.acceptOverlayRight, "Tab"),
    copy: keybinds.copy,
    cut: keybinds.cut,
    delete: realizeKeybind(keybinds.delete, isOSX ? "Backspace|Delete" : "Delete"),
    downFill: realizeKeybind(keybinds.downFill, "primary+_68"),
    scrollToSelectedCell: realizeKeybind(keybinds.scrollToSelectedCell, "primary+Enter"),
    goDownCell: realizeKeybind(keybinds.goDownCell, "ArrowDown"),
    goDownCellRetainSelection: realizeKeybind(keybinds.goDownCellRetainSelection, "alt+ArrowDown"),
    goLeftCell: realizeKeybind(keybinds.goLeftCell, "ArrowLeft|shift+Tab"),
    goLeftCellRetainSelection: realizeKeybind(keybinds.goLeftCellRetainSelection, "alt+ArrowLeft"),
    goRightCell: realizeKeybind(keybinds.goRightCell, "ArrowRight|Tab"),
    goRightCellRetainSelection: realizeKeybind(keybinds.goRightCellRetainSelection, "alt+ArrowRight"),
    goUpCell: realizeKeybind(keybinds.goUpCell, "ArrowUp"),
    goUpCellRetainSelection: realizeKeybind(keybinds.goUpCellRetainSelection, "alt+ArrowUp"),
    goToFirstCell: realizeKeybind(keybinds.goToFirstCell, "primary+Home"),
    goToFirstColumn: realizeKeybind(keybinds.goToFirstColumn, "Home|primary+ArrowLeft"),
    goToFirstRow: realizeKeybind(keybinds.goToFirstRow, "primary+ArrowUp"),
    goToLastCell: realizeKeybind(keybinds.goToLastCell, "primary+End"),
    goToLastColumn: realizeKeybind(keybinds.goToLastColumn, "End|primary+ArrowRight"),
    goToLastRow: realizeKeybind(keybinds.goToLastRow, "primary+ArrowDown"),
    goToNextPage: realizeKeybind(keybinds.goToNextPage, "PageDown"),
    goToPreviousPage: realizeKeybind(keybinds.goToPreviousPage, "PageUp"),
    paste: keybinds.paste,
    rightFill: realizeKeybind(keybinds.rightFill, "primary+_82"),
    search: realizeKeybind(keybinds.search, "primary+f"),
    selectAll: realizeKeybind(keybinds.selectAll, "primary+a"),
    selectColumn: realizeKeybind(keybinds.selectColumn, "ctrl+ "),
    selectGrowDown: realizeKeybind(keybinds.selectGrowDown, "shift+ArrowDown"),
    selectGrowLeft: realizeKeybind(keybinds.selectGrowLeft, "shift+ArrowLeft"),
    selectGrowRight: realizeKeybind(keybinds.selectGrowRight, "shift+ArrowRight"),
    selectGrowUp: realizeKeybind(keybinds.selectGrowUp, "shift+ArrowUp"),
    selectRow: realizeKeybind(keybinds.selectRow, "shift+ "),
    selectToFirstCell: realizeKeybind(keybinds.selectToFirstCell, "primary+shift+Home"),
    selectToFirstColumn: realizeKeybind(keybinds.selectToFirstColumn, "primary+shift+ArrowLeft"),
    selectToFirstRow: realizeKeybind(keybinds.selectToFirstRow, "primary+shift+ArrowUp"),
    selectToLastCell: realizeKeybind(keybinds.selectToLastCell, "primary+shift+End"),
    selectToLastColumn: realizeKeybind(keybinds.selectToLastColumn, "primary+shift+ArrowRight"),
    selectToLastRow: realizeKeybind(keybinds.selectToLastRow, "primary+shift+ArrowDown")
  };
}
function useKeybindingsWithDefaults(keybindingsIn) {
  const keys = useDeepMemo(keybindingsIn);
  return React21.useMemo(() => {
    if (keys === void 0)
      return realizeKeybinds(keybindingDefaults);
    const withBackCompatApplied = {
      ...keys,
      goToNextPage: keys?.goToNextPage ?? keys?.pageDown ?? keybindingDefaults.goToNextPage,
      goToPreviousPage: keys?.goToPreviousPage ?? keys?.pageUp ?? keybindingDefaults.goToPreviousPage,
      goToFirstCell: keys?.goToFirstCell ?? keys?.first ?? keybindingDefaults.goToFirstCell,
      goToLastCell: keys?.goToLastCell ?? keys?.last ?? keybindingDefaults.goToLastCell,
      selectToFirstCell: keys?.selectToFirstCell ?? keys?.first ?? keybindingDefaults.selectToFirstCell,
      selectToLastCell: keys?.selectToLastCell ?? keys?.last ?? keybindingDefaults.selectToLastCell
    };
    return realizeKeybinds({
      ...keybindingDefaults,
      ...withBackCompatApplied
    });
  }, [keys]);
}

// vendor/glide-data-grid/dist/esm/data-editor/row-grouping.js
import React22 from "react";
function expandRowGroups(groups) {
  function processGroup(group, depth, path) {
    if (typeof group === "number") {
      return {
        headerIndex: group,
        isCollapsed: false,
        depth,
        path
      };
    }
    const expandedGroup = {
      headerIndex: group.headerIndex,
      isCollapsed: group.isCollapsed,
      depth,
      path
    };
    if (group.subGroups !== void 0) {
      expandedGroup.subGroups = group.subGroups.map((x2, ind) => processGroup(x2, depth + 1, [...path, ind])).sort((a, b3) => a.headerIndex - b3.headerIndex);
    }
    return expandedGroup;
  }
  const expanded = groups.map((group, i) => processGroup(group, 0, [i]));
  return expanded.sort((a, b3) => a.headerIndex - b3.headerIndex);
}
function flattenRowGroups(rowGrouping, rows) {
  const flattened = [];
  function processGroup(group, nextHeaderIndex, skipChildren = false) {
    let rowsInGroup = nextHeaderIndex !== null ? nextHeaderIndex - group.headerIndex : rows - group.headerIndex;
    if (group.subGroups !== void 0) {
      rowsInGroup = group.subGroups[0].headerIndex - group.headerIndex;
    }
    rowsInGroup--;
    flattened.push({
      rowIndex: -1,
      // we will fill this in later
      headerIndex: group.headerIndex,
      contentIndex: -1,
      // we will fill this in later
      skip: skipChildren,
      isCollapsed: group.isCollapsed,
      depth: group.depth,
      path: group.path,
      rows: rowsInGroup
    });
    if (group.subGroups) {
      for (let i = 0; i < group.subGroups.length; i++) {
        const nextSubHeaderIndex = i < group.subGroups.length - 1 ? group.subGroups[i + 1].headerIndex : nextHeaderIndex;
        processGroup(group.subGroups[i], nextSubHeaderIndex, skipChildren || group.isCollapsed);
      }
    }
  }
  const expandedGroups = expandRowGroups(rowGrouping.groups);
  for (let i = 0; i < expandedGroups.length; i++) {
    const nextHeaderIndex = i < expandedGroups.length - 1 ? expandedGroups[i + 1].headerIndex : null;
    processGroup(expandedGroups[i], nextHeaderIndex);
  }
  let rowIndex = 0;
  let contentIndex = 0;
  for (const g of flattened) {
    g.contentIndex = contentIndex;
    contentIndex += g.rows;
    g.rowIndex = rowIndex;
    rowIndex += g.isCollapsed ? 1 : g.rows + 1;
  }
  return flattened.filter((x2) => x2.skip === false).map((x2) => {
    const { skip, ...rest } = x2;
    return rest;
  });
}
function mapRowIndexToPath(row, flattenedRowGroups) {
  if (flattenedRowGroups === void 0 || flattenRowGroups.length === 0)
    return {
      path: [row],
      originalIndex: row,
      isGroupHeader: false,
      groupIndex: row,
      contentIndex: row,
      groupRows: -1
    };
  let toGo = row;
  for (const group of flattenedRowGroups) {
    if (toGo === 0)
      return {
        path: [...group.path, -1],
        originalIndex: group.headerIndex,
        isGroupHeader: true,
        groupIndex: -1,
        contentIndex: -1,
        groupRows: group.rows
      };
    if (!group.isCollapsed) {
      if (toGo <= group.rows)
        return {
          path: [...group.path, toGo - 1],
          originalIndex: group.headerIndex + toGo,
          isGroupHeader: false,
          groupIndex: toGo - 1,
          contentIndex: group.contentIndex + toGo - 1,
          groupRows: group.rows
        };
      toGo = toGo - group.rows - 1;
    } else {
      toGo--;
    }
  }
  return {
    path: [row],
    originalIndex: row,
    isGroupHeader: false,
    groupIndex: row,
    contentIndex: row,
    groupRows: -1
  };
}
function useRowGroupingInner(options, rows, rowHeightIn, getRowThemeOverrideIn) {
  const flattenedRowGroups = React22.useMemo(() => options === void 0 ? void 0 : flattenRowGroups(options, rows), [options, rows]);
  const flattenedRowGroupsMap = React22.useMemo(() => {
    return flattenedRowGroups?.reduce((acc, group) => {
      acc[group.rowIndex] = group;
      return acc;
    }, {});
  }, [flattenedRowGroups]);
  const effectiveRows = React22.useMemo(() => {
    if (flattenedRowGroups === void 0)
      return rows;
    return flattenedRowGroups.reduce((acc, group) => acc + (group.isCollapsed ? 1 : group.rows + 1), 0);
  }, [flattenedRowGroups, rows]);
  const rowHeight = React22.useMemo(() => {
    if (options === void 0)
      return rowHeightIn;
    if (typeof rowHeightIn === "number" && options.height === rowHeightIn)
      return rowHeightIn;
    return (rowIndex) => {
      if (flattenedRowGroupsMap?.[rowIndex])
        return options.height;
      return typeof rowHeightIn === "number" ? rowHeightIn : rowHeightIn(rowIndex);
    };
  }, [flattenedRowGroupsMap, options, rowHeightIn]);
  const rowNumberMapperOut = React22.useCallback((row) => {
    if (flattenedRowGroups === void 0)
      return row;
    let toGo = row;
    for (const group of flattenedRowGroups) {
      if (toGo === 0)
        return void 0;
      toGo--;
      if (!group.isCollapsed) {
        if (toGo < group.rows)
          return group.contentIndex + toGo;
        toGo -= group.rows;
      }
    }
    return row;
  }, [flattenedRowGroups]);
  const getRowThemeOverride = whenDefined(getRowThemeOverrideIn ?? options?.themeOverride, React22.useCallback((row) => {
    if (options === void 0)
      return getRowThemeOverrideIn?.(row, row, row);
    if (getRowThemeOverrideIn === void 0 && options?.themeOverride === void 0)
      return void 0;
    const { isGroupHeader, contentIndex, groupIndex } = mapRowIndexToPath(row, flattenedRowGroups);
    if (isGroupHeader)
      return options.themeOverride;
    return getRowThemeOverrideIn?.(row, groupIndex, contentIndex);
  }, [flattenedRowGroups, getRowThemeOverrideIn, options]));
  if (options === void 0)
    return {
      rowHeight,
      rows,
      rowNumberMapper: rowNumberMapperOut,
      getRowThemeOverride
    };
  return {
    rowHeight,
    rows: effectiveRows,
    rowNumberMapper: rowNumberMapperOut,
    getRowThemeOverride
  };
}

// vendor/glide-data-grid/dist/esm/data-editor/row-grouping-api.js
import React23 from "react";
function useRowGrouping(options, rows) {
  const flattenedRowGroups = React23.useMemo(() => options === void 0 ? void 0 : flattenRowGroups(options, rows), [options, rows]);
  return {
    getRowGroupingForPath,
    updateRowGroupingByPath,
    mapper: React23.useCallback((itemOrRow) => {
      if (typeof itemOrRow === "number") {
        return mapRowIndexToPath(itemOrRow, flattenedRowGroups);
      }
      const r = mapRowIndexToPath(itemOrRow[1], flattenedRowGroups);
      return {
        ...r,
        originalIndex: [itemOrRow[0], r.originalIndex]
      };
    }, [flattenedRowGroups])
  };
}
function updateRowGroupingByPath(rowGrouping, path, update) {
  const [index, ...rest] = path;
  if (rest[0] === -1) {
    return rowGrouping.map((group, i) => i === index ? { ...group, ...update } : group);
  }
  return rowGrouping.map((group, i) => i === index ? { ...group, subGroups: updateRowGroupingByPath(group.subGroups ?? [], rest, update) } : group);
}
function getRowGroupingForPath(rowGrouping, path) {
  const [index, ...rest] = path;
  if (rest[0] === -1) {
    return rowGrouping[index];
  }
  return getRowGroupingForPath(rowGrouping[index].subGroups ?? [], rest);
}

// vendor/glide-data-grid/dist/esm/data-editor/use-initial-scroll-offset.js
import * as React24 from "react";
function useCallbackRef(initialValue, callback) {
  const [ref] = React24.useState(() => ({
    value: initialValue,
    callback,
    facade: {
      get current() {
        return ref.value;
      },
      set current(value) {
        const last = ref.value;
        if (last !== value) {
          ref.value = value;
          ref.callback(value, last);
        }
      }
    }
  }));
  ref.callback = callback;
  return ref.facade;
}
function useInitialScrollOffset(scrollOffsetX, scrollOffsetY, rowHeight, visibleRegionRef, onDidScroll) {
  const [visibleRegionY, visibleRegionTy] = React24.useMemo(() => {
    return [
      scrollOffsetY !== void 0 && typeof rowHeight === "number" ? Math.floor(scrollOffsetY / rowHeight) : 0,
      scrollOffsetY !== void 0 && typeof rowHeight === "number" ? -(scrollOffsetY % rowHeight) : 0
    ];
  }, [scrollOffsetY, rowHeight]);
  const visibleRegionInput = React24.useMemo(() => ({
    x: visibleRegionRef.current.x,
    y: visibleRegionY,
    width: visibleRegionRef.current.width ?? 1,
    height: visibleRegionRef.current.height ?? 1,
    // tx: 'TODO',
    ty: visibleRegionTy
  }), [visibleRegionRef, visibleRegionTy, visibleRegionY]);
  const [visibleRegion, setVisibleRegion, empty2] = useStateWithReactiveInput(visibleRegionInput);
  const onDidScrollRef = React24.useRef(onDidScroll);
  onDidScrollRef.current = onDidScroll;
  const scrollRef = useCallbackRef(null, (newVal) => {
    if (newVal !== null && scrollOffsetY !== void 0) {
      newVal.scrollTop = scrollOffsetY;
    } else if (newVal !== null && scrollOffsetX !== void 0) {
      newVal.scrollLeft = scrollOffsetX;
    }
  });
  const vScrollReady = (visibleRegion.height ?? 1) > 1;
  React24.useLayoutEffect(() => {
    if (scrollOffsetY !== void 0 && scrollRef.current !== null && vScrollReady) {
      if (scrollRef.current.scrollTop === scrollOffsetY)
        return;
      scrollRef.current.scrollTop = scrollOffsetY;
      if (scrollRef.current.scrollTop !== scrollOffsetY) {
        empty2();
      }
      onDidScrollRef.current();
    }
  }, [scrollOffsetY, vScrollReady, empty2, scrollRef]);
  const hScrollReady = (visibleRegion.width ?? 1) > 1;
  React24.useLayoutEffect(() => {
    if (scrollOffsetX !== void 0 && scrollRef.current !== null && hScrollReady) {
      if (scrollRef.current.scrollLeft === scrollOffsetX)
        return;
      scrollRef.current.scrollLeft = scrollOffsetX;
      if (scrollRef.current.scrollLeft !== scrollOffsetX) {
        empty2();
      }
      onDidScrollRef.current();
    }
  }, [scrollOffsetX, hScrollReady, empty2, scrollRef]);
  return {
    visibleRegion,
    setVisibleRegion,
    scrollRef
  };
}

// vendor/glide-data-grid/dist/esm/data-editor/data-editor.js
var DataGridOverlayEditor2 = React27.lazy(async () => await Promise.resolve().then(() => (init_data_grid_overlay_editor(), data_grid_overlay_editor_exports)));
var idCounter = 0;
function getSpanStops(cells) {
  return (0, import_uniq.default)((0, import_flatten.default)((0, import_flatten.default)(cells).filter((c) => c.span !== void 0).map((c) => (0, import_range2.default)((c.span?.[0] ?? 0) + 1, (c.span?.[1] ?? 0) + 1))));
}
function shiftSelection(input, offset) {
  if (input === void 0 || offset === 0 || input.columns.length === 0 && input.current === void 0)
    return input;
  return {
    current: input.current === void 0 ? void 0 : {
      cell: [input.current.cell[0] + offset, input.current.cell[1]],
      range: {
        ...input.current.range,
        x: input.current.range.x + offset
      },
      rangeStack: input.current.rangeStack.map((r) => ({
        ...r,
        x: r.x + offset
      }))
    },
    rows: input.rows,
    columns: input.columns.offset(offset)
  };
}
var loadingCell2 = {
  kind: GridCellKind.Loading,
  allowOverlay: false
};
var emptyGridSelection = {
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
  current: void 0
};
var DataEditorImpl = (p2, forwardedRef) => {
  const [gridSelectionInner, setGridSelectionInner] = React27.useState(emptyGridSelection);
  const [overlay, setOverlay] = React27.useState();
  const searchInputRef = React27.useRef(null);
  const canvasRef = React27.useRef(null);
  const [mouseState, setMouseState] = React27.useState();
  const lastSent = React27.useRef();
  const safeWindow = typeof window === "undefined" ? null : window;
  const { imageEditorOverride, getRowThemeOverride: getRowThemeOverrideIn, markdownDivCreateNode, width, height, columns: columnsIn, rows: rowsIn, getCellContent, onCellClicked, onCellActivated, onFillPattern, onFinishedEditing, coercePasteValue, drawHeader: drawHeaderIn, drawCell: drawCellIn, editorBloom, onHeaderClicked, onColumnProposeMove, rangeSelectionColumnSpanning = true, spanRangeBehavior = "default", onGroupHeaderClicked, onCellContextMenu, className, onHeaderContextMenu, getCellsForSelection: getCellsForSelectionIn, onGroupHeaderContextMenu, onGroupHeaderRenamed, onCellEdited, onCellsEdited, onSearchResultsChanged: onSearchResultsChangedIn, searchResults, onSearchValueChange, searchValue, onKeyDown: onKeyDownIn, onKeyUp: onKeyUpIn, keybindings: keybindingsIn, editOnType = true, onRowAppended, onColumnAppended, onColumnMoved, validateCell: validateCellIn, highlightRegions: highlightRegionsIn, rangeSelect = "rect", columnSelect = "multi", rowSelect = "multi", rangeSelectionBlending = "exclusive", columnSelectionBlending = "exclusive", rowSelectionBlending = "exclusive", onDelete: onDeleteIn, onDragStart, onMouseMove, onPaste, copyHeaders = false, freezeColumns = 0, cellActivationBehavior = "second-click", rowSelectionMode = "auto", columnSelectionMode = "auto", onHeaderMenuClick, onHeaderIndicatorClick, getGroupDetails, rowGrouping, onSearchClose: onSearchCloseIn, onItemHovered, onSelectionCleared, showSearch: showSearchIn, onVisibleRegionChanged, gridSelection: gridSelectionOuter, onGridSelectionChange, minColumnWidth: minColumnWidthIn = 50, maxColumnWidth: maxColumnWidthIn = 500, maxColumnAutoWidth: maxColumnAutoWidthIn, provideEditor, trailingRowOptions, freezeTrailingRows = 0, allowedFillDirections = "orthogonal", scrollOffsetX, scrollOffsetY, verticalBorder, onDragOverCell, onDrop, onColumnResize: onColumnResizeIn, onColumnResizeEnd: onColumnResizeEndIn, onColumnResizeStart: onColumnResizeStartIn, customRenderers: additionalRenderers, fillHandle, experimental, fixedShadowX, fixedShadowY, headerIcons, imageWindowLoader, initialSize, isDraggable, onDragLeave, onRowMoved, overscrollX: overscrollXIn, overscrollY: overscrollYIn, preventDiagonalScrolling, rightElement, rightElementProps, trapFocus = false, smoothScrollX, smoothScrollY, scaleToRem = false, rowHeight: rowHeightIn = 34, headerHeight: headerHeightIn = 36, groupHeaderHeight: groupHeaderHeightIn = headerHeightIn, theme: themeIn, isOutsideClick, renderers, resizeIndicator, scrollToActiveCell = true, drawFocusRing: drawFocusRingIn = true, portalElementRef } = p2;
  const drawFocusRing = drawFocusRingIn === "no-editor" ? overlay === void 0 : drawFocusRingIn;
  const rowMarkersObj = typeof p2.rowMarkers === "string" ? void 0 : p2.rowMarkers;
  const rowMarkers = rowMarkersObj?.kind ?? p2.rowMarkers ?? "none";
  const rowMarkerWidthRaw = rowMarkersObj?.width ?? p2.rowMarkerWidth;
  const rowMarkerStartIndex = rowMarkersObj?.startIndex ?? p2.rowMarkerStartIndex ?? 1;
  const rowMarkerTheme = rowMarkersObj?.theme ?? p2.rowMarkerTheme;
  const headerRowMarkerTheme = rowMarkersObj?.headerTheme;
  const headerRowMarkerAlwaysVisible = rowMarkersObj?.headerAlwaysVisible;
  const headerRowMarkerDisabled = rowSelect !== "multi" || rowMarkersObj?.headerDisabled === true;
  const rowMarkerCheckboxStyle = rowMarkersObj?.checkboxStyle ?? "square";
  const minColumnWidth = Math.max(minColumnWidthIn, 20);
  const maxColumnWidth = Math.max(maxColumnWidthIn, minColumnWidth);
  const maxColumnAutoWidth = Math.max(maxColumnAutoWidthIn ?? maxColumnWidth, minColumnWidth);
  const docStyle = React27.useMemo(() => {
    if (typeof window === "undefined")
      return { fontSize: "16px" };
    return window.getComputedStyle(document.documentElement);
  }, []);
  const { rows, rowNumberMapper, rowHeight: rowHeightPostGrouping, getRowThemeOverride } = useRowGroupingInner(rowGrouping, rowsIn, rowHeightIn, getRowThemeOverrideIn);
  const remSize = React27.useMemo(() => Number.parseFloat(docStyle.fontSize), [docStyle]);
  const { rowHeight, headerHeight, groupHeaderHeight, theme, overscrollX, overscrollY } = useRemAdjuster({
    groupHeaderHeight: groupHeaderHeightIn,
    headerHeight: headerHeightIn,
    overscrollX: overscrollXIn,
    overscrollY: overscrollYIn,
    remSize,
    rowHeight: rowHeightPostGrouping,
    scaleToRem,
    theme: themeIn
  });
  const keybindings = useKeybindingsWithDefaults(keybindingsIn);
  const rowMarkerWidth = rowMarkerWidthRaw ?? (rowsIn > 1e4 ? 48 : rowsIn > 1e3 ? 44 : rowsIn > 100 ? 36 : 32);
  const hasRowMarkers = rowMarkers !== "none";
  const rowMarkerOffset = hasRowMarkers ? 1 : 0;
  const showTrailingBlankRow = trailingRowOptions !== void 0;
  const lastRowSticky = trailingRowOptions?.sticky === true;
  const [showSearchInner, setShowSearchInner] = React27.useState(false);
  const showSearch = showSearchIn ?? showSearchInner;
  const onSearchClose = React27.useCallback(() => {
    if (onSearchCloseIn !== void 0) {
      onSearchCloseIn();
    } else {
      setShowSearchInner(false);
    }
  }, [onSearchCloseIn]);
  const gridSelectionOuterMangled = React27.useMemo(() => {
    return gridSelectionOuter === void 0 ? void 0 : shiftSelection(gridSelectionOuter, rowMarkerOffset);
  }, [gridSelectionOuter, rowMarkerOffset]);
  const gridSelection = gridSelectionOuterMangled ?? gridSelectionInner;
  const abortControllerRef = React27.useRef();
  if (abortControllerRef.current === void 0)
    abortControllerRef.current = new AbortController();
  React27.useEffect(() => () => abortControllerRef?.current.abort(), []);
  const [getCellsForSelection, getCellsForSeletionDirect] = useCellsForSelection(getCellsForSelectionIn, getCellContent, rowMarkerOffset, abortControllerRef.current, rows);
  const validateCell = React27.useCallback((cell, newValue, prevValue) => {
    if (validateCellIn === void 0)
      return true;
    const item = [cell[0] - rowMarkerOffset, cell[1]];
    return validateCellIn?.(item, newValue, prevValue);
  }, [rowMarkerOffset, validateCellIn]);
  const expectedExternalGridSelection = React27.useRef(gridSelectionOuter);
  const setGridSelection = React27.useCallback((newVal, expand) => {
    if (expand) {
      newVal = expandSelection(newVal, getCellsForSelection, rowMarkerOffset, spanRangeBehavior, abortControllerRef.current);
    }
    if (onGridSelectionChange !== void 0) {
      expectedExternalGridSelection.current = shiftSelection(newVal, -rowMarkerOffset);
      onGridSelectionChange(expectedExternalGridSelection.current);
    } else {
      setGridSelectionInner(newVal);
    }
  }, [onGridSelectionChange, getCellsForSelection, rowMarkerOffset, spanRangeBehavior]);
  const onColumnResize = whenDefined(onColumnResizeIn, React27.useCallback((_3, w3, ind, wg) => {
    onColumnResizeIn?.(columnsIn[ind - rowMarkerOffset], w3, ind - rowMarkerOffset, wg);
  }, [onColumnResizeIn, rowMarkerOffset, columnsIn]));
  const onColumnResizeEnd = whenDefined(onColumnResizeEndIn, React27.useCallback((_3, w3, ind, wg) => {
    onColumnResizeEndIn?.(columnsIn[ind - rowMarkerOffset], w3, ind - rowMarkerOffset, wg);
  }, [onColumnResizeEndIn, rowMarkerOffset, columnsIn]));
  const onColumnResizeStart = whenDefined(onColumnResizeStartIn, React27.useCallback((_3, w3, ind, wg) => {
    onColumnResizeStartIn?.(columnsIn[ind - rowMarkerOffset], w3, ind - rowMarkerOffset, wg);
  }, [onColumnResizeStartIn, rowMarkerOffset, columnsIn]));
  const drawHeader2 = whenDefined(drawHeaderIn, React27.useCallback((args, draw) => {
    return drawHeaderIn?.({ ...args, columnIndex: args.columnIndex - rowMarkerOffset }, draw) ?? false;
  }, [drawHeaderIn, rowMarkerOffset]));
  const drawCell2 = whenDefined(drawCellIn, React27.useCallback((args, draw) => {
    return drawCellIn?.({ ...args, col: args.col - rowMarkerOffset }, draw) ?? false;
  }, [drawCellIn, rowMarkerOffset]));
  const onDelete = React27.useCallback((sel) => {
    if (onDeleteIn !== void 0) {
      const result = onDeleteIn(shiftSelection(sel, -rowMarkerOffset));
      if (typeof result === "boolean") {
        return result;
      }
      return shiftSelection(result, rowMarkerOffset);
    }
    return true;
  }, [onDeleteIn, rowMarkerOffset]);
  const [setCurrent, setSelectedRows, setSelectedColumns] = useSelectionBehavior(gridSelection, setGridSelection, rangeSelectionBlending, columnSelectionBlending, rowSelectionBlending, rangeSelect, rangeSelectionColumnSpanning);
  const mergedTheme = React27.useMemo(() => {
    return mergeAndRealizeTheme(getDataEditorTheme(), theme);
  }, [theme]);
  const [clientSize, setClientSize] = React27.useState([0, 0, 0]);
  const rendererMap = React27.useMemo(() => {
    if (renderers === void 0)
      return {};
    const result = {};
    for (const r of renderers) {
      result[r.kind] = r;
    }
    return result;
  }, [renderers]);
  const getCellRenderer = React27.useCallback((cell) => {
    if (cell.kind !== GridCellKind.Custom) {
      return rendererMap[cell.kind];
    }
    return additionalRenderers?.find((x2) => x2.isMatch(cell));
  }, [additionalRenderers, rendererMap]);
  let { sizedColumns: columns, nonGrowWidth } = useColumnSizer(columnsIn, rows, getCellsForSeletionDirect, clientSize[0] - (rowMarkerOffset === 0 ? 0 : rowMarkerWidth) - clientSize[2], minColumnWidth, maxColumnAutoWidth, mergedTheme, getCellRenderer, abortControllerRef.current);
  if (rowMarkers !== "none")
    nonGrowWidth += rowMarkerWidth;
  const enableGroups = React27.useMemo(() => {
    return columns.some((c) => c.group !== void 0);
  }, [columns]);
  const totalHeaderHeight = enableGroups ? headerHeight + groupHeaderHeight : headerHeight;
  const numSelectedRows = gridSelection.rows.length;
  const rowMarkerChecked = rowMarkers === "none" ? void 0 : numSelectedRows === 0 ? false : numSelectedRows === rows ? true : void 0;
  const mangledCols = React27.useMemo(() => {
    if (rowMarkers === "none")
      return columns;
    return [
      {
        title: "",
        width: rowMarkerWidth,
        icon: void 0,
        hasMenu: false,
        style: "normal",
        themeOverride: rowMarkerTheme,
        rowMarker: rowMarkerCheckboxStyle,
        rowMarkerChecked,
        headerRowMarkerTheme,
        headerRowMarkerAlwaysVisible,
        headerRowMarkerDisabled
      },
      ...columns
    ];
  }, [
    rowMarkers,
    columns,
    rowMarkerWidth,
    rowMarkerTheme,
    rowMarkerCheckboxStyle,
    rowMarkerChecked,
    headerRowMarkerTheme,
    headerRowMarkerAlwaysVisible,
    headerRowMarkerDisabled
  ]);
  const visibleRegionRef = React27.useRef({
    height: 1,
    width: 1,
    x: 0,
    y: 0
  });
  const hasJustScrolled = React27.useRef(false);
  const { setVisibleRegion, visibleRegion, scrollRef } = useInitialScrollOffset(scrollOffsetX, scrollOffsetY, rowHeight, visibleRegionRef, () => hasJustScrolled.current = true);
  visibleRegionRef.current = visibleRegion;
  const cellXOffset = visibleRegion.x + rowMarkerOffset;
  const cellYOffset = visibleRegion.y;
  const gridRef = React27.useRef(null);
  const focus = React27.useCallback((immediate) => {
    if (immediate === true) {
      gridRef.current?.focus();
    } else {
      window.requestAnimationFrame(() => {
        gridRef.current?.focus();
      });
    }
  }, []);
  const mangledRows = showTrailingBlankRow ? rows + 1 : rows;
  const mangledOnCellsEdited = React27.useCallback((items) => {
    const mangledItems = rowMarkerOffset === 0 ? items : items.map((x2) => ({
      ...x2,
      location: [x2.location[0] - rowMarkerOffset, x2.location[1]]
    }));
    const r = onCellsEdited?.(mangledItems);
    if (r !== true) {
      for (const i of mangledItems)
        onCellEdited?.(i.location, i.value);
    }
    return r;
  }, [onCellEdited, onCellsEdited, rowMarkerOffset]);
  const [fillHighlightRegion, setFillHighlightRegion] = React27.useState();
  const highlightRange = gridSelection.current !== void 0 && gridSelection.current.range.width * gridSelection.current.range.height > 1 ? gridSelection.current.range : void 0;
  const highlightFocus = drawFocusRing ? gridSelection.current?.cell : void 0;
  const highlightFocusCol = highlightFocus?.[0];
  const highlightFocusRow = highlightFocus?.[1];
  const highlightRegions = React27.useMemo(() => {
    if ((highlightRegionsIn === void 0 || highlightRegionsIn.length === 0) && (highlightRange ?? highlightFocusCol ?? highlightFocusRow ?? fillHighlightRegion) === void 0)
      return void 0;
    const regions = [];
    if (highlightRegionsIn !== void 0) {
      for (const r of highlightRegionsIn) {
        const maxWidth = mangledCols.length - r.range.x - rowMarkerOffset;
        if (maxWidth > 0) {
          regions.push({
            color: r.color,
            range: {
              ...r.range,
              x: r.range.x + rowMarkerOffset,
              width: Math.min(maxWidth, r.range.width)
            },
            style: r.style
          });
        }
      }
    }
    if (fillHighlightRegion !== void 0) {
      regions.push({
        color: withAlpha(mergedTheme.accentColor, 0),
        range: fillHighlightRegion,
        style: "dashed"
      });
    }
    if (highlightRange !== void 0) {
      regions.push({
        color: withAlpha(mergedTheme.accentColor, 0.5),
        range: highlightRange,
        style: "solid-outline"
      });
    }
    if (highlightFocusCol !== void 0 && highlightFocusRow !== void 0) {
      regions.push({
        color: mergedTheme.accentColor,
        range: {
          x: highlightFocusCol,
          y: highlightFocusRow,
          width: 1,
          height: 1
        },
        style: "solid-outline"
      });
    }
    return regions.length > 0 ? regions : void 0;
  }, [
    fillHighlightRegion,
    highlightRange,
    highlightFocusCol,
    highlightFocusRow,
    highlightRegionsIn,
    mangledCols.length,
    mergedTheme.accentColor,
    rowMarkerOffset
  ]);
  const mangledColsRef = React27.useRef(mangledCols);
  mangledColsRef.current = mangledCols;
  const getMangledCellContent = React27.useCallback(([col, row], forceStrict = false) => {
    const isTrailing = showTrailingBlankRow && row === mangledRows - 1;
    const isRowMarkerCol = col === 0 && hasRowMarkers;
    if (isRowMarkerCol) {
      if (isTrailing) {
        return loadingCell2;
      }
      const mappedRow = rowNumberMapper(row);
      if (mappedRow === void 0)
        return loadingCell2;
      return {
        kind: InnerGridCellKind.Marker,
        allowOverlay: false,
        checkboxStyle: rowMarkerCheckboxStyle,
        checked: gridSelection?.rows.hasIndex(row) === true,
        markerKind: rowMarkers === "clickable-number" ? "number" : rowMarkers,
        row: rowMarkerStartIndex + mappedRow,
        drawHandle: onRowMoved !== void 0,
        cursor: rowMarkers === "clickable-number" ? "pointer" : void 0
      };
    } else if (isTrailing) {
      const isFirst = col === rowMarkerOffset;
      const maybeFirstColumnHint = isFirst ? trailingRowOptions?.hint ?? "" : "";
      const c = mangledColsRef.current[col];
      if (c?.trailingRowOptions?.disabled === true) {
        return loadingCell2;
      } else {
        const hint = c?.trailingRowOptions?.hint ?? maybeFirstColumnHint;
        const icon = c?.trailingRowOptions?.addIcon ?? trailingRowOptions?.addIcon;
        return {
          kind: InnerGridCellKind.NewRow,
          hint,
          allowOverlay: false,
          icon
        };
      }
    } else {
      const outerCol = col - rowMarkerOffset;
      if (forceStrict || experimental?.strict === true) {
        const vr = visibleRegionRef.current;
        const isOutsideMainArea = vr.x > outerCol || outerCol > vr.x + vr.width || vr.y > row || row > vr.y + vr.height || row >= rowsRef.current;
        const isSelected = outerCol === vr.extras?.selected?.[0] && row === vr.extras?.selected[1];
        let isInFreezeArea = false;
        if (vr.extras?.freezeRegions !== void 0) {
          for (const fr of vr.extras.freezeRegions) {
            if (pointInRect(fr, outerCol, row)) {
              isInFreezeArea = true;
              break;
            }
          }
        }
        if (isOutsideMainArea && !isSelected && !isInFreezeArea) {
          return loadingCell2;
        }
      }
      let result = getCellContent([outerCol, row]);
      if (rowMarkerOffset !== 0 && result.span !== void 0) {
        result = {
          ...result,
          span: [result.span[0] + rowMarkerOffset, result.span[1] + rowMarkerOffset]
        };
      }
      return result;
    }
  }, [
    showTrailingBlankRow,
    mangledRows,
    hasRowMarkers,
    rowNumberMapper,
    rowMarkerCheckboxStyle,
    gridSelection?.rows,
    rowMarkers,
    rowMarkerStartIndex,
    onRowMoved,
    rowMarkerOffset,
    trailingRowOptions?.hint,
    trailingRowOptions?.addIcon,
    experimental?.strict,
    getCellContent
  ]);
  const mangledGetGroupDetails = React27.useCallback((group) => {
    let result = getGroupDetails?.(group) ?? { name: group };
    if (onGroupHeaderRenamed !== void 0 && group !== "") {
      result = {
        icon: result.icon,
        name: result.name,
        overrideTheme: result.overrideTheme,
        actions: [
          ...result.actions ?? [],
          {
            title: "Rename",
            icon: "renameIcon",
            onClick: (e) => setRenameGroup({
              group: result.name,
              bounds: e.bounds
            })
          }
        ]
      };
    }
    return result;
  }, [getGroupDetails, onGroupHeaderRenamed]);
  const setOverlaySimple = React27.useCallback((val) => {
    const [col, row] = val.cell;
    const column = mangledCols[col];
    const groupTheme = column?.group !== void 0 ? mangledGetGroupDetails(column.group)?.overrideTheme : void 0;
    const colTheme = column?.themeOverride;
    const rowTheme = getRowThemeOverride?.(row);
    setOverlay({
      ...val,
      theme: mergeAndRealizeTheme(mergedTheme, groupTheme, colTheme, rowTheme, val.content.themeOverride)
    });
  }, [getRowThemeOverride, mangledCols, mangledGetGroupDetails, mergedTheme]);
  const reselect = React27.useCallback((bounds, activation, initialValue) => {
    if (gridSelection.current === void 0)
      return;
    const [col, row] = gridSelection.current.cell;
    const c = getMangledCellContent([col, row]);
    if (c.kind !== GridCellKind.Boolean && c.allowOverlay) {
      let content = c;
      if (initialValue !== void 0) {
        switch (content.kind) {
          case GridCellKind.Number: {
            const d3 = maybe(() => initialValue === "-" ? -0 : Number.parseFloat(initialValue), 0);
            content = {
              ...content,
              data: Number.isNaN(d3) ? 0 : d3
            };
            break;
          }
          case GridCellKind.Text:
          case GridCellKind.Markdown:
          case GridCellKind.Uri:
            content = {
              ...content,
              data: initialValue
            };
            break;
        }
      }
      setOverlaySimple({
        target: bounds,
        content,
        initialValue,
        cell: [col, row],
        highlight: initialValue === void 0,
        forceEditMode: initialValue !== void 0,
        activation
      });
    } else if (c.kind === GridCellKind.Boolean && activation.inputType === "keyboard" && c.readonly !== true) {
      mangledOnCellsEdited([
        {
          location: gridSelection.current.cell,
          value: {
            ...c,
            data: toggleBoolean(c.data)
          }
        }
      ]);
      gridRef.current?.damage([{ cell: gridSelection.current.cell }]);
    }
  }, [getMangledCellContent, gridSelection, mangledOnCellsEdited, setOverlaySimple]);
  const focusOnRowFromTrailingBlankRow = React27.useCallback((col, row) => {
    const bounds = gridRef.current?.getBounds(col, row);
    if (bounds === void 0 || scrollRef.current === null) {
      return;
    }
    const content = getMangledCellContent([col, row]);
    if (!content.allowOverlay) {
      return;
    }
    setOverlaySimple({
      target: bounds,
      content,
      initialValue: void 0,
      highlight: true,
      cell: [col, row],
      forceEditMode: true,
      activation: { inputType: "keyboard", key: "Enter" }
    });
  }, [getMangledCellContent, scrollRef, setOverlaySimple]);
  const scrollTo = React27.useCallback((col, row, dir = "both", paddingX = 0, paddingY = 0, options = void 0) => {
    if (scrollRef.current !== null) {
      const grid = gridRef.current;
      const canvas = canvasRef.current;
      const trueCol = typeof col !== "number" ? col.unit === "cell" ? col.amount : void 0 : col;
      const trueRow = typeof row !== "number" ? row.unit === "cell" ? row.amount : void 0 : row;
      const desiredX = typeof col !== "number" && col.unit === "px" ? col.amount : void 0;
      const desiredY = typeof row !== "number" && row.unit === "px" ? row.amount : void 0;
      if (grid !== null && canvas !== null) {
        let targetRect = {
          x: 0,
          y: 0,
          width: 0,
          height: 0
        };
        let scrollX = 0;
        let scrollY = 0;
        if (trueCol !== void 0 || trueRow !== void 0) {
          targetRect = grid.getBounds((trueCol ?? 0) + rowMarkerOffset, trueRow ?? 0) ?? targetRect;
          if (targetRect.width === 0 || targetRect.height === 0)
            return;
        }
        const scrollBounds = canvas.getBoundingClientRect();
        const scale = scrollBounds.width / canvas.offsetWidth;
        if (desiredX !== void 0) {
          targetRect = {
            ...targetRect,
            x: desiredX - scrollBounds.left - scrollRef.current.scrollLeft,
            width: 1
          };
        }
        if (desiredY !== void 0) {
          targetRect = {
            ...targetRect,
            y: desiredY + scrollBounds.top - scrollRef.current.scrollTop,
            height: 1
          };
        }
        if (targetRect !== void 0) {
          const bounds = {
            x: targetRect.x - paddingX,
            y: targetRect.y - paddingY,
            width: targetRect.width + 2 * paddingX,
            height: targetRect.height + 2 * paddingY
          };
          let frozenWidth = 0;
          for (let i = 0; i < freezeColumns; i++) {
            frozenWidth += columns[i].width;
          }
          let trailingRowHeight = 0;
          const freezeTrailingRowsEffective = freezeTrailingRows + (lastRowSticky ? 1 : 0);
          if (freezeTrailingRowsEffective > 0) {
            trailingRowHeight = getFreezeTrailingHeight(mangledRows, freezeTrailingRowsEffective, rowHeight);
          }
          let sLeft = frozenWidth * scale + scrollBounds.left + rowMarkerOffset * rowMarkerWidth * scale;
          let sRight = scrollBounds.right;
          let sTop = scrollBounds.top + totalHeaderHeight * scale;
          let sBottom = scrollBounds.bottom - trailingRowHeight * scale;
          const minx = targetRect.width + paddingX * 2;
          switch (options?.hAlign) {
            case "start":
              sRight = sLeft + minx;
              break;
            case "end":
              sLeft = sRight - minx;
              break;
            case "center":
              sLeft = Math.floor((sLeft + sRight) / 2) - minx / 2;
              sRight = sLeft + minx;
              break;
          }
          const miny = targetRect.height + paddingY * 2;
          switch (options?.vAlign) {
            case "start":
              sBottom = sTop + miny;
              break;
            case "end":
              sTop = sBottom - miny;
              break;
            case "center":
              sTop = Math.floor((sTop + sBottom) / 2) - miny / 2;
              sBottom = sTop + miny;
              break;
          }
          if (sLeft > bounds.x) {
            scrollX = bounds.x - sLeft;
          } else if (sRight < bounds.x + bounds.width) {
            scrollX = bounds.x + bounds.width - sRight;
          }
          if (sTop > bounds.y) {
            scrollY = bounds.y - sTop;
          } else if (sBottom < bounds.y + bounds.height) {
            scrollY = bounds.y + bounds.height - sBottom;
          }
          if (dir === "vertical" || typeof col === "number" && col < freezeColumns) {
            scrollX = 0;
          } else if (dir === "horizontal" || typeof row === "number" && row >= mangledRows - freezeTrailingRowsEffective) {
            scrollY = 0;
          }
          if (scrollX !== 0 || scrollY !== 0) {
            if (scale !== 1) {
              scrollX /= scale;
              scrollY /= scale;
            }
            scrollRef.current.scrollTo({
              left: scrollX + scrollRef.current.scrollLeft,
              top: scrollY + scrollRef.current.scrollTop,
              behavior: options?.behavior ?? "auto"
            });
          }
        }
      }
    }
  }, [
    rowMarkerOffset,
    freezeTrailingRows,
    rowMarkerWidth,
    scrollRef,
    totalHeaderHeight,
    freezeColumns,
    columns,
    mangledRows,
    lastRowSticky,
    rowHeight
  ]);
  const focusCallback = React27.useRef(focusOnRowFromTrailingBlankRow);
  const getCellContentRef = React27.useRef(getCellContent);
  focusCallback.current = focusOnRowFromTrailingBlankRow;
  getCellContentRef.current = getCellContent;
  const rowsRef = React27.useRef(rows);
  rowsRef.current = rows;
  const colsRef = React27.useRef(mangledCols.length);
  colsRef.current = mangledCols.length;
  const appendRow = React27.useCallback(async (col, openOverlay = true, behavior) => {
    const c = mangledCols[col];
    if (c?.trailingRowOptions?.disabled === true) {
      return;
    }
    const appendResult = onRowAppended?.();
    let r = void 0;
    let bottom = true;
    if (appendResult !== void 0) {
      r = await appendResult;
      if (r === "top")
        bottom = false;
      if (typeof r === "number")
        bottom = false;
    }
    let backoff = 0;
    const doFocus = () => {
      if (rowsRef.current <= rows) {
        if (backoff < 500) {
          window.setTimeout(doFocus, backoff);
        }
        backoff = 50 + backoff * 2;
        return;
      }
      const row = typeof r === "number" ? r : bottom ? rows : 0;
      scrollToRef.current(col - rowMarkerOffset, row, "both", 0, 0, behavior ? { behavior } : void 0);
      setCurrent({
        cell: [col, row],
        range: {
          x: col,
          y: row,
          width: 1,
          height: 1
        }
      }, false, false, "edit");
      const cell = getCellContentRef.current([col - rowMarkerOffset, row]);
      if (cell.allowOverlay && isReadWriteCell(cell) && cell.readonly !== true && openOverlay) {
        window.setTimeout(() => {
          focusCallback.current(col, row);
        }, 0);
      }
    };
    doFocus();
  }, [mangledCols, onRowAppended, rowMarkerOffset, rows, setCurrent]);
  const appendColumn = React27.useCallback(async (row, openOverlay = true) => {
    const appendResult = onColumnAppended?.();
    let r = void 0;
    let right = true;
    if (appendResult !== void 0) {
      r = await appendResult;
      if (r === "left")
        right = false;
      if (typeof r === "number")
        right = false;
    }
    let backoff = 0;
    const doFocus = () => {
      if (colsRef.current <= mangledCols.length) {
        if (backoff < 500) {
          window.setTimeout(doFocus, backoff);
        }
        backoff = 50 + backoff * 2;
        return;
      }
      const col = typeof r === "number" ? r : right ? mangledCols.length : 0;
      scrollTo(col - rowMarkerOffset, row);
      setCurrent({
        cell: [col, row],
        range: {
          x: col,
          y: row,
          width: 1,
          height: 1
        }
      }, false, false, "edit");
      const cell = getCellContentRef.current([col - rowMarkerOffset, row]);
      if (cell.allowOverlay && isReadWriteCell(cell) && cell.readonly !== true && openOverlay) {
        window.setTimeout(() => {
          focusCallback.current(col, row);
        }, 0);
      }
    };
    doFocus();
  }, [mangledCols, onColumnAppended, rowMarkerOffset, scrollTo, setCurrent]);
  const getCustomNewRowTargetColumn = React27.useCallback((col) => {
    const customTargetColumn = columns[col]?.trailingRowOptions?.targetColumn ?? trailingRowOptions?.targetColumn;
    if (typeof customTargetColumn === "number") {
      const customTargetOffset = hasRowMarkers ? 1 : 0;
      return customTargetColumn + customTargetOffset;
    }
    if (typeof customTargetColumn === "object") {
      const maybeIndex = columnsIn.indexOf(customTargetColumn);
      if (maybeIndex >= 0) {
        const customTargetOffset = hasRowMarkers ? 1 : 0;
        return maybeIndex + customTargetOffset;
      }
    }
    return void 0;
  }, [columns, columnsIn, hasRowMarkers, trailingRowOptions?.targetColumn]);
  const lastSelectedRowRef = React27.useRef();
  const lastSelectedColRef = React27.useRef();
  const themeForCell = React27.useCallback((cell, pos) => {
    const [col, row] = pos;
    return mergeAndRealizeTheme(mergedTheme, mangledCols[col]?.themeOverride, getRowThemeOverride?.(row), cell.themeOverride);
  }, [getRowThemeOverride, mangledCols, mergedTheme]);
  const { mapper } = useRowGrouping(rowGrouping, rowsIn);
  const rowGroupingNavBehavior = rowGrouping?.navigationBehavior;
  const handleSelect = React27.useCallback((args) => {
    const isMultiKey = browserIsOSX.value ? args.metaKey : args.ctrlKey;
    const isMultiRow = isMultiKey && rowSelect === "multi";
    const [col, row] = args.location;
    const selectedColumns = gridSelection.columns;
    const selectedRows = gridSelection.rows;
    const [cellCol, cellRow] = gridSelection.current?.cell ?? [];
    if (args.kind === "cell") {
      lastSelectedColRef.current = void 0;
      lastMouseSelectLocation.current = [col, row];
      if (col === 0 && hasRowMarkers) {
        if (showTrailingBlankRow === true && row === rows || rowMarkers === "number" || rowSelect === "none")
          return;
        const markerCell = getMangledCellContent(args.location);
        if (markerCell.kind !== InnerGridCellKind.Marker) {
          return;
        }
        if (onRowMoved !== void 0) {
          const renderer = getCellRenderer(markerCell);
          assert(renderer?.kind === InnerGridCellKind.Marker);
          const postClick = renderer?.onClick?.({
            ...args,
            cell: markerCell,
            posX: args.localEventX,
            posY: args.localEventY,
            bounds: args.bounds,
            theme: themeForCell(markerCell, args.location),
            preventDefault: () => void 0
          });
          if (postClick === void 0 || postClick.checked === markerCell.checked)
            return;
        }
        setOverlay(void 0);
        focus();
        const isSelected = selectedRows.hasIndex(row);
        const lastHighlighted = lastSelectedRowRef.current;
        if (rowSelect === "multi" && (args.shiftKey || args.isLongTouch === true) && lastHighlighted !== void 0 && selectedRows.hasIndex(lastHighlighted)) {
          const newSlice = [Math.min(lastHighlighted, row), Math.max(lastHighlighted, row) + 1];
          if (isMultiRow || rowSelectionMode === "multi") {
            setSelectedRows(void 0, newSlice, true);
          } else {
            setSelectedRows(CompactSelection.fromSingleSelection(newSlice), void 0, isMultiRow);
          }
        } else if (rowSelect === "multi" && (isMultiRow || args.isTouch || rowSelectionMode === "multi")) {
          if (isSelected) {
            setSelectedRows(selectedRows.remove(row), void 0, true);
          } else {
            setSelectedRows(void 0, row, true);
            lastSelectedRowRef.current = row;
          }
        } else if (isSelected && selectedRows.length === 1) {
          setSelectedRows(CompactSelection.empty(), void 0, isMultiKey);
        } else {
          setSelectedRows(CompactSelection.fromSingleSelection(row), void 0, isMultiKey);
          lastSelectedRowRef.current = row;
        }
      } else if (col >= rowMarkerOffset && showTrailingBlankRow && row === rows) {
        const customTargetColumn = getCustomNewRowTargetColumn(col);
        void appendRow(customTargetColumn ?? col);
      } else {
        if (cellCol !== col || cellRow !== row) {
          const cell = getMangledCellContent(args.location);
          const renderer = getCellRenderer(cell);
          if (renderer?.onSelect !== void 0) {
            let prevented = false;
            renderer.onSelect({
              ...args,
              cell,
              posX: args.localEventX,
              posY: args.localEventY,
              bounds: args.bounds,
              preventDefault: () => prevented = true,
              theme: themeForCell(cell, args.location)
            });
            if (prevented) {
              return;
            }
          }
          if (rowGroupingNavBehavior === "block" && mapper(row).isGroupHeader) {
            return;
          }
          const isLastStickyRow = lastRowSticky && row === rows;
          const startedFromLastSticky = lastRowSticky && gridSelection !== void 0 && gridSelection.current?.cell[1] === rows;
          if ((args.shiftKey || args.isLongTouch === true) && cellCol !== void 0 && cellRow !== void 0 && gridSelection.current !== void 0 && !startedFromLastSticky) {
            if (isLastStickyRow) {
              return;
            }
            const left = Math.min(col, cellCol);
            const right = Math.max(col, cellCol);
            const top = Math.min(row, cellRow);
            const bottom = Math.max(row, cellRow);
            setCurrent({
              ...gridSelection.current,
              range: {
                x: left,
                y: top,
                width: right - left + 1,
                height: bottom - top + 1
              }
            }, true, isMultiKey, "click");
            lastSelectedRowRef.current = void 0;
            focus();
          } else {
            setCurrent({
              cell: [col, row],
              range: { x: col, y: row, width: 1, height: 1 }
            }, true, isMultiKey, "click");
            lastSelectedRowRef.current = void 0;
            setOverlay(void 0);
            focus();
          }
        }
      }
    } else if (args.kind === "header") {
      lastMouseSelectLocation.current = [col, row];
      setOverlay(void 0);
      if (hasRowMarkers && col === 0) {
        lastSelectedRowRef.current = void 0;
        lastSelectedColRef.current = void 0;
        if (!headerRowMarkerDisabled && rowSelect === "multi") {
          if (selectedRows.length !== rows) {
            setSelectedRows(CompactSelection.fromSingleSelection([0, rows]), void 0, isMultiKey);
          } else {
            setSelectedRows(CompactSelection.empty(), void 0, isMultiKey);
          }
          focus();
        }
      } else {
        const lastCol = lastSelectedColRef.current;
        if (columnSelect === "multi" && (args.shiftKey || args.isLongTouch === true) && lastCol !== void 0 && selectedColumns.hasIndex(lastCol)) {
          const newSlice = [Math.min(lastCol, col), Math.max(lastCol, col) + 1];
          if (isMultiKey || args.isTouch || columnSelectionMode === "multi") {
            setSelectedColumns(void 0, newSlice, isMultiKey);
          } else {
            setSelectedColumns(CompactSelection.fromSingleSelection(newSlice), void 0, isMultiKey);
          }
        } else if (columnSelect === "multi" && (isMultiKey || args.isTouch || columnSelectionMode === "multi")) {
          if (selectedColumns.hasIndex(col)) {
            setSelectedColumns(selectedColumns.remove(col), void 0, isMultiKey);
          } else {
            setSelectedColumns(void 0, col, isMultiKey);
          }
          lastSelectedColRef.current = col;
        } else if (columnSelect !== "none") {
          if (selectedColumns.hasIndex(col)) {
            setSelectedColumns(selectedColumns.remove(col), void 0, isMultiKey);
          } else {
            setSelectedColumns(CompactSelection.fromSingleSelection(col), void 0, isMultiKey);
          }
          lastSelectedColRef.current = col;
        }
        lastSelectedRowRef.current = void 0;
        focus();
      }
    } else if (args.kind === groupHeaderKind) {
      lastMouseSelectLocation.current = [col, row];
    } else if (args.kind === outOfBoundsKind && !args.isMaybeScrollbar) {
      setGridSelection(emptyGridSelection, false);
      setOverlay(void 0);
      focus();
      onSelectionCleared?.();
      lastSelectedRowRef.current = void 0;
      lastSelectedColRef.current = void 0;
    }
  }, [
    rowSelect,
    columnSelect,
    gridSelection,
    hasRowMarkers,
    rowMarkerOffset,
    showTrailingBlankRow,
    rows,
    rowMarkers,
    getMangledCellContent,
    onRowMoved,
    focus,
    rowSelectionMode,
    columnSelectionMode,
    getCellRenderer,
    themeForCell,
    setSelectedRows,
    getCustomNewRowTargetColumn,
    appendRow,
    rowGroupingNavBehavior,
    mapper,
    lastRowSticky,
    setCurrent,
    headerRowMarkerDisabled,
    setSelectedColumns,
    setGridSelection,
    onSelectionCleared
  ]);
  const isActivelyDraggingHeader = React27.useRef(false);
  const lastMouseSelectLocation = React27.useRef();
  const touchDownArgs = React27.useRef(visibleRegion);
  const mouseDownData = React27.useRef();
  const onMouseDown = React27.useCallback((args) => {
    isPrevented.current = false;
    touchDownArgs.current = visibleRegionRef.current;
    if (args.button !== 0 && args.button !== 1) {
      mouseDownData.current = void 0;
      return;
    }
    const time = performance.now();
    mouseDownData.current = {
      button: args.button,
      time,
      location: args.location
    };
    if (args?.kind === "header") {
      isActivelyDraggingHeader.current = true;
    }
    const fh = args.kind === "cell" && args.isFillHandle;
    if (!fh && args.kind !== "cell" && args.isEdge)
      return;
    setMouseState({
      previousSelection: gridSelection,
      fillHandle: fh
    });
    lastMouseSelectLocation.current = void 0;
    if (!args.isTouch && args.button === 0 && !fh) {
      handleSelect(args);
    } else if (!args.isTouch && args.button === 1) {
      lastMouseSelectLocation.current = args.location;
    }
  }, [gridSelection, handleSelect]);
  const [renameGroup, setRenameGroup] = React27.useState();
  const handleGroupHeaderSelection = React27.useCallback((args) => {
    if (args.kind !== groupHeaderKind || columnSelect !== "multi") {
      return;
    }
    const isMultiKey = browserIsOSX.value ? args.metaKey : args.ctrlKey;
    const [col] = args.location;
    const selectedColumns = gridSelection.columns;
    if (col < rowMarkerOffset)
      return;
    const needle = mangledCols[col];
    let start = col;
    let end = col;
    for (let i = col - 1; i >= rowMarkerOffset; i--) {
      if (!isGroupEqual(needle.group, mangledCols[i].group))
        break;
      start--;
    }
    for (let i = col + 1; i < mangledCols.length; i++) {
      if (!isGroupEqual(needle.group, mangledCols[i].group))
        break;
      end++;
    }
    focus();
    if (isMultiKey || args.isTouch || columnSelectionMode === "multi") {
      if (selectedColumns.hasAll([start, end + 1])) {
        let newVal = selectedColumns;
        for (let index = start; index <= end; index++) {
          newVal = newVal.remove(index);
        }
        setSelectedColumns(newVal, void 0, isMultiKey);
      } else {
        setSelectedColumns(void 0, [start, end + 1], isMultiKey);
      }
    } else {
      setSelectedColumns(CompactSelection.fromSingleSelection([start, end + 1]), void 0, isMultiKey);
    }
  }, [
    columnSelect,
    focus,
    gridSelection.columns,
    mangledCols,
    rowMarkerOffset,
    setSelectedColumns,
    columnSelectionMode
  ]);
  const isPrevented = React27.useRef(false);
  const normalSizeColumn = React27.useCallback(async (col) => {
    if (getCellsForSelection !== void 0 && onColumnResize !== void 0) {
      const start = visibleRegionRef.current.y;
      const end = visibleRegionRef.current.height;
      let cells = getCellsForSelection({
        x: col,
        y: start,
        width: 1,
        height: Math.min(end, rows - start)
      }, abortControllerRef.current.signal);
      if (typeof cells !== "object") {
        cells = await cells();
      }
      const inputCol = columns[col - rowMarkerOffset];
      const offscreen = document.createElement("canvas");
      const ctx = offscreen.getContext("2d", { alpha: false });
      if (ctx !== null) {
        ctx.font = mergedTheme.baseFontFull;
        const newCol = measureColumn(ctx, mergedTheme, inputCol, 0, cells, minColumnWidth, maxColumnWidth, false, getCellRenderer);
        onColumnResize?.(inputCol, newCol.width, col, newCol.width);
      }
    }
  }, [
    columns,
    getCellsForSelection,
    maxColumnWidth,
    mergedTheme,
    minColumnWidth,
    onColumnResize,
    rowMarkerOffset,
    rows,
    getCellRenderer
  ]);
  const [scrollDir, setScrollDir] = React27.useState();
  const fillPattern = React27.useCallback(async (previousSelection, currentSelection) => {
    const patternRange = previousSelection.current?.range;
    if (patternRange === void 0 || getCellsForSelection === void 0 || currentSelection.current === void 0) {
      return;
    }
    const currentRange = currentSelection.current.range;
    if (onFillPattern !== void 0) {
      let canceled = false;
      onFillPattern({
        fillDestination: { ...currentRange, x: currentRange.x - rowMarkerOffset },
        patternSource: { ...patternRange, x: patternRange.x - rowMarkerOffset },
        preventDefault: () => canceled = true
      });
      if (canceled)
        return;
    }
    let cells = getCellsForSelection(patternRange, abortControllerRef.current.signal);
    if (typeof cells !== "object")
      cells = await cells();
    const pattern = cells;
    const editItemList = [];
    for (let x2 = 0; x2 < currentRange.width; x2++) {
      for (let y2 = 0; y2 < currentRange.height; y2++) {
        const cell = [currentRange.x + x2, currentRange.y + y2];
        if (itemIsInRect(cell, patternRange))
          continue;
        const patternCell = pattern[y2 % patternRange.height][x2 % patternRange.width];
        if (isInnerOnlyCell(patternCell) || !isReadWriteCell(patternCell))
          continue;
        editItemList.push({
          location: cell,
          value: { ...patternCell }
        });
      }
    }
    mangledOnCellsEdited(editItemList);
    gridRef.current?.damage(editItemList.map((c) => ({
      cell: c.location
    })));
  }, [getCellsForSelection, mangledOnCellsEdited, onFillPattern, rowMarkerOffset]);
  const fillRight = React27.useCallback(() => {
    if (gridSelection.current === void 0 || gridSelection.current.range.width <= 1)
      return;
    const firstColSelection = {
      ...gridSelection,
      current: {
        ...gridSelection.current,
        range: {
          ...gridSelection.current.range,
          width: 1
        }
      }
    };
    void fillPattern(firstColSelection, gridSelection);
  }, [fillPattern, gridSelection]);
  const fillDown = React27.useCallback(() => {
    if (gridSelection.current === void 0 || gridSelection.current.range.height <= 1)
      return;
    const firstRowSelection = {
      ...gridSelection,
      current: {
        ...gridSelection.current,
        range: {
          ...gridSelection.current.range,
          height: 1
        }
      }
    };
    void fillPattern(firstRowSelection, gridSelection);
  }, [fillPattern, gridSelection]);
  const onMouseUp = React27.useCallback((args, isOutside) => {
    const mouse = mouseState;
    setMouseState(void 0);
    setFillHighlightRegion(void 0);
    setScrollDir(void 0);
    isActivelyDraggingHeader.current = false;
    if (isOutside)
      return;
    if (mouse?.fillHandle === true && gridSelection.current !== void 0 && mouse.previousSelection?.current !== void 0) {
      if (fillHighlightRegion === void 0)
        return;
      const newRange = {
        ...gridSelection,
        current: {
          ...gridSelection.current,
          range: combineRects(mouse.previousSelection.current.range, fillHighlightRegion)
        }
      };
      void fillPattern(mouse.previousSelection, newRange);
      setGridSelection(newRange, true);
      return;
    }
    const [col, row] = args.location;
    const [lastMouseDownCol, lastMouseDownRow] = lastMouseSelectLocation.current ?? [];
    const preventDefault = () => {
      isPrevented.current = true;
    };
    const handleMaybeClick = (a) => {
      const isValidClick = a.isTouch || lastMouseDownCol === col && lastMouseDownRow === row;
      if (isValidClick) {
        onCellClicked?.([col - rowMarkerOffset, row], {
          ...a,
          preventDefault
        });
      }
      if (a.button === 1)
        return !isPrevented.current;
      if (!isPrevented.current) {
        const c = getMangledCellContent(args.location);
        const r = getCellRenderer(c);
        if (r !== void 0 && r.onClick !== void 0 && isValidClick) {
          const newVal = r.onClick({
            ...a,
            cell: c,
            posX: a.localEventX,
            posY: a.localEventY,
            bounds: a.bounds,
            theme: themeForCell(c, args.location),
            preventDefault
          });
          if (newVal !== void 0 && !isInnerOnlyCell(newVal) && isEditableGridCell(newVal)) {
            mangledOnCellsEdited([{ location: a.location, value: newVal }]);
            gridRef.current?.damage([
              {
                cell: a.location
              }
            ]);
          }
        }
        if (isPrevented.current || gridSelection.current === void 0)
          return false;
        let shouldActivate = false;
        switch (c.activationBehaviorOverride ?? cellActivationBehavior) {
          case "double-click":
          case "second-click": {
            if (mouse?.previousSelection?.current?.cell === void 0)
              break;
            const [selectedCol, selectedRow] = gridSelection.current.cell;
            const [prevCol, prevRow] = mouse.previousSelection.current.cell;
            const isClickOnSelected = col === selectedCol && col === prevCol && row === selectedRow && row === prevRow;
            shouldActivate = isClickOnSelected && (a.isDoubleClick === true || cellActivationBehavior === "second-click");
            break;
          }
          case "single-click": {
            shouldActivate = true;
            break;
          }
        }
        if (shouldActivate) {
          const act = a.isDoubleClick === true ? "double-click" : c.activationBehaviorOverride ?? cellActivationBehavior;
          const activationEvent = {
            inputType: "pointer",
            pointerActivation: act,
            pointerType: a.isTouch ? "touch" : "mouse"
          };
          onCellActivated?.([col - rowMarkerOffset, row], activationEvent);
          reselect(a.bounds, activationEvent);
          return true;
        }
      }
      return false;
    };
    const clickLocation = args.location[0] - rowMarkerOffset;
    if (args.isTouch) {
      const vr = visibleRegionRef.current;
      const touchVr = touchDownArgs.current;
      if (vr.x !== touchVr.x || vr.y !== touchVr.y) {
        return;
      }
      if (args.isLongTouch === true) {
        if (args.kind === "cell" && itemsAreEqual(gridSelection.current?.cell, args.location)) {
          onCellContextMenu?.([clickLocation, args.location[1]], {
            ...args,
            preventDefault
          });
          return;
        } else if (args.kind === "header" && gridSelection.columns.hasIndex(col)) {
          onHeaderContextMenu?.(clickLocation, { ...args, preventDefault });
          return;
        } else if (args.kind === groupHeaderKind) {
          if (clickLocation < 0) {
            return;
          }
          onGroupHeaderContextMenu?.(clickLocation, { ...args, preventDefault });
          return;
        }
      }
      if (args.kind === "cell") {
        if (!handleMaybeClick(args)) {
          handleSelect(args);
        }
      } else if (args.kind === groupHeaderKind) {
        onGroupHeaderClicked?.(clickLocation, { ...args, preventDefault });
      } else {
        if (args.kind === headerKind) {
          onHeaderClicked?.(clickLocation, {
            ...args,
            preventDefault
          });
        }
        handleSelect(args);
      }
      return;
    }
    if (args.kind === "header") {
      if (clickLocation < 0) {
        return;
      }
      if (args.isEdge) {
        if (args.isDoubleClick === true) {
          void normalSizeColumn(col);
        }
      } else if (args.button === 0 && col === lastMouseDownCol && row === lastMouseDownRow) {
        onHeaderClicked?.(clickLocation, { ...args, preventDefault });
      }
    }
    if (args.kind === groupHeaderKind) {
      if (clickLocation < 0) {
        return;
      }
      if (args.button === 0 && col === lastMouseDownCol && row === lastMouseDownRow) {
        onGroupHeaderClicked?.(clickLocation, { ...args, preventDefault });
        if (!isPrevented.current) {
          handleGroupHeaderSelection(args);
        }
      }
    }
    if (args.kind === "cell" && (args.button === 0 || args.button === 1)) {
      handleMaybeClick(args);
    }
    lastMouseSelectLocation.current = void 0;
  }, [
    mouseState,
    gridSelection,
    rowMarkerOffset,
    fillHighlightRegion,
    fillPattern,
    setGridSelection,
    onCellClicked,
    getMangledCellContent,
    getCellRenderer,
    cellActivationBehavior,
    themeForCell,
    mangledOnCellsEdited,
    onCellActivated,
    reselect,
    onCellContextMenu,
    onHeaderContextMenu,
    onGroupHeaderContextMenu,
    handleSelect,
    onGroupHeaderClicked,
    onHeaderClicked,
    normalSizeColumn,
    handleGroupHeaderSelection
  ]);
  const onMouseMoveImpl = React27.useCallback((args) => {
    const a = {
      ...args,
      location: [args.location[0] - rowMarkerOffset, args.location[1]]
    };
    onMouseMove?.(a);
    if (mouseState !== void 0 && args.buttons === 0) {
      setMouseState(void 0);
      setFillHighlightRegion(void 0);
      setScrollDir(void 0);
      isActivelyDraggingHeader.current = false;
    }
    setScrollDir((cv) => {
      if (isActivelyDraggingHeader.current)
        return [args.scrollEdge[0], 0];
      if (args.scrollEdge[0] === cv?.[0] && args.scrollEdge[1] === cv[1])
        return cv;
      return mouseState === void 0 || (mouseDownData.current?.location[0] ?? 0) < rowMarkerOffset ? void 0 : args.scrollEdge;
    });
  }, [mouseState, onMouseMove, rowMarkerOffset]);
  const onHeaderMenuClickInner = React27.useCallback((col, screenPosition) => {
    onHeaderMenuClick?.(col - rowMarkerOffset, screenPosition);
  }, [onHeaderMenuClick, rowMarkerOffset]);
  const onHeaderIndicatorClickInner = React27.useCallback((col, screenPosition) => {
    onHeaderIndicatorClick?.(col - rowMarkerOffset, screenPosition);
  }, [onHeaderIndicatorClick, rowMarkerOffset]);
  const currentCell = gridSelection?.current?.cell;
  const onVisibleRegionChangedImpl = React27.useCallback((region, clientWidth, clientHeight, rightElWidth, tx, ty) => {
    hasJustScrolled.current = false;
    let selected = currentCell;
    if (selected !== void 0) {
      selected = [selected[0] - rowMarkerOffset, selected[1]];
    }
    const freezeRegion = freezeColumns === 0 ? void 0 : {
      x: 0,
      y: region.y,
      width: freezeColumns,
      height: region.height
    };
    const freezeRegions = [];
    if (freezeRegion !== void 0)
      freezeRegions.push(freezeRegion);
    if (freezeTrailingRows > 0) {
      freezeRegions.push({
        x: region.x - rowMarkerOffset,
        y: rows - freezeTrailingRows,
        width: region.width,
        height: freezeTrailingRows
      });
      if (freezeColumns > 0) {
        freezeRegions.push({
          x: 0,
          y: rows - freezeTrailingRows,
          width: freezeColumns,
          height: freezeTrailingRows
        });
      }
    }
    const newRegion = {
      x: region.x - rowMarkerOffset,
      y: region.y,
      width: region.width,
      height: showTrailingBlankRow && region.y + region.height >= rows ? region.height - 1 : region.height,
      tx,
      ty,
      extras: {
        selected,
        freezeRegion,
        freezeRegions
      }
    };
    visibleRegionRef.current = newRegion;
    setVisibleRegion(newRegion);
    setClientSize([clientWidth, clientHeight, rightElWidth]);
    onVisibleRegionChanged?.(newRegion, newRegion.tx, newRegion.ty, newRegion.extras);
  }, [
    currentCell,
    rowMarkerOffset,
    showTrailingBlankRow,
    rows,
    freezeColumns,
    freezeTrailingRows,
    setVisibleRegion,
    onVisibleRegionChanged
  ]);
  const onColumnProposeMoveImpl = whenDefined(onColumnProposeMove, React27.useCallback((startIndex, endIndex) => {
    return onColumnProposeMove?.(startIndex - rowMarkerOffset, endIndex - rowMarkerOffset) !== false;
  }, [onColumnProposeMove, rowMarkerOffset]));
  const onColumnMovedImpl = whenDefined(onColumnMoved, React27.useCallback((startIndex, endIndex) => {
    onColumnMoved?.(startIndex - rowMarkerOffset, endIndex - rowMarkerOffset);
    if (columnSelect !== "none") {
      setSelectedColumns(CompactSelection.fromSingleSelection(endIndex), void 0, true);
    }
  }, [columnSelect, onColumnMoved, rowMarkerOffset, setSelectedColumns]));
  const isActivelyDragging = React27.useRef(false);
  const onDragStartImpl = React27.useCallback((args) => {
    if (args.location[0] === 0 && rowMarkerOffset > 0) {
      args.preventDefault();
      return;
    }
    onDragStart?.({
      ...args,
      location: [args.location[0] - rowMarkerOffset, args.location[1]]
    });
    if (!args.defaultPrevented()) {
      isActivelyDragging.current = true;
    }
    setMouseState(void 0);
  }, [onDragStart, rowMarkerOffset]);
  const onDragEnd = React27.useCallback(() => {
    isActivelyDragging.current = false;
  }, []);
  const rowGroupingSelectionBehavior = rowGrouping?.selectionBehavior;
  const getSelectionRowLimits = React27.useCallback((selectedRow) => {
    if (rowGroupingSelectionBehavior !== "block-spanning")
      return void 0;
    const { isGroupHeader, path, groupRows } = mapper(selectedRow);
    if (isGroupHeader) {
      return [selectedRow, selectedRow];
    }
    const groupRowIndex = path[path.length - 1];
    const lowerBounds = selectedRow - groupRowIndex;
    const upperBounds = selectedRow + groupRows - groupRowIndex - 1;
    return [lowerBounds, upperBounds];
  }, [mapper, rowGroupingSelectionBehavior]);
  const hoveredRef = React27.useRef();
  const onItemHoveredImpl = React27.useCallback((args) => {
    if (mouseEventArgsAreEqual(args, hoveredRef.current))
      return;
    hoveredRef.current = args;
    if (mouseDownData?.current?.button !== void 0 && mouseDownData.current.button >= 1)
      return;
    if (args.buttons !== 0 && mouseState !== void 0 && mouseDownData.current?.location[0] === 0 && rowMarkerOffset === 1 && rowSelect === "multi" && mouseState.previousSelection && !mouseState.previousSelection.rows.hasIndex(mouseDownData.current.location[1]) && gridSelection.rows.hasIndex(mouseDownData.current.location[1])) {
      const start = Math.min(mouseDownData.current.location[1], args.location[1]);
      const end = Math.max(mouseDownData.current.location[1], args.location[1]) + 1;
      setSelectedRows(CompactSelection.fromSingleSelection([start, end]), void 0, false);
    } else if (args.buttons !== 0 && mouseState !== void 0 && gridSelection.current !== void 0 && !isActivelyDragging.current && !isActivelyDraggingHeader.current && (rangeSelect === "rect" || rangeSelect === "multi-rect")) {
      const [selectedCol, selectedRow] = gridSelection.current.cell;
      let [col, row] = args.location;
      if (row < 0) {
        row = visibleRegionRef.current.y;
      }
      if (mouseState.fillHandle === true && mouseState.previousSelection?.current !== void 0) {
        const prevRange = mouseState.previousSelection.current.range;
        row = Math.min(row, showTrailingBlankRow ? rows - 1 : rows);
        const rect = getClosestRect(prevRange, col, row, allowedFillDirections);
        setFillHighlightRegion(rect);
      } else {
        const startedFromLastStickyRow = showTrailingBlankRow && selectedRow === rows;
        if (startedFromLastStickyRow)
          return;
        const landedOnLastStickyRow = showTrailingBlankRow && row === rows;
        if (landedOnLastStickyRow) {
          if (args.kind === outOfBoundsKind)
            row--;
          else
            return;
        }
        col = Math.max(col, rowMarkerOffset);
        const clampLimits = getSelectionRowLimits(selectedRow);
        row = clampLimits === void 0 ? row : (0, import_clamp4.default)(row, clampLimits[0], clampLimits[1]);
        const deltaX = col - selectedCol;
        const deltaY = row - selectedRow;
        const newRange = {
          x: deltaX >= 0 ? selectedCol : col,
          y: deltaY >= 0 ? selectedRow : row,
          width: Math.abs(deltaX) + 1,
          height: Math.abs(deltaY) + 1
        };
        setCurrent({
          ...gridSelection.current,
          range: newRange
        }, true, false, "drag");
      }
    }
    onItemHovered?.({ ...args, location: [args.location[0] - rowMarkerOffset, args.location[1]] });
  }, [
    mouseState,
    rowMarkerOffset,
    rowSelect,
    gridSelection,
    rangeSelect,
    onItemHovered,
    setSelectedRows,
    showTrailingBlankRow,
    rows,
    allowedFillDirections,
    getSelectionRowLimits,
    setCurrent
  ]);
  const adjustSelectionOnScroll = React27.useCallback(() => {
    const args = hoveredRef.current;
    if (args === void 0)
      return;
    const [xDir, yDir] = args.scrollEdge;
    let [col, row] = args.location;
    const visible = visibleRegionRef.current;
    if (xDir === -1) {
      col = visible.extras?.freezeRegion?.x ?? visible.x;
    } else if (xDir === 1) {
      col = visible.x + visible.width;
    }
    if (yDir === -1) {
      row = Math.max(0, visible.y);
    } else if (yDir === 1) {
      row = Math.min(rows - 1, visible.y + visible.height);
    }
    col = (0, import_clamp4.default)(col, 0, mangledCols.length - 1);
    row = (0, import_clamp4.default)(row, 0, rows - 1);
    onItemHoveredImpl({
      ...args,
      location: [col, row]
    });
  }, [mangledCols.length, onItemHoveredImpl, rows]);
  useAutoscroll(scrollDir, scrollRef, adjustSelectionOnScroll);
  const adjustSelection = React27.useCallback((direction2) => {
    if (gridSelection.current === void 0)
      return;
    const [x2, y2] = direction2;
    const [col, row] = gridSelection.current.cell;
    const old = gridSelection.current.range;
    let left = old.x;
    let right = old.x + old.width;
    let top = old.y;
    let bottom = old.y + old.height;
    const [minRow, maxRowRaw] = getSelectionRowLimits(row) ?? [0, rows - 1];
    const maxRow = maxRowRaw + 1;
    if (y2 !== 0) {
      switch (y2) {
        case 2: {
          bottom = maxRow;
          top = row;
          scrollTo(0, bottom, "vertical");
          break;
        }
        case -2: {
          top = minRow;
          bottom = row + 1;
          scrollTo(0, top, "vertical");
          break;
        }
        case 1: {
          if (top < row) {
            top++;
            scrollTo(0, top, "vertical");
          } else {
            bottom = Math.min(maxRow, bottom + 1);
            scrollTo(0, bottom, "vertical");
          }
          break;
        }
        case -1: {
          if (bottom > row + 1) {
            bottom--;
            scrollTo(0, bottom, "vertical");
          } else {
            top = Math.max(minRow, top - 1);
            scrollTo(0, top, "vertical");
          }
          break;
        }
        default: {
          assertNever(y2);
        }
      }
    }
    if (x2 !== 0) {
      if (x2 === 2) {
        right = mangledCols.length;
        left = col;
        scrollTo(right - 1 - rowMarkerOffset, 0, "horizontal");
      } else if (x2 === -2) {
        left = rowMarkerOffset;
        right = col + 1;
        scrollTo(left - rowMarkerOffset, 0, "horizontal");
      } else {
        let disallowed = [];
        if (getCellsForSelection !== void 0) {
          const cells = getCellsForSelection({
            x: left,
            y: top,
            width: right - left - rowMarkerOffset,
            height: bottom - top
          }, abortControllerRef.current.signal);
          if (typeof cells === "object") {
            disallowed = getSpanStops(cells);
          }
        }
        if (x2 === 1) {
          let done = false;
          if (left < col) {
            if (disallowed.length > 0) {
              const target = (0, import_range2.default)(left + 1, col + 1).find((n) => !disallowed.includes(n - rowMarkerOffset));
              if (target !== void 0) {
                left = target;
                done = true;
              }
            } else {
              left++;
              done = true;
            }
            if (done)
              scrollTo(left, 0, "horizontal");
          }
          if (!done) {
            right = Math.min(mangledCols.length, right + 1);
            scrollTo(right - 1 - rowMarkerOffset, 0, "horizontal");
          }
        } else if (x2 === -1) {
          let done = false;
          if (right > col + 1) {
            if (disallowed.length > 0) {
              const target = (0, import_range2.default)(right - 1, col, -1).find((n) => !disallowed.includes(n - rowMarkerOffset));
              if (target !== void 0) {
                right = target;
                done = true;
              }
            } else {
              right--;
              done = true;
            }
            if (done)
              scrollTo(right - rowMarkerOffset, 0, "horizontal");
          }
          if (!done) {
            left = Math.max(rowMarkerOffset, left - 1);
            scrollTo(left - rowMarkerOffset, 0, "horizontal");
          }
        } else {
          assertNever(x2);
        }
      }
    }
    setCurrent({
      cell: gridSelection.current.cell,
      range: {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top
      }
    }, true, false, "keyboard-select");
  }, [
    getCellsForSelection,
    getSelectionRowLimits,
    gridSelection,
    mangledCols.length,
    rowMarkerOffset,
    rows,
    scrollTo,
    setCurrent
  ]);
  const scrollToActiveCellRef = React27.useRef(scrollToActiveCell);
  scrollToActiveCellRef.current = scrollToActiveCell;
  const updateSelectedCell = React27.useCallback((col, row, fromEditingTrailingRow, freeMove) => {
    const rowMax = mangledRows - (fromEditingTrailingRow ? 0 : 1);
    col = (0, import_clamp4.default)(col, rowMarkerOffset, columns.length - 1 + rowMarkerOffset);
    row = (0, import_clamp4.default)(row, 0, rowMax);
    const curCol = currentCell?.[0];
    const curRow = currentCell?.[1];
    if (col === curCol && row === curRow)
      return false;
    if (freeMove && gridSelection.current !== void 0) {
      const newStack = [...gridSelection.current.rangeStack];
      if (gridSelection.current.range.width > 1 || gridSelection.current.range.height > 1) {
        newStack.push(gridSelection.current.range);
      }
      setGridSelection({
        ...gridSelection,
        current: {
          cell: [col, row],
          range: { x: col, y: row, width: 1, height: 1 },
          rangeStack: newStack
        }
      }, true);
    } else {
      setCurrent({
        cell: [col, row],
        range: { x: col, y: row, width: 1, height: 1 }
      }, true, false, "keyboard-nav");
    }
    if (lastSent.current !== void 0 && lastSent.current[0] === col && lastSent.current[1] === row) {
      lastSent.current = void 0;
    }
    if (scrollToActiveCellRef.current) {
      scrollTo(col - rowMarkerOffset, row);
    }
    return true;
  }, [
    mangledRows,
    rowMarkerOffset,
    columns.length,
    currentCell,
    gridSelection,
    scrollTo,
    setGridSelection,
    setCurrent
  ]);
  const onFinishEditing = React27.useCallback((newValue, movement) => {
    if (overlay?.cell !== void 0 && newValue !== void 0 && isEditableGridCell(newValue)) {
      mangledOnCellsEdited([{ location: overlay.cell, value: newValue }]);
      window.requestAnimationFrame(() => {
        gridRef.current?.damage([
          {
            cell: overlay.cell
          }
        ]);
      });
    }
    focus(true);
    setOverlay(void 0);
    const [movX, movY] = movement;
    if (gridSelection.current !== void 0 && (movX !== 0 || movY !== 0)) {
      const isEditingLastRow = gridSelection.current.cell[1] === mangledRows - 1 && newValue !== void 0;
      const isEditingLastCol = gridSelection.current.cell[0] === mangledCols.length - 1 && newValue !== void 0;
      let updateSelected = true;
      if (isEditingLastRow && movY === 1 && onRowAppended !== void 0) {
        updateSelected = false;
        const col = gridSelection.current.cell[0] + movX;
        const customTargetColumn = getCustomNewRowTargetColumn(col);
        void appendRow(customTargetColumn ?? col, false);
      }
      if (isEditingLastCol && movX === 1 && onColumnAppended !== void 0) {
        updateSelected = false;
        const row = gridSelection.current.cell[1] + movY;
        void appendColumn(row, false);
      }
      if (updateSelected) {
        updateSelectedCell((0, import_clamp4.default)(gridSelection.current.cell[0] + movX, 0, mangledCols.length - 1), (0, import_clamp4.default)(gridSelection.current.cell[1] + movY, 0, mangledRows - 1), isEditingLastRow, false);
      }
    }
    onFinishedEditing?.(newValue, movement);
  }, [
    overlay?.cell,
    focus,
    gridSelection,
    onFinishedEditing,
    mangledOnCellsEdited,
    mangledRows,
    updateSelectedCell,
    mangledCols.length,
    appendRow,
    appendColumn,
    onRowAppended,
    onColumnAppended,
    getCustomNewRowTargetColumn
  ]);
  const overlayID = React27.useMemo(() => {
    return `gdg-overlay-${idCounter++}`;
  }, []);
  const deleteRange = React27.useCallback((r) => {
    focus();
    const editList = [];
    for (let x2 = r.x; x2 < r.x + r.width; x2++) {
      for (let y2 = r.y; y2 < r.y + r.height; y2++) {
        const cellValue = getCellContent([x2 - rowMarkerOffset, y2]);
        if (!cellValue.allowOverlay && cellValue.kind !== GridCellKind.Boolean)
          continue;
        let newVal = void 0;
        if (cellValue.kind === GridCellKind.Custom) {
          const toDelete = getCellRenderer(cellValue);
          const editor = toDelete?.provideEditor?.({
            ...cellValue,
            location: [x2 - rowMarkerOffset, y2]
          });
          if (toDelete?.onDelete !== void 0) {
            newVal = toDelete.onDelete(cellValue);
          } else if (isObjectEditorCallbackResult(editor)) {
            newVal = editor?.deletedValue?.(cellValue);
          }
        } else if (isEditableGridCell(cellValue) && cellValue.allowOverlay || cellValue.kind === GridCellKind.Boolean) {
          const toDelete = getCellRenderer(cellValue);
          newVal = toDelete?.onDelete?.(cellValue);
        }
        if (newVal !== void 0 && !isInnerOnlyCell(newVal) && isEditableGridCell(newVal)) {
          editList.push({ location: [x2, y2], value: newVal });
        }
      }
    }
    mangledOnCellsEdited(editList);
    gridRef.current?.damage(editList.map((x2) => ({ cell: x2.location })));
  }, [focus, getCellContent, getCellRenderer, mangledOnCellsEdited, rowMarkerOffset]);
  const overlayOpen = overlay !== void 0;
  const handleFixedKeybindings = React27.useCallback((event) => {
    const cancel = () => {
      event.stopPropagation();
      event.preventDefault();
    };
    const details = {
      didMatch: false
    };
    const { bounds } = event;
    const selectedColumns = gridSelection.columns;
    const selectedRows = gridSelection.rows;
    const keys = keybindings;
    if (!overlayOpen && isHotkey(keys.clear, event, details)) {
      setGridSelection(emptyGridSelection, false);
      onSelectionCleared?.();
    } else if (!overlayOpen && isHotkey(keys.selectAll, event, details)) {
      setGridSelection({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: gridSelection.current?.cell ?? [rowMarkerOffset, 0],
          range: {
            x: rowMarkerOffset,
            y: 0,
            width: columnsIn.length,
            height: rows
          },
          rangeStack: []
        }
      }, false);
    } else if (isHotkey(keys.search, event, details)) {
      searchInputRef?.current?.focus({ preventScroll: true });
      setShowSearchInner(true);
    } else if (isHotkey(keys.delete, event, details)) {
      const callbackResult = onDelete?.(gridSelection) ?? true;
      if (callbackResult !== false) {
        const toDelete = callbackResult === true ? gridSelection : callbackResult;
        if (toDelete.current !== void 0) {
          deleteRange(toDelete.current.range);
          for (const r of toDelete.current.rangeStack) {
            deleteRange(r);
          }
        }
        for (const r of toDelete.rows) {
          deleteRange({
            x: rowMarkerOffset,
            y: r,
            width: columnsIn.length,
            height: 1
          });
        }
        for (const col2 of toDelete.columns) {
          deleteRange({
            x: col2,
            y: 0,
            width: 1,
            height: rows
          });
        }
      }
    }
    if (details.didMatch) {
      cancel();
      return true;
    }
    if (gridSelection.current === void 0)
      return false;
    let [col, row] = gridSelection.current.cell;
    const [, startRow] = gridSelection.current.cell;
    let freeMove = false;
    let cancelOnlyOnMove = false;
    if (isHotkey(keys.scrollToSelectedCell, event, details)) {
      scrollToRef.current(col - rowMarkerOffset, row);
    } else if (columnSelect !== "none" && isHotkey(keys.selectColumn, event, details)) {
      if (selectedColumns.hasIndex(col)) {
        setSelectedColumns(selectedColumns.remove(col), void 0, true);
      } else {
        if (columnSelect === "single") {
          setSelectedColumns(CompactSelection.fromSingleSelection(col), void 0, true);
        } else {
          setSelectedColumns(void 0, col, true);
        }
      }
    } else if (rowSelect !== "none" && isHotkey(keys.selectRow, event, details)) {
      if (selectedRows.hasIndex(row)) {
        setSelectedRows(selectedRows.remove(row), void 0, true);
      } else {
        if (rowSelect === "single") {
          setSelectedRows(CompactSelection.fromSingleSelection(row), void 0, true);
        } else {
          setSelectedRows(void 0, row, true);
        }
      }
    } else if (!overlayOpen && bounds !== void 0 && isHotkey(keys.activateCell, event, details)) {
      if (row === rows && showTrailingBlankRow) {
        window.setTimeout(() => {
          const customTargetColumn = getCustomNewRowTargetColumn(col);
          void appendRow(customTargetColumn ?? col);
        }, 0);
      } else {
        const activationEvent = {
          inputType: "keyboard",
          key: event.key
        };
        onCellActivated?.([col - rowMarkerOffset, row], activationEvent);
        reselect(bounds, activationEvent);
      }
    } else if (gridSelection.current.range.height > 1 && isHotkey(keys.downFill, event, details)) {
      fillDown();
    } else if (gridSelection.current.range.width > 1 && isHotkey(keys.rightFill, event, details)) {
      fillRight();
    } else if (isHotkey(keys.goToNextPage, event, details)) {
      row += Math.max(1, visibleRegionRef.current.height - 4);
    } else if (isHotkey(keys.goToPreviousPage, event, details)) {
      row -= Math.max(1, visibleRegionRef.current.height - 4);
    } else if (isHotkey(keys.goToFirstCell, event, details)) {
      setOverlay(void 0);
      row = 0;
      col = 0;
    } else if (isHotkey(keys.goToLastCell, event, details)) {
      setOverlay(void 0);
      row = Number.MAX_SAFE_INTEGER;
      col = Number.MAX_SAFE_INTEGER;
    } else if (isHotkey(keys.selectToFirstCell, event, details)) {
      setOverlay(void 0);
      adjustSelection([-2, -2]);
    } else if (isHotkey(keys.selectToLastCell, event, details)) {
      setOverlay(void 0);
      adjustSelection([2, 2]);
    } else if (!overlayOpen) {
      if (isHotkey(keys.goDownCell, event, details)) {
        row += 1;
      } else if (isHotkey(keys.goUpCell, event, details)) {
        row -= 1;
      } else if (isHotkey(keys.goRightCell, event, details)) {
        col += 1;
      } else if (isHotkey(keys.goLeftCell, event, details)) {
        col -= 1;
      } else if (isHotkey(keys.goDownCellRetainSelection, event, details)) {
        row += 1;
        freeMove = true;
      } else if (isHotkey(keys.goUpCellRetainSelection, event, details)) {
        row -= 1;
        freeMove = true;
      } else if (isHotkey(keys.goRightCellRetainSelection, event, details)) {
        col += 1;
        freeMove = true;
      } else if (isHotkey(keys.goLeftCellRetainSelection, event, details)) {
        col -= 1;
        freeMove = true;
      } else if (isHotkey(keys.goToLastRow, event, details)) {
        row = rows - 1;
      } else if (isHotkey(keys.goToFirstRow, event, details)) {
        row = Number.MIN_SAFE_INTEGER;
      } else if (isHotkey(keys.goToLastColumn, event, details)) {
        col = Number.MAX_SAFE_INTEGER;
      } else if (isHotkey(keys.goToFirstColumn, event, details)) {
        col = Number.MIN_SAFE_INTEGER;
      } else if (rangeSelect === "rect" || rangeSelect === "multi-rect") {
        if (isHotkey(keys.selectGrowDown, event, details)) {
          adjustSelection([0, 1]);
        } else if (isHotkey(keys.selectGrowUp, event, details)) {
          adjustSelection([0, -1]);
        } else if (isHotkey(keys.selectGrowRight, event, details)) {
          adjustSelection([1, 0]);
        } else if (isHotkey(keys.selectGrowLeft, event, details)) {
          adjustSelection([-1, 0]);
        } else if (isHotkey(keys.selectToLastRow, event, details)) {
          adjustSelection([0, 2]);
        } else if (isHotkey(keys.selectToFirstRow, event, details)) {
          adjustSelection([0, -2]);
        } else if (isHotkey(keys.selectToLastColumn, event, details)) {
          adjustSelection([2, 0]);
        } else if (isHotkey(keys.selectToFirstColumn, event, details)) {
          adjustSelection([-2, 0]);
        }
      }
      cancelOnlyOnMove = details.didMatch;
    } else {
      if (isHotkey(keys.closeOverlay, event, details)) {
        setOverlay(void 0);
      }
      if (isHotkey(keys.acceptOverlayDown, event, details)) {
        setOverlay(void 0);
        row++;
      }
      if (isHotkey(keys.acceptOverlayUp, event, details)) {
        setOverlay(void 0);
        row--;
      }
      if (isHotkey(keys.acceptOverlayLeft, event, details)) {
        setOverlay(void 0);
        col--;
      }
      if (isHotkey(keys.acceptOverlayRight, event, details)) {
        setOverlay(void 0);
        col++;
      }
    }
    const mustRestrictRow = rowGroupingNavBehavior !== void 0 && rowGroupingNavBehavior !== "normal";
    if (mustRestrictRow && row !== startRow) {
      const skipUp = rowGroupingNavBehavior === "skip-up" || rowGroupingNavBehavior === "skip" || rowGroupingNavBehavior === "block";
      const skipDown = rowGroupingNavBehavior === "skip-down" || rowGroupingNavBehavior === "skip" || rowGroupingNavBehavior === "block";
      const didMoveUp = row < startRow;
      if (didMoveUp && skipUp) {
        while (row >= 0 && mapper(row).isGroupHeader) {
          row--;
        }
        if (row < 0) {
          row = startRow;
        }
      } else if (!didMoveUp && skipDown) {
        while (row < rows && mapper(row).isGroupHeader) {
          row++;
        }
        if (row >= rows) {
          row = startRow;
        }
      }
    }
    const moved = updateSelectedCell(col, row, false, freeMove);
    const didMatch = details.didMatch;
    if (didMatch && (moved || !cancelOnlyOnMove || trapFocus)) {
      cancel();
    }
    return didMatch;
  }, [
    rowGroupingNavBehavior,
    overlayOpen,
    gridSelection,
    keybindings,
    columnSelect,
    rowSelect,
    rangeSelect,
    rowMarkerOffset,
    mapper,
    rows,
    updateSelectedCell,
    setGridSelection,
    onSelectionCleared,
    columnsIn.length,
    onDelete,
    trapFocus,
    deleteRange,
    setSelectedColumns,
    setSelectedRows,
    showTrailingBlankRow,
    getCustomNewRowTargetColumn,
    appendRow,
    onCellActivated,
    reselect,
    fillDown,
    fillRight,
    adjustSelection
  ]);
  const onKeyDown = React27.useCallback((event) => {
    let cancelled = false;
    if (onKeyDownIn !== void 0) {
      onKeyDownIn({
        ...event,
        ...event.location && {
          location: [event.location[0] - rowMarkerOffset, event.location[1]]
        },
        cancel: () => {
          cancelled = true;
        }
      });
    }
    if (cancelled)
      return;
    if (handleFixedKeybindings(event))
      return;
    if (gridSelection.current === void 0)
      return;
    const [col, row] = gridSelection.current.cell;
    const vr = visibleRegionRef.current;
    if (editOnType && !event.metaKey && !event.ctrlKey && gridSelection.current !== void 0 && event.key.length === 1 && /[\p{L}\p{M}\p{N}\p{S}\p{P}]/u.test(event.key) && event.bounds !== void 0 && isReadWriteCell(getCellContent([col - rowMarkerOffset, Math.max(0, Math.min(row, rows - 1))]))) {
      if ((!showTrailingBlankRow || row !== rows) && (vr.y > row || row > vr.y + vr.height || vr.x > col || col > vr.x + vr.width)) {
        return;
      }
      const activationEvent = {
        inputType: "keyboard",
        key: event.key
      };
      onCellActivated?.([col - rowMarkerOffset, row], activationEvent);
      reselect(event.bounds, activationEvent, event.key);
      event.stopPropagation();
      event.preventDefault();
    }
  }, [
    editOnType,
    onKeyDownIn,
    handleFixedKeybindings,
    gridSelection,
    getCellContent,
    rowMarkerOffset,
    rows,
    showTrailingBlankRow,
    onCellActivated,
    reselect
  ]);
  const onContextMenu = React27.useCallback((args, preventDefault) => {
    const adjustedCol = args.location[0] - rowMarkerOffset;
    if (args.kind === "header") {
      onHeaderContextMenu?.(adjustedCol, { ...args, preventDefault });
    }
    if (args.kind === groupHeaderKind) {
      if (adjustedCol < 0) {
        return;
      }
      onGroupHeaderContextMenu?.(adjustedCol, { ...args, preventDefault });
    }
    if (args.kind === "cell") {
      const [col, row] = args.location;
      onCellContextMenu?.([adjustedCol, row], {
        ...args,
        preventDefault
      });
      if (!gridSelectionHasItem(gridSelection, args.location)) {
        updateSelectedCell(col, row, false, false);
      }
    }
  }, [
    gridSelection,
    onCellContextMenu,
    onGroupHeaderContextMenu,
    onHeaderContextMenu,
    rowMarkerOffset,
    updateSelectedCell
  ]);
  const onPasteInternal = React27.useCallback(async (e) => {
    if (!keybindings.paste)
      return;
    function pasteToCell(inner, target2, rawValue, formatted) {
      const stringifiedRawValue = typeof rawValue === "object" ? rawValue?.join("\n") ?? "" : rawValue?.toString() ?? "";
      if (!isInnerOnlyCell(inner) && isReadWriteCell(inner) && inner.readonly !== true) {
        const coerced = coercePasteValue?.(stringifiedRawValue, inner);
        if (coerced !== void 0 && isEditableGridCell(coerced)) {
          if (coerced.kind !== inner.kind) {
            console.warn("Coercion should not change cell kind.");
          }
          return {
            location: target2,
            value: coerced
          };
        }
        const r = getCellRenderer(inner);
        if (r === void 0)
          return void 0;
        if (r.kind === GridCellKind.Custom) {
          assert(inner.kind === GridCellKind.Custom);
          const newVal = r.onPaste?.(stringifiedRawValue, inner.data);
          if (newVal === void 0)
            return void 0;
          return {
            location: target2,
            value: {
              ...inner,
              data: newVal
            }
          };
        } else {
          const newVal = r.onPaste?.(stringifiedRawValue, inner, {
            formatted,
            formattedString: typeof formatted === "string" ? formatted : formatted?.join("\n"),
            rawValue
          });
          if (newVal === void 0)
            return void 0;
          assert(newVal.kind === inner.kind);
          return {
            location: target2,
            value: newVal
          };
        }
      }
      return void 0;
    }
    const selectedColumns = gridSelection.columns;
    const selectedRows = gridSelection.rows;
    const focused = scrollRef.current?.contains(document.activeElement) === true || canvasRef.current?.contains(document.activeElement) === true;
    let target;
    if (gridSelection.current !== void 0) {
      target = [gridSelection.current.range.x, gridSelection.current.range.y];
    } else if (selectedColumns.length === 1) {
      target = [selectedColumns.first() ?? 0, 0];
    } else if (selectedRows.length === 1) {
      target = [rowMarkerOffset, selectedRows.first() ?? 0];
    }
    if (focused && target !== void 0) {
      let data;
      let text;
      const textPlain = "text/plain";
      const textHtml = "text/html";
      if (navigator.clipboard.read !== void 0) {
        const clipboardContent = await navigator.clipboard.read();
        for (const item of clipboardContent) {
          if (item.types.includes(textHtml)) {
            const htmlBlob = await item.getType(textHtml);
            const html = await htmlBlob.text();
            const decoded = decodeHTML(html);
            if (decoded !== void 0) {
              data = decoded;
              break;
            }
          }
          if (item.types.includes(textPlain)) {
            text = await (await item.getType(textPlain)).text();
          }
        }
      } else if (navigator.clipboard.readText !== void 0) {
        text = await navigator.clipboard.readText();
      } else if (e !== void 0 && e?.clipboardData !== null) {
        if (e.clipboardData.types.includes(textHtml)) {
          const html = e.clipboardData.getData(textHtml);
          data = decodeHTML(html);
        }
        if (data === void 0 && e.clipboardData.types.includes(textPlain)) {
          text = e.clipboardData.getData(textPlain);
        }
      } else {
        return;
      }
      const [targetCol, targetRow] = target;
      const editList = [];
      do {
        if (onPaste === void 0) {
          const cellData = getMangledCellContent(target);
          const rawValue = text ?? data?.map((r) => r.map((cb) => cb.rawValue).join("	")).join("	") ?? "";
          const newVal = pasteToCell(cellData, target, rawValue, void 0);
          if (newVal !== void 0) {
            editList.push(newVal);
          }
          break;
        }
        if (data === void 0) {
          if (text === void 0)
            return;
          data = unquote(text);
        }
        if (onPaste === false || typeof onPaste === "function" && onPaste?.([target[0] - rowMarkerOffset, target[1]], data.map((r) => r.map((cb) => cb.rawValue?.toString() ?? ""))) !== true) {
          return;
        }
        for (const [row, dataRow] of data.entries()) {
          if (row + targetRow >= rows)
            break;
          for (const [col, dataItem] of dataRow.entries()) {
            const index = [col + targetCol, row + targetRow];
            const [writeCol, writeRow] = index;
            if (writeCol >= mangledCols.length)
              continue;
            if (writeRow >= mangledRows)
              continue;
            const cellData = getMangledCellContent(index);
            const newVal = pasteToCell(cellData, index, dataItem.rawValue, dataItem.formatted);
            if (newVal !== void 0) {
              editList.push(newVal);
            }
          }
        }
      } while (false);
      mangledOnCellsEdited(editList);
      gridRef.current?.damage(editList.map((c) => ({
        cell: c.location
      })));
    }
  }, [
    coercePasteValue,
    getCellRenderer,
    getMangledCellContent,
    gridSelection,
    keybindings.paste,
    scrollRef,
    mangledCols.length,
    mangledOnCellsEdited,
    mangledRows,
    onPaste,
    rowMarkerOffset,
    rows
  ]);
  useEventListener("paste", onPasteInternal, safeWindow, false, true);
  const onCopy = React27.useCallback(async (e, ignoreFocus) => {
    if (!keybindings.copy)
      return;
    const focused = ignoreFocus === true || scrollRef.current?.contains(document.activeElement) === true || canvasRef.current?.contains(document.activeElement) === true;
    const selectedColumns = gridSelection.columns;
    const selectedRows = gridSelection.rows;
    const copyToClipboardWithHeaders = (cells, columnIndexes) => {
      if (!copyHeaders) {
        copyToClipboard(cells, columnIndexes, e);
      } else {
        const headers = columnIndexes.map((index) => ({
          kind: GridCellKind.Text,
          data: columnsIn[index].title,
          displayData: columnsIn[index].title,
          allowOverlay: false
        }));
        copyToClipboard([headers, ...cells], columnIndexes, e);
      }
    };
    if (focused && getCellsForSelection !== void 0) {
      if (gridSelection.current !== void 0) {
        let thunk = getCellsForSelection(gridSelection.current.range, abortControllerRef.current.signal);
        if (typeof thunk !== "object") {
          thunk = await thunk();
        }
        copyToClipboardWithHeaders(thunk, (0, import_range2.default)(gridSelection.current.range.x - rowMarkerOffset, gridSelection.current.range.x + gridSelection.current.range.width - rowMarkerOffset));
      } else if (selectedRows !== void 0 && selectedRows.length > 0) {
        const toCopy = [...selectedRows];
        const cells = toCopy.map((rowIndex) => {
          const thunk = getCellsForSelection({
            x: rowMarkerOffset,
            y: rowIndex,
            width: columnsIn.length,
            height: 1
          }, abortControllerRef.current.signal);
          if (typeof thunk === "object") {
            return thunk[0];
          }
          return thunk().then((v3) => v3[0]);
        });
        if (cells.some((x2) => x2 instanceof Promise)) {
          const settled = await Promise.all(cells);
          copyToClipboardWithHeaders(settled, (0, import_range2.default)(columnsIn.length));
        } else {
          copyToClipboardWithHeaders(cells, (0, import_range2.default)(columnsIn.length));
        }
      } else if (selectedColumns.length > 0) {
        const results = [];
        const cols = [];
        for (const col of selectedColumns) {
          let thunk = getCellsForSelection({
            x: col,
            y: 0,
            width: 1,
            height: rows
          }, abortControllerRef.current.signal);
          if (typeof thunk !== "object") {
            thunk = await thunk();
          }
          results.push(thunk);
          cols.push(col - rowMarkerOffset);
        }
        if (results.length === 1) {
          copyToClipboardWithHeaders(results[0], cols);
        } else {
          const toCopy = results.reduce((pv, cv) => pv.map((row, index) => [...row, ...cv[index]]));
          copyToClipboardWithHeaders(toCopy, cols);
        }
      }
    }
  }, [
    columnsIn,
    getCellsForSelection,
    gridSelection,
    keybindings.copy,
    rowMarkerOffset,
    scrollRef,
    rows,
    copyHeaders
  ]);
  useEventListener("copy", onCopy, safeWindow, false, false);
  const onCut = React27.useCallback(async (e) => {
    if (!keybindings.cut)
      return;
    const focused = scrollRef.current?.contains(document.activeElement) === true || canvasRef.current?.contains(document.activeElement) === true;
    if (!focused)
      return;
    await onCopy(e);
    if (gridSelection.current !== void 0) {
      let effectiveSelection = {
        current: {
          cell: gridSelection.current.cell,
          range: gridSelection.current.range,
          rangeStack: []
        },
        rows: CompactSelection.empty(),
        columns: CompactSelection.empty()
      };
      const onDeleteResult = onDelete?.(effectiveSelection);
      if (onDeleteResult === false)
        return;
      effectiveSelection = onDeleteResult === true ? effectiveSelection : onDeleteResult;
      if (effectiveSelection.current === void 0)
        return;
      deleteRange(effectiveSelection.current.range);
    }
  }, [deleteRange, gridSelection, keybindings.cut, onCopy, scrollRef, onDelete]);
  useEventListener("cut", onCut, safeWindow, false, false);
  const onSearchResultsChanged = React27.useCallback((results, navIndex) => {
    if (onSearchResultsChangedIn !== void 0) {
      if (rowMarkerOffset !== 0) {
        results = results.map((item) => [item[0] - rowMarkerOffset, item[1]]);
      }
      onSearchResultsChangedIn(results, navIndex);
      return;
    }
    if (results.length === 0 || navIndex === -1)
      return;
    const [col, row] = results[navIndex];
    if (lastSent.current !== void 0 && lastSent.current[0] === col && lastSent.current[1] === row) {
      return;
    }
    lastSent.current = [col, row];
    updateSelectedCell(col, row, false, false);
  }, [onSearchResultsChangedIn, rowMarkerOffset, updateSelectedCell]);
  const [outCol, outRow] = gridSelectionOuter?.current?.cell ?? [];
  const scrollToRef = React27.useRef(scrollTo);
  scrollToRef.current = scrollTo;
  React27.useLayoutEffect(() => {
    if (scrollToActiveCellRef.current && !hasJustScrolled.current && outCol !== void 0 && outRow !== void 0 && (outCol !== expectedExternalGridSelection.current?.current?.cell[0] || outRow !== expectedExternalGridSelection.current?.current?.cell[1])) {
      scrollToRef.current(outCol, outRow);
    }
    hasJustScrolled.current = false;
  }, [outCol, outRow]);
  const selectionOutOfBounds = gridSelection.current !== void 0 && (gridSelection.current.cell[0] >= mangledCols.length || gridSelection.current.cell[1] >= mangledRows);
  React27.useLayoutEffect(() => {
    if (selectionOutOfBounds) {
      setGridSelection(emptyGridSelection, false);
    }
  }, [selectionOutOfBounds, setGridSelection]);
  const disabledRows = React27.useMemo(() => {
    if (showTrailingBlankRow === true && trailingRowOptions?.tint === true) {
      return CompactSelection.fromSingleSelection(mangledRows - 1);
    }
    return CompactSelection.empty();
  }, [mangledRows, showTrailingBlankRow, trailingRowOptions?.tint]);
  const mangledVerticalBorder = React27.useCallback((col) => {
    return typeof verticalBorder === "boolean" ? verticalBorder : verticalBorder?.(col - rowMarkerOffset) ?? true;
  }, [rowMarkerOffset, verticalBorder]);
  const renameGroupNode = React27.useMemo(() => {
    if (renameGroup === void 0 || canvasRef.current === null)
      return null;
    const { bounds, group } = renameGroup;
    const canvasBounds = canvasRef.current.getBoundingClientRect();
    return React27.createElement(GroupRename, { bounds, group, canvasBounds, onClose: () => setRenameGroup(void 0), onFinish: (newVal) => {
      setRenameGroup(void 0);
      onGroupHeaderRenamed?.(group, newVal);
    } });
  }, [onGroupHeaderRenamed, renameGroup]);
  const mangledFreezeColumns = Math.min(mangledCols.length, freezeColumns + (hasRowMarkers ? 1 : 0));
  React27.useImperativeHandle(forwardedRef, () => ({
    appendRow: (col, openOverlay) => appendRow(col + rowMarkerOffset, openOverlay),
    appendColumn: (row, openOverlay) => appendColumn(row, openOverlay),
    updateCells: (damageList) => {
      if (rowMarkerOffset !== 0) {
        damageList = damageList.map((x2) => ({ cell: [x2.cell[0] + rowMarkerOffset, x2.cell[1]] }));
      }
      return gridRef.current?.damage(damageList);
    },
    getBounds: (col, row) => {
      if (canvasRef?.current === null || scrollRef?.current === null) {
        return void 0;
      }
      if (col === void 0 && row === void 0) {
        const rect = canvasRef.current.getBoundingClientRect();
        const scale = rect.width / scrollRef.current.clientWidth;
        return {
          x: rect.x - scrollRef.current.scrollLeft * scale,
          y: rect.y - scrollRef.current.scrollTop * scale,
          width: scrollRef.current.scrollWidth * scale,
          height: scrollRef.current.scrollHeight * scale
        };
      }
      return gridRef.current?.getBounds((col ?? 0) + rowMarkerOffset, row);
    },
    focus: () => gridRef.current?.focus(),
    emit: async (e) => {
      switch (e) {
        case "delete":
          onKeyDown({
            bounds: void 0,
            cancel: () => void 0,
            stopPropagation: () => void 0,
            preventDefault: () => void 0,
            ctrlKey: false,
            key: "Delete",
            keyCode: 46,
            metaKey: false,
            shiftKey: false,
            altKey: false,
            rawEvent: void 0,
            location: void 0
          });
          break;
        case "fill-right":
          onKeyDown({
            bounds: void 0,
            cancel: () => void 0,
            stopPropagation: () => void 0,
            preventDefault: () => void 0,
            ctrlKey: true,
            key: "r",
            keyCode: 82,
            metaKey: false,
            shiftKey: false,
            altKey: false,
            rawEvent: void 0,
            location: void 0
          });
          break;
        case "fill-down":
          onKeyDown({
            bounds: void 0,
            cancel: () => void 0,
            stopPropagation: () => void 0,
            preventDefault: () => void 0,
            ctrlKey: true,
            key: "d",
            keyCode: 68,
            metaKey: false,
            shiftKey: false,
            altKey: false,
            rawEvent: void 0,
            location: void 0
          });
          break;
        case "copy":
          await onCopy(void 0, true);
          break;
        case "paste":
          await onPasteInternal();
          break;
      }
    },
    scrollTo,
    remeasureColumns: (cols) => {
      for (const col of cols) {
        void normalSizeColumn(col + rowMarkerOffset);
      }
    },
    getMouseArgsForPosition: (posX, posY, ev) => {
      if (gridRef?.current === null) {
        return void 0;
      }
      const args = gridRef.current.getMouseArgsForPosition(posX, posY, ev);
      if (args === void 0) {
        return void 0;
      }
      return {
        ...args,
        location: [args.location[0] - rowMarkerOffset, args.location[1]]
      };
    }
  }), [
    appendRow,
    appendColumn,
    normalSizeColumn,
    scrollRef,
    onCopy,
    onKeyDown,
    onPasteInternal,
    rowMarkerOffset,
    scrollTo
  ]);
  const [selCol, selRow] = currentCell ?? [];
  const onCellFocused = React27.useCallback((cell) => {
    const [col, row] = cell;
    if (row === -1) {
      if (columnSelect !== "none") {
        setSelectedColumns(CompactSelection.fromSingleSelection(col), void 0, false);
        focus();
      }
      return;
    }
    if (selCol === col && selRow === row)
      return;
    setCurrent({
      cell,
      range: { x: col, y: row, width: 1, height: 1 }
    }, true, false, "keyboard-nav");
    scrollTo(col, row);
  }, [columnSelect, focus, scrollTo, selCol, selRow, setCurrent, setSelectedColumns]);
  const [isFocused, setIsFocused] = React27.useState(false);
  const setIsFocusedDebounced = React27.useRef((0, import_debounce2.default)((val) => {
    setIsFocused(val);
  }, 5));
  const onCanvasFocused = React27.useCallback(() => {
    setIsFocusedDebounced.current(true);
    if (gridSelection.current === void 0 && gridSelection.columns.length === 0 && gridSelection.rows.length === 0 && mouseState === void 0) {
      setCurrent({
        cell: [rowMarkerOffset, cellYOffset],
        range: {
          x: rowMarkerOffset,
          y: cellYOffset,
          width: 1,
          height: 1
        }
      }, true, false, "keyboard-select");
    }
  }, [cellYOffset, gridSelection, mouseState, rowMarkerOffset, setCurrent]);
  const onFocusOut = React27.useCallback(() => {
    setIsFocusedDebounced.current(false);
  }, []);
  const [idealWidth, idealHeight] = React27.useMemo(() => {
    let h;
    const scrollbarWidth = experimental?.scrollbarWidthOverride ?? getScrollBarWidth();
    const rowsCountWithTrailingRow = rows + (showTrailingBlankRow ? 1 : 0);
    if (typeof rowHeight === "number") {
      h = totalHeaderHeight + rowsCountWithTrailingRow * rowHeight;
    } else {
      let avg = 0;
      const toAverage = Math.min(rowsCountWithTrailingRow, 10);
      for (let i = 0; i < toAverage; i++) {
        avg += rowHeight(i);
      }
      avg = Math.floor(avg / toAverage);
      h = totalHeaderHeight + rowsCountWithTrailingRow * avg;
    }
    h += scrollbarWidth;
    const w3 = mangledCols.reduce((acc, x2) => x2.width + acc, 0) + scrollbarWidth;
    return [`${Math.min(1e5, w3)}px`, `${Math.min(1e5, h)}px`];
  }, [mangledCols, experimental?.scrollbarWidthOverride, rowHeight, rows, showTrailingBlankRow, totalHeaderHeight]);
  const cssStyle = React27.useMemo(() => {
    return makeCSSStyle(mergedTheme);
  }, [mergedTheme]);
  return React27.createElement(
    ThemeContext.Provider,
    { value: mergedTheme },
    React27.createElement(
      DataEditorContainer,
      { style: cssStyle, className, inWidth: width ?? idealWidth, inHeight: height ?? idealHeight },
      React27.createElement(data_grid_search_default, { fillHandle, drawFocusRing, experimental, fixedShadowX, fixedShadowY, getRowThemeOverride, headerIcons, imageWindowLoader, initialSize, isDraggable, onDragLeave, onRowMoved, overscrollX, overscrollY, preventDiagonalScrolling, rightElement, rightElementProps, smoothScrollX, smoothScrollY, className, enableGroups, onCanvasFocused, onCanvasBlur: onFocusOut, canvasRef, onContextMenu, theme: mergedTheme, cellXOffset, cellYOffset, accessibilityHeight: visibleRegion.height, onDragEnd, columns: mangledCols, nonGrowWidth, drawHeader: drawHeader2, onColumnProposeMove: onColumnProposeMoveImpl, drawCell: drawCell2, disabledRows, freezeColumns: mangledFreezeColumns, lockColumns: rowMarkerOffset, firstColAccessible: rowMarkerOffset === 0, getCellContent: getMangledCellContent, minColumnWidth, maxColumnWidth, searchInputRef, showSearch, onSearchClose, highlightRegions, getCellsForSelection, getGroupDetails: mangledGetGroupDetails, headerHeight, isFocused, groupHeaderHeight: enableGroups ? groupHeaderHeight : 0, freezeTrailingRows: freezeTrailingRows + (showTrailingBlankRow && trailingRowOptions?.sticky === true ? 1 : 0), hasAppendRow: showTrailingBlankRow, onColumnResize, onColumnResizeEnd, onColumnResizeStart, onCellFocused, onColumnMoved: onColumnMovedImpl, onDragStart: onDragStartImpl, onHeaderMenuClick: onHeaderMenuClickInner, onHeaderIndicatorClick: onHeaderIndicatorClickInner, onItemHovered: onItemHoveredImpl, isFilling: mouseState?.fillHandle === true, onMouseMove: onMouseMoveImpl, onKeyDown, onKeyUp: onKeyUpIn, onMouseDown, onMouseUp, onDragOverCell, onDrop, onSearchResultsChanged, onVisibleRegionChanged: onVisibleRegionChangedImpl, clientSize, rowHeight, searchResults, searchValue, onSearchValueChange, rows: mangledRows, scrollRef, selection: gridSelection, translateX: visibleRegion.tx, translateY: visibleRegion.ty, verticalBorder: mangledVerticalBorder, gridRef, getCellRenderer, resizeIndicator }),
      renameGroupNode,
      overlay !== void 0 && React27.createElement(
        React27.Suspense,
        { fallback: null },
        React27.createElement(DataGridOverlayEditor2, { ...overlay, validateCell, bloom: editorBloom, id: overlayID, getCellRenderer, className: experimental?.isSubGrid === true ? "click-outside-ignore" : void 0, provideEditor, imageEditorOverride, portalElementRef, onFinishEditing, markdownDivCreateNode, isOutsideClick, customEventTarget: experimental?.eventTarget })
      )
    )
  );
};
var DataEditor = React27.forwardRef(DataEditorImpl);

// vendor/glide-data-grid/dist/esm/cells/boolean-cell.js
init_data_grid_types();
function isOverEditableRegion(e) {
  const { cell, posX: pointerX, posY: pointerY, bounds, theme } = e;
  const { width, height, x: cellX, y: cellY } = bounds;
  const maxWidth = cell.maxSize ?? theme.checkboxMaxSize;
  const cellCenterY = Math.floor(bounds.y + height / 2);
  const checkBoxWidth = getSquareWidth(maxWidth, height, theme.cellVerticalPadding);
  const posX = getSquareXPosFromAlign(cell.contentAlign ?? "center", cellX, width, theme.cellHorizontalPadding, checkBoxWidth);
  const bb = getSquareBB(posX, cellCenterY, checkBoxWidth);
  const checkBoxClicked = pointIsWithinBB(cellX + pointerX, cellY + pointerY, bb);
  return booleanCellIsEditable(cell) && checkBoxClicked;
}
var booleanCellRenderer = {
  getAccessibilityString: (c) => c.data?.toString() ?? "false",
  kind: GridCellKind.Boolean,
  needsHover: true,
  useLabel: false,
  needsHoverPosition: true,
  measure: () => 50,
  draw: (a) => drawBoolean(a, a.cell.data, booleanCellIsEditable(a.cell), a.cell.maxSize ?? a.theme.checkboxMaxSize, a.cell.hoverEffectIntensity ?? 0.35),
  onDelete: (c) => ({
    ...c,
    data: false
  }),
  onSelect: (e) => {
    if (isOverEditableRegion(e)) {
      e.preventDefault();
    }
  },
  onClick: (e) => {
    if (isOverEditableRegion(e)) {
      return {
        ...e.cell,
        data: toggleBoolean(e.cell.data)
      };
    }
    return void 0;
  },
  onPaste: (toPaste, cell) => {
    let newVal = BooleanEmpty;
    if (toPaste.toLowerCase() === "true") {
      newVal = true;
    } else if (toPaste.toLowerCase() === "false") {
      newVal = false;
    } else if (toPaste.toLowerCase() === "indeterminate") {
      newVal = BooleanIndeterminate;
    }
    return newVal === cell.data ? void 0 : {
      ...cell,
      data: newVal
    };
  }
};
function drawBoolean(args, data, canEdit, maxSize, hoverEffectIntensity) {
  if (!canEdit && data === BooleanEmpty) {
    return;
  }
  const { ctx, hoverAmount, theme, rect, highlighted, hoverX, hoverY, cell: { contentAlign } } = args;
  const { x: x2, y: y2, width: w3, height: h } = rect;
  let shouldRestoreAlpha = false;
  if (hoverEffectIntensity > 0) {
    let alpha = canEdit ? 1 - hoverEffectIntensity + hoverEffectIntensity * hoverAmount : 0.4;
    if (data === BooleanEmpty) {
      alpha *= hoverAmount;
    }
    if (alpha === 0) {
      return;
    }
    if (alpha < 1) {
      shouldRestoreAlpha = true;
      ctx.globalAlpha = alpha;
    }
  }
  drawCheckbox(ctx, theme, data, x2, y2, w3, h, highlighted, hoverX, hoverY, maxSize, contentAlign);
  if (shouldRestoreAlpha) {
    ctx.globalAlpha = 1;
  }
}

// vendor/glide-data-grid/dist/esm/cells/bubble-cell.js
import * as React29 from "react";

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/bubbles-overlay-editor.js
import * as React28 from "react";

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/bubbles-overlay-editor-style.js
init_dist2();
var BubblesOverlayEditorStyle = /* @__PURE__ */ styled_default("div")({
  name: "BubblesOverlayEditorStyle",
  class: "gdg-b1ygi5by",
  propsAsIs: false
});

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/bubbles-overlay-editor.js
var BubblesOverlayEditor = (p2) => {
  const { bubbles } = p2;
  return React28.createElement(
    BubblesOverlayEditorStyle,
    null,
    bubbles.map((b3, i) => React28.createElement("div", { key: i, className: "boe-bubble" }, b3)),
    React28.createElement("textarea", { className: "gdg-input", autoFocus: true })
  );
};
var bubbles_overlay_editor_default = BubblesOverlayEditor;

// vendor/glide-data-grid/dist/esm/cells/bubble-cell.js
init_data_grid_types();
var bubbleCellRenderer = {
  getAccessibilityString: (c) => makeAccessibilityStringForArray(c.data),
  kind: GridCellKind.Bubble,
  needsHover: false,
  useLabel: false,
  needsHoverPosition: false,
  measure: (ctx, cell, theme) => {
    const bubblesWidth = cell.data.reduce((acc, data) => ctx.measureText(data).width + acc + theme.bubblePadding * 2 + theme.bubbleMargin, 0);
    if (cell.data.length === 0)
      return theme.cellHorizontalPadding * 2;
    return bubblesWidth + 2 * theme.cellHorizontalPadding - theme.bubbleMargin;
  },
  draw: (a) => drawBubbles(a, a.cell.data),
  provideEditor: () => (p2) => {
    const { value } = p2;
    return React29.createElement(bubbles_overlay_editor_default, { bubbles: value.data });
  },
  onPaste: () => void 0
};
function drawBubbles(args, data) {
  const { rect, theme, ctx, highlighted } = args;
  const { x: x2, y: y2, width: w3, height: h } = rect;
  let renderX = x2 + theme.cellHorizontalPadding;
  const renderBoxes = [];
  for (const s of data) {
    if (renderX > x2 + w3)
      break;
    const textWidth = measureTextCached(s, ctx, theme.baseFontFull).width;
    renderBoxes.push({
      x: renderX,
      width: textWidth
    });
    renderX += textWidth + theme.bubblePadding * 2 + theme.bubbleMargin;
  }
  ctx.beginPath();
  for (const rectInfo of renderBoxes) {
    roundedRect(ctx, rectInfo.x, y2 + (h - theme.bubbleHeight) / 2, rectInfo.width + theme.bubblePadding * 2, theme.bubbleHeight, theme.roundingRadius ?? theme.bubbleHeight / 2);
  }
  ctx.fillStyle = highlighted ? theme.bgBubbleSelected : theme.bgBubble;
  ctx.fill();
  for (const [i, rectInfo] of renderBoxes.entries()) {
    ctx.beginPath();
    ctx.fillStyle = theme.textBubble;
    ctx.fillText(data[i], rectInfo.x + theme.bubblePadding, y2 + h / 2 + getMiddleCenterBias(ctx, theme));
  }
}

// vendor/glide-data-grid/dist/esm/cells/drilldown-cell.js
import * as React31 from "react";

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/drilldown-overlay-editor.js
init_dist2();
import * as React30 from "react";
var DrilldownOverlayEditorStyle = /* @__PURE__ */ styled_default("div")({
  name: "DrilldownOverlayEditorStyle",
  class: "gdg-d4zsq0x",
  propsAsIs: false
});
var DrilldownOverlayEditor = (p2) => {
  const {
    drilldowns
  } = p2;
  return React30.createElement(DrilldownOverlayEditorStyle, null, drilldowns.map((d3, i) => React30.createElement("div", {
    key: i,
    className: "doe-bubble"
  }, d3.img !== void 0 && React30.createElement("img", {
    src: d3.img
  }), React30.createElement("div", null, d3.text))));
};
var drilldown_overlay_editor_default = DrilldownOverlayEditor;

// vendor/glide-data-grid/dist/esm/cells/drilldown-cell.js
init_data_grid_types();
var drilldownCellRenderer = {
  getAccessibilityString: (c) => makeAccessibilityStringForArray(c.data.map((d3) => d3.text)),
  kind: GridCellKind.Drilldown,
  needsHover: false,
  useLabel: false,
  needsHoverPosition: false,
  measure: (ctx, cell, theme) => cell.data.reduce((acc, data) => ctx.measureText(data.text).width + acc + theme.bubblePadding * 2 + theme.bubbleMargin + (data.img !== void 0 ? 18 : 0), 0) + 2 * theme.cellHorizontalPadding - 4,
  draw: (a) => drawDrilldownCell(a, a.cell.data),
  provideEditor: () => (p2) => {
    const { value } = p2;
    return React31.createElement(drilldown_overlay_editor_default, { drilldowns: value.data });
  },
  onPaste: () => void 0
};
var drilldownCache = {};
function getAndCacheDrilldownBorder(bgCell, border, height, rounding) {
  const dpr = Math.ceil(window.devicePixelRatio);
  const shadowBlur = 5;
  const targetHeight = height - shadowBlur * 2;
  const middleWidth = 4;
  const innerHeight = height * dpr;
  const sideWidth = rounding + shadowBlur;
  const targetWidth = rounding * 3;
  const innerWidth = (targetWidth + shadowBlur * 2) * dpr;
  const key = `${bgCell},${border},${dpr},${height}`;
  if (drilldownCache[key] !== void 0) {
    return {
      el: drilldownCache[key],
      height: innerHeight,
      width: innerWidth,
      middleWidth: middleWidth * dpr,
      sideWidth: sideWidth * dpr,
      padding: shadowBlur * dpr,
      dpr
    };
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx === null)
    return null;
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  ctx.scale(dpr, dpr);
  drilldownCache[key] = canvas;
  ctx.beginPath();
  roundedRect(ctx, shadowBlur, shadowBlur, targetWidth, targetHeight, rounding);
  ctx.shadowColor = "rgba(24, 25, 34, 0.4)";
  ctx.shadowBlur = 1;
  ctx.fillStyle = bgCell;
  ctx.fill();
  ctx.shadowColor = "rgba(24, 25, 34, 0.3)";
  ctx.shadowOffsetY = 1;
  ctx.shadowBlur = 5;
  ctx.fillStyle = bgCell;
  ctx.fill();
  ctx.shadowOffsetY = 0;
  ctx.shadowBlur = 0;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  roundedRect(ctx, shadowBlur + 0.5, shadowBlur + 0.5, targetWidth, targetHeight, rounding);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.stroke();
  return {
    el: canvas,
    height: innerHeight,
    width: innerWidth,
    sideWidth: sideWidth * dpr,
    middleWidth: rounding * dpr,
    padding: shadowBlur * dpr,
    dpr
  };
}
function drawDrilldownCell(args, data) {
  const { rect, theme, ctx, imageLoader, col, row } = args;
  const { x: x2, width: w3 } = rect;
  const font = theme.baseFontFull;
  const emHeight = getEmHeight(ctx, font);
  const h = Math.min(rect.height, Math.max(16, Math.ceil(emHeight * theme.lineHeight) * 2));
  const y2 = Math.floor(rect.y + (rect.height - h) / 2);
  const bubbleHeight = h - 10;
  const bubblePad = theme.bubblePadding;
  const bubbleMargin = theme.bubbleMargin;
  let renderX = x2 + theme.cellHorizontalPadding;
  const rounding = theme.roundingRadius ?? 6;
  const tileMap = getAndCacheDrilldownBorder(theme.bgCell, theme.drilldownBorder, h, rounding);
  const renderBoxes = [];
  for (const el of data) {
    if (renderX > x2 + w3)
      break;
    const textMetrics = measureTextCached(el.text, ctx, font);
    const textWidth = textMetrics.width;
    let imgWidth = 0;
    if (el.img !== void 0) {
      const img = imageLoader.loadOrGetImage(el.img, col, row);
      if (img !== void 0) {
        imgWidth = bubbleHeight - 8 + 4;
      }
    }
    const renderWidth = textWidth + imgWidth + bubblePad * 2;
    renderBoxes.push({
      x: renderX,
      width: renderWidth
    });
    renderX += renderWidth + bubbleMargin;
  }
  if (tileMap !== null) {
    const { el, height, middleWidth, sideWidth, width, dpr, padding } = tileMap;
    const outerSideWidth = sideWidth / dpr;
    const outerPadding = padding / dpr;
    for (const rectInfo of renderBoxes) {
      const rx = Math.floor(rectInfo.x);
      const rw = Math.floor(rectInfo.width);
      const outerMiddleWidth = rw - (outerSideWidth - outerPadding) * 2;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(el, 0, 0, sideWidth, height, rx - outerPadding, y2, outerSideWidth, h);
      if (outerMiddleWidth > 0)
        ctx.drawImage(el, sideWidth, 0, middleWidth, height, rx + (outerSideWidth - outerPadding), y2, outerMiddleWidth, h);
      ctx.drawImage(el, width - sideWidth, 0, sideWidth, height, rx + rw - (outerSideWidth - outerPadding), y2, outerSideWidth, h);
      ctx.imageSmoothingEnabled = true;
    }
  }
  ctx.beginPath();
  for (const [i, rectInfo] of renderBoxes.entries()) {
    const d3 = data[i];
    let drawX = rectInfo.x + bubblePad;
    if (d3.img !== void 0) {
      const img = imageLoader.loadOrGetImage(d3.img, col, row);
      if (img !== void 0) {
        const imgSize = bubbleHeight - 8;
        let srcX = 0;
        let srcY = 0;
        let srcWidth = img.width;
        let srcHeight = img.height;
        if (srcWidth > srcHeight) {
          srcX += (srcWidth - srcHeight) / 2;
          srcWidth = srcHeight;
        } else if (srcHeight > srcWidth) {
          srcY += (srcHeight - srcWidth) / 2;
          srcHeight = srcWidth;
        }
        ctx.beginPath();
        roundedRect(ctx, drawX, y2 + h / 2 - imgSize / 2, imgSize, imgSize, theme.roundingRadius ?? 3);
        ctx.save();
        ctx.clip();
        ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, drawX, y2 + h / 2 - imgSize / 2, imgSize, imgSize);
        ctx.restore();
        drawX += imgSize + 4;
      }
    }
    ctx.beginPath();
    ctx.fillStyle = theme.textBubble;
    ctx.fillText(d3.text, drawX, y2 + h / 2 + getMiddleCenterBias(ctx, theme));
  }
}

// vendor/glide-data-grid/dist/esm/cells/image-cell.js
import * as React32 from "react";
init_data_grid_types();
var imageCellRenderer = {
  getAccessibilityString: (c) => c.data.join(", "),
  kind: GridCellKind.Image,
  needsHover: false,
  useLabel: false,
  needsHoverPosition: false,
  draw: (a) => drawImage(a, a.cell.displayData ?? a.cell.data, a.cell.rounding ?? a.theme.roundingRadius ?? 4, a.cell.contentAlign),
  measure: (_ctx, cell) => cell.data.length * 50,
  onDelete: (c) => ({
    ...c,
    data: []
  }),
  provideEditor: () => (p2) => {
    const { value, onFinishedEditing, imageEditorOverride } = p2;
    const ImageEditor = imageEditorOverride ?? ImageOverlayEditor;
    return React32.createElement(ImageEditor, { urls: value.data, canWrite: value.readonly !== true, onCancel: onFinishedEditing, onChange: (newImage) => {
      onFinishedEditing({
        ...value,
        data: [newImage]
      });
    } });
  },
  onPaste: (toPaste, cell) => {
    toPaste = toPaste.trim();
    const fragments = toPaste.split(",");
    const uris = fragments.map((f) => {
      try {
        new URL(f);
        return f;
      } catch {
        return void 0;
      }
    }).filter((x2) => x2 !== void 0);
    if (uris.length === cell.data.length && uris.every((u, i) => u === cell.data[i]))
      return void 0;
    return {
      ...cell,
      data: uris
    };
  }
};
var itemMargin = 4;
function drawImage(args, data, rounding, contentAlign) {
  const { rect, col, row, theme, ctx, imageLoader } = args;
  const { x: x2, y: y2, height: h, width: w3 } = rect;
  const imgHeight = h - theme.cellVerticalPadding * 2;
  const images = [];
  let totalWidth = 0;
  for (let index = 0; index < data.length; index++) {
    const i = data[index];
    if (i.length === 0)
      continue;
    const img = imageLoader.loadOrGetImage(i, col, row);
    if (img !== void 0) {
      images[index] = img;
      const imgWidth = img.width * (imgHeight / img.height);
      totalWidth += imgWidth + itemMargin;
    }
  }
  if (totalWidth === 0)
    return;
  totalWidth -= itemMargin;
  let drawX = x2 + theme.cellHorizontalPadding;
  if (contentAlign === "right")
    drawX = Math.floor(x2 + w3 - theme.cellHorizontalPadding - totalWidth);
  else if (contentAlign === "center")
    drawX = Math.floor(x2 + w3 / 2 - totalWidth / 2);
  for (const img of images) {
    if (img === void 0)
      continue;
    const imgWidth = img.width * (imgHeight / img.height);
    if (rounding > 0) {
      ctx.beginPath();
      roundedRect(ctx, drawX, y2 + theme.cellVerticalPadding, imgWidth, imgHeight, rounding);
      ctx.save();
      ctx.clip();
    }
    ctx.drawImage(img, drawX, y2 + theme.cellVerticalPadding, imgWidth, imgHeight);
    if (rounding > 0) {
      ctx.restore();
    }
    drawX += imgWidth + itemMargin;
  }
}

// vendor/glide-data-grid/dist/esm/cells/loading-cell.js
init_color_parser();
init_data_grid_types();
function getRandomNumber(x2, y2) {
  let seed = x2 * 49632 + y2 * 325176;
  seed ^= seed << 13;
  seed ^= seed >> 17;
  seed ^= seed << 5;
  return seed / 4294967295 * 2;
}
var loadingCellRenderer = {
  getAccessibilityString: () => "",
  kind: GridCellKind.Loading,
  needsHover: false,
  useLabel: false,
  needsHoverPosition: false,
  measure: () => 120,
  draw: (a) => {
    const { cell, col, row, ctx, rect, theme } = a;
    if (cell.skeletonWidth === void 0 || cell.skeletonWidth === 0) {
      return;
    }
    let width = cell.skeletonWidth;
    if (cell.skeletonWidthVariability !== void 0 && cell.skeletonWidthVariability > 0) {
      width += Math.round(getRandomNumber(col, row) * cell.skeletonWidthVariability);
    }
    const hpad = theme.cellHorizontalPadding;
    if (width + hpad * 2 >= rect.width) {
      width = rect.width - hpad * 2 - 1;
    }
    const rectHeight = cell.skeletonHeight ?? Math.min(18, rect.height - 2 * theme.cellVerticalPadding);
    roundedRect(ctx, rect.x + hpad, rect.y + (rect.height - rectHeight) / 2, width, rectHeight, theme.roundingRadius ?? 3);
    ctx.fillStyle = withAlpha(theme.textDark, 0.1);
    ctx.fill();
  },
  onPaste: () => void 0
};

// vendor/glide-data-grid/dist/esm/cells/markdown-cell.js
import * as React34 from "react";

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/markdown-overlay-editor.js
import * as React33 from "react";

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/markdown-overlay-editor-style.js
init_dist2();
var _exp8 = () => (p2) => p2.targetWidth;
var MarkdownOverlayEditorStyle = /* @__PURE__ */ styled_default("div")({
  name: "MarkdownOverlayEditorStyle",
  class: "gdg-m1pnx84e",
  propsAsIs: false,
  vars: {
    "m1pnx84e-0": [_exp8(), "px"]
  }
});

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/markdown-overlay-editor.js
var MarkdownOverlayEditor = (p2) => {
  const { value, onChange, forceEditMode, createNode, targetRect, onFinish, validatedSelection } = p2;
  const markdown = value.data;
  const readonly = value.readonly === true;
  const [editMode, setEditMode] = React33.useState(markdown === "" || forceEditMode);
  const onEditClick = React33.useCallback(() => {
    setEditMode((e) => !e);
  }, []);
  const addLeftPad = markdown ? "gdg-ml-6" : "";
  if (editMode) {
    return React33.createElement(
      MarkdownOverlayEditorStyle,
      { targetWidth: targetRect.width - 20 },
      React33.createElement(GrowingEntry, { autoFocus: true, highlight: false, validatedSelection, value: markdown, onKeyDown: (e) => {
        if (e.key === "Enter")
          e.stopPropagation();
      }, onChange }),
      React33.createElement(
        "div",
        { className: `gdg-edit-icon gdg-checkmark-hover ${addLeftPad}`, onClick: () => onFinish(value) },
        React33.createElement(Checkmark, null)
      )
    );
  }
  return React33.createElement(
    MarkdownOverlayEditorStyle,
    { targetWidth: targetRect.width },
    React33.createElement(MarkdownDiv, { contents: markdown, createNode }),
    !readonly && React33.createElement(
      React33.Fragment,
      null,
      React33.createElement("div", { className: "spacer" }),
      React33.createElement(
        "div",
        { className: `gdg-edit-icon gdg-edit-hover ${addLeftPad}`, onClick: onEditClick },
        React33.createElement(EditPencil, null)
      )
    ),
    React33.createElement("textarea", { className: "gdg-md-edit-textarea gdg-input", autoFocus: true })
  );
};

// vendor/glide-data-grid/dist/esm/cells/markdown-cell.js
init_data_grid_types();
var markdownCellRenderer = {
  getAccessibilityString: (c) => c.data?.toString() ?? "",
  kind: GridCellKind.Markdown,
  needsHover: false,
  needsHoverPosition: false,
  drawPrep: prepTextCell,
  measure: (ctx, cell, t) => {
    const firstLine = cell.data.split("\n")[0];
    return ctx.measureText(firstLine).width + 2 * t.cellHorizontalPadding;
  },
  draw: (a) => drawTextCell(a, a.cell.data, a.cell.contentAlign),
  onDelete: (c) => ({
    ...c,
    data: ""
  }),
  provideEditor: () => (p2) => {
    const { onChange, value, target, onFinishedEditing, markdownDivCreateNode, forceEditMode, validatedSelection } = p2;
    return React34.createElement(MarkdownOverlayEditor, { onFinish: onFinishedEditing, targetRect: target, value, validatedSelection, onChange: (e) => onChange({
      ...value,
      data: e.target.value
    }), forceEditMode, createNode: markdownDivCreateNode });
  },
  onPaste: (toPaste, cell) => toPaste === cell.data ? void 0 : { ...cell, data: toPaste }
};

// vendor/glide-data-grid/dist/esm/cells/marker-cell.js
init_data_grid_types();
var markerCellRenderer = {
  getAccessibilityString: (c) => c.row.toString(),
  kind: InnerGridCellKind.Marker,
  needsHover: true,
  needsHoverPosition: false,
  drawPrep: prepMarkerRowCell,
  measure: () => 44,
  draw: (a) => drawMarkerRowCell(a, a.cell.row, a.cell.checked, a.cell.markerKind, a.cell.drawHandle, a.cell.checkboxStyle),
  onClick: (e) => {
    const { bounds, cell, posX: x2, posY: y2 } = e;
    const { width, height } = bounds;
    const centerX = cell.drawHandle ? 7 + (width - 7) / 2 : width / 2;
    const centerY = height / 2;
    if (Math.abs(x2 - centerX) <= 10 && Math.abs(y2 - centerY) <= 10) {
      return {
        ...cell,
        checked: !cell.checked
      };
    }
    return void 0;
  },
  onPaste: () => void 0
};
function prepMarkerRowCell(args, lastPrep) {
  const { ctx, theme } = args;
  const newFont = theme.markerFontFull;
  const result = lastPrep ?? {};
  if (result?.font !== newFont) {
    ctx.font = newFont;
    result.font = newFont;
  }
  result.deprep = deprepMarkerRowCell;
  ctx.textAlign = "center";
  return result;
}
function deprepMarkerRowCell(args) {
  const { ctx } = args;
  ctx.textAlign = "start";
}
function drawMarkerRowCell(args, index, checked, markerKind, drawHandle, style) {
  const { ctx, rect, hoverAmount, theme } = args;
  const { x: x2, y: y2, width, height } = rect;
  const checkedboxAlpha = checked ? 1 : markerKind === "checkbox-visible" ? 0.6 + 0.4 * hoverAmount : hoverAmount;
  if (markerKind !== "number" && checkedboxAlpha > 0) {
    ctx.globalAlpha = checkedboxAlpha;
    const offsetAmount = 7 * (checked ? hoverAmount : 1);
    drawCheckbox(ctx, theme, checked, drawHandle ? x2 + offsetAmount : x2, y2, drawHandle ? width - offsetAmount : width, height, true, void 0, void 0, theme.checkboxMaxSize, "center", style);
    if (drawHandle) {
      ctx.globalAlpha = hoverAmount;
      ctx.beginPath();
      for (const xOffset of [3, 6]) {
        for (const yOffset of [-5, -1, 3]) {
          ctx.rect(x2 + xOffset, y2 + height / 2 + yOffset, 2, 2);
        }
      }
      ctx.fillStyle = theme.textLight;
      ctx.fill();
      ctx.beginPath();
    }
    ctx.globalAlpha = 1;
  }
  if (markerKind === "number" || markerKind === "both" && !checked) {
    const text = index.toString();
    const fontStyle = theme.markerFontFull;
    const start = x2 + width / 2;
    if (markerKind === "both" && hoverAmount !== 0) {
      ctx.globalAlpha = 1 - hoverAmount;
    }
    ctx.fillStyle = theme.textLight;
    ctx.font = fontStyle;
    ctx.fillText(text, start, y2 + height / 2 + getMiddleCenterBias(ctx, fontStyle));
    if (hoverAmount !== 0) {
      ctx.globalAlpha = 1;
    }
  }
}

// vendor/glide-data-grid/dist/esm/cells/new-row-cell.js
init_data_grid_types();
var newRowCellRenderer = {
  getAccessibilityString: () => "",
  kind: InnerGridCellKind.NewRow,
  needsHover: true,
  needsHoverPosition: false,
  measure: () => 200,
  draw: (a) => drawNewRowCell(a, a.cell.hint, a.cell.icon),
  onPaste: () => void 0
};
function drawNewRowCell(args, data, icon) {
  const { ctx, rect, hoverAmount, theme, spriteManager } = args;
  const { x: x2, y: y2, width: w3, height: h } = rect;
  ctx.beginPath();
  ctx.globalAlpha = hoverAmount;
  ctx.rect(x2 + 1, y2 + 1, w3, h - 2);
  ctx.fillStyle = theme.bgHeaderHovered;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  const alwaysShowIcon = data !== "";
  let textX = 0;
  if (icon !== void 0) {
    const padding = 8;
    const size = h - padding;
    const px = x2 + padding / 2;
    const py = y2 + padding / 2;
    spriteManager.drawSprite(icon, "normal", ctx, px, py, size, theme, alwaysShowIcon ? 1 : hoverAmount);
    textX = size;
  } else {
    textX = 24;
    const finalLineSize = 12;
    const lineSize = alwaysShowIcon ? finalLineSize : hoverAmount * finalLineSize;
    const xTranslate = alwaysShowIcon ? 0 : (1 - hoverAmount) * finalLineSize * 0.5;
    const padPlus = theme.cellHorizontalPadding + 4;
    if (lineSize > 0) {
      ctx.moveTo(x2 + padPlus + xTranslate, y2 + h / 2);
      ctx.lineTo(x2 + padPlus + xTranslate + lineSize, y2 + h / 2);
      ctx.moveTo(x2 + padPlus + xTranslate + lineSize * 0.5, y2 + h / 2 - lineSize * 0.5);
      ctx.lineTo(x2 + padPlus + xTranslate + lineSize * 0.5, y2 + h / 2 + lineSize * 0.5);
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.bgIconHeader;
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }
  ctx.fillStyle = theme.textMedium;
  ctx.fillText(data, textX + x2 + theme.cellHorizontalPadding + 0.5, y2 + h / 2 + getMiddleCenterBias(ctx, theme));
  ctx.beginPath();
}

// vendor/glide-data-grid/dist/esm/cells/number-cell.js
import * as React37 from "react";
init_data_grid_types();

// vendor/glide-data-grid/dist/esm/internal/data-grid/render/draw-edit-hover-indicator.js
init_color_parser();
function drawEditHoverIndicator(ctx, theme, effectTheme, displayData, rect, hoverAmount, overrideCursor) {
  ctx.textBaseline = "alphabetic";
  const effectRect = getHoverEffectRect(ctx, rect, displayData, theme, effectTheme?.fullSize ?? false);
  ctx.beginPath();
  roundedRect(ctx, effectRect.x, effectRect.y, effectRect.width, effectRect.height, theme.roundingRadius ?? 4);
  ctx.globalAlpha = hoverAmount;
  ctx.fillStyle = effectTheme?.bgColor ?? withAlpha(theme.textDark, 0.1);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.textDark;
  ctx.textBaseline = "middle";
  overrideCursor?.("text");
}
function getHoverEffectRect(ctx, cellRect, displayData, theme, fullSize) {
  const padX = theme.cellHorizontalPadding;
  const padY = theme.cellVerticalPadding;
  if (fullSize) {
    return {
      x: cellRect.x + padX / 2,
      y: cellRect.y + padY / 2 + 1,
      width: cellRect.width - padX,
      height: cellRect.height - padY - 1
    };
  }
  const m2 = measureTextCached(displayData, ctx, theme.baseFontFull, "alphabetic");
  const maxH = cellRect.height - padY;
  const h = Math.min(maxH, m2.actualBoundingBoxAscent * 2.5);
  return {
    x: cellRect.x + padX / 2,
    y: cellRect.y + (cellRect.height - h) / 2 + 1,
    width: m2.width + padX * 3,
    height: h - 1
  };
}

// vendor/glide-data-grid/dist/esm/cells/number-cell.js
var NumberOverlayEditor2 = React37.lazy(async () => await Promise.resolve().then(() => (init_number_overlay_editor(), number_overlay_editor_exports)));
var numberCellRenderer = {
  getAccessibilityString: (c) => c.data?.toString() ?? "",
  kind: GridCellKind.Number,
  needsHover: (cell) => cell.hoverEffect === true,
  needsHoverPosition: false,
  useLabel: true,
  drawPrep: prepTextCell,
  draw: (a) => {
    const { hoverAmount, cell, ctx, theme, rect, overrideCursor } = a;
    const { hoverEffect, displayData, hoverEffectTheme } = cell;
    if (hoverEffect === true && hoverAmount > 0) {
      drawEditHoverIndicator(ctx, theme, hoverEffectTheme, displayData, rect, hoverAmount, overrideCursor);
    }
    drawTextCell(a, a.cell.displayData, a.cell.contentAlign);
  },
  measure: (ctx, cell, theme) => ctx.measureText(cell.displayData).width + theme.cellHorizontalPadding * 2,
  onDelete: (c) => ({
    ...c,
    data: void 0
  }),
  provideEditor: () => (p2) => {
    const { isHighlighted, onChange, value, validatedSelection } = p2;
    return React37.createElement(
      React37.Suspense,
      { fallback: null },
      React37.createElement(NumberOverlayEditor2, { highlight: isHighlighted, disabled: value.readonly === true, value: value.data, fixedDecimals: value.fixedDecimals, allowNegative: value.allowNegative, thousandSeparator: value.thousandSeparator, decimalSeparator: value.decimalSeparator, validatedSelection, onChange: (x2) => onChange({
        ...value,
        data: Number.isNaN(x2.floatValue ?? 0) ? 0 : x2.floatValue
      }) })
    );
  },
  onPaste: (toPaste, cell, details) => {
    const newNumber = typeof details.rawValue === "number" ? details.rawValue : Number.parseFloat(typeof details.rawValue === "string" ? details.rawValue : toPaste);
    if (Number.isNaN(newNumber) || cell.data === newNumber)
      return void 0;
    return { ...cell, data: newNumber, displayData: details.formattedString ?? cell.displayData };
  }
};

// vendor/glide-data-grid/dist/esm/cells/protected-cell.js
init_data_grid_types();
var protectedCellRenderer = {
  getAccessibilityString: () => "",
  measure: () => 108,
  kind: GridCellKind.Protected,
  needsHover: false,
  needsHoverPosition: false,
  draw: drawProtectedCell,
  onPaste: () => void 0
};
function drawProtectedCell(args) {
  const { ctx, theme, rect } = args;
  const { x: x2, y: y2, height: h } = rect;
  ctx.beginPath();
  const radius = 2.5;
  let xStart = x2 + theme.cellHorizontalPadding + radius;
  const center = y2 + h / 2;
  const p2 = Math.cos(degreesToRadians(30)) * radius;
  const q2 = Math.sin(degreesToRadians(30)) * radius;
  for (let i = 0; i < 12; i++) {
    ctx.moveTo(xStart, center - radius);
    ctx.lineTo(xStart, center + radius);
    ctx.moveTo(xStart + p2, center - q2);
    ctx.lineTo(xStart - p2, center + q2);
    ctx.moveTo(xStart - p2, center - q2);
    ctx.lineTo(xStart + p2, center + q2);
    xStart += 8;
  }
  ctx.lineWidth = 1.1;
  ctx.lineCap = "square";
  ctx.strokeStyle = theme.textLight;
  ctx.stroke();
}

// vendor/glide-data-grid/dist/esm/cells/row-id-cell.js
import React38 from "react";
init_data_grid_types();
var rowIDCellRenderer = {
  getAccessibilityString: (c) => c.data?.toString() ?? "",
  kind: GridCellKind.RowID,
  needsHover: false,
  needsHoverPosition: false,
  drawPrep: (a, b3) => prepTextCell(a, b3, a.theme.textLight),
  draw: (a) => drawTextCell(a, a.cell.data, a.cell.contentAlign),
  measure: (ctx, cell, theme) => ctx.measureText(cell.data).width + theme.cellHorizontalPadding * 2,
  // eslint-disable-next-line react/display-name
  provideEditor: () => (p2) => {
    const { isHighlighted, onChange, value, validatedSelection } = p2;
    return React38.createElement(GrowingEntry, { highlight: isHighlighted, autoFocus: value.readonly !== true, disabled: value.readonly !== false, value: value.data, validatedSelection, onChange: (e) => onChange({
      ...value,
      data: e.target.value
    }) });
  },
  onPaste: () => void 0
};

// vendor/glide-data-grid/dist/esm/cells/text-cell.js
import * as React39 from "react";
init_data_grid_types();
var textCellRenderer = {
  getAccessibilityString: (c) => c.data?.toString() ?? "",
  kind: GridCellKind.Text,
  needsHover: (textCell) => textCell.hoverEffect === true,
  needsHoverPosition: false,
  drawPrep: prepTextCell,
  useLabel: true,
  draw: (a) => {
    const { cell, hoverAmount, hyperWrapping, ctx, rect, theme, overrideCursor } = a;
    const { displayData, contentAlign, hoverEffect, allowWrapping, hoverEffectTheme } = cell;
    if (hoverEffect === true && hoverAmount > 0) {
      drawEditHoverIndicator(ctx, theme, hoverEffectTheme, displayData, rect, hoverAmount, overrideCursor);
    }
    drawTextCell(a, displayData, contentAlign, allowWrapping, hyperWrapping);
  },
  measure: (ctx, cell, t) => {
    const lines = cell.displayData.split("\n", cell.allowWrapping === true ? void 0 : 1);
    let maxLineWidth = 0;
    for (const line of lines) {
      maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width);
    }
    return maxLineWidth + 2 * t.cellHorizontalPadding;
  },
  onDelete: (c) => ({
    ...c,
    data: ""
  }),
  provideEditor: (cell) => ({
    disablePadding: cell.allowWrapping === true,
    editor: (p2) => {
      const { isHighlighted, onChange, value, validatedSelection } = p2;
      return React39.createElement(GrowingEntry, { style: cell.allowWrapping === true ? { padding: "3px 8.5px" } : void 0, highlight: isHighlighted, autoFocus: value.readonly !== true, disabled: value.readonly === true, altNewline: true, value: value.data, validatedSelection, onChange: (e) => onChange({
        ...value,
        data: e.target.value
      }) });
    }
  }),
  onPaste: (toPaste, cell, details) => toPaste === cell.data ? void 0 : { ...cell, data: toPaste, displayData: details.formattedString ?? cell.displayData }
};

// vendor/glide-data-grid/dist/esm/cells/uri-cell.js
import * as React41 from "react";

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/uri-overlay-editor.js
import * as React40 from "react";

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/uri-overlay-editor-style.js
init_dist2();
var UriOverlayEditorStyle = /* @__PURE__ */ styled_default("div")({
  name: "UriOverlayEditorStyle",
  class: "gdg-u1rrojo",
  propsAsIs: false
});

// vendor/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/private/uri-overlay-editor.js
var UriOverlayEditor = (p2) => {
  const { uri, onChange, forceEditMode, readonly, validatedSelection, preview } = p2;
  const [editMode, setEditMode] = React40.useState(!readonly && (uri === "" || forceEditMode));
  const onEditClick = React40.useCallback(() => {
    setEditMode(true);
  }, []);
  if (editMode) {
    return React40.createElement(GrowingEntry, { validatedSelection, highlight: true, autoFocus: true, value: uri, onChange });
  }
  return React40.createElement(
    UriOverlayEditorStyle,
    null,
    React40.createElement("a", { className: "gdg-link-area", href: uri, target: "_blank", rel: "noopener noreferrer" }, preview),
    !readonly && React40.createElement(
      "div",
      { className: "gdg-edit-icon", onClick: onEditClick },
      React40.createElement(EditPencil, null)
    ),
    React40.createElement("textarea", { className: "gdg-input", autoFocus: true })
  );
};
var uri_overlay_editor_default = UriOverlayEditor;

// vendor/glide-data-grid/dist/esm/cells/uri-cell.js
init_data_grid_types();
function getTextRect(metrics, rect, theme, contentAlign) {
  let x2 = theme.cellHorizontalPadding;
  const y2 = rect.height / 2 - metrics.actualBoundingBoxAscent / 2;
  const width = metrics.width;
  const height = metrics.actualBoundingBoxAscent;
  if (contentAlign === "right") {
    x2 = rect.width - width - theme.cellHorizontalPadding;
  } else if (contentAlign === "center") {
    x2 = rect.width / 2 - width / 2;
  }
  return { x: x2, y: y2, width, height };
}
function isOverLinkText(e) {
  const { cell, bounds, posX, posY, theme } = e;
  const txt = cell.displayData ?? cell.data;
  if (cell.hoverEffect !== true || cell.onClickUri === void 0)
    return false;
  const m2 = getMeasuredTextCache(txt, theme.baseFontFull);
  if (m2 === void 0)
    return false;
  const textRect = getTextRect(m2, bounds, theme, cell.contentAlign);
  return pointInRect({
    x: textRect.x - 4,
    y: textRect.y - 4,
    width: textRect.width + 8,
    height: textRect.height + 8
  }, posX, posY);
}
var uriCellRenderer = {
  getAccessibilityString: (c) => c.data?.toString() ?? "",
  kind: GridCellKind.Uri,
  needsHover: (uriCell) => uriCell.hoverEffect === true,
  needsHoverPosition: true,
  useLabel: true,
  drawPrep: prepTextCell,
  draw: (a) => {
    const { cell, theme, overrideCursor, hoverX, hoverY, rect, ctx } = a;
    const txt = cell.displayData ?? cell.data;
    const isLinky = cell.hoverEffect === true;
    if (overrideCursor !== void 0 && isLinky && hoverX !== void 0 && hoverY !== void 0) {
      const m2 = measureTextCached(txt, ctx, theme.baseFontFull);
      const textRect = getTextRect(m2, rect, theme, cell.contentAlign);
      const { x: x2, y: y2, width: w3, height: h } = textRect;
      if (hoverX >= x2 - 4 && hoverX <= x2 - 4 + w3 + 8 && hoverY >= y2 - 4 && hoverY <= y2 - 4 + h + 8) {
        const middleCenterBias = getMiddleCenterBias(ctx, theme.baseFontFull);
        overrideCursor("pointer");
        const underlineOffset = 5;
        const drawY = y2 - middleCenterBias;
        ctx.beginPath();
        ctx.moveTo(rect.x + x2, Math.floor(rect.y + drawY + h + underlineOffset) + 0.5);
        ctx.lineTo(rect.x + x2 + w3, Math.floor(rect.y + drawY + h + underlineOffset) + 0.5);
        ctx.strokeStyle = theme.linkColor;
        ctx.stroke();
        ctx.save();
        ctx.fillStyle = a.cellFillColor;
        drawTextCell({ ...a, rect: { ...rect, x: rect.x - 1 } }, txt, cell.contentAlign);
        drawTextCell({ ...a, rect: { ...rect, x: rect.x - 2 } }, txt, cell.contentAlign);
        drawTextCell({ ...a, rect: { ...rect, x: rect.x + 1 } }, txt, cell.contentAlign);
        drawTextCell({ ...a, rect: { ...rect, x: rect.x + 2 } }, txt, cell.contentAlign);
        ctx.restore();
      }
    }
    ctx.fillStyle = isLinky ? theme.linkColor : theme.textDark;
    drawTextCell(a, txt, cell.contentAlign);
  },
  onSelect: (e) => {
    if (isOverLinkText(e)) {
      e.preventDefault();
    }
  },
  onClick: (a) => {
    const { cell } = a;
    const didClick = isOverLinkText(a);
    if (didClick) {
      cell.onClickUri?.(a);
    }
    return void 0;
  },
  measure: (ctx, cell, theme) => ctx.measureText(cell.displayData ?? cell.data).width + theme.cellHorizontalPadding * 2,
  onDelete: (c) => ({
    ...c,
    data: ""
  }),
  provideEditor: (cell) => (p2) => {
    const { onChange, value, forceEditMode, validatedSelection } = p2;
    return React41.createElement(uri_overlay_editor_default, { forceEditMode: value.readonly !== true && (forceEditMode || cell.hoverEffect === true && cell.onClickUri !== void 0), uri: value.data, preview: value.displayData ?? value.data, validatedSelection, readonly: value.readonly === true, onChange: (e) => onChange({
      ...value,
      data: e.target.value
    }) });
  },
  onPaste: (toPaste, cell, details) => toPaste === cell.data ? void 0 : { ...cell, data: toPaste, displayData: details.formattedString ?? cell.displayData }
};

// vendor/glide-data-grid/dist/esm/cells/index.js
var AllCellRenderers = [
  markerCellRenderer,
  newRowCellRenderer,
  booleanCellRenderer,
  bubbleCellRenderer,
  drilldownCellRenderer,
  imageCellRenderer,
  loadingCellRenderer,
  markdownCellRenderer,
  numberCellRenderer,
  protectedCellRenderer,
  rowIDCellRenderer,
  textCellRenderer,
  uriCellRenderer
];

// vendor/glide-data-grid/dist/esm/common/image-window-loader.js
var import_throttle = __toESM(require_throttle(), 1);
var imgPool = [];
var ImageWindowLoaderImpl = class extends WindowingTrackerBase {
  imageLoaded = () => void 0;
  loadedLocations = [];
  cache = {};
  setCallback(imageLoaded) {
    this.imageLoaded = imageLoaded;
  }
  // eslint-disable-next-line unicorn/consistent-function-scoping
  sendLoaded = (0, import_throttle.default)(() => {
    this.imageLoaded(new CellSet(this.loadedLocations));
    this.loadedLocations = [];
  }, 20);
  clearOutOfWindow = () => {
    const keys = Object.keys(this.cache);
    for (const key of keys) {
      const obj = this.cache[key];
      let keep = false;
      for (let j2 = 0; j2 < obj.cells.length; j2++) {
        const packed = obj.cells[j2];
        if (this.isInWindow(packed)) {
          keep = true;
          break;
        }
      }
      if (keep) {
        obj.cells = obj.cells.filter(this.isInWindow);
      } else {
        obj.cancel();
        delete this.cache[key];
      }
    }
  };
  loadImage(url, col, row, key) {
    let loaded = false;
    const img = imgPool.pop() ?? new Image();
    let canceled = false;
    const result = {
      img: void 0,
      cells: [packColRowToNumber(col, row)],
      url,
      cancel: () => {
        if (canceled)
          return;
        canceled = true;
        if (imgPool.length < 12) {
          imgPool.unshift(img);
        } else if (!loaded) {
          img.src = "";
        }
      }
    };
    const loadPromise = new Promise((r) => img.addEventListener("load", () => r(null)));
    requestAnimationFrame(async () => {
      try {
        img.src = url;
        await loadPromise;
        await img.decode();
        const toWrite = this.cache[key];
        if (toWrite !== void 0 && !canceled) {
          toWrite.img = img;
          for (const packed of toWrite.cells) {
            this.loadedLocations.push(unpackNumberToColRow(packed));
          }
          loaded = true;
          this.sendLoaded();
        }
      } catch {
        result.cancel();
      }
    });
    this.cache[key] = result;
  }
  loadOrGetImage(url, col, row) {
    const key = url;
    const current = this.cache[key];
    if (current !== void 0) {
      const packed = packColRowToNumber(col, row);
      if (!current.cells.includes(packed)) {
        current.cells.push(packed);
      }
      return current.img;
    } else {
      this.loadImage(url, col, row, key);
    }
    return void 0;
  }
};
var image_window_loader_default = ImageWindowLoaderImpl;

// vendor/glide-data-grid/dist/esm/data-editor-all.js
var DataEditorAllImpl = (p2, ref) => {
  const allSprites = React42.useMemo(() => {
    return { ...sprites, ...p2.headerIcons };
  }, [p2.headerIcons]);
  const renderers = React42.useMemo(() => {
    return p2.renderers ?? AllCellRenderers;
  }, [p2.renderers]);
  const imageWindowLoader = React42.useMemo(() => {
    return p2.imageWindowLoader ?? new image_window_loader_default();
  }, [p2.imageWindowLoader]);
  return React42.createElement(DataEditor, { ...p2, renderers, headerIcons: allSprites, ref, imageWindowLoader });
};
var DataEditorAll = React42.forwardRef(DataEditorAllImpl);
export {
  AllCellRenderers,
  BooleanEmpty,
  BooleanIndeterminate,
  CellSet,
  CompactSelection,
  DEFAULT_FILL_HANDLE,
  DataEditorAll as DataEditor,
  DataEditor as DataEditorCore,
  GridCellKind,
  GridColumnIcon,
  GridColumnMenuIcon,
  ImageOverlayEditor,
  image_window_loader_default as ImageWindowLoaderImpl,
  InnerGridCellKind,
  MarkdownDiv,
  GrowingEntry as TextCellEntry,
  blend,
  booleanCellIsEditable,
  booleanCellRenderer,
  bubbleCellRenderer,
  decodeHTML,
  DataEditorAll as default,
  drawTextCellExternal as drawTextCell,
  drilldownCellRenderer,
  emptyGridSelection,
  getCopyBufferContents,
  getDataEditorTheme as getDefaultTheme,
  getEmHeight,
  getLuminance,
  getMiddleCenterBias,
  imageCellRenderer,
  interpolateColors,
  isEditableGridCell,
  isInnerOnlyCell,
  isObjectEditorCallbackResult,
  isReadWriteCell,
  isRectangleEqual,
  isSizedGridColumn,
  isTextEditableGridCell,
  loadingCellRenderer,
  markdownCellRenderer,
  markerCellRenderer,
  measureTextCached,
  newRowCellRenderer,
  numberCellRenderer,
  parseToRgba,
  protectedCellRenderer,
  resolveCellsThunk,
  roundedPoly,
  roundedRect,
  rowIDCellRenderer,
  sprites,
  textCellRenderer,
  uriCellRenderer,
  useColumnSizer,
  useRowGrouping,
  useTheme,
  withAlpha
};
/*! Bundled license information:

react-is/cjs/react-is.development.js:
  (** @license React v16.13.1
   * react-is.development.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

object-assign/index.js:
  (*
  object-assign
  (c) Sindre Sorhus
  @license MIT
  *)

classnames/index.js:
  (*!
  	Copyright (c) 2018 Jed Watson.
  	Licensed under the MIT License (MIT), see
  	http://jedwatson.github.io/classnames
  *)
*/
