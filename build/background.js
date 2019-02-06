(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict'

// A linked list to keep track of recently-used-ness
const Yallist = require('yallist')

const MAX = Symbol('max')
const LENGTH = Symbol('length')
const LENGTH_CALCULATOR = Symbol('lengthCalculator')
const ALLOW_STALE = Symbol('allowStale')
const MAX_AGE = Symbol('maxAge')
const DISPOSE = Symbol('dispose')
const NO_DISPOSE_ON_SET = Symbol('noDisposeOnSet')
const LRU_LIST = Symbol('lruList')
const CACHE = Symbol('cache')
const UPDATE_AGE_ON_GET = Symbol('updateAgeOnGet')

const naiveLength = () => 1

// lruList is a yallist where the head is the youngest
// item, and the tail is the oldest.  the list contains the Hit
// objects as the entries.
// Each Hit object has a reference to its Yallist.Node.  This
// never changes.
//
// cache is a Map (or PseudoMap) that matches the keys to
// the Yallist.Node object.
class LRUCache {
  constructor (options) {
    if (typeof options === 'number')
      options = { max: options }

    if (!options)
      options = {}

    if (options.max && (typeof options.max !== 'number' || options.max < 0))
      throw new TypeError('max must be a non-negative number')
    // Kind of weird to have a default max of Infinity, but oh well.
    const max = this[MAX] = options.max || Infinity

    const lc = options.length || naiveLength
    this[LENGTH_CALCULATOR] = (typeof lc !== 'function') ? naiveLength : lc
    this[ALLOW_STALE] = options.stale || false
    if (options.maxAge && typeof options.maxAge !== 'number')
      throw new TypeError('maxAge must be a number')
    this[MAX_AGE] = options.maxAge || 0
    this[DISPOSE] = options.dispose
    this[NO_DISPOSE_ON_SET] = options.noDisposeOnSet || false
    this[UPDATE_AGE_ON_GET] = options.updateAgeOnGet || false
    this.reset()
  }

  // resize the cache when the max changes.
  set max (mL) {
    if (typeof mL !== 'number' || mL < 0)
      throw new TypeError('max must be a non-negative number')

    this[MAX] = mL || Infinity
    trim(this)
  }
  get max () {
    return this[MAX]
  }

  set allowStale (allowStale) {
    this[ALLOW_STALE] = !!allowStale
  }
  get allowStale () {
    return this[ALLOW_STALE]
  }

  set maxAge (mA) {
    if (typeof mA !== 'number')
      throw new TypeError('maxAge must be a non-negative number')

    this[MAX_AGE] = mA
    trim(this)
  }
  get maxAge () {
    return this[MAX_AGE]
  }

  // resize the cache when the lengthCalculator changes.
  set lengthCalculator (lC) {
    if (typeof lC !== 'function')
      lC = naiveLength

    if (lC !== this[LENGTH_CALCULATOR]) {
      this[LENGTH_CALCULATOR] = lC
      this[LENGTH] = 0
      this[LRU_LIST].forEach(hit => {
        hit.length = this[LENGTH_CALCULATOR](hit.value, hit.key)
        this[LENGTH] += hit.length
      })
    }
    trim(this)
  }
  get lengthCalculator () { return this[LENGTH_CALCULATOR] }

  get length () { return this[LENGTH] }
  get itemCount () { return this[LRU_LIST].length }

  rforEach (fn, thisp) {
    thisp = thisp || this
    for (let walker = this[LRU_LIST].tail; walker !== null;) {
      const prev = walker.prev
      forEachStep(this, fn, walker, thisp)
      walker = prev
    }
  }

  forEach (fn, thisp) {
    thisp = thisp || this
    for (let walker = this[LRU_LIST].head; walker !== null;) {
      const next = walker.next
      forEachStep(this, fn, walker, thisp)
      walker = next
    }
  }

  keys () {
    return this[LRU_LIST].toArray().map(k => k.key)
  }

  values () {
    return this[LRU_LIST].toArray().map(k => k.value)
  }

  reset () {
    if (this[DISPOSE] &&
        this[LRU_LIST] &&
        this[LRU_LIST].length) {
      this[LRU_LIST].forEach(hit => this[DISPOSE](hit.key, hit.value))
    }

    this[CACHE] = new Map() // hash of items by key
    this[LRU_LIST] = new Yallist() // list of items in order of use recency
    this[LENGTH] = 0 // length of items in the list
  }

  dump () {
    return this[LRU_LIST].map(hit =>
      isStale(this, hit) ? false : {
        k: hit.key,
        v: hit.value,
        e: hit.now + (hit.maxAge || 0)
      }).toArray().filter(h => h)
  }

  dumpLru () {
    return this[LRU_LIST]
  }

  set (key, value, maxAge) {
    maxAge = maxAge || this[MAX_AGE]

    if (maxAge && typeof maxAge !== 'number')
      throw new TypeError('maxAge must be a number')

    const now = maxAge ? Date.now() : 0
    const len = this[LENGTH_CALCULATOR](value, key)

    if (this[CACHE].has(key)) {
      if (len > this[MAX]) {
        del(this, this[CACHE].get(key))
        return false
      }

      const node = this[CACHE].get(key)
      const item = node.value

      // dispose of the old one before overwriting
      // split out into 2 ifs for better coverage tracking
      if (this[DISPOSE]) {
        if (!this[NO_DISPOSE_ON_SET])
          this[DISPOSE](key, item.value)
      }

      item.now = now
      item.maxAge = maxAge
      item.value = value
      this[LENGTH] += len - item.length
      item.length = len
      this.get(key)
      trim(this)
      return true
    }

    const hit = new Entry(key, value, len, now, maxAge)

    // oversized objects fall out of cache automatically.
    if (hit.length > this[MAX]) {
      if (this[DISPOSE])
        this[DISPOSE](key, value)

      return false
    }

    this[LENGTH] += hit.length
    this[LRU_LIST].unshift(hit)
    this[CACHE].set(key, this[LRU_LIST].head)
    trim(this)
    return true
  }

  has (key) {
    if (!this[CACHE].has(key)) return false
    const hit = this[CACHE].get(key).value
    return !isStale(this, hit)
  }

  get (key) {
    return get(this, key, true)
  }

  peek (key) {
    return get(this, key, false)
  }

  pop () {
    const node = this[LRU_LIST].tail
    if (!node)
      return null

    del(this, node)
    return node.value
  }

  del (key) {
    del(this, this[CACHE].get(key))
  }

  load (arr) {
    // reset the cache
    this.reset()

    const now = Date.now()
    // A previous serialized cache has the most recent items first
    for (let l = arr.length - 1; l >= 0; l--) {
      const hit = arr[l]
      const expiresAt = hit.e || 0
      if (expiresAt === 0)
        // the item was created without expiration in a non aged cache
        this.set(hit.k, hit.v)
      else {
        const maxAge = expiresAt - now
        // dont add already expired items
        if (maxAge > 0) {
          this.set(hit.k, hit.v, maxAge)
        }
      }
    }
  }

  prune () {
    this[CACHE].forEach((value, key) => get(this, key, false))
  }
}

const get = (self, key, doUse) => {
  const node = self[CACHE].get(key)
  if (node) {
    const hit = node.value
    if (isStale(self, hit)) {
      del(self, node)
      if (!self[ALLOW_STALE])
        return undefined
    } else {
      if (doUse) {
        if (self[UPDATE_AGE_ON_GET])
          node.value.now = Date.now()
        self[LRU_LIST].unshiftNode(node)
      }
    }
    return hit.value
  }
}

const isStale = (self, hit) => {
  if (!hit || (!hit.maxAge && !self[MAX_AGE]))
    return false

  const diff = Date.now() - hit.now
  return hit.maxAge ? diff > hit.maxAge
    : self[MAX_AGE] && (diff > self[MAX_AGE])
}

const trim = self => {
  if (self[LENGTH] > self[MAX]) {
    for (let walker = self[LRU_LIST].tail;
      self[LENGTH] > self[MAX] && walker !== null;) {
      // We know that we're about to delete this one, and also
      // what the next least recently used key will be, so just
      // go ahead and set it now.
      const prev = walker.prev
      del(self, walker)
      walker = prev
    }
  }
}

const del = (self, node) => {
  if (node) {
    const hit = node.value
    if (self[DISPOSE])
      self[DISPOSE](hit.key, hit.value)

    self[LENGTH] -= hit.length
    self[CACHE].delete(hit.key)
    self[LRU_LIST].removeNode(node)
  }
}

class Entry {
  constructor (key, value, length, now, maxAge) {
    this.key = key
    this.value = value
    this.length = length
    this.now = now
    this.maxAge = maxAge || 0
  }
}

const forEachStep = (self, fn, node, thisp) => {
  let hit = node.value
  if (isStale(self, hit)) {
    del(self, node)
    if (!self[ALLOW_STALE])
      hit = undefined
  }
  if (hit)
    fn.call(thisp, hit.value, hit.key, self)
}

module.exports = LRUCache

},{"yallist":3}],2:[function(require,module,exports){
'use strict'
module.exports = function (Yallist) {
  Yallist.prototype[Symbol.iterator] = function* () {
    for (let walker = this.head; walker; walker = walker.next) {
      yield walker.value
    }
  }
}

},{}],3:[function(require,module,exports){
'use strict'
module.exports = Yallist

Yallist.Node = Node
Yallist.create = Yallist

function Yallist (list) {
  var self = this
  if (!(self instanceof Yallist)) {
    self = new Yallist()
  }

  self.tail = null
  self.head = null
  self.length = 0

  if (list && typeof list.forEach === 'function') {
    list.forEach(function (item) {
      self.push(item)
    })
  } else if (arguments.length > 0) {
    for (var i = 0, l = arguments.length; i < l; i++) {
      self.push(arguments[i])
    }
  }

  return self
}

Yallist.prototype.removeNode = function (node) {
  if (node.list !== this) {
    throw new Error('removing node which does not belong to this list')
  }

  var next = node.next
  var prev = node.prev

  if (next) {
    next.prev = prev
  }

  if (prev) {
    prev.next = next
  }

  if (node === this.head) {
    this.head = next
  }
  if (node === this.tail) {
    this.tail = prev
  }

  node.list.length--
  node.next = null
  node.prev = null
  node.list = null
}

Yallist.prototype.unshiftNode = function (node) {
  if (node === this.head) {
    return
  }

  if (node.list) {
    node.list.removeNode(node)
  }

  var head = this.head
  node.list = this
  node.next = head
  if (head) {
    head.prev = node
  }

  this.head = node
  if (!this.tail) {
    this.tail = node
  }
  this.length++
}

Yallist.prototype.pushNode = function (node) {
  if (node === this.tail) {
    return
  }

  if (node.list) {
    node.list.removeNode(node)
  }

  var tail = this.tail
  node.list = this
  node.prev = tail
  if (tail) {
    tail.next = node
  }

  this.tail = node
  if (!this.head) {
    this.head = node
  }
  this.length++
}

Yallist.prototype.push = function () {
  for (var i = 0, l = arguments.length; i < l; i++) {
    push(this, arguments[i])
  }
  return this.length
}

Yallist.prototype.unshift = function () {
  for (var i = 0, l = arguments.length; i < l; i++) {
    unshift(this, arguments[i])
  }
  return this.length
}

Yallist.prototype.pop = function () {
  if (!this.tail) {
    return undefined
  }

  var res = this.tail.value
  this.tail = this.tail.prev
  if (this.tail) {
    this.tail.next = null
  } else {
    this.head = null
  }
  this.length--
  return res
}

Yallist.prototype.shift = function () {
  if (!this.head) {
    return undefined
  }

  var res = this.head.value
  this.head = this.head.next
  if (this.head) {
    this.head.prev = null
  } else {
    this.tail = null
  }
  this.length--
  return res
}

Yallist.prototype.forEach = function (fn, thisp) {
  thisp = thisp || this
  for (var walker = this.head, i = 0; walker !== null; i++) {
    fn.call(thisp, walker.value, i, this)
    walker = walker.next
  }
}

Yallist.prototype.forEachReverse = function (fn, thisp) {
  thisp = thisp || this
  for (var walker = this.tail, i = this.length - 1; walker !== null; i--) {
    fn.call(thisp, walker.value, i, this)
    walker = walker.prev
  }
}

Yallist.prototype.get = function (n) {
  for (var i = 0, walker = this.head; walker !== null && i < n; i++) {
    // abort out of the list early if we hit a cycle
    walker = walker.next
  }
  if (i === n && walker !== null) {
    return walker.value
  }
}

Yallist.prototype.getReverse = function (n) {
  for (var i = 0, walker = this.tail; walker !== null && i < n; i++) {
    // abort out of the list early if we hit a cycle
    walker = walker.prev
  }
  if (i === n && walker !== null) {
    return walker.value
  }
}

Yallist.prototype.map = function (fn, thisp) {
  thisp = thisp || this
  var res = new Yallist()
  for (var walker = this.head; walker !== null;) {
    res.push(fn.call(thisp, walker.value, this))
    walker = walker.next
  }
  return res
}

Yallist.prototype.mapReverse = function (fn, thisp) {
  thisp = thisp || this
  var res = new Yallist()
  for (var walker = this.tail; walker !== null;) {
    res.push(fn.call(thisp, walker.value, this))
    walker = walker.prev
  }
  return res
}

Yallist.prototype.reduce = function (fn, initial) {
  var acc
  var walker = this.head
  if (arguments.length > 1) {
    acc = initial
  } else if (this.head) {
    walker = this.head.next
    acc = this.head.value
  } else {
    throw new TypeError('Reduce of empty list with no initial value')
  }

  for (var i = 0; walker !== null; i++) {
    acc = fn(acc, walker.value, i)
    walker = walker.next
  }

  return acc
}

Yallist.prototype.reduceReverse = function (fn, initial) {
  var acc
  var walker = this.tail
  if (arguments.length > 1) {
    acc = initial
  } else if (this.tail) {
    walker = this.tail.prev
    acc = this.tail.value
  } else {
    throw new TypeError('Reduce of empty list with no initial value')
  }

  for (var i = this.length - 1; walker !== null; i--) {
    acc = fn(acc, walker.value, i)
    walker = walker.prev
  }

  return acc
}

Yallist.prototype.toArray = function () {
  var arr = new Array(this.length)
  for (var i = 0, walker = this.head; walker !== null; i++) {
    arr[i] = walker.value
    walker = walker.next
  }
  return arr
}

Yallist.prototype.toArrayReverse = function () {
  var arr = new Array(this.length)
  for (var i = 0, walker = this.tail; walker !== null; i++) {
    arr[i] = walker.value
    walker = walker.prev
  }
  return arr
}

Yallist.prototype.slice = function (from, to) {
  to = to || this.length
  if (to < 0) {
    to += this.length
  }
  from = from || 0
  if (from < 0) {
    from += this.length
  }
  var ret = new Yallist()
  if (to < from || to < 0) {
    return ret
  }
  if (from < 0) {
    from = 0
  }
  if (to > this.length) {
    to = this.length
  }
  for (var i = 0, walker = this.head; walker !== null && i < from; i++) {
    walker = walker.next
  }
  for (; walker !== null && i < to; i++, walker = walker.next) {
    ret.push(walker.value)
  }
  return ret
}

Yallist.prototype.sliceReverse = function (from, to) {
  to = to || this.length
  if (to < 0) {
    to += this.length
  }
  from = from || 0
  if (from < 0) {
    from += this.length
  }
  var ret = new Yallist()
  if (to < from || to < 0) {
    return ret
  }
  if (from < 0) {
    from = 0
  }
  if (to > this.length) {
    to = this.length
  }
  for (var i = this.length, walker = this.tail; walker !== null && i > to; i--) {
    walker = walker.prev
  }
  for (; walker !== null && i > from; i--, walker = walker.prev) {
    ret.push(walker.value)
  }
  return ret
}

Yallist.prototype.reverse = function () {
  var head = this.head
  var tail = this.tail
  for (var walker = head; walker !== null; walker = walker.prev) {
    var p = walker.prev
    walker.prev = walker.next
    walker.next = p
  }
  this.head = tail
  this.tail = head
  return this
}

function push (self, item) {
  self.tail = new Node(item, self.tail, null, self)
  if (!self.head) {
    self.head = self.tail
  }
  self.length++
}

function unshift (self, item) {
  self.head = new Node(item, null, self.head, self)
  if (!self.tail) {
    self.tail = self.head
  }
  self.length++
}

function Node (value, prev, next, list) {
  if (!(this instanceof Node)) {
    return new Node(value, prev, next, list)
  }

  this.list = list
  this.value = value

  if (prev) {
    prev.next = this
    this.prev = prev
  } else {
    this.prev = null
  }

  if (next) {
    next.prev = this
    this.next = next
  } else {
    this.next = null
  }
}

try {
  // add if support for Symbol.iterator is present
  require('./iterator.js')(Yallist)
} catch (er) {}

},{"./iterator.js":2}],4:[function(require,module,exports){
"use strict";

var gapi = _interopRequireWildcard(require("./gapi"));

var _msg2 = require("./msg");

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

var mainPatterns = [];
var analyzePatterns = [];
var calendars = {};
var calData = {};
chrome.runtime.onConnect.addListener(function (port) {
  console.assert(port.name == 'main');
  port.onMessage.addListener(function (_msg) {
    var msg = _msg2.Msg.inflate(_msg);

    console.log(msg);

    if (msg.type == _msg2.msgType.updatePatterns) {
      if (msg.data.id == 'analyze') analyzePatterns = msg.data.patterns;else mainPatterns = msg.data.patterns;
      port.postMessage(msg.genResp(null));
    } else if (msg.type == _msg2.msgType.getPatterns) {
      var patterns;
      if (msg.data.id == 'analyze') patterns = analyzePatterns;else patterns = mainPatterns;
      port.postMessage(msg.genResp(patterns));
    } else if (msg.type == _msg2.msgType.updateCalendars) {
      calendars = msg.data;

      for (var id in calendars) {
        if (!calData.hasOwnProperty(id)) calData[id] = new gapi.GCalendar(id, calendars[id].summary);
      }

      port.postMessage(msg.genResp(null));
    } else if (msg.type == _msg2.msgType.getCalendars) {
      var cals = calendars;

      if (msg.data.enabledOnly) {
        cals = Object.keys(calendars).filter(function (id) {
          return calendars[id].enabled;
        }).reduce(function (res, id) {
          return res[id] = calendars[id], res;
        }, {});
      }

      port.postMessage(msg.genResp(cals));
    } else if (msg.type == _msg2.msgType.getCalEvents) {
      calData[msg.data.id].getEvents(new Date(msg.data.start), new Date(msg.data.end)).catch(function (e) {
        console.log("cannot load calendar ".concat(msg.data.id), e);
        return [];
      }).then(function (data) {
        console.log(data);
        var resp = msg.genResp(data.map(function (e) {
          return {
            id: e.id,
            start: e.start.getTime(),
            end: e.end.getTime()
          };
        }));
        console.log(resp);
        port.postMessage(resp);
      });
    } else {
      console.error("unknown msg type");
    }
  });
});
chrome.browserAction.onClicked.addListener(function () {
  chrome.tabs.create({
    url: 'index.html'
  });
});

},{"./gapi":5,"./msg":6}],5:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getLoggedIn = getLoggedIn;
exports.getAuthToken = getAuthToken;
exports.login = login;
exports.logout = logout;
exports.getCalendars = getCalendars;
exports.getColors = getColors;
exports.GCalendar = void 0;

var _lruCache = _interopRequireDefault(require("lru-cache"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance"); }

function _iterableToArray(iter) { if (Symbol.iterator in Object(iter) || Object.prototype.toString.call(iter) === "[object Arguments]") return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

var gapi_base = 'https://www.googleapis.com/calendar/v3';
var GApiError = Object.freeze({
  invalidSyncToken: Symbol("invalidSyncToken"),
  notLoggedIn: Symbol("notLoggedIn"),
  notLoggedOut: Symbol("notLoggedOut"),
  otherError: Symbol("otherError")
});

function to_params(dict) {
  return Object.entries(dict).filter(function (_ref) {
    var _ref2 = _slicedToArray(_ref, 2),
        k = _ref2[0],
        v = _ref2[1];

    return v;
  }).map(function (_ref3) {
    var _ref4 = _slicedToArray(_ref3, 2),
        k = _ref4[0],
        v = _ref4[1];

    return "".concat(encodeURIComponent(k), "=").concat(encodeURIComponent(v));
  }).join('&');
}

var loggedIn = null;

function _getAuthToken() {
  var interactive = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
  return new Promise(function (resolver) {
    return chrome.identity.getAuthToken({
      interactive: interactive
    }, function (token) {
      return resolver([token, !chrome.runtime.lastError]);
    });
  }).then(function (_ref5) {
    var _ref6 = _slicedToArray(_ref5, 2),
        token = _ref6[0],
        ok = _ref6[1];

    if (ok) return token;else throw GApiError.notLoggedIn;
  });
}

function _removeCachedAuthToken(token) {
  return new Promise(function (resolver) {
    return chrome.identity.removeCachedAuthToken({
      token: token
    }, function () {
      return resolver();
    });
  });
}

function getLoggedIn() {
  if (loggedIn === null) {
    return _getAuthToken(false).then(function () {
      loggedIn = true;
    }).catch(function () {
      loggedIn = false;
      console.log("here");
    }).then(function () {
      return loggedIn;
    });
  } else return Promise.resolve(loggedIn);
}

function getAuthToken() {
  return getLoggedIn().then(function (b) {
    if (b) return _getAuthToken(false);else throw GApiError.notLoggedIn;
  });
}

function login() {
  return getLoggedIn().then(function (b) {
    if (!b) return _getAuthToken(true).then(function () {
      return loggedIn = true;
    });else throw GApiError.notLoggedOut;
  });
}

function logout() {
  return getAuthToken().then(function (token) {
    return fetch("https://accounts.google.com/o/oauth2/revoke?".concat(to_params({
      token: token
    })), {
      method: 'GET',
      async: true
    }).then(function (response) {
      if (response.status === 200) return _removeCachedAuthToken(token);else throw GApiError.otherError;
    });
  }).then(function () {
    return loggedIn = false;
  });
}

function getCalendars(token) {
  return fetch("".concat(gapi_base, "/users/me/calendarList?").concat(to_params({
    access_token: token
  })), {
    method: 'GET',
    async: true
  }).then(function (response) {
    return response.json();
  }).then(function (data) {
    return data.items;
  });
}

function getColors(token) {
  return fetch("".concat(gapi_base, "/colors?").concat(to_params({
    access_token: token
  })), {
    method: 'GET',
    async: true
  }).then(function (response) {
    return response.json();
  });
}

function getEvent(calId, eventId, token) {
  return fetch("".concat(gapi_base, "/calendars/").concat(calId, "/events/").concat(eventId, "?").concat(to_params({
    access_token: token
  })), {
    method: 'GET',
    async: true
  }).then(function (response) {
    return response.json();
  });
}

function _getEvents(calId, token) {
  var syncToken = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
  var timeMin = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;
  var timeMax = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : null;
  var resultsPerRequest = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : 100;
  var results = [];

  var singleFetch = function singleFetch(pageToken, syncToken) {
    return fetch("".concat(gapi_base, "/calendars/").concat(calId, "/events?").concat(to_params({
      access_token: token,
      pageToken: pageToken,
      syncToken: syncToken,
      timeMin: timeMin,
      timeMax: timeMax,
      maxResults: resultsPerRequest
    })), {
      method: 'GET',
      async: true
    }).then(function (response) {
      if (response.status === 200) return response.json();else if (response.status === 410) throw GApiError.invalidSyncToken;else throw GApiError.otherError;
    }).then(function (data) {
      results.push.apply(results, _toConsumableArray(data.items));

      if (data.nextPageToken) {
        return singleFetch(data.nextPageToken, '');
      } else {
        return {
          nextSyncToken: data.nextSyncToken,
          results: results
        };
      }
    });
  };

  return singleFetch('', syncToken);
}

var GCalendar =
/*#__PURE__*/
function () {
  function GCalendar(calId, name) {
    var _this = this;

    var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {
      maxCachedItems: 100,
      nDaysPerSlot: 10,
      largeQuery: 10
    };

    _classCallCheck(this, GCalendar);

    this.calId = calId;
    this.name = name;
    this.syncToken = '';
    this.cache = new _lruCache.default({
      max: options.maxCachedItems,
      dispose: function dispose(k, v) {
        return _this.onRemoveSlot(k, v);
      }
    });
    this.eventMeta = {};
    this.options = options;
    this.divider = 8.64e7 * this.options.nDaysPerSlot;
  }

  _createClass(GCalendar, [{
    key: "dateToCacheKey",
    value: function dateToCacheKey(date) {
      return Math.floor(date / this.divider);
    }
  }, {
    key: "dateRangeToCacheKeys",
    value: function dateRangeToCacheKeys(range) {
      return {
        start: this.dateToCacheKey(range.start),
        end: this.dateToCacheKey(new Date(range.end.getTime() - 1))
      };
    }
  }, {
    key: "getSlot",
    value: function getSlot(k) {
      if (!this.cache.has(k)) {
        var res = {};
        this.cache.set(k, res);
        return res;
      } else return this.cache.get(k);
    }
  }, {
    key: "onRemoveSlot",
    value: function onRemoveSlot(k, v) {
      for (var id in v) {
        console.assert(this.eventMeta[id]);
        var keys = this.eventMeta[id].keys;
        keys.delete(k);
        if (keys.size === 0) delete this.eventMeta[id];
      }
    }
  }, {
    key: "slotStartDate",
    value: function slotStartDate(k) {
      return new Date(k * this.divider);
    }
  }, {
    key: "slotEndDate",
    value: function slotEndDate(k) {
      return new Date((k + 1) * this.divider);
    }
  }, {
    key: "addEvent",
    value: function addEvent(e) {
      var evict = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      //console.log('adding event', e);
      if (this.eventMeta.hasOwnProperty(e.id)) this.removeEvent(e);
      var r = this.dateRangeToCacheKeys(e);
      var ks = r.start;
      var ke = r.end;
      var t = this.cache.length;
      var keys = new Set();

      for (var i = ks; i <= ke; i++) {
        keys.add(i);
        if (!this.cache.has(i)) t++;
      }

      this.eventMeta[e.id] = {
        keys: keys,
        summary: e.summary
      };
      if (!evict && t > this.options.maxCachedItems) return;
      if (ks === ke) this.getSlot(ks)[e.id] = {
        start: e.start,
        end: e.end,
        id: e.id
      };else {
        this.getSlot(ks)[e.id] = {
          start: e.start,
          end: this.slotEndDate(ks),
          id: e.id
        };
        this.getSlot(ke)[e.id] = {
          start: this.slotStartDate(ke),
          end: e.end,
          id: e.id
        };

        for (var k = ks + 1; k < ke; k++) {
          this.getSlot(k)[e.id] = {
            start: this.slotStartDate(k),
            end: this.slotEndDate(k),
            id: e.id
          };
        }
      }
    }
  }, {
    key: "removeEvent",
    value: function removeEvent(e) {
      var _this2 = this;

      var keys = this.eventMeta[e.id].keys;
      console.assert(keys);
      keys.forEach(function (k) {
        return delete _this2.getSlot(k)[e.id];
      });
      delete this.eventMeta[e.id];
    }
  }, {
    key: "getSlotEvents",
    value: function getSlotEvents(k, start, end) {
      var s = this.getSlot(k); //console.log(s);

      var results = [];

      for (var id in s) {
        if (!(s[id].start >= end || s[id].end <= start)) {
          results.push({
            id: id,
            start: s[id].start < start ? start : s[id].start,
            end: s[id].end > end ? end : s[id].end,
            summary: this.eventMeta[id].summary
          });
        }
      }

      return results;
    }
  }, {
    key: "getCachedEvents",
    value: function getCachedEvents(_r) {
      var r = this.dateRangeToCacheKeys(_r);
      var ks = r.start;
      var ke = r.end;
      var results = this.getSlotEvents(ks, _r.start, _r.end);

      for (var k = ks + 1; k < ke; k++) {
        var s = this.getSlot(k);

        for (var id in s) {
          results.push(s[id]);
        }
      }

      if (ke > ks) results.push.apply(results, _toConsumableArray(this.getSlotEvents(ke, _r.start, _r.end)));
      return results;
    }
  }, {
    key: "sync",
    value: function sync() {
      var _this3 = this;

      return this.token.then(function (token) {
        return _getEvents(_this3.calId, token, _this3.syncToken).then(function (r) {
          var pms = r.results.map(function (e) {
            return e.start ? Promise.resolve(e) : getEvent(_this3.calId, e.id, token);
          });
          return Promise.all(pms).then(function (results) {
            results.forEach(function (e) {
              e.start = new Date(e.start.dateTime);
              e.end = new Date(e.end.dateTime);
              if (e.status === 'confirmed') _this3.addEvent(e);else if (e.status === 'cancelled') _this3.removeEvent(e);
            });
            _this3.syncToken = r.nextSyncToken;
          });
        });
      }).catch(function (e) {
        if (e === GApiError.invalidSyncToken) {
          _this3.syncToken = '';

          _this3.sync();
        } else throw e;
      });
    }
  }, {
    key: "getEvents",
    value: function getEvents(start, end) {
      var _this4 = this;

      var r = this.dateRangeToCacheKeys({
        start: start,
        end: end
      });
      var query = {};

      for (var k = r.start; k <= r.end; k++) {
        if (!this.cache.has(k)) {
          if (!query.hasOwnProperty('start')) query.start = k;
          query.end = k;
        }
      }

      console.log("start: ".concat(start, " end: ").concat(end));

      if (query.hasOwnProperty('start')) {
        console.assert(query.start <= query.end);

        if (query.end - query.start + 1 > this.options.largeQuery) {
          console.log("encounter large query, use direct fetch");
          return this.token.then(function (token) {
            return _getEvents(_this4.calId, token, null, start.toISOString(), end.toISOString()).then(function (r) {
              var results = [];
              r.results.forEach(function (e) {
                console.assert(e.start);
                e.start = new Date(e.start.dateTime);
                e.end = new Date(e.end.dateTime);
                results.push(e);
              });
              return results.filter(function (e) {
                return !(e.start >= end || e.end <= start);
              }).map(function (e) {
                return {
                  id: e.id,
                  start: e.start < start ? start : e.start,
                  end: e.end > end ? end : e.end,
                  summary: e.summary
                };
              });
            });
          });
        }

        console.log("fetching short event list");
        return this.token.then(function (token) {
          return _getEvents(_this4.calId, token, null, _this4.slotStartDate(query.start).toISOString(), _this4.slotEndDate(query.end).toISOString()).then(function (r) {
            r.results.forEach(function (e) {
              if (e.status === 'confirmed') {
                console.assert(e.start);
                e.start = new Date(e.start.dateTime);
                e.end = new Date(e.end.dateTime);

                _this4.addEvent(e, true);
              }
            });
            if (_this4.syncToken === '') _this4.syncToken = r.nextSyncToken;
          });
        }).then(function () {
          return _this4.sync();
        }).then(function () {
          return _this4.getCachedEvents({
            start: start,
            end: end
          });
        });
      } else {
        console.log("cache hit");
        return this.sync().then(function () {
          return _this4.getCachedEvents({
            start: start,
            end: end
          });
        });
      }
    }
  }, {
    key: "token",
    get: function get() {
      return getAuthToken();
    }
  }]);

  return GCalendar;
}();

exports.GCalendar = GCalendar;

},{"lru-cache":1}],6:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MsgClient = exports.Msg = exports.msgType = void 0;

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

/* global chrome */
var _updatePatterns = "updatePatterns";
var _getPatterns = "getPatterns";
var _updateCalendars = "updateCalendars";
var _getCalendars = "getCalendars";
var _getCalEvents = "getCalEvents";
var msgType = Object.freeze({
  updatePatterns: Symbol(_updatePatterns),
  getPatterns: Symbol(_getPatterns),
  updateCalendars: Symbol(_updateCalendars),
  getCalendars: Symbol(_getCalendars),
  getCalEvents: Symbol(_getCalEvents)
});
exports.msgType = msgType;

function stringifyMsgType(mt) {
  switch (mt) {
    case msgType.updatePatterns:
      return _updatePatterns;

    case msgType.getPatterns:
      return _getPatterns;

    case msgType.updateCalendars:
      return _updateCalendars;

    case msgType.getCalendars:
      return _getCalendars;

    case msgType.getCalEvents:
      return _getCalEvents;

    default:
      console.error("unreachable");
  }
}

function parseMsgType(s) {
  switch (s) {
    case _updatePatterns:
      return msgType.updatePatterns;

    case _getPatterns:
      return msgType.getPatterns;

    case _updateCalendars:
      return msgType.updateCalendars;

    case _getCalendars:
      return msgType.getCalendars;

    case _getCalEvents:
      return msgType.getCalEvents;

    default:
      console.error("unreachable");
  }
}

var Msg =
/*#__PURE__*/
function () {
  function Msg(id, type, data) {
    _classCallCheck(this, Msg);

    this.id = id;
    this.type = type;
    this.data = data;
  }

  _createClass(Msg, [{
    key: "genResp",
    value: function genResp(data) {
      return new Msg(this.id, this.type, data);
    }
  }, {
    key: "deflate",
    value: function deflate() {
      return {
        id: this.id,
        type: stringifyMsgType(this.type),
        data: this.data
      };
    }
  }]);

  return Msg;
}();

exports.Msg = Msg;

_defineProperty(Msg, "inflate", function (obj) {
  return new Msg(obj.id, parseMsgType(obj.type), obj.data);
});

var MsgClient = function MsgClient(channelName) {
  var _this = this;

  _classCallCheck(this, MsgClient);

  _defineProperty(this, "sendMsg", function (_ref) {
    var type = _ref.type,
        data = _ref.data;
    var rcb = _this.requestCallback;
    var cb;
    var pm = new Promise(function (resolve) {
      cb = resolve;
    });
    var id;

    if (rcb.ids.length > 0) {
      id = rcb.ids.pop();
    } else {
      id = rcb.maxId++;
    }

    rcb.inFlight[id] = cb;

    _this.port.postMessage(new Msg(id, type, data).deflate());

    return pm;
  });

  var port = chrome.runtime.connect({
    name: channelName
  });

  var getCallBack = function getCallBack(rcb) {
    return _this.requestCallback;
  };

  port.onMessage.addListener(function (msg) {
    console.log(msg);
    var rcb = getCallBack(msg.type);
    var cb = rcb.inFlight[msg.id];
    console.assert(cb !== undefined);
    rcb.ids.push(msg.id);
    cb(msg);
  });
  this.port = port;
  this.requestCallback = {
    inFlight: {},
    ids: [],
    maxId: 0
  };
};

exports.MsgClient = MsgClient;

},{}]},{},[4])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvbHJ1LWNhY2hlL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3lhbGxpc3QvaXRlcmF0b3IuanMiLCJub2RlX21vZHVsZXMveWFsbGlzdC95YWxsaXN0LmpzIiwic3JjL2JhY2tncm91bmQuanMiLCJzcmMvZ2FwaS5qcyIsInNyYy9tc2cuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3hYQTs7QUFDQTs7OztBQUVBLElBQUksWUFBWSxHQUFHLEVBQW5CO0FBQ0EsSUFBSSxlQUFlLEdBQUcsRUFBdEI7QUFDQSxJQUFJLFNBQVMsR0FBRyxFQUFoQjtBQUNBLElBQUksT0FBTyxHQUFHLEVBQWQ7QUFFQSxNQUFNLENBQUMsT0FBUCxDQUFlLFNBQWYsQ0FBeUIsV0FBekIsQ0FBcUMsVUFBUyxJQUFULEVBQWU7QUFDaEQsRUFBQSxPQUFPLENBQUMsTUFBUixDQUFlLElBQUksQ0FBQyxJQUFMLElBQWEsTUFBNUI7QUFDQSxFQUFBLElBQUksQ0FBQyxTQUFMLENBQWUsV0FBZixDQUEyQixVQUFTLElBQVQsRUFBZTtBQUN0QyxRQUFJLEdBQUcsR0FBRyxVQUFJLE9BQUosQ0FBWSxJQUFaLENBQVY7O0FBQ0EsSUFBQSxPQUFPLENBQUMsR0FBUixDQUFZLEdBQVo7O0FBQ0EsUUFBSSxHQUFHLENBQUMsSUFBSixJQUFZLGNBQVEsY0FBeEIsRUFBd0M7QUFDcEMsVUFBSSxHQUFHLENBQUMsSUFBSixDQUFTLEVBQVQsSUFBZSxTQUFuQixFQUNJLGVBQWUsR0FBRyxHQUFHLENBQUMsSUFBSixDQUFTLFFBQTNCLENBREosS0FHSSxZQUFZLEdBQUcsR0FBRyxDQUFDLElBQUosQ0FBUyxRQUF4QjtBQUNKLE1BQUEsSUFBSSxDQUFDLFdBQUwsQ0FBaUIsR0FBRyxDQUFDLE9BQUosQ0FBWSxJQUFaLENBQWpCO0FBQ0gsS0FORCxNQU9LLElBQUksR0FBRyxDQUFDLElBQUosSUFBWSxjQUFRLFdBQXhCLEVBQXFDO0FBQ3RDLFVBQUksUUFBSjtBQUNBLFVBQUksR0FBRyxDQUFDLElBQUosQ0FBUyxFQUFULElBQWUsU0FBbkIsRUFDSSxRQUFRLEdBQUcsZUFBWCxDQURKLEtBR0ksUUFBUSxHQUFHLFlBQVg7QUFDSixNQUFBLElBQUksQ0FBQyxXQUFMLENBQWlCLEdBQUcsQ0FBQyxPQUFKLENBQVksUUFBWixDQUFqQjtBQUNILEtBUEksTUFRQSxJQUFJLEdBQUcsQ0FBQyxJQUFKLElBQVksY0FBUSxlQUF4QixFQUF5QztBQUMxQyxNQUFBLFNBQVMsR0FBRyxHQUFHLENBQUMsSUFBaEI7O0FBQ0EsV0FBSyxJQUFJLEVBQVQsSUFBZSxTQUFmLEVBQTBCO0FBQ3RCLFlBQUksQ0FBQyxPQUFPLENBQUMsY0FBUixDQUF1QixFQUF2QixDQUFMLEVBQ0ksT0FBTyxDQUFDLEVBQUQsQ0FBUCxHQUFjLElBQUksSUFBSSxDQUFDLFNBQVQsQ0FBbUIsRUFBbkIsRUFBdUIsU0FBUyxDQUFDLEVBQUQsQ0FBVCxDQUFjLE9BQXJDLENBQWQ7QUFDUDs7QUFDRCxNQUFBLElBQUksQ0FBQyxXQUFMLENBQWlCLEdBQUcsQ0FBQyxPQUFKLENBQVksSUFBWixDQUFqQjtBQUNILEtBUEksTUFRQSxJQUFJLEdBQUcsQ0FBQyxJQUFKLElBQVksY0FBUSxZQUF4QixFQUFzQztBQUN2QyxVQUFJLElBQUksR0FBRyxTQUFYOztBQUNBLFVBQUksR0FBRyxDQUFDLElBQUosQ0FBUyxXQUFiLEVBQ0E7QUFDSSxRQUFBLElBQUksR0FBRyxNQUFNLENBQUMsSUFBUCxDQUFZLFNBQVosRUFDRixNQURFLENBQ0ssVUFBQSxFQUFFO0FBQUEsaUJBQUksU0FBUyxDQUFDLEVBQUQsQ0FBVCxDQUFjLE9BQWxCO0FBQUEsU0FEUCxFQUVGLE1BRkUsQ0FFSyxVQUFDLEdBQUQsRUFBTSxFQUFOO0FBQUEsaUJBQWMsR0FBRyxDQUFDLEVBQUQsQ0FBSCxHQUFVLFNBQVMsQ0FBQyxFQUFELENBQW5CLEVBQXlCLEdBQXZDO0FBQUEsU0FGTCxFQUVrRCxFQUZsRCxDQUFQO0FBR0g7O0FBQ0QsTUFBQSxJQUFJLENBQUMsV0FBTCxDQUFpQixHQUFHLENBQUMsT0FBSixDQUFZLElBQVosQ0FBakI7QUFDSCxLQVRJLE1BVUEsSUFBSSxHQUFHLENBQUMsSUFBSixJQUFZLGNBQVEsWUFBeEIsRUFBc0M7QUFDdkMsTUFBQSxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUosQ0FBUyxFQUFWLENBQVAsQ0FBcUIsU0FBckIsQ0FBK0IsSUFBSSxJQUFKLENBQVMsR0FBRyxDQUFDLElBQUosQ0FBUyxLQUFsQixDQUEvQixFQUF5RCxJQUFJLElBQUosQ0FBUyxHQUFHLENBQUMsSUFBSixDQUFTLEdBQWxCLENBQXpELEVBQ0ssS0FETCxDQUNXLFVBQUEsQ0FBQyxFQUFJO0FBQ1IsUUFBQSxPQUFPLENBQUMsR0FBUixnQ0FBb0MsR0FBRyxDQUFDLElBQUosQ0FBUyxFQUE3QyxHQUFtRCxDQUFuRDtBQUNBLGVBQU8sRUFBUDtBQUNILE9BSkwsRUFLSyxJQUxMLENBS1UsVUFBQSxJQUFJLEVBQUk7QUFDZCxRQUFBLE9BQU8sQ0FBQyxHQUFSLENBQVksSUFBWjtBQUNBLFlBQUksSUFBSSxHQUFHLEdBQUcsQ0FBQyxPQUFKLENBQVksSUFBSSxDQUFDLEdBQUwsQ0FBUyxVQUFBLENBQUMsRUFBSTtBQUNqQyxpQkFBTztBQUNILFlBQUEsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQURIO0FBRUgsWUFBQSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUYsQ0FBUSxPQUFSLEVBRko7QUFHSCxZQUFBLEdBQUcsRUFBRSxDQUFDLENBQUMsR0FBRixDQUFNLE9BQU47QUFIRixXQUFQO0FBS0gsU0FOc0IsQ0FBWixDQUFYO0FBT0EsUUFBQSxPQUFPLENBQUMsR0FBUixDQUFZLElBQVo7QUFDQSxRQUFBLElBQUksQ0FBQyxXQUFMLENBQWlCLElBQWpCO0FBQ0gsT0FoQkQ7QUFpQkgsS0FsQkksTUFtQkE7QUFDRCxNQUFBLE9BQU8sQ0FBQyxLQUFSLENBQWMsa0JBQWQ7QUFDSDtBQUNKLEdBMUREO0FBMkRILENBN0REO0FBK0RBLE1BQU0sQ0FBQyxhQUFQLENBQXFCLFNBQXJCLENBQStCLFdBQS9CLENBQTJDLFlBQVc7QUFDbEQsRUFBQSxNQUFNLENBQUMsSUFBUCxDQUFZLE1BQVosQ0FBbUI7QUFBQyxJQUFBLEdBQUcsRUFBRTtBQUFOLEdBQW5CO0FBQ0gsQ0FGRDs7Ozs7Ozs7Ozs7Ozs7OztBQ3RFQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSxJQUFNLFNBQVMsR0FBRyx3Q0FBbEI7QUFFQSxJQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsTUFBUCxDQUFjO0FBQzVCLEVBQUEsZ0JBQWdCLEVBQUUsTUFBTSxDQUFDLGtCQUFELENBREk7QUFFNUIsRUFBQSxXQUFXLEVBQUUsTUFBTSxDQUFDLGFBQUQsQ0FGUztBQUc1QixFQUFBLFlBQVksRUFBRSxNQUFNLENBQUMsY0FBRCxDQUhRO0FBSTVCLEVBQUEsVUFBVSxFQUFFLE1BQU0sQ0FBQyxZQUFEO0FBSlUsQ0FBZCxDQUFsQjs7QUFPQSxTQUFTLFNBQVQsQ0FBbUIsSUFBbkIsRUFBeUI7QUFDckIsU0FBTyxNQUFNLENBQUMsT0FBUCxDQUFlLElBQWYsRUFBcUIsTUFBckIsQ0FBNEI7QUFBQTtBQUFBLFFBQUUsQ0FBRjtBQUFBLFFBQUssQ0FBTDs7QUFBQSxXQUFZLENBQVo7QUFBQSxHQUE1QixFQUEyQyxHQUEzQyxDQUErQztBQUFBO0FBQUEsUUFBRSxDQUFGO0FBQUEsUUFBSyxDQUFMOztBQUFBLHFCQUFlLGtCQUFrQixDQUFDLENBQUQsQ0FBakMsY0FBd0Msa0JBQWtCLENBQUMsQ0FBRCxDQUExRDtBQUFBLEdBQS9DLEVBQWdILElBQWhILENBQXFILEdBQXJILENBQVA7QUFDSDs7QUFFRCxJQUFJLFFBQVEsR0FBRyxJQUFmOztBQUVBLFNBQVMsYUFBVCxHQUE0QztBQUFBLE1BQXJCLFdBQXFCLHVFQUFQLEtBQU87QUFDeEMsU0FBTyxJQUFJLE9BQUosQ0FBWSxVQUFBLFFBQVE7QUFBQSxXQUN2QixNQUFNLENBQUMsUUFBUCxDQUFnQixZQUFoQixDQUNJO0FBQUUsTUFBQSxXQUFXLEVBQVg7QUFBRixLQURKLEVBQ3FCLFVBQUEsS0FBSztBQUFBLGFBQUksUUFBUSxDQUFDLENBQUMsS0FBRCxFQUFRLENBQUMsTUFBTSxDQUFDLE9BQVAsQ0FBZSxTQUF4QixDQUFELENBQVo7QUFBQSxLQUQxQixDQUR1QjtBQUFBLEdBQXBCLEVBR0UsSUFIRixDQUdPLGlCQUFpQjtBQUFBO0FBQUEsUUFBZixLQUFlO0FBQUEsUUFBUixFQUFROztBQUNuQixRQUFJLEVBQUosRUFBUSxPQUFPLEtBQVAsQ0FBUixLQUNLLE1BQU0sU0FBUyxDQUFDLFdBQWhCO0FBQ1IsR0FORixDQUFQO0FBT0g7O0FBRUQsU0FBUyxzQkFBVCxDQUFnQyxLQUFoQyxFQUF1QztBQUNuQyxTQUFPLElBQUksT0FBSixDQUFZLFVBQUEsUUFBUTtBQUFBLFdBQ3ZCLE1BQU0sQ0FBQyxRQUFQLENBQWdCLHFCQUFoQixDQUFzQztBQUFFLE1BQUEsS0FBSyxFQUFMO0FBQUYsS0FBdEMsRUFBaUQ7QUFBQSxhQUFNLFFBQVEsRUFBZDtBQUFBLEtBQWpELENBRHVCO0FBQUEsR0FBcEIsQ0FBUDtBQUVIOztBQUVNLFNBQVMsV0FBVCxHQUF1QjtBQUMxQixNQUFJLFFBQVEsS0FBSyxJQUFqQixFQUNBO0FBQ0ksV0FBTyxhQUFhLENBQUMsS0FBRCxDQUFiLENBQ0YsSUFERSxDQUNHLFlBQU07QUFBQyxNQUFBLFFBQVEsR0FBRyxJQUFYO0FBQWdCLEtBRDFCLEVBRUYsS0FGRSxDQUVJLFlBQU07QUFBQyxNQUFBLFFBQVEsR0FBRyxLQUFYO0FBQWtCLE1BQUEsT0FBTyxDQUFDLEdBQVIsQ0FBWSxNQUFaO0FBQXFCLEtBRmxELEVBR0YsSUFIRSxDQUdHO0FBQUEsYUFBTSxRQUFOO0FBQUEsS0FISCxDQUFQO0FBSUgsR0FORCxNQU9LLE9BQU8sT0FBTyxDQUFDLE9BQVIsQ0FBZ0IsUUFBaEIsQ0FBUDtBQUNSOztBQUVNLFNBQVMsWUFBVCxHQUF3QjtBQUMzQixTQUFPLFdBQVcsR0FBRyxJQUFkLENBQW1CLFVBQUEsQ0FBQyxFQUFJO0FBQzNCLFFBQUksQ0FBSixFQUFPLE9BQU8sYUFBYSxDQUFDLEtBQUQsQ0FBcEIsQ0FBUCxLQUNLLE1BQU0sU0FBUyxDQUFDLFdBQWhCO0FBQ1IsR0FITSxDQUFQO0FBSUg7O0FBRU0sU0FBUyxLQUFULEdBQWlCO0FBQ3BCLFNBQU8sV0FBVyxHQUFHLElBQWQsQ0FBbUIsVUFBQSxDQUFDLEVBQUk7QUFDM0IsUUFBSSxDQUFDLENBQUwsRUFBUSxPQUFPLGFBQWEsQ0FBQyxJQUFELENBQWIsQ0FBb0IsSUFBcEIsQ0FBeUI7QUFBQSxhQUFNLFFBQVEsR0FBRyxJQUFqQjtBQUFBLEtBQXpCLENBQVAsQ0FBUixLQUNLLE1BQU0sU0FBUyxDQUFDLFlBQWhCO0FBQ1IsR0FITSxDQUFQO0FBSUg7O0FBRU0sU0FBUyxNQUFULEdBQWtCO0FBQ3JCLFNBQU8sWUFBWSxHQUFHLElBQWYsQ0FBb0IsVUFBQSxLQUFLLEVBQUk7QUFDaEMsV0FBTyxLQUFLLHVEQUFnRCxTQUFTLENBQUM7QUFBRSxNQUFBLEtBQUssRUFBTDtBQUFGLEtBQUQsQ0FBekQsR0FDQTtBQUFFLE1BQUEsTUFBTSxFQUFFLEtBQVY7QUFBaUIsTUFBQSxLQUFLLEVBQUU7QUFBeEIsS0FEQSxDQUFMLENBQ3FDLElBRHJDLENBQzBDLFVBQUEsUUFBUSxFQUFJO0FBQ3pELFVBQUksUUFBUSxDQUFDLE1BQVQsS0FBb0IsR0FBeEIsRUFDSSxPQUFPLHNCQUFzQixDQUFDLEtBQUQsQ0FBN0IsQ0FESixLQUVLLE1BQU0sU0FBUyxDQUFDLFVBQWhCO0FBQ1IsS0FMTSxDQUFQO0FBTUgsR0FQTSxFQU9KLElBUEksQ0FPQztBQUFBLFdBQU0sUUFBUSxHQUFHLEtBQWpCO0FBQUEsR0FQRCxDQUFQO0FBUUg7O0FBRU0sU0FBUyxZQUFULENBQXNCLEtBQXRCLEVBQTZCO0FBQ2hDLFNBQU8sS0FBSyxXQUFJLFNBQUosb0NBQXVDLFNBQVMsQ0FBQztBQUFDLElBQUEsWUFBWSxFQUFFO0FBQWYsR0FBRCxDQUFoRCxHQUNKO0FBQUUsSUFBQSxNQUFNLEVBQUUsS0FBVjtBQUFpQixJQUFBLEtBQUssRUFBRTtBQUF4QixHQURJLENBQUwsQ0FFRixJQUZFLENBRUcsVUFBQSxRQUFRO0FBQUEsV0FBSSxRQUFRLENBQUMsSUFBVCxFQUFKO0FBQUEsR0FGWCxFQUdGLElBSEUsQ0FHRyxVQUFBLElBQUk7QUFBQSxXQUFJLElBQUksQ0FBQyxLQUFUO0FBQUEsR0FIUCxDQUFQO0FBSUg7O0FBRU0sU0FBUyxTQUFULENBQW1CLEtBQW5CLEVBQTBCO0FBQzdCLFNBQU8sS0FBSyxXQUFJLFNBQUoscUJBQXdCLFNBQVMsQ0FBQztBQUFDLElBQUEsWUFBWSxFQUFFO0FBQWYsR0FBRCxDQUFqQyxHQUNSO0FBQUUsSUFBQSxNQUFNLEVBQUUsS0FBVjtBQUFpQixJQUFBLEtBQUssRUFBRTtBQUF4QixHQURRLENBQUwsQ0FFRixJQUZFLENBRUcsVUFBQSxRQUFRO0FBQUEsV0FBSSxRQUFRLENBQUMsSUFBVCxFQUFKO0FBQUEsR0FGWCxDQUFQO0FBR0g7O0FBRUQsU0FBUyxRQUFULENBQWtCLEtBQWxCLEVBQXlCLE9BQXpCLEVBQWtDLEtBQWxDLEVBQXlDO0FBQ3JDLFNBQU8sS0FBSyxXQUFJLFNBQUosd0JBQTJCLEtBQTNCLHFCQUEyQyxPQUEzQyxjQUFzRCxTQUFTLENBQUM7QUFBQyxJQUFBLFlBQVksRUFBRTtBQUFmLEdBQUQsQ0FBL0QsR0FDUjtBQUFFLElBQUEsTUFBTSxFQUFFLEtBQVY7QUFBaUIsSUFBQSxLQUFLLEVBQUU7QUFBeEIsR0FEUSxDQUFMLENBRUYsSUFGRSxDQUVHLFVBQUEsUUFBUTtBQUFBLFdBQUksUUFBUSxDQUFDLElBQVQsRUFBSjtBQUFBLEdBRlgsQ0FBUDtBQUdIOztBQUVELFNBQVMsVUFBVCxDQUFtQixLQUFuQixFQUEwQixLQUExQixFQUFvRztBQUFBLE1BQW5FLFNBQW1FLHVFQUF6RCxJQUF5RDtBQUFBLE1BQW5ELE9BQW1ELHVFQUEzQyxJQUEyQztBQUFBLE1BQXJDLE9BQXFDLHVFQUE3QixJQUE2QjtBQUFBLE1BQXZCLGlCQUF1Qix1RUFBTCxHQUFLO0FBQ2hHLE1BQUksT0FBTyxHQUFHLEVBQWQ7O0FBQ0EsTUFBTSxXQUFXLEdBQUcsU0FBZCxXQUFjLENBQUMsU0FBRCxFQUFZLFNBQVo7QUFBQSxXQUEwQixLQUFLLFdBQUksU0FBSix3QkFBMkIsS0FBM0IscUJBQTJDLFNBQVMsQ0FBQztBQUNoRyxNQUFBLFlBQVksRUFBRSxLQURrRjtBQUVoRyxNQUFBLFNBQVMsRUFBVCxTQUZnRztBQUdoRyxNQUFBLFNBQVMsRUFBVCxTQUhnRztBQUloRyxNQUFBLE9BQU8sRUFBUCxPQUpnRztBQUtoRyxNQUFBLE9BQU8sRUFBUCxPQUxnRztBQU1oRyxNQUFBLFVBQVUsRUFBRTtBQU5vRixLQUFELENBQXBELEdBT3pDO0FBQUUsTUFBQSxNQUFNLEVBQUUsS0FBVjtBQUFpQixNQUFBLEtBQUssRUFBRTtBQUF4QixLQVB5QyxDQUFMLENBUXJDLElBUnFDLENBUWhDLFVBQUEsUUFBUSxFQUFJO0FBQ2QsVUFBSSxRQUFRLENBQUMsTUFBVCxLQUFvQixHQUF4QixFQUNJLE9BQU8sUUFBUSxDQUFDLElBQVQsRUFBUCxDQURKLEtBRUssSUFBSSxRQUFRLENBQUMsTUFBVCxLQUFvQixHQUF4QixFQUNELE1BQU0sU0FBUyxDQUFDLGdCQUFoQixDQURDLEtBRUEsTUFBTSxTQUFTLENBQUMsVUFBaEI7QUFDUixLQWRxQyxFQWVyQyxJQWZxQyxDQWVoQyxVQUFBLElBQUksRUFBSTtBQUNWLE1BQUEsT0FBTyxDQUFDLElBQVIsT0FBQSxPQUFPLHFCQUFTLElBQUksQ0FBQyxLQUFkLEVBQVA7O0FBQ0EsVUFBSSxJQUFJLENBQUMsYUFBVCxFQUF3QjtBQUNwQixlQUFPLFdBQVcsQ0FBQyxJQUFJLENBQUMsYUFBTixFQUFxQixFQUFyQixDQUFsQjtBQUNILE9BRkQsTUFFTztBQUNILGVBQVE7QUFDSixVQUFBLGFBQWEsRUFBRSxJQUFJLENBQUMsYUFEaEI7QUFFSixVQUFBLE9BQU8sRUFBUDtBQUZJLFNBQVI7QUFJSDtBQUNKLEtBekJxQyxDQUExQjtBQUFBLEdBQXBCOztBQTJCQSxTQUFPLFdBQVcsQ0FBQyxFQUFELEVBQUssU0FBTCxDQUFsQjtBQUNIOztJQUVZLFM7OztBQUNULHFCQUFZLEtBQVosRUFBbUIsSUFBbkIsRUFBMEY7QUFBQTs7QUFBQSxRQUFqRSxPQUFpRSx1RUFBekQ7QUFBQyxNQUFBLGNBQWMsRUFBRSxHQUFqQjtBQUFzQixNQUFBLFlBQVksRUFBRSxFQUFwQztBQUF3QyxNQUFBLFVBQVUsRUFBRTtBQUFwRCxLQUF5RDs7QUFBQTs7QUFDdEYsU0FBSyxLQUFMLEdBQWEsS0FBYjtBQUNBLFNBQUssSUFBTCxHQUFZLElBQVo7QUFDQSxTQUFLLFNBQUwsR0FBaUIsRUFBakI7QUFDQSxTQUFLLEtBQUwsR0FBYSxJQUFJLGlCQUFKLENBQVE7QUFDakIsTUFBQSxHQUFHLEVBQUUsT0FBTyxDQUFDLGNBREk7QUFFakIsTUFBQSxPQUFPLEVBQUUsaUJBQUMsQ0FBRCxFQUFJLENBQUo7QUFBQSxlQUFVLEtBQUksQ0FBQyxZQUFMLENBQWtCLENBQWxCLEVBQXFCLENBQXJCLENBQVY7QUFBQTtBQUZRLEtBQVIsQ0FBYjtBQUlBLFNBQUssU0FBTCxHQUFpQixFQUFqQjtBQUNBLFNBQUssT0FBTCxHQUFlLE9BQWY7QUFDQSxTQUFLLE9BQUwsR0FBZSxTQUFTLEtBQUssT0FBTCxDQUFhLFlBQXJDO0FBQ0g7Ozs7bUNBSWMsSSxFQUFNO0FBQ2pCLGFBQU8sSUFBSSxDQUFDLEtBQUwsQ0FBVyxJQUFJLEdBQUcsS0FBSyxPQUF2QixDQUFQO0FBQ0g7Ozt5Q0FFb0IsSyxFQUFPO0FBQ3hCLGFBQU87QUFDSCxRQUFBLEtBQUssRUFBRSxLQUFLLGNBQUwsQ0FBb0IsS0FBSyxDQUFDLEtBQTFCLENBREo7QUFFSCxRQUFBLEdBQUcsRUFBRSxLQUFLLGNBQUwsQ0FBb0IsSUFBSSxJQUFKLENBQVMsS0FBSyxDQUFDLEdBQU4sQ0FBVSxPQUFWLEtBQXNCLENBQS9CLENBQXBCO0FBRkYsT0FBUDtBQUlIOzs7NEJBRU8sQyxFQUFHO0FBQ1AsVUFBSSxDQUFDLEtBQUssS0FBTCxDQUFXLEdBQVgsQ0FBZSxDQUFmLENBQUwsRUFDQTtBQUNJLFlBQUksR0FBRyxHQUFHLEVBQVY7QUFDQSxhQUFLLEtBQUwsQ0FBVyxHQUFYLENBQWUsQ0FBZixFQUFrQixHQUFsQjtBQUNBLGVBQU8sR0FBUDtBQUNILE9BTEQsTUFNSyxPQUFPLEtBQUssS0FBTCxDQUFXLEdBQVgsQ0FBZSxDQUFmLENBQVA7QUFDUjs7O2lDQUVZLEMsRUFBRyxDLEVBQUc7QUFDZixXQUFLLElBQUksRUFBVCxJQUFlLENBQWYsRUFBa0I7QUFDZCxRQUFBLE9BQU8sQ0FBQyxNQUFSLENBQWUsS0FBSyxTQUFMLENBQWUsRUFBZixDQUFmO0FBQ0EsWUFBSSxJQUFJLEdBQUcsS0FBSyxTQUFMLENBQWUsRUFBZixFQUFtQixJQUE5QjtBQUNBLFFBQUEsSUFBSSxDQUFDLE1BQUwsQ0FBWSxDQUFaO0FBQ0EsWUFBSSxJQUFJLENBQUMsSUFBTCxLQUFjLENBQWxCLEVBQ0ksT0FBTyxLQUFLLFNBQUwsQ0FBZSxFQUFmLENBQVA7QUFDUDtBQUNKOzs7a0NBRWEsQyxFQUFHO0FBQUUsYUFBTyxJQUFJLElBQUosQ0FBUyxDQUFDLEdBQUcsS0FBSyxPQUFsQixDQUFQO0FBQW9DOzs7Z0NBQzNDLEMsRUFBRztBQUFFLGFBQU8sSUFBSSxJQUFKLENBQVMsQ0FBQyxDQUFDLEdBQUcsQ0FBTCxJQUFVLEtBQUssT0FBeEIsQ0FBUDtBQUEwQzs7OzZCQUVsRCxDLEVBQWtCO0FBQUEsVUFBZixLQUFlLHVFQUFQLEtBQU87QUFDdkI7QUFDQSxVQUFJLEtBQUssU0FBTCxDQUFlLGNBQWYsQ0FBOEIsQ0FBQyxDQUFDLEVBQWhDLENBQUosRUFDSSxLQUFLLFdBQUwsQ0FBaUIsQ0FBakI7QUFDSixVQUFJLENBQUMsR0FBRyxLQUFLLG9CQUFMLENBQTBCLENBQTFCLENBQVI7QUFDQSxVQUFJLEVBQUUsR0FBRyxDQUFDLENBQUMsS0FBWDtBQUNBLFVBQUksRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFYO0FBQ0EsVUFBSSxDQUFDLEdBQUcsS0FBSyxLQUFMLENBQVcsTUFBbkI7QUFDQSxVQUFJLElBQUksR0FBRyxJQUFJLEdBQUosRUFBWDs7QUFDQSxXQUFLLElBQUksQ0FBQyxHQUFHLEVBQWIsRUFBaUIsQ0FBQyxJQUFJLEVBQXRCLEVBQTBCLENBQUMsRUFBM0IsRUFDQTtBQUNJLFFBQUEsSUFBSSxDQUFDLEdBQUwsQ0FBUyxDQUFUO0FBQ0EsWUFBSSxDQUFDLEtBQUssS0FBTCxDQUFXLEdBQVgsQ0FBZSxDQUFmLENBQUwsRUFBd0IsQ0FBQztBQUM1Qjs7QUFDRCxXQUFLLFNBQUwsQ0FBZSxDQUFDLENBQUMsRUFBakIsSUFBdUI7QUFDbkIsUUFBQSxJQUFJLEVBQUosSUFEbUI7QUFFbkIsUUFBQSxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBRlEsT0FBdkI7QUFJQSxVQUFJLENBQUMsS0FBRCxJQUFVLENBQUMsR0FBRyxLQUFLLE9BQUwsQ0FBYSxjQUEvQixFQUErQztBQUMvQyxVQUFJLEVBQUUsS0FBSyxFQUFYLEVBQ0ksS0FBSyxPQUFMLENBQWEsRUFBYixFQUFpQixDQUFDLENBQUMsRUFBbkIsSUFBeUI7QUFDckIsUUFBQSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBRFk7QUFFckIsUUFBQSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBRmM7QUFHckIsUUFBQSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBSGUsT0FBekIsQ0FESixLQU1BO0FBQ0ksYUFBSyxPQUFMLENBQWEsRUFBYixFQUFpQixDQUFDLENBQUMsRUFBbkIsSUFBeUI7QUFDckIsVUFBQSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBRFk7QUFFckIsVUFBQSxHQUFHLEVBQUUsS0FBSyxXQUFMLENBQWlCLEVBQWpCLENBRmdCO0FBR3JCLFVBQUEsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUhlLFNBQXpCO0FBSUEsYUFBSyxPQUFMLENBQWEsRUFBYixFQUFpQixDQUFDLENBQUMsRUFBbkIsSUFBeUI7QUFDckIsVUFBQSxLQUFLLEVBQUUsS0FBSyxhQUFMLENBQW1CLEVBQW5CLENBRGM7QUFFckIsVUFBQSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBRmM7QUFHckIsVUFBQSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBSGUsU0FBekI7O0FBSUEsYUFBSyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBbEIsRUFBcUIsQ0FBQyxHQUFHLEVBQXpCLEVBQTZCLENBQUMsRUFBOUI7QUFDSSxlQUFLLE9BQUwsQ0FBYSxDQUFiLEVBQWdCLENBQUMsQ0FBQyxFQUFsQixJQUF3QjtBQUNwQixZQUFBLEtBQUssRUFBRSxLQUFLLGFBQUwsQ0FBbUIsQ0FBbkIsQ0FEYTtBQUVwQixZQUFBLEdBQUcsRUFBRSxLQUFLLFdBQUwsQ0FBaUIsQ0FBakIsQ0FGZTtBQUdwQixZQUFBLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFIYyxXQUF4QjtBQURKO0FBS0g7QUFDSjs7O2dDQUVXLEMsRUFBRztBQUFBOztBQUNYLFVBQUksSUFBSSxHQUFHLEtBQUssU0FBTCxDQUFlLENBQUMsQ0FBQyxFQUFqQixFQUFxQixJQUFoQztBQUNBLE1BQUEsT0FBTyxDQUFDLE1BQVIsQ0FBZSxJQUFmO0FBQ0EsTUFBQSxJQUFJLENBQUMsT0FBTCxDQUFhLFVBQUEsQ0FBQztBQUFBLGVBQUksT0FBTyxNQUFJLENBQUMsT0FBTCxDQUFhLENBQWIsRUFBZ0IsQ0FBQyxDQUFDLEVBQWxCLENBQVg7QUFBQSxPQUFkO0FBQ0EsYUFBTyxLQUFLLFNBQUwsQ0FBZSxDQUFDLENBQUMsRUFBakIsQ0FBUDtBQUNIOzs7a0NBRWEsQyxFQUFHLEssRUFBTyxHLEVBQUs7QUFDekIsVUFBSSxDQUFDLEdBQUcsS0FBSyxPQUFMLENBQWEsQ0FBYixDQUFSLENBRHlCLENBRXpCOztBQUNBLFVBQUksT0FBTyxHQUFHLEVBQWQ7O0FBQ0EsV0FBSyxJQUFJLEVBQVQsSUFBZSxDQUFmLEVBQWtCO0FBQ2QsWUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFELENBQUQsQ0FBTSxLQUFOLElBQWUsR0FBZixJQUFzQixDQUFDLENBQUMsRUFBRCxDQUFELENBQU0sR0FBTixJQUFhLEtBQXJDLENBQUosRUFDQTtBQUNJLFVBQUEsT0FBTyxDQUFDLElBQVIsQ0FBYTtBQUNULFlBQUEsRUFBRSxFQUFGLEVBRFM7QUFFVCxZQUFBLEtBQUssRUFBRSxDQUFDLENBQUMsRUFBRCxDQUFELENBQU0sS0FBTixHQUFjLEtBQWQsR0FBc0IsS0FBdEIsR0FBNkIsQ0FBQyxDQUFDLEVBQUQsQ0FBRCxDQUFNLEtBRmpDO0FBR1QsWUFBQSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUQsQ0FBRCxDQUFNLEdBQU4sR0FBWSxHQUFaLEdBQWtCLEdBQWxCLEdBQXVCLENBQUMsQ0FBQyxFQUFELENBQUQsQ0FBTSxHQUh6QjtBQUlULFlBQUEsT0FBTyxFQUFFLEtBQUssU0FBTCxDQUFlLEVBQWYsRUFBbUI7QUFKbkIsV0FBYjtBQU1IO0FBQ0o7O0FBQ0QsYUFBTyxPQUFQO0FBQ0g7OztvQ0FFZSxFLEVBQUk7QUFDaEIsVUFBSSxDQUFDLEdBQUcsS0FBSyxvQkFBTCxDQUEwQixFQUExQixDQUFSO0FBQ0EsVUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQVg7QUFDQSxVQUFJLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBWDtBQUNBLFVBQUksT0FBTyxHQUFHLEtBQUssYUFBTCxDQUFtQixFQUFuQixFQUF1QixFQUFFLENBQUMsS0FBMUIsRUFBaUMsRUFBRSxDQUFDLEdBQXBDLENBQWQ7O0FBQ0EsV0FBSyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBbEIsRUFBcUIsQ0FBQyxHQUFHLEVBQXpCLEVBQTZCLENBQUMsRUFBOUIsRUFDQTtBQUNJLFlBQUksQ0FBQyxHQUFHLEtBQUssT0FBTCxDQUFhLENBQWIsQ0FBUjs7QUFDQSxhQUFLLElBQUksRUFBVCxJQUFlLENBQWY7QUFDSSxVQUFBLE9BQU8sQ0FBQyxJQUFSLENBQWEsQ0FBQyxDQUFDLEVBQUQsQ0FBZDtBQURKO0FBRUg7O0FBQ0QsVUFBSSxFQUFFLEdBQUcsRUFBVCxFQUNJLE9BQU8sQ0FBQyxJQUFSLE9BQUEsT0FBTyxxQkFBUyxLQUFLLGFBQUwsQ0FBbUIsRUFBbkIsRUFBdUIsRUFBRSxDQUFDLEtBQTFCLEVBQWlDLEVBQUUsQ0FBQyxHQUFwQyxDQUFULEVBQVA7QUFDSixhQUFPLE9BQVA7QUFDSDs7OzJCQUVNO0FBQUE7O0FBQ0gsYUFBTyxLQUFLLEtBQUwsQ0FBVyxJQUFYLENBQWdCLFVBQUEsS0FBSztBQUFBLGVBQUksVUFBUyxDQUFDLE1BQUksQ0FBQyxLQUFOLEVBQWEsS0FBYixFQUFvQixNQUFJLENBQUMsU0FBekIsQ0FBVCxDQUE2QyxJQUE3QyxDQUFrRCxVQUFBLENBQUMsRUFBSTtBQUNuRixjQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsT0FBRixDQUFVLEdBQVYsQ0FBYyxVQUFBLENBQUM7QUFBQSxtQkFBSSxDQUFDLENBQUMsS0FBRixHQUFVLE9BQU8sQ0FBQyxPQUFSLENBQWdCLENBQWhCLENBQVYsR0FBK0IsUUFBUSxDQUFDLE1BQUksQ0FBQyxLQUFOLEVBQWEsQ0FBQyxDQUFDLEVBQWYsRUFBbUIsS0FBbkIsQ0FBM0M7QUFBQSxXQUFmLENBQVY7QUFDQSxpQkFBTyxPQUFPLENBQUMsR0FBUixDQUFZLEdBQVosRUFBaUIsSUFBakIsQ0FBc0IsVUFBQSxPQUFPLEVBQUk7QUFDcEMsWUFBQSxPQUFPLENBQUMsT0FBUixDQUFnQixVQUFBLENBQUMsRUFBSTtBQUNqQixjQUFBLENBQUMsQ0FBQyxLQUFGLEdBQVUsSUFBSSxJQUFKLENBQVMsQ0FBQyxDQUFDLEtBQUYsQ0FBUSxRQUFqQixDQUFWO0FBQ0EsY0FBQSxDQUFDLENBQUMsR0FBRixHQUFRLElBQUksSUFBSixDQUFTLENBQUMsQ0FBQyxHQUFGLENBQU0sUUFBZixDQUFSO0FBQ0Esa0JBQUksQ0FBQyxDQUFDLE1BQUYsS0FBYSxXQUFqQixFQUNJLE1BQUksQ0FBQyxRQUFMLENBQWMsQ0FBZCxFQURKLEtBRUssSUFBSSxDQUFDLENBQUMsTUFBRixLQUFhLFdBQWpCLEVBQ0QsTUFBSSxDQUFDLFdBQUwsQ0FBaUIsQ0FBakI7QUFDUCxhQVBEO0FBUUEsWUFBQSxNQUFJLENBQUMsU0FBTCxHQUFpQixDQUFDLENBQUMsYUFBbkI7QUFDSCxXQVZNLENBQVA7QUFXSCxTQWIrQixDQUFKO0FBQUEsT0FBckIsRUFhSCxLQWJHLENBYUcsVUFBQSxDQUFDLEVBQUk7QUFDWCxZQUFJLENBQUMsS0FBSyxTQUFTLENBQUMsZ0JBQXBCLEVBQXNDO0FBQ2xDLFVBQUEsTUFBSSxDQUFDLFNBQUwsR0FBaUIsRUFBakI7O0FBQ0EsVUFBQSxNQUFJLENBQUMsSUFBTDtBQUNILFNBSEQsTUFHTyxNQUFNLENBQU47QUFDVixPQWxCTSxDQUFQO0FBbUJIOzs7OEJBRVMsSyxFQUFPLEcsRUFBSztBQUFBOztBQUNsQixVQUFJLENBQUMsR0FBRyxLQUFLLG9CQUFMLENBQTBCO0FBQUUsUUFBQSxLQUFLLEVBQUwsS0FBRjtBQUFTLFFBQUEsR0FBRyxFQUFIO0FBQVQsT0FBMUIsQ0FBUjtBQUNBLFVBQUksS0FBSyxHQUFHLEVBQVo7O0FBQ0EsV0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBZixFQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDLEdBQTdCLEVBQWtDLENBQUMsRUFBbkM7QUFDSSxZQUFJLENBQUMsS0FBSyxLQUFMLENBQVcsR0FBWCxDQUFlLENBQWYsQ0FBTCxFQUNBO0FBQ0ksY0FBSSxDQUFDLEtBQUssQ0FBQyxjQUFOLENBQXFCLE9BQXJCLENBQUwsRUFDSSxLQUFLLENBQUMsS0FBTixHQUFjLENBQWQ7QUFDSixVQUFBLEtBQUssQ0FBQyxHQUFOLEdBQVksQ0FBWjtBQUNIO0FBTkw7O0FBT0EsTUFBQSxPQUFPLENBQUMsR0FBUixrQkFBc0IsS0FBdEIsbUJBQW9DLEdBQXBDOztBQUNBLFVBQUksS0FBSyxDQUFDLGNBQU4sQ0FBcUIsT0FBckIsQ0FBSixFQUNBO0FBQ0ksUUFBQSxPQUFPLENBQUMsTUFBUixDQUFlLEtBQUssQ0FBQyxLQUFOLElBQWUsS0FBSyxDQUFDLEdBQXBDOztBQUNBLFlBQUksS0FBSyxDQUFDLEdBQU4sR0FBWSxLQUFLLENBQUMsS0FBbEIsR0FBMEIsQ0FBMUIsR0FBOEIsS0FBSyxPQUFMLENBQWEsVUFBL0MsRUFBMkQ7QUFDdkQsVUFBQSxPQUFPLENBQUMsR0FBUjtBQUNBLGlCQUFPLEtBQUssS0FBTCxDQUFXLElBQVgsQ0FBZ0IsVUFBQSxLQUFLO0FBQUEsbUJBQUksVUFBUyxDQUFDLE1BQUksQ0FBQyxLQUFOLEVBQWEsS0FBYixFQUFvQixJQUFwQixFQUNqQyxLQUFLLENBQUMsV0FBTixFQURpQyxFQUNaLEdBQUcsQ0FBQyxXQUFKLEVBRFksQ0FBVCxDQUNnQixJQURoQixDQUNxQixVQUFBLENBQUMsRUFBSTtBQUN0RCxrQkFBSSxPQUFPLEdBQUcsRUFBZDtBQUNBLGNBQUEsQ0FBQyxDQUFDLE9BQUYsQ0FBVSxPQUFWLENBQWtCLFVBQUEsQ0FBQyxFQUFJO0FBQ25CLGdCQUFBLE9BQU8sQ0FBQyxNQUFSLENBQWUsQ0FBQyxDQUFDLEtBQWpCO0FBQ0EsZ0JBQUEsQ0FBQyxDQUFDLEtBQUYsR0FBVSxJQUFJLElBQUosQ0FBUyxDQUFDLENBQUMsS0FBRixDQUFRLFFBQWpCLENBQVY7QUFDQSxnQkFBQSxDQUFDLENBQUMsR0FBRixHQUFRLElBQUksSUFBSixDQUFTLENBQUMsQ0FBQyxHQUFGLENBQU0sUUFBZixDQUFSO0FBQ0EsZ0JBQUEsT0FBTyxDQUFDLElBQVIsQ0FBYSxDQUFiO0FBQ0gsZUFMRDtBQU1BLHFCQUFPLE9BQU8sQ0FBQyxNQUFSLENBQWUsVUFBQSxDQUFDO0FBQUEsdUJBQUksRUFBRSxDQUFDLENBQUMsS0FBRixJQUFXLEdBQVgsSUFBa0IsQ0FBQyxDQUFDLEdBQUYsSUFBUyxLQUE3QixDQUFKO0FBQUEsZUFBaEIsRUFBeUQsR0FBekQsQ0FBNkQsVUFBQSxDQUFDLEVBQUk7QUFDckUsdUJBQU87QUFDSCxrQkFBQSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBREg7QUFFSCxrQkFBQSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUYsR0FBVSxLQUFWLEdBQWtCLEtBQWxCLEdBQXlCLENBQUMsQ0FBQyxLQUYvQjtBQUdILGtCQUFBLEdBQUcsRUFBRSxDQUFDLENBQUMsR0FBRixHQUFRLEdBQVIsR0FBYyxHQUFkLEdBQW1CLENBQUMsQ0FBQyxHQUh2QjtBQUlILGtCQUFBLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFKUixpQkFBUDtBQU1ILGVBUE0sQ0FBUDtBQVFILGFBakIrQixDQUFKO0FBQUEsV0FBckIsQ0FBUDtBQWtCSDs7QUFFRCxRQUFBLE9BQU8sQ0FBQyxHQUFSO0FBQ0EsZUFBTyxLQUFLLEtBQUwsQ0FBVyxJQUFYLENBQWdCLFVBQUEsS0FBSztBQUFBLGlCQUFJLFVBQVMsQ0FBQyxNQUFJLENBQUMsS0FBTixFQUFhLEtBQWIsRUFBb0IsSUFBcEIsRUFDckMsTUFBSSxDQUFDLGFBQUwsQ0FBbUIsS0FBSyxDQUFDLEtBQXpCLEVBQWdDLFdBQWhDLEVBRHFDLEVBRXJDLE1BQUksQ0FBQyxXQUFMLENBQWlCLEtBQUssQ0FBQyxHQUF2QixFQUE0QixXQUE1QixFQUZxQyxDQUFULENBRWUsSUFGZixDQUVvQixVQUFBLENBQUMsRUFBSTtBQUNqRCxZQUFBLENBQUMsQ0FBQyxPQUFGLENBQVUsT0FBVixDQUFrQixVQUFBLENBQUMsRUFBSTtBQUNuQixrQkFBSSxDQUFDLENBQUMsTUFBRixLQUFhLFdBQWpCLEVBQ0E7QUFDSSxnQkFBQSxPQUFPLENBQUMsTUFBUixDQUFlLENBQUMsQ0FBQyxLQUFqQjtBQUNBLGdCQUFBLENBQUMsQ0FBQyxLQUFGLEdBQVUsSUFBSSxJQUFKLENBQVMsQ0FBQyxDQUFDLEtBQUYsQ0FBUSxRQUFqQixDQUFWO0FBQ0EsZ0JBQUEsQ0FBQyxDQUFDLEdBQUYsR0FBUSxJQUFJLElBQUosQ0FBUyxDQUFDLENBQUMsR0FBRixDQUFNLFFBQWYsQ0FBUjs7QUFDQSxnQkFBQSxNQUFJLENBQUMsUUFBTCxDQUFjLENBQWQsRUFBaUIsSUFBakI7QUFDSDtBQUNKLGFBUkQ7QUFTQSxnQkFBSSxNQUFJLENBQUMsU0FBTCxLQUFtQixFQUF2QixFQUNJLE1BQUksQ0FBQyxTQUFMLEdBQWlCLENBQUMsQ0FBQyxhQUFuQjtBQUNQLFdBZDJCLENBQUo7QUFBQSxTQUFyQixFQWNDLElBZEQsQ0FjTTtBQUFBLGlCQUFNLE1BQUksQ0FBQyxJQUFMLEVBQU47QUFBQSxTQWROLEVBZUYsSUFmRSxDQWVHO0FBQUEsaUJBQU0sTUFBSSxDQUFDLGVBQUwsQ0FBcUI7QUFBRSxZQUFBLEtBQUssRUFBTCxLQUFGO0FBQVMsWUFBQSxHQUFHLEVBQUg7QUFBVCxXQUFyQixDQUFOO0FBQUEsU0FmSCxDQUFQO0FBZ0JILE9BMUNELE1BNENBO0FBQ0ksUUFBQSxPQUFPLENBQUMsR0FBUjtBQUNBLGVBQU8sS0FBSyxJQUFMLEdBQVksSUFBWixDQUFpQjtBQUFBLGlCQUFNLE1BQUksQ0FBQyxlQUFMLENBQXFCO0FBQUUsWUFBQSxLQUFLLEVBQUwsS0FBRjtBQUFTLFlBQUEsR0FBRyxFQUFIO0FBQVQsV0FBckIsQ0FBTjtBQUFBLFNBQWpCLENBQVA7QUFDSDtBQUNKOzs7d0JBeE1XO0FBQUUsYUFBTyxZQUFZLEVBQW5CO0FBQXdCOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNySTFDO0FBQ0EsSUFBTSxlQUFlLEdBQUcsZ0JBQXhCO0FBQ0EsSUFBTSxZQUFZLEdBQUcsYUFBckI7QUFDQSxJQUFNLGdCQUFnQixHQUFHLGlCQUF6QjtBQUNBLElBQU0sYUFBYSxHQUFHLGNBQXRCO0FBQ0EsSUFBTSxhQUFhLEdBQUcsY0FBdEI7QUFFTyxJQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsTUFBUCxDQUFjO0FBQ2pDLEVBQUEsY0FBYyxFQUFFLE1BQU0sQ0FBQyxlQUFELENBRFc7QUFFakMsRUFBQSxXQUFXLEVBQUUsTUFBTSxDQUFDLFlBQUQsQ0FGYztBQUdqQyxFQUFBLGVBQWUsRUFBRSxNQUFNLENBQUMsZ0JBQUQsQ0FIVTtBQUlqQyxFQUFBLFlBQVksRUFBRSxNQUFNLENBQUMsYUFBRCxDQUphO0FBS2pDLEVBQUEsWUFBWSxFQUFFLE1BQU0sQ0FBQyxhQUFEO0FBTGEsQ0FBZCxDQUFoQjs7O0FBUVAsU0FBUyxnQkFBVCxDQUEwQixFQUExQixFQUE4QjtBQUMxQixVQUFRLEVBQVI7QUFDSSxTQUFLLE9BQU8sQ0FBQyxjQUFiO0FBQTZCLGFBQU8sZUFBUDs7QUFDN0IsU0FBSyxPQUFPLENBQUMsV0FBYjtBQUEwQixhQUFPLFlBQVA7O0FBQzFCLFNBQUssT0FBTyxDQUFDLGVBQWI7QUFBOEIsYUFBTyxnQkFBUDs7QUFDOUIsU0FBSyxPQUFPLENBQUMsWUFBYjtBQUEyQixhQUFPLGFBQVA7O0FBQzNCLFNBQUssT0FBTyxDQUFDLFlBQWI7QUFBMkIsYUFBTyxhQUFQOztBQUMzQjtBQUFTLE1BQUEsT0FBTyxDQUFDLEtBQVIsQ0FBYyxhQUFkO0FBTmI7QUFRSDs7QUFFRCxTQUFTLFlBQVQsQ0FBc0IsQ0FBdEIsRUFBeUI7QUFDckIsVUFBTyxDQUFQO0FBQ0ksU0FBSyxlQUFMO0FBQXNCLGFBQU8sT0FBTyxDQUFDLGNBQWY7O0FBQ3RCLFNBQUssWUFBTDtBQUFtQixhQUFPLE9BQU8sQ0FBQyxXQUFmOztBQUNuQixTQUFLLGdCQUFMO0FBQXVCLGFBQU8sT0FBTyxDQUFDLGVBQWY7O0FBQ3ZCLFNBQUssYUFBTDtBQUFvQixhQUFPLE9BQU8sQ0FBQyxZQUFmOztBQUNwQixTQUFLLGFBQUw7QUFBb0IsYUFBTyxPQUFPLENBQUMsWUFBZjs7QUFDcEI7QUFBUyxNQUFBLE9BQU8sQ0FBQyxLQUFSLENBQWMsYUFBZDtBQU5iO0FBUUg7O0lBRVksRzs7O0FBQ1QsZUFBWSxFQUFaLEVBQWdCLElBQWhCLEVBQXNCLElBQXRCLEVBQTRCO0FBQUE7O0FBQ3hCLFNBQUssRUFBTCxHQUFVLEVBQVY7QUFDQSxTQUFLLElBQUwsR0FBWSxJQUFaO0FBQ0EsU0FBSyxJQUFMLEdBQVksSUFBWjtBQUNIOzs7OzRCQUNPLEksRUFBTTtBQUFFLGFBQU8sSUFBSSxHQUFKLENBQVEsS0FBSyxFQUFiLEVBQWlCLEtBQUssSUFBdEIsRUFBNEIsSUFBNUIsQ0FBUDtBQUEyQzs7OzhCQUNqRDtBQUNOLGFBQU87QUFDSCxRQUFBLEVBQUUsRUFBRSxLQUFLLEVBRE47QUFFSCxRQUFBLElBQUksRUFBRSxnQkFBZ0IsQ0FBQyxLQUFLLElBQU4sQ0FGbkI7QUFHSCxRQUFBLElBQUksRUFBRSxLQUFLO0FBSFIsT0FBUDtBQUtIOzs7Ozs7OztnQkFiUSxHLGFBY1EsVUFBQSxHQUFHO0FBQUEsU0FBSSxJQUFJLEdBQUosQ0FBUSxHQUFHLENBQUMsRUFBWixFQUFnQixZQUFZLENBQUMsR0FBRyxDQUFDLElBQUwsQ0FBNUIsRUFBd0MsR0FBRyxDQUFDLElBQTVDLENBQUo7QUFBQSxDOztJQUdYLFMsR0FDVCxtQkFBWSxXQUFaLEVBQXlCO0FBQUE7O0FBQUE7O0FBQUEsbUNBZWYsZ0JBQW9CO0FBQUEsUUFBakIsSUFBaUIsUUFBakIsSUFBaUI7QUFBQSxRQUFYLElBQVcsUUFBWCxJQUFXO0FBQzFCLFFBQUksR0FBRyxHQUFHLEtBQUksQ0FBQyxlQUFmO0FBQ0EsUUFBSSxFQUFKO0FBQ0EsUUFBSSxFQUFFLEdBQUcsSUFBSSxPQUFKLENBQVksVUFBQSxPQUFPLEVBQUk7QUFBRSxNQUFBLEVBQUUsR0FBRyxPQUFMO0FBQWUsS0FBeEMsQ0FBVDtBQUNBLFFBQUksRUFBSjs7QUFDQSxRQUFJLEdBQUcsQ0FBQyxHQUFKLENBQVEsTUFBUixHQUFpQixDQUFyQixFQUF3QjtBQUNwQixNQUFBLEVBQUUsR0FBRyxHQUFHLENBQUMsR0FBSixDQUFRLEdBQVIsRUFBTDtBQUNILEtBRkQsTUFFTztBQUNILE1BQUEsRUFBRSxHQUFHLEdBQUcsQ0FBQyxLQUFKLEVBQUw7QUFDSDs7QUFDRCxJQUFBLEdBQUcsQ0FBQyxRQUFKLENBQWEsRUFBYixJQUFtQixFQUFuQjs7QUFDQSxJQUFBLEtBQUksQ0FBQyxJQUFMLENBQVUsV0FBVixDQUF1QixJQUFJLEdBQUosQ0FBUSxFQUFSLEVBQVksSUFBWixFQUFrQixJQUFsQixDQUFELENBQTBCLE9BQTFCLEVBQXRCOztBQUNBLFdBQU8sRUFBUDtBQUNILEdBNUJ3Qjs7QUFDckIsTUFBSSxJQUFJLEdBQUcsTUFBTSxDQUFDLE9BQVAsQ0FBZSxPQUFmLENBQXVCO0FBQUMsSUFBQSxJQUFJLEVBQUU7QUFBUCxHQUF2QixDQUFYOztBQUNBLE1BQU0sV0FBVyxHQUFHLFNBQWQsV0FBYyxDQUFBLEdBQUc7QUFBQSxXQUFJLEtBQUksQ0FBQyxlQUFUO0FBQUEsR0FBdkI7O0FBQ0EsRUFBQSxJQUFJLENBQUMsU0FBTCxDQUFlLFdBQWYsQ0FBMkIsVUFBUyxHQUFULEVBQWM7QUFDckMsSUFBQSxPQUFPLENBQUMsR0FBUixDQUFZLEdBQVo7QUFDQSxRQUFJLEdBQUcsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUwsQ0FBckI7QUFDQSxRQUFJLEVBQUUsR0FBRyxHQUFHLENBQUMsUUFBSixDQUFhLEdBQUcsQ0FBQyxFQUFqQixDQUFUO0FBQ0EsSUFBQSxPQUFPLENBQUMsTUFBUixDQUFlLEVBQUUsS0FBSyxTQUF0QjtBQUNBLElBQUEsR0FBRyxDQUFDLEdBQUosQ0FBUSxJQUFSLENBQWEsR0FBRyxDQUFDLEVBQWpCO0FBQ0EsSUFBQSxFQUFFLENBQUMsR0FBRCxDQUFGO0FBQ0gsR0FQRDtBQVFBLE9BQUssSUFBTCxHQUFZLElBQVo7QUFDQSxPQUFLLGVBQUwsR0FBdUI7QUFBQyxJQUFBLFFBQVEsRUFBRSxFQUFYO0FBQWUsSUFBQSxHQUFHLEVBQUUsRUFBcEI7QUFBd0IsSUFBQSxLQUFLLEVBQUU7QUFBL0IsR0FBdkI7QUFDSCxDIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiJ3VzZSBzdHJpY3QnXG5cbi8vIEEgbGlua2VkIGxpc3QgdG8ga2VlcCB0cmFjayBvZiByZWNlbnRseS11c2VkLW5lc3NcbmNvbnN0IFlhbGxpc3QgPSByZXF1aXJlKCd5YWxsaXN0JylcblxuY29uc3QgTUFYID0gU3ltYm9sKCdtYXgnKVxuY29uc3QgTEVOR1RIID0gU3ltYm9sKCdsZW5ndGgnKVxuY29uc3QgTEVOR1RIX0NBTENVTEFUT1IgPSBTeW1ib2woJ2xlbmd0aENhbGN1bGF0b3InKVxuY29uc3QgQUxMT1dfU1RBTEUgPSBTeW1ib2woJ2FsbG93U3RhbGUnKVxuY29uc3QgTUFYX0FHRSA9IFN5bWJvbCgnbWF4QWdlJylcbmNvbnN0IERJU1BPU0UgPSBTeW1ib2woJ2Rpc3Bvc2UnKVxuY29uc3QgTk9fRElTUE9TRV9PTl9TRVQgPSBTeW1ib2woJ25vRGlzcG9zZU9uU2V0JylcbmNvbnN0IExSVV9MSVNUID0gU3ltYm9sKCdscnVMaXN0JylcbmNvbnN0IENBQ0hFID0gU3ltYm9sKCdjYWNoZScpXG5jb25zdCBVUERBVEVfQUdFX09OX0dFVCA9IFN5bWJvbCgndXBkYXRlQWdlT25HZXQnKVxuXG5jb25zdCBuYWl2ZUxlbmd0aCA9ICgpID0+IDFcblxuLy8gbHJ1TGlzdCBpcyBhIHlhbGxpc3Qgd2hlcmUgdGhlIGhlYWQgaXMgdGhlIHlvdW5nZXN0XG4vLyBpdGVtLCBhbmQgdGhlIHRhaWwgaXMgdGhlIG9sZGVzdC4gIHRoZSBsaXN0IGNvbnRhaW5zIHRoZSBIaXRcbi8vIG9iamVjdHMgYXMgdGhlIGVudHJpZXMuXG4vLyBFYWNoIEhpdCBvYmplY3QgaGFzIGEgcmVmZXJlbmNlIHRvIGl0cyBZYWxsaXN0Lk5vZGUuICBUaGlzXG4vLyBuZXZlciBjaGFuZ2VzLlxuLy9cbi8vIGNhY2hlIGlzIGEgTWFwIChvciBQc2V1ZG9NYXApIHRoYXQgbWF0Y2hlcyB0aGUga2V5cyB0b1xuLy8gdGhlIFlhbGxpc3QuTm9kZSBvYmplY3QuXG5jbGFzcyBMUlVDYWNoZSB7XG4gIGNvbnN0cnVjdG9yIChvcHRpb25zKSB7XG4gICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJylcbiAgICAgIG9wdGlvbnMgPSB7IG1heDogb3B0aW9ucyB9XG5cbiAgICBpZiAoIW9wdGlvbnMpXG4gICAgICBvcHRpb25zID0ge31cblxuICAgIGlmIChvcHRpb25zLm1heCAmJiAodHlwZW9mIG9wdGlvbnMubWF4ICE9PSAnbnVtYmVyJyB8fCBvcHRpb25zLm1heCA8IDApKVxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbWF4IG11c3QgYmUgYSBub24tbmVnYXRpdmUgbnVtYmVyJylcbiAgICAvLyBLaW5kIG9mIHdlaXJkIHRvIGhhdmUgYSBkZWZhdWx0IG1heCBvZiBJbmZpbml0eSwgYnV0IG9oIHdlbGwuXG4gICAgY29uc3QgbWF4ID0gdGhpc1tNQVhdID0gb3B0aW9ucy5tYXggfHwgSW5maW5pdHlcblxuICAgIGNvbnN0IGxjID0gb3B0aW9ucy5sZW5ndGggfHwgbmFpdmVMZW5ndGhcbiAgICB0aGlzW0xFTkdUSF9DQUxDVUxBVE9SXSA9ICh0eXBlb2YgbGMgIT09ICdmdW5jdGlvbicpID8gbmFpdmVMZW5ndGggOiBsY1xuICAgIHRoaXNbQUxMT1dfU1RBTEVdID0gb3B0aW9ucy5zdGFsZSB8fCBmYWxzZVxuICAgIGlmIChvcHRpb25zLm1heEFnZSAmJiB0eXBlb2Ygb3B0aW9ucy5tYXhBZ2UgIT09ICdudW1iZXInKVxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbWF4QWdlIG11c3QgYmUgYSBudW1iZXInKVxuICAgIHRoaXNbTUFYX0FHRV0gPSBvcHRpb25zLm1heEFnZSB8fCAwXG4gICAgdGhpc1tESVNQT1NFXSA9IG9wdGlvbnMuZGlzcG9zZVxuICAgIHRoaXNbTk9fRElTUE9TRV9PTl9TRVRdID0gb3B0aW9ucy5ub0Rpc3Bvc2VPblNldCB8fCBmYWxzZVxuICAgIHRoaXNbVVBEQVRFX0FHRV9PTl9HRVRdID0gb3B0aW9ucy51cGRhdGVBZ2VPbkdldCB8fCBmYWxzZVxuICAgIHRoaXMucmVzZXQoKVxuICB9XG5cbiAgLy8gcmVzaXplIHRoZSBjYWNoZSB3aGVuIHRoZSBtYXggY2hhbmdlcy5cbiAgc2V0IG1heCAobUwpIHtcbiAgICBpZiAodHlwZW9mIG1MICE9PSAnbnVtYmVyJyB8fCBtTCA8IDApXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtYXggbXVzdCBiZSBhIG5vbi1uZWdhdGl2ZSBudW1iZXInKVxuXG4gICAgdGhpc1tNQVhdID0gbUwgfHwgSW5maW5pdHlcbiAgICB0cmltKHRoaXMpXG4gIH1cbiAgZ2V0IG1heCAoKSB7XG4gICAgcmV0dXJuIHRoaXNbTUFYXVxuICB9XG5cbiAgc2V0IGFsbG93U3RhbGUgKGFsbG93U3RhbGUpIHtcbiAgICB0aGlzW0FMTE9XX1NUQUxFXSA9ICEhYWxsb3dTdGFsZVxuICB9XG4gIGdldCBhbGxvd1N0YWxlICgpIHtcbiAgICByZXR1cm4gdGhpc1tBTExPV19TVEFMRV1cbiAgfVxuXG4gIHNldCBtYXhBZ2UgKG1BKSB7XG4gICAgaWYgKHR5cGVvZiBtQSAhPT0gJ251bWJlcicpXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtYXhBZ2UgbXVzdCBiZSBhIG5vbi1uZWdhdGl2ZSBudW1iZXInKVxuXG4gICAgdGhpc1tNQVhfQUdFXSA9IG1BXG4gICAgdHJpbSh0aGlzKVxuICB9XG4gIGdldCBtYXhBZ2UgKCkge1xuICAgIHJldHVybiB0aGlzW01BWF9BR0VdXG4gIH1cblxuICAvLyByZXNpemUgdGhlIGNhY2hlIHdoZW4gdGhlIGxlbmd0aENhbGN1bGF0b3IgY2hhbmdlcy5cbiAgc2V0IGxlbmd0aENhbGN1bGF0b3IgKGxDKSB7XG4gICAgaWYgKHR5cGVvZiBsQyAhPT0gJ2Z1bmN0aW9uJylcbiAgICAgIGxDID0gbmFpdmVMZW5ndGhcblxuICAgIGlmIChsQyAhPT0gdGhpc1tMRU5HVEhfQ0FMQ1VMQVRPUl0pIHtcbiAgICAgIHRoaXNbTEVOR1RIX0NBTENVTEFUT1JdID0gbENcbiAgICAgIHRoaXNbTEVOR1RIXSA9IDBcbiAgICAgIHRoaXNbTFJVX0xJU1RdLmZvckVhY2goaGl0ID0+IHtcbiAgICAgICAgaGl0Lmxlbmd0aCA9IHRoaXNbTEVOR1RIX0NBTENVTEFUT1JdKGhpdC52YWx1ZSwgaGl0LmtleSlcbiAgICAgICAgdGhpc1tMRU5HVEhdICs9IGhpdC5sZW5ndGhcbiAgICAgIH0pXG4gICAgfVxuICAgIHRyaW0odGhpcylcbiAgfVxuICBnZXQgbGVuZ3RoQ2FsY3VsYXRvciAoKSB7IHJldHVybiB0aGlzW0xFTkdUSF9DQUxDVUxBVE9SXSB9XG5cbiAgZ2V0IGxlbmd0aCAoKSB7IHJldHVybiB0aGlzW0xFTkdUSF0gfVxuICBnZXQgaXRlbUNvdW50ICgpIHsgcmV0dXJuIHRoaXNbTFJVX0xJU1RdLmxlbmd0aCB9XG5cbiAgcmZvckVhY2ggKGZuLCB0aGlzcCkge1xuICAgIHRoaXNwID0gdGhpc3AgfHwgdGhpc1xuICAgIGZvciAobGV0IHdhbGtlciA9IHRoaXNbTFJVX0xJU1RdLnRhaWw7IHdhbGtlciAhPT0gbnVsbDspIHtcbiAgICAgIGNvbnN0IHByZXYgPSB3YWxrZXIucHJldlxuICAgICAgZm9yRWFjaFN0ZXAodGhpcywgZm4sIHdhbGtlciwgdGhpc3ApXG4gICAgICB3YWxrZXIgPSBwcmV2XG4gICAgfVxuICB9XG5cbiAgZm9yRWFjaCAoZm4sIHRoaXNwKSB7XG4gICAgdGhpc3AgPSB0aGlzcCB8fCB0aGlzXG4gICAgZm9yIChsZXQgd2Fsa2VyID0gdGhpc1tMUlVfTElTVF0uaGVhZDsgd2Fsa2VyICE9PSBudWxsOykge1xuICAgICAgY29uc3QgbmV4dCA9IHdhbGtlci5uZXh0XG4gICAgICBmb3JFYWNoU3RlcCh0aGlzLCBmbiwgd2Fsa2VyLCB0aGlzcClcbiAgICAgIHdhbGtlciA9IG5leHRcbiAgICB9XG4gIH1cblxuICBrZXlzICgpIHtcbiAgICByZXR1cm4gdGhpc1tMUlVfTElTVF0udG9BcnJheSgpLm1hcChrID0+IGsua2V5KVxuICB9XG5cbiAgdmFsdWVzICgpIHtcbiAgICByZXR1cm4gdGhpc1tMUlVfTElTVF0udG9BcnJheSgpLm1hcChrID0+IGsudmFsdWUpXG4gIH1cblxuICByZXNldCAoKSB7XG4gICAgaWYgKHRoaXNbRElTUE9TRV0gJiZcbiAgICAgICAgdGhpc1tMUlVfTElTVF0gJiZcbiAgICAgICAgdGhpc1tMUlVfTElTVF0ubGVuZ3RoKSB7XG4gICAgICB0aGlzW0xSVV9MSVNUXS5mb3JFYWNoKGhpdCA9PiB0aGlzW0RJU1BPU0VdKGhpdC5rZXksIGhpdC52YWx1ZSkpXG4gICAgfVxuXG4gICAgdGhpc1tDQUNIRV0gPSBuZXcgTWFwKCkgLy8gaGFzaCBvZiBpdGVtcyBieSBrZXlcbiAgICB0aGlzW0xSVV9MSVNUXSA9IG5ldyBZYWxsaXN0KCkgLy8gbGlzdCBvZiBpdGVtcyBpbiBvcmRlciBvZiB1c2UgcmVjZW5jeVxuICAgIHRoaXNbTEVOR1RIXSA9IDAgLy8gbGVuZ3RoIG9mIGl0ZW1zIGluIHRoZSBsaXN0XG4gIH1cblxuICBkdW1wICgpIHtcbiAgICByZXR1cm4gdGhpc1tMUlVfTElTVF0ubWFwKGhpdCA9PlxuICAgICAgaXNTdGFsZSh0aGlzLCBoaXQpID8gZmFsc2UgOiB7XG4gICAgICAgIGs6IGhpdC5rZXksXG4gICAgICAgIHY6IGhpdC52YWx1ZSxcbiAgICAgICAgZTogaGl0Lm5vdyArIChoaXQubWF4QWdlIHx8IDApXG4gICAgICB9KS50b0FycmF5KCkuZmlsdGVyKGggPT4gaClcbiAgfVxuXG4gIGR1bXBMcnUgKCkge1xuICAgIHJldHVybiB0aGlzW0xSVV9MSVNUXVxuICB9XG5cbiAgc2V0IChrZXksIHZhbHVlLCBtYXhBZ2UpIHtcbiAgICBtYXhBZ2UgPSBtYXhBZ2UgfHwgdGhpc1tNQVhfQUdFXVxuXG4gICAgaWYgKG1heEFnZSAmJiB0eXBlb2YgbWF4QWdlICE9PSAnbnVtYmVyJylcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ21heEFnZSBtdXN0IGJlIGEgbnVtYmVyJylcblxuICAgIGNvbnN0IG5vdyA9IG1heEFnZSA/IERhdGUubm93KCkgOiAwXG4gICAgY29uc3QgbGVuID0gdGhpc1tMRU5HVEhfQ0FMQ1VMQVRPUl0odmFsdWUsIGtleSlcblxuICAgIGlmICh0aGlzW0NBQ0hFXS5oYXMoa2V5KSkge1xuICAgICAgaWYgKGxlbiA+IHRoaXNbTUFYXSkge1xuICAgICAgICBkZWwodGhpcywgdGhpc1tDQUNIRV0uZ2V0KGtleSkpXG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgfVxuXG4gICAgICBjb25zdCBub2RlID0gdGhpc1tDQUNIRV0uZ2V0KGtleSlcbiAgICAgIGNvbnN0IGl0ZW0gPSBub2RlLnZhbHVlXG5cbiAgICAgIC8vIGRpc3Bvc2Ugb2YgdGhlIG9sZCBvbmUgYmVmb3JlIG92ZXJ3cml0aW5nXG4gICAgICAvLyBzcGxpdCBvdXQgaW50byAyIGlmcyBmb3IgYmV0dGVyIGNvdmVyYWdlIHRyYWNraW5nXG4gICAgICBpZiAodGhpc1tESVNQT1NFXSkge1xuICAgICAgICBpZiAoIXRoaXNbTk9fRElTUE9TRV9PTl9TRVRdKVxuICAgICAgICAgIHRoaXNbRElTUE9TRV0oa2V5LCBpdGVtLnZhbHVlKVxuICAgICAgfVxuXG4gICAgICBpdGVtLm5vdyA9IG5vd1xuICAgICAgaXRlbS5tYXhBZ2UgPSBtYXhBZ2VcbiAgICAgIGl0ZW0udmFsdWUgPSB2YWx1ZVxuICAgICAgdGhpc1tMRU5HVEhdICs9IGxlbiAtIGl0ZW0ubGVuZ3RoXG4gICAgICBpdGVtLmxlbmd0aCA9IGxlblxuICAgICAgdGhpcy5nZXQoa2V5KVxuICAgICAgdHJpbSh0aGlzKVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBjb25zdCBoaXQgPSBuZXcgRW50cnkoa2V5LCB2YWx1ZSwgbGVuLCBub3csIG1heEFnZSlcblxuICAgIC8vIG92ZXJzaXplZCBvYmplY3RzIGZhbGwgb3V0IG9mIGNhY2hlIGF1dG9tYXRpY2FsbHkuXG4gICAgaWYgKGhpdC5sZW5ndGggPiB0aGlzW01BWF0pIHtcbiAgICAgIGlmICh0aGlzW0RJU1BPU0VdKVxuICAgICAgICB0aGlzW0RJU1BPU0VdKGtleSwgdmFsdWUpXG5cbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIHRoaXNbTEVOR1RIXSArPSBoaXQubGVuZ3RoXG4gICAgdGhpc1tMUlVfTElTVF0udW5zaGlmdChoaXQpXG4gICAgdGhpc1tDQUNIRV0uc2V0KGtleSwgdGhpc1tMUlVfTElTVF0uaGVhZClcbiAgICB0cmltKHRoaXMpXG4gICAgcmV0dXJuIHRydWVcbiAgfVxuXG4gIGhhcyAoa2V5KSB7XG4gICAgaWYgKCF0aGlzW0NBQ0hFXS5oYXMoa2V5KSkgcmV0dXJuIGZhbHNlXG4gICAgY29uc3QgaGl0ID0gdGhpc1tDQUNIRV0uZ2V0KGtleSkudmFsdWVcbiAgICByZXR1cm4gIWlzU3RhbGUodGhpcywgaGl0KVxuICB9XG5cbiAgZ2V0IChrZXkpIHtcbiAgICByZXR1cm4gZ2V0KHRoaXMsIGtleSwgdHJ1ZSlcbiAgfVxuXG4gIHBlZWsgKGtleSkge1xuICAgIHJldHVybiBnZXQodGhpcywga2V5LCBmYWxzZSlcbiAgfVxuXG4gIHBvcCAoKSB7XG4gICAgY29uc3Qgbm9kZSA9IHRoaXNbTFJVX0xJU1RdLnRhaWxcbiAgICBpZiAoIW5vZGUpXG4gICAgICByZXR1cm4gbnVsbFxuXG4gICAgZGVsKHRoaXMsIG5vZGUpXG4gICAgcmV0dXJuIG5vZGUudmFsdWVcbiAgfVxuXG4gIGRlbCAoa2V5KSB7XG4gICAgZGVsKHRoaXMsIHRoaXNbQ0FDSEVdLmdldChrZXkpKVxuICB9XG5cbiAgbG9hZCAoYXJyKSB7XG4gICAgLy8gcmVzZXQgdGhlIGNhY2hlXG4gICAgdGhpcy5yZXNldCgpXG5cbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpXG4gICAgLy8gQSBwcmV2aW91cyBzZXJpYWxpemVkIGNhY2hlIGhhcyB0aGUgbW9zdCByZWNlbnQgaXRlbXMgZmlyc3RcbiAgICBmb3IgKGxldCBsID0gYXJyLmxlbmd0aCAtIDE7IGwgPj0gMDsgbC0tKSB7XG4gICAgICBjb25zdCBoaXQgPSBhcnJbbF1cbiAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IGhpdC5lIHx8IDBcbiAgICAgIGlmIChleHBpcmVzQXQgPT09IDApXG4gICAgICAgIC8vIHRoZSBpdGVtIHdhcyBjcmVhdGVkIHdpdGhvdXQgZXhwaXJhdGlvbiBpbiBhIG5vbiBhZ2VkIGNhY2hlXG4gICAgICAgIHRoaXMuc2V0KGhpdC5rLCBoaXQudilcbiAgICAgIGVsc2Uge1xuICAgICAgICBjb25zdCBtYXhBZ2UgPSBleHBpcmVzQXQgLSBub3dcbiAgICAgICAgLy8gZG9udCBhZGQgYWxyZWFkeSBleHBpcmVkIGl0ZW1zXG4gICAgICAgIGlmIChtYXhBZ2UgPiAwKSB7XG4gICAgICAgICAgdGhpcy5zZXQoaGl0LmssIGhpdC52LCBtYXhBZ2UpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcnVuZSAoKSB7XG4gICAgdGhpc1tDQUNIRV0uZm9yRWFjaCgodmFsdWUsIGtleSkgPT4gZ2V0KHRoaXMsIGtleSwgZmFsc2UpKVxuICB9XG59XG5cbmNvbnN0IGdldCA9IChzZWxmLCBrZXksIGRvVXNlKSA9PiB7XG4gIGNvbnN0IG5vZGUgPSBzZWxmW0NBQ0hFXS5nZXQoa2V5KVxuICBpZiAobm9kZSkge1xuICAgIGNvbnN0IGhpdCA9IG5vZGUudmFsdWVcbiAgICBpZiAoaXNTdGFsZShzZWxmLCBoaXQpKSB7XG4gICAgICBkZWwoc2VsZiwgbm9kZSlcbiAgICAgIGlmICghc2VsZltBTExPV19TVEFMRV0pXG4gICAgICAgIHJldHVybiB1bmRlZmluZWRcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGRvVXNlKSB7XG4gICAgICAgIGlmIChzZWxmW1VQREFURV9BR0VfT05fR0VUXSlcbiAgICAgICAgICBub2RlLnZhbHVlLm5vdyA9IERhdGUubm93KClcbiAgICAgICAgc2VsZltMUlVfTElTVF0udW5zaGlmdE5vZGUobm9kZSlcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGhpdC52YWx1ZVxuICB9XG59XG5cbmNvbnN0IGlzU3RhbGUgPSAoc2VsZiwgaGl0KSA9PiB7XG4gIGlmICghaGl0IHx8ICghaGl0Lm1heEFnZSAmJiAhc2VsZltNQVhfQUdFXSkpXG4gICAgcmV0dXJuIGZhbHNlXG5cbiAgY29uc3QgZGlmZiA9IERhdGUubm93KCkgLSBoaXQubm93XG4gIHJldHVybiBoaXQubWF4QWdlID8gZGlmZiA+IGhpdC5tYXhBZ2VcbiAgICA6IHNlbGZbTUFYX0FHRV0gJiYgKGRpZmYgPiBzZWxmW01BWF9BR0VdKVxufVxuXG5jb25zdCB0cmltID0gc2VsZiA9PiB7XG4gIGlmIChzZWxmW0xFTkdUSF0gPiBzZWxmW01BWF0pIHtcbiAgICBmb3IgKGxldCB3YWxrZXIgPSBzZWxmW0xSVV9MSVNUXS50YWlsO1xuICAgICAgc2VsZltMRU5HVEhdID4gc2VsZltNQVhdICYmIHdhbGtlciAhPT0gbnVsbDspIHtcbiAgICAgIC8vIFdlIGtub3cgdGhhdCB3ZSdyZSBhYm91dCB0byBkZWxldGUgdGhpcyBvbmUsIGFuZCBhbHNvXG4gICAgICAvLyB3aGF0IHRoZSBuZXh0IGxlYXN0IHJlY2VudGx5IHVzZWQga2V5IHdpbGwgYmUsIHNvIGp1c3RcbiAgICAgIC8vIGdvIGFoZWFkIGFuZCBzZXQgaXQgbm93LlxuICAgICAgY29uc3QgcHJldiA9IHdhbGtlci5wcmV2XG4gICAgICBkZWwoc2VsZiwgd2Fsa2VyKVxuICAgICAgd2Fsa2VyID0gcHJldlxuICAgIH1cbiAgfVxufVxuXG5jb25zdCBkZWwgPSAoc2VsZiwgbm9kZSkgPT4ge1xuICBpZiAobm9kZSkge1xuICAgIGNvbnN0IGhpdCA9IG5vZGUudmFsdWVcbiAgICBpZiAoc2VsZltESVNQT1NFXSlcbiAgICAgIHNlbGZbRElTUE9TRV0oaGl0LmtleSwgaGl0LnZhbHVlKVxuXG4gICAgc2VsZltMRU5HVEhdIC09IGhpdC5sZW5ndGhcbiAgICBzZWxmW0NBQ0hFXS5kZWxldGUoaGl0LmtleSlcbiAgICBzZWxmW0xSVV9MSVNUXS5yZW1vdmVOb2RlKG5vZGUpXG4gIH1cbn1cblxuY2xhc3MgRW50cnkge1xuICBjb25zdHJ1Y3RvciAoa2V5LCB2YWx1ZSwgbGVuZ3RoLCBub3csIG1heEFnZSkge1xuICAgIHRoaXMua2V5ID0ga2V5XG4gICAgdGhpcy52YWx1ZSA9IHZhbHVlXG4gICAgdGhpcy5sZW5ndGggPSBsZW5ndGhcbiAgICB0aGlzLm5vdyA9IG5vd1xuICAgIHRoaXMubWF4QWdlID0gbWF4QWdlIHx8IDBcbiAgfVxufVxuXG5jb25zdCBmb3JFYWNoU3RlcCA9IChzZWxmLCBmbiwgbm9kZSwgdGhpc3ApID0+IHtcbiAgbGV0IGhpdCA9IG5vZGUudmFsdWVcbiAgaWYgKGlzU3RhbGUoc2VsZiwgaGl0KSkge1xuICAgIGRlbChzZWxmLCBub2RlKVxuICAgIGlmICghc2VsZltBTExPV19TVEFMRV0pXG4gICAgICBoaXQgPSB1bmRlZmluZWRcbiAgfVxuICBpZiAoaGl0KVxuICAgIGZuLmNhbGwodGhpc3AsIGhpdC52YWx1ZSwgaGl0LmtleSwgc2VsZilcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBMUlVDYWNoZVxuIiwiJ3VzZSBzdHJpY3QnXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChZYWxsaXN0KSB7XG4gIFlhbGxpc3QucHJvdG90eXBlW1N5bWJvbC5pdGVyYXRvcl0gPSBmdW5jdGlvbiogKCkge1xuICAgIGZvciAobGV0IHdhbGtlciA9IHRoaXMuaGVhZDsgd2Fsa2VyOyB3YWxrZXIgPSB3YWxrZXIubmV4dCkge1xuICAgICAgeWllbGQgd2Fsa2VyLnZhbHVlXG4gICAgfVxuICB9XG59XG4iLCIndXNlIHN0cmljdCdcbm1vZHVsZS5leHBvcnRzID0gWWFsbGlzdFxuXG5ZYWxsaXN0Lk5vZGUgPSBOb2RlXG5ZYWxsaXN0LmNyZWF0ZSA9IFlhbGxpc3RcblxuZnVuY3Rpb24gWWFsbGlzdCAobGlzdCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKCEoc2VsZiBpbnN0YW5jZW9mIFlhbGxpc3QpKSB7XG4gICAgc2VsZiA9IG5ldyBZYWxsaXN0KClcbiAgfVxuXG4gIHNlbGYudGFpbCA9IG51bGxcbiAgc2VsZi5oZWFkID0gbnVsbFxuICBzZWxmLmxlbmd0aCA9IDBcblxuICBpZiAobGlzdCAmJiB0eXBlb2YgbGlzdC5mb3JFYWNoID09PSAnZnVuY3Rpb24nKSB7XG4gICAgbGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgICBzZWxmLnB1c2goaXRlbSlcbiAgICB9KVxuICB9IGVsc2UgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGwgPSBhcmd1bWVudHMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICBzZWxmLnB1c2goYXJndW1lbnRzW2ldKVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzZWxmXG59XG5cbllhbGxpc3QucHJvdG90eXBlLnJlbW92ZU5vZGUgPSBmdW5jdGlvbiAobm9kZSkge1xuICBpZiAobm9kZS5saXN0ICE9PSB0aGlzKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdyZW1vdmluZyBub2RlIHdoaWNoIGRvZXMgbm90IGJlbG9uZyB0byB0aGlzIGxpc3QnKVxuICB9XG5cbiAgdmFyIG5leHQgPSBub2RlLm5leHRcbiAgdmFyIHByZXYgPSBub2RlLnByZXZcblxuICBpZiAobmV4dCkge1xuICAgIG5leHQucHJldiA9IHByZXZcbiAgfVxuXG4gIGlmIChwcmV2KSB7XG4gICAgcHJldi5uZXh0ID0gbmV4dFxuICB9XG5cbiAgaWYgKG5vZGUgPT09IHRoaXMuaGVhZCkge1xuICAgIHRoaXMuaGVhZCA9IG5leHRcbiAgfVxuICBpZiAobm9kZSA9PT0gdGhpcy50YWlsKSB7XG4gICAgdGhpcy50YWlsID0gcHJldlxuICB9XG5cbiAgbm9kZS5saXN0Lmxlbmd0aC0tXG4gIG5vZGUubmV4dCA9IG51bGxcbiAgbm9kZS5wcmV2ID0gbnVsbFxuICBub2RlLmxpc3QgPSBudWxsXG59XG5cbllhbGxpc3QucHJvdG90eXBlLnVuc2hpZnROb2RlID0gZnVuY3Rpb24gKG5vZGUpIHtcbiAgaWYgKG5vZGUgPT09IHRoaXMuaGVhZCkge1xuICAgIHJldHVyblxuICB9XG5cbiAgaWYgKG5vZGUubGlzdCkge1xuICAgIG5vZGUubGlzdC5yZW1vdmVOb2RlKG5vZGUpXG4gIH1cblxuICB2YXIgaGVhZCA9IHRoaXMuaGVhZFxuICBub2RlLmxpc3QgPSB0aGlzXG4gIG5vZGUubmV4dCA9IGhlYWRcbiAgaWYgKGhlYWQpIHtcbiAgICBoZWFkLnByZXYgPSBub2RlXG4gIH1cblxuICB0aGlzLmhlYWQgPSBub2RlXG4gIGlmICghdGhpcy50YWlsKSB7XG4gICAgdGhpcy50YWlsID0gbm9kZVxuICB9XG4gIHRoaXMubGVuZ3RoKytcbn1cblxuWWFsbGlzdC5wcm90b3R5cGUucHVzaE5vZGUgPSBmdW5jdGlvbiAobm9kZSkge1xuICBpZiAobm9kZSA9PT0gdGhpcy50YWlsKSB7XG4gICAgcmV0dXJuXG4gIH1cblxuICBpZiAobm9kZS5saXN0KSB7XG4gICAgbm9kZS5saXN0LnJlbW92ZU5vZGUobm9kZSlcbiAgfVxuXG4gIHZhciB0YWlsID0gdGhpcy50YWlsXG4gIG5vZGUubGlzdCA9IHRoaXNcbiAgbm9kZS5wcmV2ID0gdGFpbFxuICBpZiAodGFpbCkge1xuICAgIHRhaWwubmV4dCA9IG5vZGVcbiAgfVxuXG4gIHRoaXMudGFpbCA9IG5vZGVcbiAgaWYgKCF0aGlzLmhlYWQpIHtcbiAgICB0aGlzLmhlYWQgPSBub2RlXG4gIH1cbiAgdGhpcy5sZW5ndGgrK1xufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5wdXNoID0gZnVuY3Rpb24gKCkge1xuICBmb3IgKHZhciBpID0gMCwgbCA9IGFyZ3VtZW50cy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBwdXNoKHRoaXMsIGFyZ3VtZW50c1tpXSlcbiAgfVxuICByZXR1cm4gdGhpcy5sZW5ndGhcbn1cblxuWWFsbGlzdC5wcm90b3R5cGUudW5zaGlmdCA9IGZ1bmN0aW9uICgpIHtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBhcmd1bWVudHMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgdW5zaGlmdCh0aGlzLCBhcmd1bWVudHNbaV0pXG4gIH1cbiAgcmV0dXJuIHRoaXMubGVuZ3RoXG59XG5cbllhbGxpc3QucHJvdG90eXBlLnBvcCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLnRhaWwpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkXG4gIH1cblxuICB2YXIgcmVzID0gdGhpcy50YWlsLnZhbHVlXG4gIHRoaXMudGFpbCA9IHRoaXMudGFpbC5wcmV2XG4gIGlmICh0aGlzLnRhaWwpIHtcbiAgICB0aGlzLnRhaWwubmV4dCA9IG51bGxcbiAgfSBlbHNlIHtcbiAgICB0aGlzLmhlYWQgPSBudWxsXG4gIH1cbiAgdGhpcy5sZW5ndGgtLVxuICByZXR1cm4gcmVzXG59XG5cbllhbGxpc3QucHJvdG90eXBlLnNoaWZ0ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuaGVhZCkge1xuICAgIHJldHVybiB1bmRlZmluZWRcbiAgfVxuXG4gIHZhciByZXMgPSB0aGlzLmhlYWQudmFsdWVcbiAgdGhpcy5oZWFkID0gdGhpcy5oZWFkLm5leHRcbiAgaWYgKHRoaXMuaGVhZCkge1xuICAgIHRoaXMuaGVhZC5wcmV2ID0gbnVsbFxuICB9IGVsc2Uge1xuICAgIHRoaXMudGFpbCA9IG51bGxcbiAgfVxuICB0aGlzLmxlbmd0aC0tXG4gIHJldHVybiByZXNcbn1cblxuWWFsbGlzdC5wcm90b3R5cGUuZm9yRWFjaCA9IGZ1bmN0aW9uIChmbiwgdGhpc3ApIHtcbiAgdGhpc3AgPSB0aGlzcCB8fCB0aGlzXG4gIGZvciAodmFyIHdhbGtlciA9IHRoaXMuaGVhZCwgaSA9IDA7IHdhbGtlciAhPT0gbnVsbDsgaSsrKSB7XG4gICAgZm4uY2FsbCh0aGlzcCwgd2Fsa2VyLnZhbHVlLCBpLCB0aGlzKVxuICAgIHdhbGtlciA9IHdhbGtlci5uZXh0XG4gIH1cbn1cblxuWWFsbGlzdC5wcm90b3R5cGUuZm9yRWFjaFJldmVyc2UgPSBmdW5jdGlvbiAoZm4sIHRoaXNwKSB7XG4gIHRoaXNwID0gdGhpc3AgfHwgdGhpc1xuICBmb3IgKHZhciB3YWxrZXIgPSB0aGlzLnRhaWwsIGkgPSB0aGlzLmxlbmd0aCAtIDE7IHdhbGtlciAhPT0gbnVsbDsgaS0tKSB7XG4gICAgZm4uY2FsbCh0aGlzcCwgd2Fsa2VyLnZhbHVlLCBpLCB0aGlzKVxuICAgIHdhbGtlciA9IHdhbGtlci5wcmV2XG4gIH1cbn1cblxuWWFsbGlzdC5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKG4pIHtcbiAgZm9yICh2YXIgaSA9IDAsIHdhbGtlciA9IHRoaXMuaGVhZDsgd2Fsa2VyICE9PSBudWxsICYmIGkgPCBuOyBpKyspIHtcbiAgICAvLyBhYm9ydCBvdXQgb2YgdGhlIGxpc3QgZWFybHkgaWYgd2UgaGl0IGEgY3ljbGVcbiAgICB3YWxrZXIgPSB3YWxrZXIubmV4dFxuICB9XG4gIGlmIChpID09PSBuICYmIHdhbGtlciAhPT0gbnVsbCkge1xuICAgIHJldHVybiB3YWxrZXIudmFsdWVcbiAgfVxufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5nZXRSZXZlcnNlID0gZnVuY3Rpb24gKG4pIHtcbiAgZm9yICh2YXIgaSA9IDAsIHdhbGtlciA9IHRoaXMudGFpbDsgd2Fsa2VyICE9PSBudWxsICYmIGkgPCBuOyBpKyspIHtcbiAgICAvLyBhYm9ydCBvdXQgb2YgdGhlIGxpc3QgZWFybHkgaWYgd2UgaGl0IGEgY3ljbGVcbiAgICB3YWxrZXIgPSB3YWxrZXIucHJldlxuICB9XG4gIGlmIChpID09PSBuICYmIHdhbGtlciAhPT0gbnVsbCkge1xuICAgIHJldHVybiB3YWxrZXIudmFsdWVcbiAgfVxufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5tYXAgPSBmdW5jdGlvbiAoZm4sIHRoaXNwKSB7XG4gIHRoaXNwID0gdGhpc3AgfHwgdGhpc1xuICB2YXIgcmVzID0gbmV3IFlhbGxpc3QoKVxuICBmb3IgKHZhciB3YWxrZXIgPSB0aGlzLmhlYWQ7IHdhbGtlciAhPT0gbnVsbDspIHtcbiAgICByZXMucHVzaChmbi5jYWxsKHRoaXNwLCB3YWxrZXIudmFsdWUsIHRoaXMpKVxuICAgIHdhbGtlciA9IHdhbGtlci5uZXh0XG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5tYXBSZXZlcnNlID0gZnVuY3Rpb24gKGZuLCB0aGlzcCkge1xuICB0aGlzcCA9IHRoaXNwIHx8IHRoaXNcbiAgdmFyIHJlcyA9IG5ldyBZYWxsaXN0KClcbiAgZm9yICh2YXIgd2Fsa2VyID0gdGhpcy50YWlsOyB3YWxrZXIgIT09IG51bGw7KSB7XG4gICAgcmVzLnB1c2goZm4uY2FsbCh0aGlzcCwgd2Fsa2VyLnZhbHVlLCB0aGlzKSlcbiAgICB3YWxrZXIgPSB3YWxrZXIucHJldlxuICB9XG4gIHJldHVybiByZXNcbn1cblxuWWFsbGlzdC5wcm90b3R5cGUucmVkdWNlID0gZnVuY3Rpb24gKGZuLCBpbml0aWFsKSB7XG4gIHZhciBhY2NcbiAgdmFyIHdhbGtlciA9IHRoaXMuaGVhZFxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICBhY2MgPSBpbml0aWFsXG4gIH0gZWxzZSBpZiAodGhpcy5oZWFkKSB7XG4gICAgd2Fsa2VyID0gdGhpcy5oZWFkLm5leHRcbiAgICBhY2MgPSB0aGlzLmhlYWQudmFsdWVcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdSZWR1Y2Ugb2YgZW1wdHkgbGlzdCB3aXRoIG5vIGluaXRpYWwgdmFsdWUnKVxuICB9XG5cbiAgZm9yICh2YXIgaSA9IDA7IHdhbGtlciAhPT0gbnVsbDsgaSsrKSB7XG4gICAgYWNjID0gZm4oYWNjLCB3YWxrZXIudmFsdWUsIGkpXG4gICAgd2Fsa2VyID0gd2Fsa2VyLm5leHRcbiAgfVxuXG4gIHJldHVybiBhY2Ncbn1cblxuWWFsbGlzdC5wcm90b3R5cGUucmVkdWNlUmV2ZXJzZSA9IGZ1bmN0aW9uIChmbiwgaW5pdGlhbCkge1xuICB2YXIgYWNjXG4gIHZhciB3YWxrZXIgPSB0aGlzLnRhaWxcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgYWNjID0gaW5pdGlhbFxuICB9IGVsc2UgaWYgKHRoaXMudGFpbCkge1xuICAgIHdhbGtlciA9IHRoaXMudGFpbC5wcmV2XG4gICAgYWNjID0gdGhpcy50YWlsLnZhbHVlXG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignUmVkdWNlIG9mIGVtcHR5IGxpc3Qgd2l0aCBubyBpbml0aWFsIHZhbHVlJylcbiAgfVxuXG4gIGZvciAodmFyIGkgPSB0aGlzLmxlbmd0aCAtIDE7IHdhbGtlciAhPT0gbnVsbDsgaS0tKSB7XG4gICAgYWNjID0gZm4oYWNjLCB3YWxrZXIudmFsdWUsIGkpXG4gICAgd2Fsa2VyID0gd2Fsa2VyLnByZXZcbiAgfVxuXG4gIHJldHVybiBhY2Ncbn1cblxuWWFsbGlzdC5wcm90b3R5cGUudG9BcnJheSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGFyciA9IG5ldyBBcnJheSh0aGlzLmxlbmd0aClcbiAgZm9yICh2YXIgaSA9IDAsIHdhbGtlciA9IHRoaXMuaGVhZDsgd2Fsa2VyICE9PSBudWxsOyBpKyspIHtcbiAgICBhcnJbaV0gPSB3YWxrZXIudmFsdWVcbiAgICB3YWxrZXIgPSB3YWxrZXIubmV4dFxuICB9XG4gIHJldHVybiBhcnJcbn1cblxuWWFsbGlzdC5wcm90b3R5cGUudG9BcnJheVJldmVyc2UgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBhcnIgPSBuZXcgQXJyYXkodGhpcy5sZW5ndGgpXG4gIGZvciAodmFyIGkgPSAwLCB3YWxrZXIgPSB0aGlzLnRhaWw7IHdhbGtlciAhPT0gbnVsbDsgaSsrKSB7XG4gICAgYXJyW2ldID0gd2Fsa2VyLnZhbHVlXG4gICAgd2Fsa2VyID0gd2Fsa2VyLnByZXZcbiAgfVxuICByZXR1cm4gYXJyXG59XG5cbllhbGxpc3QucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gKGZyb20sIHRvKSB7XG4gIHRvID0gdG8gfHwgdGhpcy5sZW5ndGhcbiAgaWYgKHRvIDwgMCkge1xuICAgIHRvICs9IHRoaXMubGVuZ3RoXG4gIH1cbiAgZnJvbSA9IGZyb20gfHwgMFxuICBpZiAoZnJvbSA8IDApIHtcbiAgICBmcm9tICs9IHRoaXMubGVuZ3RoXG4gIH1cbiAgdmFyIHJldCA9IG5ldyBZYWxsaXN0KClcbiAgaWYgKHRvIDwgZnJvbSB8fCB0byA8IDApIHtcbiAgICByZXR1cm4gcmV0XG4gIH1cbiAgaWYgKGZyb20gPCAwKSB7XG4gICAgZnJvbSA9IDBcbiAgfVxuICBpZiAodG8gPiB0aGlzLmxlbmd0aCkge1xuICAgIHRvID0gdGhpcy5sZW5ndGhcbiAgfVxuICBmb3IgKHZhciBpID0gMCwgd2Fsa2VyID0gdGhpcy5oZWFkOyB3YWxrZXIgIT09IG51bGwgJiYgaSA8IGZyb207IGkrKykge1xuICAgIHdhbGtlciA9IHdhbGtlci5uZXh0XG4gIH1cbiAgZm9yICg7IHdhbGtlciAhPT0gbnVsbCAmJiBpIDwgdG87IGkrKywgd2Fsa2VyID0gd2Fsa2VyLm5leHQpIHtcbiAgICByZXQucHVzaCh3YWxrZXIudmFsdWUpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5zbGljZVJldmVyc2UgPSBmdW5jdGlvbiAoZnJvbSwgdG8pIHtcbiAgdG8gPSB0byB8fCB0aGlzLmxlbmd0aFxuICBpZiAodG8gPCAwKSB7XG4gICAgdG8gKz0gdGhpcy5sZW5ndGhcbiAgfVxuICBmcm9tID0gZnJvbSB8fCAwXG4gIGlmIChmcm9tIDwgMCkge1xuICAgIGZyb20gKz0gdGhpcy5sZW5ndGhcbiAgfVxuICB2YXIgcmV0ID0gbmV3IFlhbGxpc3QoKVxuICBpZiAodG8gPCBmcm9tIHx8IHRvIDwgMCkge1xuICAgIHJldHVybiByZXRcbiAgfVxuICBpZiAoZnJvbSA8IDApIHtcbiAgICBmcm9tID0gMFxuICB9XG4gIGlmICh0byA+IHRoaXMubGVuZ3RoKSB7XG4gICAgdG8gPSB0aGlzLmxlbmd0aFxuICB9XG4gIGZvciAodmFyIGkgPSB0aGlzLmxlbmd0aCwgd2Fsa2VyID0gdGhpcy50YWlsOyB3YWxrZXIgIT09IG51bGwgJiYgaSA+IHRvOyBpLS0pIHtcbiAgICB3YWxrZXIgPSB3YWxrZXIucHJldlxuICB9XG4gIGZvciAoOyB3YWxrZXIgIT09IG51bGwgJiYgaSA+IGZyb207IGktLSwgd2Fsa2VyID0gd2Fsa2VyLnByZXYpIHtcbiAgICByZXQucHVzaCh3YWxrZXIudmFsdWUpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5yZXZlcnNlID0gZnVuY3Rpb24gKCkge1xuICB2YXIgaGVhZCA9IHRoaXMuaGVhZFxuICB2YXIgdGFpbCA9IHRoaXMudGFpbFxuICBmb3IgKHZhciB3YWxrZXIgPSBoZWFkOyB3YWxrZXIgIT09IG51bGw7IHdhbGtlciA9IHdhbGtlci5wcmV2KSB7XG4gICAgdmFyIHAgPSB3YWxrZXIucHJldlxuICAgIHdhbGtlci5wcmV2ID0gd2Fsa2VyLm5leHRcbiAgICB3YWxrZXIubmV4dCA9IHBcbiAgfVxuICB0aGlzLmhlYWQgPSB0YWlsXG4gIHRoaXMudGFpbCA9IGhlYWRcbiAgcmV0dXJuIHRoaXNcbn1cblxuZnVuY3Rpb24gcHVzaCAoc2VsZiwgaXRlbSkge1xuICBzZWxmLnRhaWwgPSBuZXcgTm9kZShpdGVtLCBzZWxmLnRhaWwsIG51bGwsIHNlbGYpXG4gIGlmICghc2VsZi5oZWFkKSB7XG4gICAgc2VsZi5oZWFkID0gc2VsZi50YWlsXG4gIH1cbiAgc2VsZi5sZW5ndGgrK1xufVxuXG5mdW5jdGlvbiB1bnNoaWZ0IChzZWxmLCBpdGVtKSB7XG4gIHNlbGYuaGVhZCA9IG5ldyBOb2RlKGl0ZW0sIG51bGwsIHNlbGYuaGVhZCwgc2VsZilcbiAgaWYgKCFzZWxmLnRhaWwpIHtcbiAgICBzZWxmLnRhaWwgPSBzZWxmLmhlYWRcbiAgfVxuICBzZWxmLmxlbmd0aCsrXG59XG5cbmZ1bmN0aW9uIE5vZGUgKHZhbHVlLCBwcmV2LCBuZXh0LCBsaXN0KSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBOb2RlKSkge1xuICAgIHJldHVybiBuZXcgTm9kZSh2YWx1ZSwgcHJldiwgbmV4dCwgbGlzdClcbiAgfVxuXG4gIHRoaXMubGlzdCA9IGxpc3RcbiAgdGhpcy52YWx1ZSA9IHZhbHVlXG5cbiAgaWYgKHByZXYpIHtcbiAgICBwcmV2Lm5leHQgPSB0aGlzXG4gICAgdGhpcy5wcmV2ID0gcHJldlxuICB9IGVsc2Uge1xuICAgIHRoaXMucHJldiA9IG51bGxcbiAgfVxuXG4gIGlmIChuZXh0KSB7XG4gICAgbmV4dC5wcmV2ID0gdGhpc1xuICAgIHRoaXMubmV4dCA9IG5leHRcbiAgfSBlbHNlIHtcbiAgICB0aGlzLm5leHQgPSBudWxsXG4gIH1cbn1cblxudHJ5IHtcbiAgLy8gYWRkIGlmIHN1cHBvcnQgZm9yIFN5bWJvbC5pdGVyYXRvciBpcyBwcmVzZW50XG4gIHJlcXVpcmUoJy4vaXRlcmF0b3IuanMnKShZYWxsaXN0KVxufSBjYXRjaCAoZXIpIHt9XG4iLCJpbXBvcnQgKiBhcyBnYXBpIGZyb20gJy4vZ2FwaSc7XG5pbXBvcnQgeyBtc2dUeXBlLCBNc2cgfSBmcm9tICcuL21zZyc7XG5cbmxldCBtYWluUGF0dGVybnMgPSBbXTtcbmxldCBhbmFseXplUGF0dGVybnMgPSBbXTtcbmxldCBjYWxlbmRhcnMgPSB7fTtcbmxldCBjYWxEYXRhID0ge307XG5cbmNocm9tZS5ydW50aW1lLm9uQ29ubmVjdC5hZGRMaXN0ZW5lcihmdW5jdGlvbihwb3J0KSB7XG4gICAgY29uc29sZS5hc3NlcnQocG9ydC5uYW1lID09ICdtYWluJyk7XG4gICAgcG9ydC5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoZnVuY3Rpb24oX21zZykge1xuICAgICAgICBsZXQgbXNnID0gTXNnLmluZmxhdGUoX21zZyk7XG4gICAgICAgIGNvbnNvbGUubG9nKG1zZyk7XG4gICAgICAgIGlmIChtc2cudHlwZSA9PSBtc2dUeXBlLnVwZGF0ZVBhdHRlcm5zKSB7XG4gICAgICAgICAgICBpZiAobXNnLmRhdGEuaWQgPT0gJ2FuYWx5emUnKVxuICAgICAgICAgICAgICAgIGFuYWx5emVQYXR0ZXJucyA9IG1zZy5kYXRhLnBhdHRlcm5zO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIG1haW5QYXR0ZXJucyA9IG1zZy5kYXRhLnBhdHRlcm5zO1xuICAgICAgICAgICAgcG9ydC5wb3N0TWVzc2FnZShtc2cuZ2VuUmVzcChudWxsKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobXNnLnR5cGUgPT0gbXNnVHlwZS5nZXRQYXR0ZXJucykge1xuICAgICAgICAgICAgbGV0IHBhdHRlcm5zO1xuICAgICAgICAgICAgaWYgKG1zZy5kYXRhLmlkID09ICdhbmFseXplJylcbiAgICAgICAgICAgICAgICBwYXR0ZXJucyA9IGFuYWx5emVQYXR0ZXJucztcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICBwYXR0ZXJucyA9IG1haW5QYXR0ZXJucztcbiAgICAgICAgICAgIHBvcnQucG9zdE1lc3NhZ2UobXNnLmdlblJlc3AocGF0dGVybnMpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChtc2cudHlwZSA9PSBtc2dUeXBlLnVwZGF0ZUNhbGVuZGFycykge1xuICAgICAgICAgICAgY2FsZW5kYXJzID0gbXNnLmRhdGE7XG4gICAgICAgICAgICBmb3IgKGxldCBpZCBpbiBjYWxlbmRhcnMpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNhbERhdGEuaGFzT3duUHJvcGVydHkoaWQpKVxuICAgICAgICAgICAgICAgICAgICBjYWxEYXRhW2lkXSA9IG5ldyBnYXBpLkdDYWxlbmRhcihpZCwgY2FsZW5kYXJzW2lkXS5zdW1tYXJ5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBvcnQucG9zdE1lc3NhZ2UobXNnLmdlblJlc3AobnVsbCkpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG1zZy50eXBlID09IG1zZ1R5cGUuZ2V0Q2FsZW5kYXJzKSB7XG4gICAgICAgICAgICBsZXQgY2FscyA9IGNhbGVuZGFycztcbiAgICAgICAgICAgIGlmIChtc2cuZGF0YS5lbmFibGVkT25seSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBjYWxzID0gT2JqZWN0LmtleXMoY2FsZW5kYXJzKVxuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKGlkID0+IGNhbGVuZGFyc1tpZF0uZW5hYmxlZClcbiAgICAgICAgICAgICAgICAgICAgLnJlZHVjZSgocmVzLCBpZCkgPT4gKHJlc1tpZF0gPSBjYWxlbmRhcnNbaWRdLCByZXMpLCB7fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwb3J0LnBvc3RNZXNzYWdlKG1zZy5nZW5SZXNwKGNhbHMpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChtc2cudHlwZSA9PSBtc2dUeXBlLmdldENhbEV2ZW50cykge1xuICAgICAgICAgICAgY2FsRGF0YVttc2cuZGF0YS5pZF0uZ2V0RXZlbnRzKG5ldyBEYXRlKG1zZy5kYXRhLnN0YXJ0KSwgbmV3IERhdGUobXNnLmRhdGEuZW5kKSlcbiAgICAgICAgICAgICAgICAuY2F0Y2goZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBjYW5ub3QgbG9hZCBjYWxlbmRhciAke21zZy5kYXRhLmlkfWAsIGUpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAudGhlbihkYXRhID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhkYXRhKTtcbiAgICAgICAgICAgICAgICBsZXQgcmVzcCA9IG1zZy5nZW5SZXNwKGRhdGEubWFwKGUgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWQ6IGUuaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydDogZS5zdGFydC5nZXRUaW1lKCksXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmQ6IGUuZW5kLmdldFRpbWUoKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHJlc3ApO1xuICAgICAgICAgICAgICAgIHBvcnQucG9zdE1lc3NhZ2UocmVzcCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJ1bmtub3duIG1zZyB0eXBlXCIpO1xuICAgICAgICB9XG4gICAgfSk7XG59KTtcblxuY2hyb21lLmJyb3dzZXJBY3Rpb24ub25DbGlja2VkLmFkZExpc3RlbmVyKGZ1bmN0aW9uKCkge1xuICAgIGNocm9tZS50YWJzLmNyZWF0ZSh7dXJsOiAnaW5kZXguaHRtbCd9KTtcbn0pO1xuXG4iLCIvKiBnbG9iYWwgY2hyb21lICovXG5pbXBvcnQgTFJVIGZyb20gXCJscnUtY2FjaGVcIjtcbmNvbnN0IGdhcGlfYmFzZSA9ICdodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9jYWxlbmRhci92Myc7XG5cbmNvbnN0IEdBcGlFcnJvciA9IE9iamVjdC5mcmVlemUoe1xuICAgIGludmFsaWRTeW5jVG9rZW46IFN5bWJvbChcImludmFsaWRTeW5jVG9rZW5cIiksXG4gICAgbm90TG9nZ2VkSW46IFN5bWJvbChcIm5vdExvZ2dlZEluXCIpLFxuICAgIG5vdExvZ2dlZE91dDogU3ltYm9sKFwibm90TG9nZ2VkT3V0XCIpLFxuICAgIG90aGVyRXJyb3I6IFN5bWJvbChcIm90aGVyRXJyb3JcIiksXG59KTtcblxuZnVuY3Rpb24gdG9fcGFyYW1zKGRpY3QpIHtcbiAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMoZGljdCkuZmlsdGVyKChbaywgdl0pID0+IHYpLm1hcCgoW2ssIHZdKSA9PiBgJHtlbmNvZGVVUklDb21wb25lbnQoayl9PSR7ZW5jb2RlVVJJQ29tcG9uZW50KHYpfWApLmpvaW4oJyYnKTtcbn1cblxubGV0IGxvZ2dlZEluID0gbnVsbDtcblxuZnVuY3Rpb24gX2dldEF1dGhUb2tlbihpbnRlcmFjdGl2ZSA9IGZhbHNlKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmVyID0+XG4gICAgICAgIGNocm9tZS5pZGVudGl0eS5nZXRBdXRoVG9rZW4oXG4gICAgICAgICAgICB7IGludGVyYWN0aXZlIH0sIHRva2VuID0+IHJlc29sdmVyKFt0b2tlbiwgIWNocm9tZS5ydW50aW1lLmxhc3RFcnJvcl0pKSlcbiAgICAgICAgICAgIC50aGVuKChbdG9rZW4sIG9rXSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChvaykgcmV0dXJuIHRva2VuO1xuICAgICAgICAgICAgICAgIGVsc2UgdGhyb3cgR0FwaUVycm9yLm5vdExvZ2dlZEluO1xuICAgICAgICAgICAgfSk7XG59XG5cbmZ1bmN0aW9uIF9yZW1vdmVDYWNoZWRBdXRoVG9rZW4odG9rZW4pIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZXIgPT5cbiAgICAgICAgY2hyb21lLmlkZW50aXR5LnJlbW92ZUNhY2hlZEF1dGhUb2tlbih7IHRva2VuIH0sICgpID0+IHJlc29sdmVyKCkpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldExvZ2dlZEluKCkge1xuICAgIGlmIChsb2dnZWRJbiA9PT0gbnVsbClcbiAgICB7XG4gICAgICAgIHJldHVybiBfZ2V0QXV0aFRva2VuKGZhbHNlKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge2xvZ2dlZEluID0gdHJ1ZX0pXG4gICAgICAgICAgICAuY2F0Y2goKCkgPT4ge2xvZ2dlZEluID0gZmFsc2U7IGNvbnNvbGUubG9nKFwiaGVyZVwiKTt9KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gbG9nZ2VkSW4pO1xuICAgIH1cbiAgICBlbHNlIHJldHVybiBQcm9taXNlLnJlc29sdmUobG9nZ2VkSW4pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QXV0aFRva2VuKCkge1xuICAgIHJldHVybiBnZXRMb2dnZWRJbigpLnRoZW4oYiA9PiB7XG4gICAgICAgIGlmIChiKSByZXR1cm4gX2dldEF1dGhUb2tlbihmYWxzZSk7XG4gICAgICAgIGVsc2UgdGhyb3cgR0FwaUVycm9yLm5vdExvZ2dlZEluO1xuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9naW4oKSB7XG4gICAgcmV0dXJuIGdldExvZ2dlZEluKCkudGhlbihiID0+IHtcbiAgICAgICAgaWYgKCFiKSByZXR1cm4gX2dldEF1dGhUb2tlbih0cnVlKS50aGVuKCgpID0+IGxvZ2dlZEluID0gdHJ1ZSk7XG4gICAgICAgIGVsc2UgdGhyb3cgR0FwaUVycm9yLm5vdExvZ2dlZE91dDtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvZ291dCgpIHtcbiAgICByZXR1cm4gZ2V0QXV0aFRva2VuKCkudGhlbih0b2tlbiA9PiB7XG4gICAgICAgIHJldHVybiBmZXRjaChgaHR0cHM6Ly9hY2NvdW50cy5nb29nbGUuY29tL28vb2F1dGgyL3Jldm9rZT8ke3RvX3BhcmFtcyh7IHRva2VuIH0pfWAsXG4gICAgICAgICAgICAgICAgICAgIHsgbWV0aG9kOiAnR0VUJywgYXN5bmM6IHRydWUgfSkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSAyMDApXG4gICAgICAgICAgICAgICAgcmV0dXJuIF9yZW1vdmVDYWNoZWRBdXRoVG9rZW4odG9rZW4pO1xuICAgICAgICAgICAgZWxzZSB0aHJvdyBHQXBpRXJyb3Iub3RoZXJFcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfSkudGhlbigoKSA9PiBsb2dnZWRJbiA9IGZhbHNlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENhbGVuZGFycyh0b2tlbikge1xuICAgIHJldHVybiBmZXRjaChgJHtnYXBpX2Jhc2V9L3VzZXJzL21lL2NhbGVuZGFyTGlzdD8ke3RvX3BhcmFtcyh7YWNjZXNzX3Rva2VuOiB0b2tlbn0pfWAsXG4gICAgICAgICAgICB7IG1ldGhvZDogJ0dFVCcsIGFzeW5jOiB0cnVlIH0pXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHJlc3BvbnNlLmpzb24oKSlcbiAgICAgICAgLnRoZW4oZGF0YSA9PiBkYXRhLml0ZW1zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbG9ycyh0b2tlbikge1xuICAgIHJldHVybiBmZXRjaChgJHtnYXBpX2Jhc2V9L2NvbG9ycz8ke3RvX3BhcmFtcyh7YWNjZXNzX3Rva2VuOiB0b2tlbn0pfWAsXG4gICAgICAgIHsgbWV0aG9kOiAnR0VUJywgYXN5bmM6IHRydWUgfSlcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4gcmVzcG9uc2UuanNvbigpKTtcbn1cblxuZnVuY3Rpb24gZ2V0RXZlbnQoY2FsSWQsIGV2ZW50SWQsIHRva2VuKSB7XG4gICAgcmV0dXJuIGZldGNoKGAke2dhcGlfYmFzZX0vY2FsZW5kYXJzLyR7Y2FsSWR9L2V2ZW50cy8ke2V2ZW50SWR9PyR7dG9fcGFyYW1zKHthY2Nlc3NfdG9rZW46IHRva2VufSl9YCxcbiAgICAgICAgeyBtZXRob2Q6ICdHRVQnLCBhc3luYzogdHJ1ZSB9KVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiByZXNwb25zZS5qc29uKCkpO1xufVxuXG5mdW5jdGlvbiBnZXRFdmVudHMoY2FsSWQsIHRva2VuLCBzeW5jVG9rZW49bnVsbCwgdGltZU1pbj1udWxsLCB0aW1lTWF4PW51bGwsIHJlc3VsdHNQZXJSZXF1ZXN0PTEwMCkge1xuICAgIGxldCByZXN1bHRzID0gW107XG4gICAgY29uc3Qgc2luZ2xlRmV0Y2ggPSAocGFnZVRva2VuLCBzeW5jVG9rZW4pID0+IGZldGNoKGAke2dhcGlfYmFzZX0vY2FsZW5kYXJzLyR7Y2FsSWR9L2V2ZW50cz8ke3RvX3BhcmFtcyh7XG4gICAgICAgICAgICBhY2Nlc3NfdG9rZW46IHRva2VuLFxuICAgICAgICAgICAgcGFnZVRva2VuLFxuICAgICAgICAgICAgc3luY1Rva2VuLFxuICAgICAgICAgICAgdGltZU1pbixcbiAgICAgICAgICAgIHRpbWVNYXgsXG4gICAgICAgICAgICBtYXhSZXN1bHRzOiByZXN1bHRzUGVyUmVxdWVzdFxuICAgICAgICB9KX1gLCB7IG1ldGhvZDogJ0dFVCcsIGFzeW5jOiB0cnVlIH0pXG4gICAgICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gMjAwKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2UuanNvbigpO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDEwKVxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBHQXBpRXJyb3IuaW52YWxpZFN5bmNUb2tlbjtcbiAgICAgICAgICAgICAgICBlbHNlIHRocm93IEdBcGlFcnJvci5vdGhlckVycm9yO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKGRhdGEgPT4ge1xuICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaCguLi5kYXRhLml0ZW1zKTtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5uZXh0UGFnZVRva2VuKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzaW5nbGVGZXRjaChkYXRhLm5leHRQYWdlVG9rZW4sICcnKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5leHRTeW5jVG9rZW46IGRhdGEubmV4dFN5bmNUb2tlbixcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHNcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcblxuICAgIHJldHVybiBzaW5nbGVGZXRjaCgnJywgc3luY1Rva2VuKTtcbn1cblxuZXhwb3J0IGNsYXNzIEdDYWxlbmRhciB7XG4gICAgY29uc3RydWN0b3IoY2FsSWQsIG5hbWUsIG9wdGlvbnM9e21heENhY2hlZEl0ZW1zOiAxMDAsIG5EYXlzUGVyU2xvdDogMTAsIGxhcmdlUXVlcnk6IDEwfSkge1xuICAgICAgICB0aGlzLmNhbElkID0gY2FsSWQ7XG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgICAgIHRoaXMuc3luY1Rva2VuID0gJyc7XG4gICAgICAgIHRoaXMuY2FjaGUgPSBuZXcgTFJVKHtcbiAgICAgICAgICAgIG1heDogb3B0aW9ucy5tYXhDYWNoZWRJdGVtcyxcbiAgICAgICAgICAgIGRpc3Bvc2U6IChrLCB2KSA9PiB0aGlzLm9uUmVtb3ZlU2xvdChrLCB2KVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5ldmVudE1ldGEgPSB7fTtcbiAgICAgICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgICAgICAgdGhpcy5kaXZpZGVyID0gOC42NGU3ICogdGhpcy5vcHRpb25zLm5EYXlzUGVyU2xvdDtcbiAgICB9XG5cbiAgICBnZXQgdG9rZW4oKSB7IHJldHVybiBnZXRBdXRoVG9rZW4oKTsgfVxuXG4gICAgZGF0ZVRvQ2FjaGVLZXkoZGF0ZSkge1xuICAgICAgICByZXR1cm4gTWF0aC5mbG9vcihkYXRlIC8gdGhpcy5kaXZpZGVyKTtcbiAgICB9XG5cbiAgICBkYXRlUmFuZ2VUb0NhY2hlS2V5cyhyYW5nZSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3RhcnQ6IHRoaXMuZGF0ZVRvQ2FjaGVLZXkocmFuZ2Uuc3RhcnQpLFxuICAgICAgICAgICAgZW5kOiB0aGlzLmRhdGVUb0NhY2hlS2V5KG5ldyBEYXRlKHJhbmdlLmVuZC5nZXRUaW1lKCkgLSAxKSlcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBnZXRTbG90KGspIHtcbiAgICAgICAgaWYgKCF0aGlzLmNhY2hlLmhhcyhrKSlcbiAgICAgICAge1xuICAgICAgICAgICAgbGV0IHJlcyA9IHt9O1xuICAgICAgICAgICAgdGhpcy5jYWNoZS5zZXQoaywgcmVzKTtcbiAgICAgICAgICAgIHJldHVybiByZXM7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSByZXR1cm4gdGhpcy5jYWNoZS5nZXQoayk7XG4gICAgfVxuXG4gICAgb25SZW1vdmVTbG90KGssIHYpIHtcbiAgICAgICAgZm9yIChsZXQgaWQgaW4gdikge1xuICAgICAgICAgICAgY29uc29sZS5hc3NlcnQodGhpcy5ldmVudE1ldGFbaWRdKTtcbiAgICAgICAgICAgIGxldCBrZXlzID0gdGhpcy5ldmVudE1ldGFbaWRdLmtleXM7XG4gICAgICAgICAgICBrZXlzLmRlbGV0ZShrKTtcbiAgICAgICAgICAgIGlmIChrZXlzLnNpemUgPT09IDApXG4gICAgICAgICAgICAgICAgZGVsZXRlIHRoaXMuZXZlbnRNZXRhW2lkXTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNsb3RTdGFydERhdGUoaykgeyByZXR1cm4gbmV3IERhdGUoayAqIHRoaXMuZGl2aWRlcik7IH1cbiAgICBzbG90RW5kRGF0ZShrKSB7IHJldHVybiBuZXcgRGF0ZSgoayArIDEpICogdGhpcy5kaXZpZGVyKTsgfVxuXG4gICAgYWRkRXZlbnQoZSwgZXZpY3QgPSBmYWxzZSkge1xuICAgICAgICAvL2NvbnNvbGUubG9nKCdhZGRpbmcgZXZlbnQnLCBlKTtcbiAgICAgICAgaWYgKHRoaXMuZXZlbnRNZXRhLmhhc093blByb3BlcnR5KGUuaWQpKVxuICAgICAgICAgICAgdGhpcy5yZW1vdmVFdmVudChlKTtcbiAgICAgICAgbGV0IHIgPSB0aGlzLmRhdGVSYW5nZVRvQ2FjaGVLZXlzKGUpO1xuICAgICAgICBsZXQga3MgPSByLnN0YXJ0O1xuICAgICAgICBsZXQga2UgPSByLmVuZDtcbiAgICAgICAgbGV0IHQgPSB0aGlzLmNhY2hlLmxlbmd0aDtcbiAgICAgICAgbGV0IGtleXMgPSBuZXcgU2V0KCk7XG4gICAgICAgIGZvciAobGV0IGkgPSBrczsgaSA8PSBrZTsgaSsrKVxuICAgICAgICB7XG4gICAgICAgICAgICBrZXlzLmFkZChpKTtcbiAgICAgICAgICAgIGlmICghdGhpcy5jYWNoZS5oYXMoaSkpIHQrKztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmV2ZW50TWV0YVtlLmlkXSA9IHtcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBzdW1tYXJ5OiBlLnN1bW1hcnksXG4gICAgICAgIH07XG4gICAgICAgIGlmICghZXZpY3QgJiYgdCA+IHRoaXMub3B0aW9ucy5tYXhDYWNoZWRJdGVtcykgcmV0dXJuO1xuICAgICAgICBpZiAoa3MgPT09IGtlKVxuICAgICAgICAgICAgdGhpcy5nZXRTbG90KGtzKVtlLmlkXSA9IHtcbiAgICAgICAgICAgICAgICBzdGFydDogZS5zdGFydCxcbiAgICAgICAgICAgICAgICBlbmQ6IGUuZW5kLFxuICAgICAgICAgICAgICAgIGlkOiBlLmlkIH07XG4gICAgICAgIGVsc2VcbiAgICAgICAge1xuICAgICAgICAgICAgdGhpcy5nZXRTbG90KGtzKVtlLmlkXSA9IHtcbiAgICAgICAgICAgICAgICBzdGFydDogZS5zdGFydCxcbiAgICAgICAgICAgICAgICBlbmQ6IHRoaXMuc2xvdEVuZERhdGUoa3MpLFxuICAgICAgICAgICAgICAgIGlkOiBlLmlkIH07XG4gICAgICAgICAgICB0aGlzLmdldFNsb3Qoa2UpW2UuaWRdID0ge1xuICAgICAgICAgICAgICAgIHN0YXJ0OiB0aGlzLnNsb3RTdGFydERhdGUoa2UpLFxuICAgICAgICAgICAgICAgIGVuZDogZS5lbmQsXG4gICAgICAgICAgICAgICAgaWQ6IGUuaWQgfTtcbiAgICAgICAgICAgIGZvciAobGV0IGsgPSBrcyArIDE7IGsgPCBrZTsgaysrKVxuICAgICAgICAgICAgICAgIHRoaXMuZ2V0U2xvdChrKVtlLmlkXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IHRoaXMuc2xvdFN0YXJ0RGF0ZShrKSxcbiAgICAgICAgICAgICAgICAgICAgZW5kOiB0aGlzLnNsb3RFbmREYXRlKGspLFxuICAgICAgICAgICAgICAgICAgICBpZDogZS5pZH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZW1vdmVFdmVudChlKSB7XG4gICAgICAgIGxldCBrZXlzID0gdGhpcy5ldmVudE1ldGFbZS5pZF0ua2V5cztcbiAgICAgICAgY29uc29sZS5hc3NlcnQoa2V5cyk7XG4gICAgICAgIGtleXMuZm9yRWFjaChrID0+IGRlbGV0ZSB0aGlzLmdldFNsb3QoaylbZS5pZF0pO1xuICAgICAgICBkZWxldGUgdGhpcy5ldmVudE1ldGFbZS5pZF07XG4gICAgfVxuXG4gICAgZ2V0U2xvdEV2ZW50cyhrLCBzdGFydCwgZW5kKSB7XG4gICAgICAgIGxldCBzID0gdGhpcy5nZXRTbG90KGspO1xuICAgICAgICAvL2NvbnNvbGUubG9nKHMpO1xuICAgICAgICBsZXQgcmVzdWx0cyA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpZCBpbiBzKSB7XG4gICAgICAgICAgICBpZiAoIShzW2lkXS5zdGFydCA+PSBlbmQgfHwgc1tpZF0uZW5kIDw9IHN0YXJ0KSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IHNbaWRdLnN0YXJ0IDwgc3RhcnQgPyBzdGFydDogc1tpZF0uc3RhcnQsXG4gICAgICAgICAgICAgICAgICAgIGVuZDogc1tpZF0uZW5kID4gZW5kID8gZW5kOiBzW2lkXS5lbmQsXG4gICAgICAgICAgICAgICAgICAgIHN1bW1hcnk6IHRoaXMuZXZlbnRNZXRhW2lkXS5zdW1tYXJ5XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfVxuXG4gICAgZ2V0Q2FjaGVkRXZlbnRzKF9yKSB7XG4gICAgICAgIGxldCByID0gdGhpcy5kYXRlUmFuZ2VUb0NhY2hlS2V5cyhfcik7XG4gICAgICAgIGxldCBrcyA9IHIuc3RhcnQ7XG4gICAgICAgIGxldCBrZSA9IHIuZW5kO1xuICAgICAgICBsZXQgcmVzdWx0cyA9IHRoaXMuZ2V0U2xvdEV2ZW50cyhrcywgX3Iuc3RhcnQsIF9yLmVuZCk7XG4gICAgICAgIGZvciAobGV0IGsgPSBrcyArIDE7IGsgPCBrZTsgaysrKVxuICAgICAgICB7XG4gICAgICAgICAgICBsZXQgcyA9IHRoaXMuZ2V0U2xvdChrKTtcbiAgICAgICAgICAgIGZvciAobGV0IGlkIGluIHMpXG4gICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHNbaWRdKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoa2UgPiBrcylcbiAgICAgICAgICAgIHJlc3VsdHMucHVzaCguLi50aGlzLmdldFNsb3RFdmVudHMoa2UsIF9yLnN0YXJ0LCBfci5lbmQpKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfVxuXG4gICAgc3luYygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW4udGhlbih0b2tlbiA9PiBnZXRFdmVudHModGhpcy5jYWxJZCwgdG9rZW4sIHRoaXMuc3luY1Rva2VuKS50aGVuKHIgPT4ge1xuICAgICAgICAgICAgbGV0IHBtcyA9IHIucmVzdWx0cy5tYXAoZSA9PiBlLnN0YXJ0ID8gUHJvbWlzZS5yZXNvbHZlKGUpIDogZ2V0RXZlbnQodGhpcy5jYWxJZCwgZS5pZCwgdG9rZW4pKTtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwbXMpLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICAgICAgcmVzdWx0cy5mb3JFYWNoKGUgPT4ge1xuICAgICAgICAgICAgICAgICAgICBlLnN0YXJ0ID0gbmV3IERhdGUoZS5zdGFydC5kYXRlVGltZSk7XG4gICAgICAgICAgICAgICAgICAgIGUuZW5kID0gbmV3IERhdGUoZS5lbmQuZGF0ZVRpbWUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZS5zdGF0dXMgPT09ICdjb25maXJtZWQnKVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGRFdmVudChlKTtcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoZS5zdGF0dXMgPT09ICdjYW5jZWxsZWQnKVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVFdmVudChlKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB0aGlzLnN5bmNUb2tlbiA9IHIubmV4dFN5bmNUb2tlbjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KSkuY2F0Y2goZSA9PiB7XG4gICAgICAgICAgICBpZiAoZSA9PT0gR0FwaUVycm9yLmludmFsaWRTeW5jVG9rZW4pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnN5bmNUb2tlbiA9ICcnO1xuICAgICAgICAgICAgICAgIHRoaXMuc3luYygpO1xuICAgICAgICAgICAgfSBlbHNlIHRocm93IGU7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGdldEV2ZW50cyhzdGFydCwgZW5kKSB7XG4gICAgICAgIGxldCByID0gdGhpcy5kYXRlUmFuZ2VUb0NhY2hlS2V5cyh7IHN0YXJ0LCBlbmQgfSk7XG4gICAgICAgIGxldCBxdWVyeSA9IHt9O1xuICAgICAgICBmb3IgKGxldCBrID0gci5zdGFydDsgayA8PSByLmVuZDsgaysrKVxuICAgICAgICAgICAgaWYgKCF0aGlzLmNhY2hlLmhhcyhrKSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBpZiAoIXF1ZXJ5Lmhhc093blByb3BlcnR5KCdzdGFydCcpKVxuICAgICAgICAgICAgICAgICAgICBxdWVyeS5zdGFydCA9IGs7XG4gICAgICAgICAgICAgICAgcXVlcnkuZW5kID0gaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgY29uc29sZS5sb2coYHN0YXJ0OiAke3N0YXJ0fSBlbmQ6ICR7ZW5kfWApO1xuICAgICAgICBpZiAocXVlcnkuaGFzT3duUHJvcGVydHkoJ3N0YXJ0JykpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGNvbnNvbGUuYXNzZXJ0KHF1ZXJ5LnN0YXJ0IDw9IHF1ZXJ5LmVuZCk7XG4gICAgICAgICAgICBpZiAocXVlcnkuZW5kIC0gcXVlcnkuc3RhcnQgKyAxID4gdGhpcy5vcHRpb25zLmxhcmdlUXVlcnkpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgZW5jb3VudGVyIGxhcmdlIHF1ZXJ5LCB1c2UgZGlyZWN0IGZldGNoYCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9rZW4udGhlbih0b2tlbiA9PiBnZXRFdmVudHModGhpcy5jYWxJZCwgdG9rZW4sIG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydC50b0lTT1N0cmluZygpLCBlbmQudG9JU09TdHJpbmcoKSkudGhlbihyID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHJlc3VsdHMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgci5yZXN1bHRzLmZvckVhY2goZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmFzc2VydChlLnN0YXJ0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGUuc3RhcnQgPSBuZXcgRGF0ZShlLnN0YXJ0LmRhdGVUaW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGUuZW5kID0gbmV3IERhdGUoZS5lbmQuZGF0ZVRpbWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKGUpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdHMuZmlsdGVyKGUgPT4gIShlLnN0YXJ0ID49IGVuZCB8fCBlLmVuZCA8PSBzdGFydCkpLm1hcChlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ6IGUuaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IGUuc3RhcnQgPCBzdGFydCA/IHN0YXJ0OiBlLnN0YXJ0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZDogZS5lbmQgPiBlbmQgPyBlbmQ6IGUuZW5kLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1bW1hcnk6IGUuc3VtbWFyeSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc29sZS5sb2coYGZldGNoaW5nIHNob3J0IGV2ZW50IGxpc3RgKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRva2VuLnRoZW4odG9rZW4gPT4gZ2V0RXZlbnRzKHRoaXMuY2FsSWQsIHRva2VuLCBudWxsLFxuICAgICAgICAgICAgICAgIHRoaXMuc2xvdFN0YXJ0RGF0ZShxdWVyeS5zdGFydCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICB0aGlzLnNsb3RFbmREYXRlKHF1ZXJ5LmVuZCkudG9JU09TdHJpbmcoKSkudGhlbihyID0+IHtcbiAgICAgICAgICAgICAgICAgICAgci5yZXN1bHRzLmZvckVhY2goZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZS5zdGF0dXMgPT09ICdjb25maXJtZWQnKVxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuYXNzZXJ0KGUuc3RhcnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUuc3RhcnQgPSBuZXcgRGF0ZShlLnN0YXJ0LmRhdGVUaW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLmVuZCA9IG5ldyBEYXRlKGUuZW5kLmRhdGVUaW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZEV2ZW50KGUsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc3luY1Rva2VuID09PSAnJylcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3luY1Rva2VuID0gci5uZXh0U3luY1Rva2VuO1xuICAgICAgICAgICAgICAgIH0pKS50aGVuKCgpID0+IHRoaXMuc3luYygpKVxuICAgICAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMuZ2V0Q2FjaGVkRXZlbnRzKHsgc3RhcnQsIGVuZCB9KSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgY2FjaGUgaGl0YCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zeW5jKCkudGhlbigoKSA9PiB0aGlzLmdldENhY2hlZEV2ZW50cyh7IHN0YXJ0LCBlbmQgfSkpO1xuICAgICAgICB9XG4gICAgfVxufVxuIiwiLyogZ2xvYmFsIGNocm9tZSAqL1xuY29uc3QgX3VwZGF0ZVBhdHRlcm5zID0gXCJ1cGRhdGVQYXR0ZXJuc1wiO1xuY29uc3QgX2dldFBhdHRlcm5zID0gXCJnZXRQYXR0ZXJuc1wiO1xuY29uc3QgX3VwZGF0ZUNhbGVuZGFycyA9IFwidXBkYXRlQ2FsZW5kYXJzXCI7XG5jb25zdCBfZ2V0Q2FsZW5kYXJzID0gXCJnZXRDYWxlbmRhcnNcIjtcbmNvbnN0IF9nZXRDYWxFdmVudHMgPSBcImdldENhbEV2ZW50c1wiO1xuXG5leHBvcnQgY29uc3QgbXNnVHlwZSA9IE9iamVjdC5mcmVlemUoe1xuICAgIHVwZGF0ZVBhdHRlcm5zOiBTeW1ib2woX3VwZGF0ZVBhdHRlcm5zKSxcbiAgICBnZXRQYXR0ZXJuczogU3ltYm9sKF9nZXRQYXR0ZXJucyksXG4gICAgdXBkYXRlQ2FsZW5kYXJzOiBTeW1ib2woX3VwZGF0ZUNhbGVuZGFycyksXG4gICAgZ2V0Q2FsZW5kYXJzOiBTeW1ib2woX2dldENhbGVuZGFycyksXG4gICAgZ2V0Q2FsRXZlbnRzOiBTeW1ib2woX2dldENhbEV2ZW50cyksXG59KTtcblxuZnVuY3Rpb24gc3RyaW5naWZ5TXNnVHlwZShtdCkge1xuICAgIHN3aXRjaCAobXQpIHtcbiAgICAgICAgY2FzZSBtc2dUeXBlLnVwZGF0ZVBhdHRlcm5zOiByZXR1cm4gX3VwZGF0ZVBhdHRlcm5zO1xuICAgICAgICBjYXNlIG1zZ1R5cGUuZ2V0UGF0dGVybnM6IHJldHVybiBfZ2V0UGF0dGVybnM7XG4gICAgICAgIGNhc2UgbXNnVHlwZS51cGRhdGVDYWxlbmRhcnM6IHJldHVybiBfdXBkYXRlQ2FsZW5kYXJzO1xuICAgICAgICBjYXNlIG1zZ1R5cGUuZ2V0Q2FsZW5kYXJzOiByZXR1cm4gX2dldENhbGVuZGFycztcbiAgICAgICAgY2FzZSBtc2dUeXBlLmdldENhbEV2ZW50czogcmV0dXJuIF9nZXRDYWxFdmVudHM7XG4gICAgICAgIGRlZmF1bHQ6IGNvbnNvbGUuZXJyb3IoXCJ1bnJlYWNoYWJsZVwiKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHBhcnNlTXNnVHlwZShzKSB7XG4gICAgc3dpdGNoKHMpIHtcbiAgICAgICAgY2FzZSBfdXBkYXRlUGF0dGVybnM6IHJldHVybiBtc2dUeXBlLnVwZGF0ZVBhdHRlcm5zO1xuICAgICAgICBjYXNlIF9nZXRQYXR0ZXJuczogcmV0dXJuIG1zZ1R5cGUuZ2V0UGF0dGVybnM7XG4gICAgICAgIGNhc2UgX3VwZGF0ZUNhbGVuZGFyczogcmV0dXJuIG1zZ1R5cGUudXBkYXRlQ2FsZW5kYXJzO1xuICAgICAgICBjYXNlIF9nZXRDYWxlbmRhcnM6IHJldHVybiBtc2dUeXBlLmdldENhbGVuZGFycztcbiAgICAgICAgY2FzZSBfZ2V0Q2FsRXZlbnRzOiByZXR1cm4gbXNnVHlwZS5nZXRDYWxFdmVudHM7XG4gICAgICAgIGRlZmF1bHQ6IGNvbnNvbGUuZXJyb3IoXCJ1bnJlYWNoYWJsZVwiKTtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBNc2cge1xuICAgIGNvbnN0cnVjdG9yKGlkLCB0eXBlLCBkYXRhKSB7XG4gICAgICAgIHRoaXMuaWQgPSBpZDtcbiAgICAgICAgdGhpcy50eXBlID0gdHlwZTtcbiAgICAgICAgdGhpcy5kYXRhID0gZGF0YTtcbiAgICB9XG4gICAgZ2VuUmVzcChkYXRhKSB7IHJldHVybiBuZXcgTXNnKHRoaXMuaWQsIHRoaXMudHlwZSwgZGF0YSk7IH1cbiAgICBkZWZsYXRlKCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaWQ6IHRoaXMuaWQsXG4gICAgICAgICAgICB0eXBlOiBzdHJpbmdpZnlNc2dUeXBlKHRoaXMudHlwZSksXG4gICAgICAgICAgICBkYXRhOiB0aGlzLmRhdGFcbiAgICAgICAgfVxuICAgIH1cbiAgICBzdGF0aWMgaW5mbGF0ZSA9IG9iaiA9PiBuZXcgTXNnKG9iai5pZCwgcGFyc2VNc2dUeXBlKG9iai50eXBlKSwgb2JqLmRhdGEpO1xufVxuXG5leHBvcnQgY2xhc3MgTXNnQ2xpZW50IHtcbiAgICBjb25zdHJ1Y3RvcihjaGFubmVsTmFtZSkge1xuICAgICAgICBsZXQgcG9ydCA9IGNocm9tZS5ydW50aW1lLmNvbm5lY3Qoe25hbWU6IGNoYW5uZWxOYW1lfSk7XG4gICAgICAgIGNvbnN0IGdldENhbGxCYWNrID0gcmNiID0+IHRoaXMucmVxdWVzdENhbGxiYWNrO1xuICAgICAgICBwb3J0Lm9uTWVzc2FnZS5hZGRMaXN0ZW5lcihmdW5jdGlvbihtc2cpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKG1zZyk7XG4gICAgICAgICAgICBsZXQgcmNiID0gZ2V0Q2FsbEJhY2sobXNnLnR5cGUpO1xuICAgICAgICAgICAgbGV0IGNiID0gcmNiLmluRmxpZ2h0W21zZy5pZF07XG4gICAgICAgICAgICBjb25zb2xlLmFzc2VydChjYiAhPT0gdW5kZWZpbmVkKTtcbiAgICAgICAgICAgIHJjYi5pZHMucHVzaChtc2cuaWQpO1xuICAgICAgICAgICAgY2IobXNnKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMucG9ydCA9IHBvcnQ7XG4gICAgICAgIHRoaXMucmVxdWVzdENhbGxiYWNrID0ge2luRmxpZ2h0OiB7fSwgaWRzOiBbXSwgbWF4SWQ6IDB9O1xuICAgIH1cblxuICAgIHNlbmRNc2cgPSAoeyB0eXBlLCBkYXRhIH0pID0+IHtcbiAgICAgICAgbGV0IHJjYiA9IHRoaXMucmVxdWVzdENhbGxiYWNrO1xuICAgICAgICBsZXQgY2I7XG4gICAgICAgIGxldCBwbSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4geyBjYiA9IHJlc29sdmU7IH0pO1xuICAgICAgICBsZXQgaWQ7XG4gICAgICAgIGlmIChyY2IuaWRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlkID0gcmNiLmlkcy5wb3AoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlkID0gcmNiLm1heElkKys7XG4gICAgICAgIH1cbiAgICAgICAgcmNiLmluRmxpZ2h0W2lkXSA9IGNiO1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2UoKG5ldyBNc2coaWQsIHR5cGUsIGRhdGEpKS5kZWZsYXRlKCkpO1xuICAgICAgICByZXR1cm4gcG07XG4gICAgfVxufVxuIl19
