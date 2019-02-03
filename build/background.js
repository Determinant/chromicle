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

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

var patterns = [];
var calendars = {};
var calData = {};
chrome.runtime.onConnect.addListener(function (port) {
  console.assert(port.name == 'main');
  port.onMessage.addListener(function (msg) {
    console.log(msg);

    if (msg.type == 0) {
      patterns = msg.data;
    } else if (msg.type == 1) {
      port.postMessage({
        id: msg.id,
        type: 1,
        data: patterns
      });
    } else if (msg.type == 2) {
      calendars = msg.data;
    } else if (msg.type == 3) {
      port.postMessage({
        id: msg.id,
        type: 3,
        data: calendars
      });
    } else if (msg.type == 4) {
      calData[msg.data.id].getEvents(new Date(msg.data.start), new Date(msg.data.end)).catch(function (e) {
        console.log("cannot load calendar ".concat(msg.data.id), e);
        return [];
      }).then(function (data) {
        console.log(data);
        var resp = {
          id: msg.id,
          type: 4,
          data: data.map(function (e) {
            return {
              id: e.id,
              start: e.start.getTime(),
              end: e.end.getTime()
            };
          })
        };
        console.log(resp);
        port.postMessage(resp);
      });
    } else if (msg.type == 5) {
      calendars = msg.data;

      for (var id in calendars) {
        if (!calData.hasOwnProperty(id)) calData[id] = new gapi.GCalendar(id, calendars[id].summary);
      }
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

},{"./gapi":5}],5:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getAuthToken = getAuthToken;
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
var GApiError = {
  invalidSyncToken: 1,
  otherError: 2
};

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

function getAuthToken() {
  return new Promise(function (resolver) {
    return chrome.identity.getAuthToken({
      interactive: true
    }, function (token) {
      return resolver(token);
    });
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
      if (response.status === 200) return response.json();else if (response.status === 410) throw GApiError.invalidSyncToken;else throw GApiError.otherErrors;
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
    this.token = getAuthToken();
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
          _this3.syncToken = r.nextSyncToken;
          var pm_results = r.results.map(function (e) {
            return e.start ? Promise.resolve(e) : getEvent(_this3.calId, e.id, token);
          });
          return Promise.all(pm_results).then(function (results) {
            return results.forEach(function (e) {
              e.start = new Date(e.start.dateTime);
              e.end = new Date(e.end.dateTime);
              if (e.status === 'confirmed') _this3.addEvent(e);else if (e.status === 'cancelled') _this3.removeEvent(e);
            });
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
            if (_this4.syncToken === '') _this4.syncToken = r.nextSyncToken;
            return r.results.forEach(function (e) {
              if (e.status === 'confirmed') {
                console.assert(e.start);
                e.start = new Date(e.start.dateTime);
                e.end = new Date(e.end.dateTime);

                _this4.addEvent(e, true);
              }
            });
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
  }]);

  return GCalendar;
}();

exports.GCalendar = GCalendar;

},{"lru-cache":1}]},{},[4])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvbHJ1LWNhY2hlL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3lhbGxpc3QvaXRlcmF0b3IuanMiLCJub2RlX21vZHVsZXMveWFsbGlzdC95YWxsaXN0LmpzIiwic3JjL2JhY2tncm91bmQuanMiLCJzcmMvZ2FwaS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOVVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FB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Iiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIid1c2Ugc3RyaWN0J1xuXG4vLyBBIGxpbmtlZCBsaXN0IHRvIGtlZXAgdHJhY2sgb2YgcmVjZW50bHktdXNlZC1uZXNzXG5jb25zdCBZYWxsaXN0ID0gcmVxdWlyZSgneWFsbGlzdCcpXG5cbmNvbnN0IE1BWCA9IFN5bWJvbCgnbWF4JylcbmNvbnN0IExFTkdUSCA9IFN5bWJvbCgnbGVuZ3RoJylcbmNvbnN0IExFTkdUSF9DQUxDVUxBVE9SID0gU3ltYm9sKCdsZW5ndGhDYWxjdWxhdG9yJylcbmNvbnN0IEFMTE9XX1NUQUxFID0gU3ltYm9sKCdhbGxvd1N0YWxlJylcbmNvbnN0IE1BWF9BR0UgPSBTeW1ib2woJ21heEFnZScpXG5jb25zdCBESVNQT1NFID0gU3ltYm9sKCdkaXNwb3NlJylcbmNvbnN0IE5PX0RJU1BPU0VfT05fU0VUID0gU3ltYm9sKCdub0Rpc3Bvc2VPblNldCcpXG5jb25zdCBMUlVfTElTVCA9IFN5bWJvbCgnbHJ1TGlzdCcpXG5jb25zdCBDQUNIRSA9IFN5bWJvbCgnY2FjaGUnKVxuY29uc3QgVVBEQVRFX0FHRV9PTl9HRVQgPSBTeW1ib2woJ3VwZGF0ZUFnZU9uR2V0JylcblxuY29uc3QgbmFpdmVMZW5ndGggPSAoKSA9PiAxXG5cbi8vIGxydUxpc3QgaXMgYSB5YWxsaXN0IHdoZXJlIHRoZSBoZWFkIGlzIHRoZSB5b3VuZ2VzdFxuLy8gaXRlbSwgYW5kIHRoZSB0YWlsIGlzIHRoZSBvbGRlc3QuICB0aGUgbGlzdCBjb250YWlucyB0aGUgSGl0XG4vLyBvYmplY3RzIGFzIHRoZSBlbnRyaWVzLlxuLy8gRWFjaCBIaXQgb2JqZWN0IGhhcyBhIHJlZmVyZW5jZSB0byBpdHMgWWFsbGlzdC5Ob2RlLiAgVGhpc1xuLy8gbmV2ZXIgY2hhbmdlcy5cbi8vXG4vLyBjYWNoZSBpcyBhIE1hcCAob3IgUHNldWRvTWFwKSB0aGF0IG1hdGNoZXMgdGhlIGtleXMgdG9cbi8vIHRoZSBZYWxsaXN0Lk5vZGUgb2JqZWN0LlxuY2xhc3MgTFJVQ2FjaGUge1xuICBjb25zdHJ1Y3RvciAob3B0aW9ucykge1xuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ251bWJlcicpXG4gICAgICBvcHRpb25zID0geyBtYXg6IG9wdGlvbnMgfVxuXG4gICAgaWYgKCFvcHRpb25zKVxuICAgICAgb3B0aW9ucyA9IHt9XG5cbiAgICBpZiAob3B0aW9ucy5tYXggJiYgKHR5cGVvZiBvcHRpb25zLm1heCAhPT0gJ251bWJlcicgfHwgb3B0aW9ucy5tYXggPCAwKSlcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ21heCBtdXN0IGJlIGEgbm9uLW5lZ2F0aXZlIG51bWJlcicpXG4gICAgLy8gS2luZCBvZiB3ZWlyZCB0byBoYXZlIGEgZGVmYXVsdCBtYXggb2YgSW5maW5pdHksIGJ1dCBvaCB3ZWxsLlxuICAgIGNvbnN0IG1heCA9IHRoaXNbTUFYXSA9IG9wdGlvbnMubWF4IHx8IEluZmluaXR5XG5cbiAgICBjb25zdCBsYyA9IG9wdGlvbnMubGVuZ3RoIHx8IG5haXZlTGVuZ3RoXG4gICAgdGhpc1tMRU5HVEhfQ0FMQ1VMQVRPUl0gPSAodHlwZW9mIGxjICE9PSAnZnVuY3Rpb24nKSA/IG5haXZlTGVuZ3RoIDogbGNcbiAgICB0aGlzW0FMTE9XX1NUQUxFXSA9IG9wdGlvbnMuc3RhbGUgfHwgZmFsc2VcbiAgICBpZiAob3B0aW9ucy5tYXhBZ2UgJiYgdHlwZW9mIG9wdGlvbnMubWF4QWdlICE9PSAnbnVtYmVyJylcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ21heEFnZSBtdXN0IGJlIGEgbnVtYmVyJylcbiAgICB0aGlzW01BWF9BR0VdID0gb3B0aW9ucy5tYXhBZ2UgfHwgMFxuICAgIHRoaXNbRElTUE9TRV0gPSBvcHRpb25zLmRpc3Bvc2VcbiAgICB0aGlzW05PX0RJU1BPU0VfT05fU0VUXSA9IG9wdGlvbnMubm9EaXNwb3NlT25TZXQgfHwgZmFsc2VcbiAgICB0aGlzW1VQREFURV9BR0VfT05fR0VUXSA9IG9wdGlvbnMudXBkYXRlQWdlT25HZXQgfHwgZmFsc2VcbiAgICB0aGlzLnJlc2V0KClcbiAgfVxuXG4gIC8vIHJlc2l6ZSB0aGUgY2FjaGUgd2hlbiB0aGUgbWF4IGNoYW5nZXMuXG4gIHNldCBtYXggKG1MKSB7XG4gICAgaWYgKHR5cGVvZiBtTCAhPT0gJ251bWJlcicgfHwgbUwgPCAwKVxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbWF4IG11c3QgYmUgYSBub24tbmVnYXRpdmUgbnVtYmVyJylcblxuICAgIHRoaXNbTUFYXSA9IG1MIHx8IEluZmluaXR5XG4gICAgdHJpbSh0aGlzKVxuICB9XG4gIGdldCBtYXggKCkge1xuICAgIHJldHVybiB0aGlzW01BWF1cbiAgfVxuXG4gIHNldCBhbGxvd1N0YWxlIChhbGxvd1N0YWxlKSB7XG4gICAgdGhpc1tBTExPV19TVEFMRV0gPSAhIWFsbG93U3RhbGVcbiAgfVxuICBnZXQgYWxsb3dTdGFsZSAoKSB7XG4gICAgcmV0dXJuIHRoaXNbQUxMT1dfU1RBTEVdXG4gIH1cblxuICBzZXQgbWF4QWdlIChtQSkge1xuICAgIGlmICh0eXBlb2YgbUEgIT09ICdudW1iZXInKVxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbWF4QWdlIG11c3QgYmUgYSBub24tbmVnYXRpdmUgbnVtYmVyJylcblxuICAgIHRoaXNbTUFYX0FHRV0gPSBtQVxuICAgIHRyaW0odGhpcylcbiAgfVxuICBnZXQgbWF4QWdlICgpIHtcbiAgICByZXR1cm4gdGhpc1tNQVhfQUdFXVxuICB9XG5cbiAgLy8gcmVzaXplIHRoZSBjYWNoZSB3aGVuIHRoZSBsZW5ndGhDYWxjdWxhdG9yIGNoYW5nZXMuXG4gIHNldCBsZW5ndGhDYWxjdWxhdG9yIChsQykge1xuICAgIGlmICh0eXBlb2YgbEMgIT09ICdmdW5jdGlvbicpXG4gICAgICBsQyA9IG5haXZlTGVuZ3RoXG5cbiAgICBpZiAobEMgIT09IHRoaXNbTEVOR1RIX0NBTENVTEFUT1JdKSB7XG4gICAgICB0aGlzW0xFTkdUSF9DQUxDVUxBVE9SXSA9IGxDXG4gICAgICB0aGlzW0xFTkdUSF0gPSAwXG4gICAgICB0aGlzW0xSVV9MSVNUXS5mb3JFYWNoKGhpdCA9PiB7XG4gICAgICAgIGhpdC5sZW5ndGggPSB0aGlzW0xFTkdUSF9DQUxDVUxBVE9SXShoaXQudmFsdWUsIGhpdC5rZXkpXG4gICAgICAgIHRoaXNbTEVOR1RIXSArPSBoaXQubGVuZ3RoXG4gICAgICB9KVxuICAgIH1cbiAgICB0cmltKHRoaXMpXG4gIH1cbiAgZ2V0IGxlbmd0aENhbGN1bGF0b3IgKCkgeyByZXR1cm4gdGhpc1tMRU5HVEhfQ0FMQ1VMQVRPUl0gfVxuXG4gIGdldCBsZW5ndGggKCkgeyByZXR1cm4gdGhpc1tMRU5HVEhdIH1cbiAgZ2V0IGl0ZW1Db3VudCAoKSB7IHJldHVybiB0aGlzW0xSVV9MSVNUXS5sZW5ndGggfVxuXG4gIHJmb3JFYWNoIChmbiwgdGhpc3ApIHtcbiAgICB0aGlzcCA9IHRoaXNwIHx8IHRoaXNcbiAgICBmb3IgKGxldCB3YWxrZXIgPSB0aGlzW0xSVV9MSVNUXS50YWlsOyB3YWxrZXIgIT09IG51bGw7KSB7XG4gICAgICBjb25zdCBwcmV2ID0gd2Fsa2VyLnByZXZcbiAgICAgIGZvckVhY2hTdGVwKHRoaXMsIGZuLCB3YWxrZXIsIHRoaXNwKVxuICAgICAgd2Fsa2VyID0gcHJldlxuICAgIH1cbiAgfVxuXG4gIGZvckVhY2ggKGZuLCB0aGlzcCkge1xuICAgIHRoaXNwID0gdGhpc3AgfHwgdGhpc1xuICAgIGZvciAobGV0IHdhbGtlciA9IHRoaXNbTFJVX0xJU1RdLmhlYWQ7IHdhbGtlciAhPT0gbnVsbDspIHtcbiAgICAgIGNvbnN0IG5leHQgPSB3YWxrZXIubmV4dFxuICAgICAgZm9yRWFjaFN0ZXAodGhpcywgZm4sIHdhbGtlciwgdGhpc3ApXG4gICAgICB3YWxrZXIgPSBuZXh0XG4gICAgfVxuICB9XG5cbiAga2V5cyAoKSB7XG4gICAgcmV0dXJuIHRoaXNbTFJVX0xJU1RdLnRvQXJyYXkoKS5tYXAoayA9PiBrLmtleSlcbiAgfVxuXG4gIHZhbHVlcyAoKSB7XG4gICAgcmV0dXJuIHRoaXNbTFJVX0xJU1RdLnRvQXJyYXkoKS5tYXAoayA9PiBrLnZhbHVlKVxuICB9XG5cbiAgcmVzZXQgKCkge1xuICAgIGlmICh0aGlzW0RJU1BPU0VdICYmXG4gICAgICAgIHRoaXNbTFJVX0xJU1RdICYmXG4gICAgICAgIHRoaXNbTFJVX0xJU1RdLmxlbmd0aCkge1xuICAgICAgdGhpc1tMUlVfTElTVF0uZm9yRWFjaChoaXQgPT4gdGhpc1tESVNQT1NFXShoaXQua2V5LCBoaXQudmFsdWUpKVxuICAgIH1cblxuICAgIHRoaXNbQ0FDSEVdID0gbmV3IE1hcCgpIC8vIGhhc2ggb2YgaXRlbXMgYnkga2V5XG4gICAgdGhpc1tMUlVfTElTVF0gPSBuZXcgWWFsbGlzdCgpIC8vIGxpc3Qgb2YgaXRlbXMgaW4gb3JkZXIgb2YgdXNlIHJlY2VuY3lcbiAgICB0aGlzW0xFTkdUSF0gPSAwIC8vIGxlbmd0aCBvZiBpdGVtcyBpbiB0aGUgbGlzdFxuICB9XG5cbiAgZHVtcCAoKSB7XG4gICAgcmV0dXJuIHRoaXNbTFJVX0xJU1RdLm1hcChoaXQgPT5cbiAgICAgIGlzU3RhbGUodGhpcywgaGl0KSA/IGZhbHNlIDoge1xuICAgICAgICBrOiBoaXQua2V5LFxuICAgICAgICB2OiBoaXQudmFsdWUsXG4gICAgICAgIGU6IGhpdC5ub3cgKyAoaGl0Lm1heEFnZSB8fCAwKVxuICAgICAgfSkudG9BcnJheSgpLmZpbHRlcihoID0+IGgpXG4gIH1cblxuICBkdW1wTHJ1ICgpIHtcbiAgICByZXR1cm4gdGhpc1tMUlVfTElTVF1cbiAgfVxuXG4gIHNldCAoa2V5LCB2YWx1ZSwgbWF4QWdlKSB7XG4gICAgbWF4QWdlID0gbWF4QWdlIHx8IHRoaXNbTUFYX0FHRV1cblxuICAgIGlmIChtYXhBZ2UgJiYgdHlwZW9mIG1heEFnZSAhPT0gJ251bWJlcicpXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtYXhBZ2UgbXVzdCBiZSBhIG51bWJlcicpXG5cbiAgICBjb25zdCBub3cgPSBtYXhBZ2UgPyBEYXRlLm5vdygpIDogMFxuICAgIGNvbnN0IGxlbiA9IHRoaXNbTEVOR1RIX0NBTENVTEFUT1JdKHZhbHVlLCBrZXkpXG5cbiAgICBpZiAodGhpc1tDQUNIRV0uaGFzKGtleSkpIHtcbiAgICAgIGlmIChsZW4gPiB0aGlzW01BWF0pIHtcbiAgICAgICAgZGVsKHRoaXMsIHRoaXNbQ0FDSEVdLmdldChrZXkpKVxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgIH1cblxuICAgICAgY29uc3Qgbm9kZSA9IHRoaXNbQ0FDSEVdLmdldChrZXkpXG4gICAgICBjb25zdCBpdGVtID0gbm9kZS52YWx1ZVxuXG4gICAgICAvLyBkaXNwb3NlIG9mIHRoZSBvbGQgb25lIGJlZm9yZSBvdmVyd3JpdGluZ1xuICAgICAgLy8gc3BsaXQgb3V0IGludG8gMiBpZnMgZm9yIGJldHRlciBjb3ZlcmFnZSB0cmFja2luZ1xuICAgICAgaWYgKHRoaXNbRElTUE9TRV0pIHtcbiAgICAgICAgaWYgKCF0aGlzW05PX0RJU1BPU0VfT05fU0VUXSlcbiAgICAgICAgICB0aGlzW0RJU1BPU0VdKGtleSwgaXRlbS52YWx1ZSlcbiAgICAgIH1cblxuICAgICAgaXRlbS5ub3cgPSBub3dcbiAgICAgIGl0ZW0ubWF4QWdlID0gbWF4QWdlXG4gICAgICBpdGVtLnZhbHVlID0gdmFsdWVcbiAgICAgIHRoaXNbTEVOR1RIXSArPSBsZW4gLSBpdGVtLmxlbmd0aFxuICAgICAgaXRlbS5sZW5ndGggPSBsZW5cbiAgICAgIHRoaXMuZ2V0KGtleSlcbiAgICAgIHRyaW0odGhpcylcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgY29uc3QgaGl0ID0gbmV3IEVudHJ5KGtleSwgdmFsdWUsIGxlbiwgbm93LCBtYXhBZ2UpXG5cbiAgICAvLyBvdmVyc2l6ZWQgb2JqZWN0cyBmYWxsIG91dCBvZiBjYWNoZSBhdXRvbWF0aWNhbGx5LlxuICAgIGlmIChoaXQubGVuZ3RoID4gdGhpc1tNQVhdKSB7XG4gICAgICBpZiAodGhpc1tESVNQT1NFXSlcbiAgICAgICAgdGhpc1tESVNQT1NFXShrZXksIHZhbHVlKVxuXG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICB0aGlzW0xFTkdUSF0gKz0gaGl0Lmxlbmd0aFxuICAgIHRoaXNbTFJVX0xJU1RdLnVuc2hpZnQoaGl0KVxuICAgIHRoaXNbQ0FDSEVdLnNldChrZXksIHRoaXNbTFJVX0xJU1RdLmhlYWQpXG4gICAgdHJpbSh0aGlzKVxuICAgIHJldHVybiB0cnVlXG4gIH1cblxuICBoYXMgKGtleSkge1xuICAgIGlmICghdGhpc1tDQUNIRV0uaGFzKGtleSkpIHJldHVybiBmYWxzZVxuICAgIGNvbnN0IGhpdCA9IHRoaXNbQ0FDSEVdLmdldChrZXkpLnZhbHVlXG4gICAgcmV0dXJuICFpc1N0YWxlKHRoaXMsIGhpdClcbiAgfVxuXG4gIGdldCAoa2V5KSB7XG4gICAgcmV0dXJuIGdldCh0aGlzLCBrZXksIHRydWUpXG4gIH1cblxuICBwZWVrIChrZXkpIHtcbiAgICByZXR1cm4gZ2V0KHRoaXMsIGtleSwgZmFsc2UpXG4gIH1cblxuICBwb3AgKCkge1xuICAgIGNvbnN0IG5vZGUgPSB0aGlzW0xSVV9MSVNUXS50YWlsXG4gICAgaWYgKCFub2RlKVxuICAgICAgcmV0dXJuIG51bGxcblxuICAgIGRlbCh0aGlzLCBub2RlKVxuICAgIHJldHVybiBub2RlLnZhbHVlXG4gIH1cblxuICBkZWwgKGtleSkge1xuICAgIGRlbCh0aGlzLCB0aGlzW0NBQ0hFXS5nZXQoa2V5KSlcbiAgfVxuXG4gIGxvYWQgKGFycikge1xuICAgIC8vIHJlc2V0IHRoZSBjYWNoZVxuICAgIHRoaXMucmVzZXQoKVxuXG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKVxuICAgIC8vIEEgcHJldmlvdXMgc2VyaWFsaXplZCBjYWNoZSBoYXMgdGhlIG1vc3QgcmVjZW50IGl0ZW1zIGZpcnN0XG4gICAgZm9yIChsZXQgbCA9IGFyci5sZW5ndGggLSAxOyBsID49IDA7IGwtLSkge1xuICAgICAgY29uc3QgaGl0ID0gYXJyW2xdXG4gICAgICBjb25zdCBleHBpcmVzQXQgPSBoaXQuZSB8fCAwXG4gICAgICBpZiAoZXhwaXJlc0F0ID09PSAwKVxuICAgICAgICAvLyB0aGUgaXRlbSB3YXMgY3JlYXRlZCB3aXRob3V0IGV4cGlyYXRpb24gaW4gYSBub24gYWdlZCBjYWNoZVxuICAgICAgICB0aGlzLnNldChoaXQuaywgaGl0LnYpXG4gICAgICBlbHNlIHtcbiAgICAgICAgY29uc3QgbWF4QWdlID0gZXhwaXJlc0F0IC0gbm93XG4gICAgICAgIC8vIGRvbnQgYWRkIGFscmVhZHkgZXhwaXJlZCBpdGVtc1xuICAgICAgICBpZiAobWF4QWdlID4gMCkge1xuICAgICAgICAgIHRoaXMuc2V0KGhpdC5rLCBoaXQudiwgbWF4QWdlKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJ1bmUgKCkge1xuICAgIHRoaXNbQ0FDSEVdLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IGdldCh0aGlzLCBrZXksIGZhbHNlKSlcbiAgfVxufVxuXG5jb25zdCBnZXQgPSAoc2VsZiwga2V5LCBkb1VzZSkgPT4ge1xuICBjb25zdCBub2RlID0gc2VsZltDQUNIRV0uZ2V0KGtleSlcbiAgaWYgKG5vZGUpIHtcbiAgICBjb25zdCBoaXQgPSBub2RlLnZhbHVlXG4gICAgaWYgKGlzU3RhbGUoc2VsZiwgaGl0KSkge1xuICAgICAgZGVsKHNlbGYsIG5vZGUpXG4gICAgICBpZiAoIXNlbGZbQUxMT1dfU1RBTEVdKVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChkb1VzZSkge1xuICAgICAgICBpZiAoc2VsZltVUERBVEVfQUdFX09OX0dFVF0pXG4gICAgICAgICAgbm9kZS52YWx1ZS5ub3cgPSBEYXRlLm5vdygpXG4gICAgICAgIHNlbGZbTFJVX0xJU1RdLnVuc2hpZnROb2RlKG5vZGUpXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBoaXQudmFsdWVcbiAgfVxufVxuXG5jb25zdCBpc1N0YWxlID0gKHNlbGYsIGhpdCkgPT4ge1xuICBpZiAoIWhpdCB8fCAoIWhpdC5tYXhBZ2UgJiYgIXNlbGZbTUFYX0FHRV0pKVxuICAgIHJldHVybiBmYWxzZVxuXG4gIGNvbnN0IGRpZmYgPSBEYXRlLm5vdygpIC0gaGl0Lm5vd1xuICByZXR1cm4gaGl0Lm1heEFnZSA/IGRpZmYgPiBoaXQubWF4QWdlXG4gICAgOiBzZWxmW01BWF9BR0VdICYmIChkaWZmID4gc2VsZltNQVhfQUdFXSlcbn1cblxuY29uc3QgdHJpbSA9IHNlbGYgPT4ge1xuICBpZiAoc2VsZltMRU5HVEhdID4gc2VsZltNQVhdKSB7XG4gICAgZm9yIChsZXQgd2Fsa2VyID0gc2VsZltMUlVfTElTVF0udGFpbDtcbiAgICAgIHNlbGZbTEVOR1RIXSA+IHNlbGZbTUFYXSAmJiB3YWxrZXIgIT09IG51bGw7KSB7XG4gICAgICAvLyBXZSBrbm93IHRoYXQgd2UncmUgYWJvdXQgdG8gZGVsZXRlIHRoaXMgb25lLCBhbmQgYWxzb1xuICAgICAgLy8gd2hhdCB0aGUgbmV4dCBsZWFzdCByZWNlbnRseSB1c2VkIGtleSB3aWxsIGJlLCBzbyBqdXN0XG4gICAgICAvLyBnbyBhaGVhZCBhbmQgc2V0IGl0IG5vdy5cbiAgICAgIGNvbnN0IHByZXYgPSB3YWxrZXIucHJldlxuICAgICAgZGVsKHNlbGYsIHdhbGtlcilcbiAgICAgIHdhbGtlciA9IHByZXZcbiAgICB9XG4gIH1cbn1cblxuY29uc3QgZGVsID0gKHNlbGYsIG5vZGUpID0+IHtcbiAgaWYgKG5vZGUpIHtcbiAgICBjb25zdCBoaXQgPSBub2RlLnZhbHVlXG4gICAgaWYgKHNlbGZbRElTUE9TRV0pXG4gICAgICBzZWxmW0RJU1BPU0VdKGhpdC5rZXksIGhpdC52YWx1ZSlcblxuICAgIHNlbGZbTEVOR1RIXSAtPSBoaXQubGVuZ3RoXG4gICAgc2VsZltDQUNIRV0uZGVsZXRlKGhpdC5rZXkpXG4gICAgc2VsZltMUlVfTElTVF0ucmVtb3ZlTm9kZShub2RlKVxuICB9XG59XG5cbmNsYXNzIEVudHJ5IHtcbiAgY29uc3RydWN0b3IgKGtleSwgdmFsdWUsIGxlbmd0aCwgbm93LCBtYXhBZ2UpIHtcbiAgICB0aGlzLmtleSA9IGtleVxuICAgIHRoaXMudmFsdWUgPSB2YWx1ZVxuICAgIHRoaXMubGVuZ3RoID0gbGVuZ3RoXG4gICAgdGhpcy5ub3cgPSBub3dcbiAgICB0aGlzLm1heEFnZSA9IG1heEFnZSB8fCAwXG4gIH1cbn1cblxuY29uc3QgZm9yRWFjaFN0ZXAgPSAoc2VsZiwgZm4sIG5vZGUsIHRoaXNwKSA9PiB7XG4gIGxldCBoaXQgPSBub2RlLnZhbHVlXG4gIGlmIChpc1N0YWxlKHNlbGYsIGhpdCkpIHtcbiAgICBkZWwoc2VsZiwgbm9kZSlcbiAgICBpZiAoIXNlbGZbQUxMT1dfU1RBTEVdKVxuICAgICAgaGl0ID0gdW5kZWZpbmVkXG4gIH1cbiAgaWYgKGhpdClcbiAgICBmbi5jYWxsKHRoaXNwLCBoaXQudmFsdWUsIGhpdC5rZXksIHNlbGYpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gTFJVQ2FjaGVcbiIsIid1c2Ugc3RyaWN0J1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoWWFsbGlzdCkge1xuICBZYWxsaXN0LnByb3RvdHlwZVtTeW1ib2wuaXRlcmF0b3JdID0gZnVuY3Rpb24qICgpIHtcbiAgICBmb3IgKGxldCB3YWxrZXIgPSB0aGlzLmhlYWQ7IHdhbGtlcjsgd2Fsa2VyID0gd2Fsa2VyLm5leHQpIHtcbiAgICAgIHlpZWxkIHdhbGtlci52YWx1ZVxuICAgIH1cbiAgfVxufVxuIiwiJ3VzZSBzdHJpY3QnXG5tb2R1bGUuZXhwb3J0cyA9IFlhbGxpc3RcblxuWWFsbGlzdC5Ob2RlID0gTm9kZVxuWWFsbGlzdC5jcmVhdGUgPSBZYWxsaXN0XG5cbmZ1bmN0aW9uIFlhbGxpc3QgKGxpc3QpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIGlmICghKHNlbGYgaW5zdGFuY2VvZiBZYWxsaXN0KSkge1xuICAgIHNlbGYgPSBuZXcgWWFsbGlzdCgpXG4gIH1cblxuICBzZWxmLnRhaWwgPSBudWxsXG4gIHNlbGYuaGVhZCA9IG51bGxcbiAgc2VsZi5sZW5ndGggPSAwXG5cbiAgaWYgKGxpc3QgJiYgdHlwZW9mIGxpc3QuZm9yRWFjaCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIGxpc3QuZm9yRWFjaChmdW5jdGlvbiAoaXRlbSkge1xuICAgICAgc2VsZi5wdXNoKGl0ZW0pXG4gICAgfSlcbiAgfSBlbHNlIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMCkge1xuICAgIGZvciAodmFyIGkgPSAwLCBsID0gYXJndW1lbnRzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgc2VsZi5wdXNoKGFyZ3VtZW50c1tpXSlcbiAgICB9XG4gIH1cblxuICByZXR1cm4gc2VsZlxufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5yZW1vdmVOb2RlID0gZnVuY3Rpb24gKG5vZGUpIHtcbiAgaWYgKG5vZGUubGlzdCAhPT0gdGhpcykge1xuICAgIHRocm93IG5ldyBFcnJvcigncmVtb3Zpbmcgbm9kZSB3aGljaCBkb2VzIG5vdCBiZWxvbmcgdG8gdGhpcyBsaXN0JylcbiAgfVxuXG4gIHZhciBuZXh0ID0gbm9kZS5uZXh0XG4gIHZhciBwcmV2ID0gbm9kZS5wcmV2XG5cbiAgaWYgKG5leHQpIHtcbiAgICBuZXh0LnByZXYgPSBwcmV2XG4gIH1cblxuICBpZiAocHJldikge1xuICAgIHByZXYubmV4dCA9IG5leHRcbiAgfVxuXG4gIGlmIChub2RlID09PSB0aGlzLmhlYWQpIHtcbiAgICB0aGlzLmhlYWQgPSBuZXh0XG4gIH1cbiAgaWYgKG5vZGUgPT09IHRoaXMudGFpbCkge1xuICAgIHRoaXMudGFpbCA9IHByZXZcbiAgfVxuXG4gIG5vZGUubGlzdC5sZW5ndGgtLVxuICBub2RlLm5leHQgPSBudWxsXG4gIG5vZGUucHJldiA9IG51bGxcbiAgbm9kZS5saXN0ID0gbnVsbFxufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS51bnNoaWZ0Tm9kZSA9IGZ1bmN0aW9uIChub2RlKSB7XG4gIGlmIChub2RlID09PSB0aGlzLmhlYWQpIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIGlmIChub2RlLmxpc3QpIHtcbiAgICBub2RlLmxpc3QucmVtb3ZlTm9kZShub2RlKVxuICB9XG5cbiAgdmFyIGhlYWQgPSB0aGlzLmhlYWRcbiAgbm9kZS5saXN0ID0gdGhpc1xuICBub2RlLm5leHQgPSBoZWFkXG4gIGlmIChoZWFkKSB7XG4gICAgaGVhZC5wcmV2ID0gbm9kZVxuICB9XG5cbiAgdGhpcy5oZWFkID0gbm9kZVxuICBpZiAoIXRoaXMudGFpbCkge1xuICAgIHRoaXMudGFpbCA9IG5vZGVcbiAgfVxuICB0aGlzLmxlbmd0aCsrXG59XG5cbllhbGxpc3QucHJvdG90eXBlLnB1c2hOb2RlID0gZnVuY3Rpb24gKG5vZGUpIHtcbiAgaWYgKG5vZGUgPT09IHRoaXMudGFpbCkge1xuICAgIHJldHVyblxuICB9XG5cbiAgaWYgKG5vZGUubGlzdCkge1xuICAgIG5vZGUubGlzdC5yZW1vdmVOb2RlKG5vZGUpXG4gIH1cblxuICB2YXIgdGFpbCA9IHRoaXMudGFpbFxuICBub2RlLmxpc3QgPSB0aGlzXG4gIG5vZGUucHJldiA9IHRhaWxcbiAgaWYgKHRhaWwpIHtcbiAgICB0YWlsLm5leHQgPSBub2RlXG4gIH1cblxuICB0aGlzLnRhaWwgPSBub2RlXG4gIGlmICghdGhpcy5oZWFkKSB7XG4gICAgdGhpcy5oZWFkID0gbm9kZVxuICB9XG4gIHRoaXMubGVuZ3RoKytcbn1cblxuWWFsbGlzdC5wcm90b3R5cGUucHVzaCA9IGZ1bmN0aW9uICgpIHtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBhcmd1bWVudHMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgcHVzaCh0aGlzLCBhcmd1bWVudHNbaV0pXG4gIH1cbiAgcmV0dXJuIHRoaXMubGVuZ3RoXG59XG5cbllhbGxpc3QucHJvdG90eXBlLnVuc2hpZnQgPSBmdW5jdGlvbiAoKSB7XG4gIGZvciAodmFyIGkgPSAwLCBsID0gYXJndW1lbnRzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIHVuc2hpZnQodGhpcywgYXJndW1lbnRzW2ldKVxuICB9XG4gIHJldHVybiB0aGlzLmxlbmd0aFxufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5wb3AgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy50YWlsKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZFxuICB9XG5cbiAgdmFyIHJlcyA9IHRoaXMudGFpbC52YWx1ZVxuICB0aGlzLnRhaWwgPSB0aGlzLnRhaWwucHJldlxuICBpZiAodGhpcy50YWlsKSB7XG4gICAgdGhpcy50YWlsLm5leHQgPSBudWxsXG4gIH0gZWxzZSB7XG4gICAgdGhpcy5oZWFkID0gbnVsbFxuICB9XG4gIHRoaXMubGVuZ3RoLS1cbiAgcmV0dXJuIHJlc1xufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5zaGlmdCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmhlYWQpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkXG4gIH1cblxuICB2YXIgcmVzID0gdGhpcy5oZWFkLnZhbHVlXG4gIHRoaXMuaGVhZCA9IHRoaXMuaGVhZC5uZXh0XG4gIGlmICh0aGlzLmhlYWQpIHtcbiAgICB0aGlzLmhlYWQucHJldiA9IG51bGxcbiAgfSBlbHNlIHtcbiAgICB0aGlzLnRhaWwgPSBudWxsXG4gIH1cbiAgdGhpcy5sZW5ndGgtLVxuICByZXR1cm4gcmVzXG59XG5cbllhbGxpc3QucHJvdG90eXBlLmZvckVhY2ggPSBmdW5jdGlvbiAoZm4sIHRoaXNwKSB7XG4gIHRoaXNwID0gdGhpc3AgfHwgdGhpc1xuICBmb3IgKHZhciB3YWxrZXIgPSB0aGlzLmhlYWQsIGkgPSAwOyB3YWxrZXIgIT09IG51bGw7IGkrKykge1xuICAgIGZuLmNhbGwodGhpc3AsIHdhbGtlci52YWx1ZSwgaSwgdGhpcylcbiAgICB3YWxrZXIgPSB3YWxrZXIubmV4dFxuICB9XG59XG5cbllhbGxpc3QucHJvdG90eXBlLmZvckVhY2hSZXZlcnNlID0gZnVuY3Rpb24gKGZuLCB0aGlzcCkge1xuICB0aGlzcCA9IHRoaXNwIHx8IHRoaXNcbiAgZm9yICh2YXIgd2Fsa2VyID0gdGhpcy50YWlsLCBpID0gdGhpcy5sZW5ndGggLSAxOyB3YWxrZXIgIT09IG51bGw7IGktLSkge1xuICAgIGZuLmNhbGwodGhpc3AsIHdhbGtlci52YWx1ZSwgaSwgdGhpcylcbiAgICB3YWxrZXIgPSB3YWxrZXIucHJldlxuICB9XG59XG5cbllhbGxpc3QucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChuKSB7XG4gIGZvciAodmFyIGkgPSAwLCB3YWxrZXIgPSB0aGlzLmhlYWQ7IHdhbGtlciAhPT0gbnVsbCAmJiBpIDwgbjsgaSsrKSB7XG4gICAgLy8gYWJvcnQgb3V0IG9mIHRoZSBsaXN0IGVhcmx5IGlmIHdlIGhpdCBhIGN5Y2xlXG4gICAgd2Fsa2VyID0gd2Fsa2VyLm5leHRcbiAgfVxuICBpZiAoaSA9PT0gbiAmJiB3YWxrZXIgIT09IG51bGwpIHtcbiAgICByZXR1cm4gd2Fsa2VyLnZhbHVlXG4gIH1cbn1cblxuWWFsbGlzdC5wcm90b3R5cGUuZ2V0UmV2ZXJzZSA9IGZ1bmN0aW9uIChuKSB7XG4gIGZvciAodmFyIGkgPSAwLCB3YWxrZXIgPSB0aGlzLnRhaWw7IHdhbGtlciAhPT0gbnVsbCAmJiBpIDwgbjsgaSsrKSB7XG4gICAgLy8gYWJvcnQgb3V0IG9mIHRoZSBsaXN0IGVhcmx5IGlmIHdlIGhpdCBhIGN5Y2xlXG4gICAgd2Fsa2VyID0gd2Fsa2VyLnByZXZcbiAgfVxuICBpZiAoaSA9PT0gbiAmJiB3YWxrZXIgIT09IG51bGwpIHtcbiAgICByZXR1cm4gd2Fsa2VyLnZhbHVlXG4gIH1cbn1cblxuWWFsbGlzdC5wcm90b3R5cGUubWFwID0gZnVuY3Rpb24gKGZuLCB0aGlzcCkge1xuICB0aGlzcCA9IHRoaXNwIHx8IHRoaXNcbiAgdmFyIHJlcyA9IG5ldyBZYWxsaXN0KClcbiAgZm9yICh2YXIgd2Fsa2VyID0gdGhpcy5oZWFkOyB3YWxrZXIgIT09IG51bGw7KSB7XG4gICAgcmVzLnB1c2goZm4uY2FsbCh0aGlzcCwgd2Fsa2VyLnZhbHVlLCB0aGlzKSlcbiAgICB3YWxrZXIgPSB3YWxrZXIubmV4dFxuICB9XG4gIHJldHVybiByZXNcbn1cblxuWWFsbGlzdC5wcm90b3R5cGUubWFwUmV2ZXJzZSA9IGZ1bmN0aW9uIChmbiwgdGhpc3ApIHtcbiAgdGhpc3AgPSB0aGlzcCB8fCB0aGlzXG4gIHZhciByZXMgPSBuZXcgWWFsbGlzdCgpXG4gIGZvciAodmFyIHdhbGtlciA9IHRoaXMudGFpbDsgd2Fsa2VyICE9PSBudWxsOykge1xuICAgIHJlcy5wdXNoKGZuLmNhbGwodGhpc3AsIHdhbGtlci52YWx1ZSwgdGhpcykpXG4gICAgd2Fsa2VyID0gd2Fsa2VyLnByZXZcbiAgfVxuICByZXR1cm4gcmVzXG59XG5cbllhbGxpc3QucHJvdG90eXBlLnJlZHVjZSA9IGZ1bmN0aW9uIChmbiwgaW5pdGlhbCkge1xuICB2YXIgYWNjXG4gIHZhciB3YWxrZXIgPSB0aGlzLmhlYWRcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgYWNjID0gaW5pdGlhbFxuICB9IGVsc2UgaWYgKHRoaXMuaGVhZCkge1xuICAgIHdhbGtlciA9IHRoaXMuaGVhZC5uZXh0XG4gICAgYWNjID0gdGhpcy5oZWFkLnZhbHVlXG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignUmVkdWNlIG9mIGVtcHR5IGxpc3Qgd2l0aCBubyBpbml0aWFsIHZhbHVlJylcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyB3YWxrZXIgIT09IG51bGw7IGkrKykge1xuICAgIGFjYyA9IGZuKGFjYywgd2Fsa2VyLnZhbHVlLCBpKVxuICAgIHdhbGtlciA9IHdhbGtlci5uZXh0XG4gIH1cblxuICByZXR1cm4gYWNjXG59XG5cbllhbGxpc3QucHJvdG90eXBlLnJlZHVjZVJldmVyc2UgPSBmdW5jdGlvbiAoZm4sIGluaXRpYWwpIHtcbiAgdmFyIGFjY1xuICB2YXIgd2Fsa2VyID0gdGhpcy50YWlsXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgIGFjYyA9IGluaXRpYWxcbiAgfSBlbHNlIGlmICh0aGlzLnRhaWwpIHtcbiAgICB3YWxrZXIgPSB0aGlzLnRhaWwucHJldlxuICAgIGFjYyA9IHRoaXMudGFpbC52YWx1ZVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1JlZHVjZSBvZiBlbXB0eSBsaXN0IHdpdGggbm8gaW5pdGlhbCB2YWx1ZScpXG4gIH1cblxuICBmb3IgKHZhciBpID0gdGhpcy5sZW5ndGggLSAxOyB3YWxrZXIgIT09IG51bGw7IGktLSkge1xuICAgIGFjYyA9IGZuKGFjYywgd2Fsa2VyLnZhbHVlLCBpKVxuICAgIHdhbGtlciA9IHdhbGtlci5wcmV2XG4gIH1cblxuICByZXR1cm4gYWNjXG59XG5cbllhbGxpc3QucHJvdG90eXBlLnRvQXJyYXkgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBhcnIgPSBuZXcgQXJyYXkodGhpcy5sZW5ndGgpXG4gIGZvciAodmFyIGkgPSAwLCB3YWxrZXIgPSB0aGlzLmhlYWQ7IHdhbGtlciAhPT0gbnVsbDsgaSsrKSB7XG4gICAgYXJyW2ldID0gd2Fsa2VyLnZhbHVlXG4gICAgd2Fsa2VyID0gd2Fsa2VyLm5leHRcbiAgfVxuICByZXR1cm4gYXJyXG59XG5cbllhbGxpc3QucHJvdG90eXBlLnRvQXJyYXlSZXZlcnNlID0gZnVuY3Rpb24gKCkge1xuICB2YXIgYXJyID0gbmV3IEFycmF5KHRoaXMubGVuZ3RoKVxuICBmb3IgKHZhciBpID0gMCwgd2Fsa2VyID0gdGhpcy50YWlsOyB3YWxrZXIgIT09IG51bGw7IGkrKykge1xuICAgIGFycltpXSA9IHdhbGtlci52YWx1ZVxuICAgIHdhbGtlciA9IHdhbGtlci5wcmV2XG4gIH1cbiAgcmV0dXJuIGFyclxufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5zbGljZSA9IGZ1bmN0aW9uIChmcm9tLCB0bykge1xuICB0byA9IHRvIHx8IHRoaXMubGVuZ3RoXG4gIGlmICh0byA8IDApIHtcbiAgICB0byArPSB0aGlzLmxlbmd0aFxuICB9XG4gIGZyb20gPSBmcm9tIHx8IDBcbiAgaWYgKGZyb20gPCAwKSB7XG4gICAgZnJvbSArPSB0aGlzLmxlbmd0aFxuICB9XG4gIHZhciByZXQgPSBuZXcgWWFsbGlzdCgpXG4gIGlmICh0byA8IGZyb20gfHwgdG8gPCAwKSB7XG4gICAgcmV0dXJuIHJldFxuICB9XG4gIGlmIChmcm9tIDwgMCkge1xuICAgIGZyb20gPSAwXG4gIH1cbiAgaWYgKHRvID4gdGhpcy5sZW5ndGgpIHtcbiAgICB0byA9IHRoaXMubGVuZ3RoXG4gIH1cbiAgZm9yICh2YXIgaSA9IDAsIHdhbGtlciA9IHRoaXMuaGVhZDsgd2Fsa2VyICE9PSBudWxsICYmIGkgPCBmcm9tOyBpKyspIHtcbiAgICB3YWxrZXIgPSB3YWxrZXIubmV4dFxuICB9XG4gIGZvciAoOyB3YWxrZXIgIT09IG51bGwgJiYgaSA8IHRvOyBpKyssIHdhbGtlciA9IHdhbGtlci5uZXh0KSB7XG4gICAgcmV0LnB1c2god2Fsa2VyLnZhbHVlKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuWWFsbGlzdC5wcm90b3R5cGUuc2xpY2VSZXZlcnNlID0gZnVuY3Rpb24gKGZyb20sIHRvKSB7XG4gIHRvID0gdG8gfHwgdGhpcy5sZW5ndGhcbiAgaWYgKHRvIDwgMCkge1xuICAgIHRvICs9IHRoaXMubGVuZ3RoXG4gIH1cbiAgZnJvbSA9IGZyb20gfHwgMFxuICBpZiAoZnJvbSA8IDApIHtcbiAgICBmcm9tICs9IHRoaXMubGVuZ3RoXG4gIH1cbiAgdmFyIHJldCA9IG5ldyBZYWxsaXN0KClcbiAgaWYgKHRvIDwgZnJvbSB8fCB0byA8IDApIHtcbiAgICByZXR1cm4gcmV0XG4gIH1cbiAgaWYgKGZyb20gPCAwKSB7XG4gICAgZnJvbSA9IDBcbiAgfVxuICBpZiAodG8gPiB0aGlzLmxlbmd0aCkge1xuICAgIHRvID0gdGhpcy5sZW5ndGhcbiAgfVxuICBmb3IgKHZhciBpID0gdGhpcy5sZW5ndGgsIHdhbGtlciA9IHRoaXMudGFpbDsgd2Fsa2VyICE9PSBudWxsICYmIGkgPiB0bzsgaS0tKSB7XG4gICAgd2Fsa2VyID0gd2Fsa2VyLnByZXZcbiAgfVxuICBmb3IgKDsgd2Fsa2VyICE9PSBudWxsICYmIGkgPiBmcm9tOyBpLS0sIHdhbGtlciA9IHdhbGtlci5wcmV2KSB7XG4gICAgcmV0LnB1c2god2Fsa2VyLnZhbHVlKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuWWFsbGlzdC5wcm90b3R5cGUucmV2ZXJzZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGhlYWQgPSB0aGlzLmhlYWRcbiAgdmFyIHRhaWwgPSB0aGlzLnRhaWxcbiAgZm9yICh2YXIgd2Fsa2VyID0gaGVhZDsgd2Fsa2VyICE9PSBudWxsOyB3YWxrZXIgPSB3YWxrZXIucHJldikge1xuICAgIHZhciBwID0gd2Fsa2VyLnByZXZcbiAgICB3YWxrZXIucHJldiA9IHdhbGtlci5uZXh0XG4gICAgd2Fsa2VyLm5leHQgPSBwXG4gIH1cbiAgdGhpcy5oZWFkID0gdGFpbFxuICB0aGlzLnRhaWwgPSBoZWFkXG4gIHJldHVybiB0aGlzXG59XG5cbmZ1bmN0aW9uIHB1c2ggKHNlbGYsIGl0ZW0pIHtcbiAgc2VsZi50YWlsID0gbmV3IE5vZGUoaXRlbSwgc2VsZi50YWlsLCBudWxsLCBzZWxmKVxuICBpZiAoIXNlbGYuaGVhZCkge1xuICAgIHNlbGYuaGVhZCA9IHNlbGYudGFpbFxuICB9XG4gIHNlbGYubGVuZ3RoKytcbn1cblxuZnVuY3Rpb24gdW5zaGlmdCAoc2VsZiwgaXRlbSkge1xuICBzZWxmLmhlYWQgPSBuZXcgTm9kZShpdGVtLCBudWxsLCBzZWxmLmhlYWQsIHNlbGYpXG4gIGlmICghc2VsZi50YWlsKSB7XG4gICAgc2VsZi50YWlsID0gc2VsZi5oZWFkXG4gIH1cbiAgc2VsZi5sZW5ndGgrK1xufVxuXG5mdW5jdGlvbiBOb2RlICh2YWx1ZSwgcHJldiwgbmV4dCwgbGlzdCkge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgTm9kZSkpIHtcbiAgICByZXR1cm4gbmV3IE5vZGUodmFsdWUsIHByZXYsIG5leHQsIGxpc3QpXG4gIH1cblxuICB0aGlzLmxpc3QgPSBsaXN0XG4gIHRoaXMudmFsdWUgPSB2YWx1ZVxuXG4gIGlmIChwcmV2KSB7XG4gICAgcHJldi5uZXh0ID0gdGhpc1xuICAgIHRoaXMucHJldiA9IHByZXZcbiAgfSBlbHNlIHtcbiAgICB0aGlzLnByZXYgPSBudWxsXG4gIH1cblxuICBpZiAobmV4dCkge1xuICAgIG5leHQucHJldiA9IHRoaXNcbiAgICB0aGlzLm5leHQgPSBuZXh0XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5uZXh0ID0gbnVsbFxuICB9XG59XG5cbnRyeSB7XG4gIC8vIGFkZCBpZiBzdXBwb3J0IGZvciBTeW1ib2wuaXRlcmF0b3IgaXMgcHJlc2VudFxuICByZXF1aXJlKCcuL2l0ZXJhdG9yLmpzJykoWWFsbGlzdClcbn0gY2F0Y2ggKGVyKSB7fVxuIiwiaW1wb3J0ICogYXMgZ2FwaSBmcm9tICcuL2dhcGknO1xuXG5sZXQgcGF0dGVybnMgPSBbXTtcbmxldCBjYWxlbmRhcnMgPSB7fTtcbmxldCBjYWxEYXRhID0ge307XG5cbmNocm9tZS5ydW50aW1lLm9uQ29ubmVjdC5hZGRMaXN0ZW5lcihmdW5jdGlvbihwb3J0KSB7XG4gICAgY29uc29sZS5hc3NlcnQocG9ydC5uYW1lID09ICdtYWluJyk7XG4gICAgcG9ydC5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoZnVuY3Rpb24obXNnKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKG1zZyk7XG4gICAgICAgIGlmIChtc2cudHlwZSA9PSAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucyA9IG1zZy5kYXRhO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG1zZy50eXBlID09IDEpIHtcbiAgICAgICAgICAgIHBvcnQucG9zdE1lc3NhZ2UoeyBpZDogbXNnLmlkLCB0eXBlOiAxLCBkYXRhOiBwYXR0ZXJucyB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChtc2cudHlwZSA9PSAyKSB7XG4gICAgICAgICAgICBjYWxlbmRhcnMgPSBtc2cuZGF0YTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChtc2cudHlwZSA9PSAzKSB7XG4gICAgICAgICAgICBwb3J0LnBvc3RNZXNzYWdlKHsgaWQ6IG1zZy5pZCwgdHlwZTogMywgZGF0YTogY2FsZW5kYXJzIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG1zZy50eXBlID09IDQpIHtcbiAgICAgICAgICAgIGNhbERhdGFbbXNnLmRhdGEuaWRdLmdldEV2ZW50cyhuZXcgRGF0ZShtc2cuZGF0YS5zdGFydCksIG5ldyBEYXRlKG1zZy5kYXRhLmVuZCkpXG4gICAgICAgICAgICAgICAgLmNhdGNoKGUgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgY2Fubm90IGxvYWQgY2FsZW5kYXIgJHttc2cuZGF0YS5pZH1gLCBlKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coZGF0YSk7XG4gICAgICAgICAgICAgICAgbGV0IHJlc3AgPSB7IGlkOiBtc2cuaWQsIHR5cGU6IDQsIGRhdGE6IGRhdGEubWFwKGUgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWQ6IGUuaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydDogZS5zdGFydC5nZXRUaW1lKCksXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmQ6IGUuZW5kLmdldFRpbWUoKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSl9O1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHJlc3ApO1xuICAgICAgICAgICAgICAgIHBvcnQucG9zdE1lc3NhZ2UocmVzcCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChtc2cudHlwZSA9PSA1KSB7XG4gICAgICAgICAgICBjYWxlbmRhcnMgPSBtc2cuZGF0YTtcbiAgICAgICAgICAgIGZvciAobGV0IGlkIGluIGNhbGVuZGFycykge1xuICAgICAgICAgICAgICAgIGlmICghY2FsRGF0YS5oYXNPd25Qcm9wZXJ0eShpZCkpXG4gICAgICAgICAgICAgICAgICAgIGNhbERhdGFbaWRdID0gbmV3IGdhcGkuR0NhbGVuZGFyKGlkLCBjYWxlbmRhcnNbaWRdLnN1bW1hcnkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcInVua25vd24gbXNnIHR5cGVcIik7XG4gICAgICAgIH1cbiAgICB9KTtcbn0pO1xuXG5jaHJvbWUuYnJvd3NlckFjdGlvbi5vbkNsaWNrZWQuYWRkTGlzdGVuZXIoZnVuY3Rpb24oKSB7XG4gICAgY2hyb21lLnRhYnMuY3JlYXRlKHt1cmw6ICdpbmRleC5odG1sJ30pO1xufSk7XG5cbiIsIi8qIGdsb2JhbCBjaHJvbWUgKi9cbmltcG9ydCBMUlUgZnJvbSBcImxydS1jYWNoZVwiO1xuY29uc3QgZ2FwaV9iYXNlID0gJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2NhbGVuZGFyL3YzJztcblxuY29uc3QgR0FwaUVycm9yID0ge1xuICAgIGludmFsaWRTeW5jVG9rZW46IDEsXG4gICAgb3RoZXJFcnJvcjogMixcbn07XG5cbmZ1bmN0aW9uIHRvX3BhcmFtcyhkaWN0KSB7XG4gICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKGRpY3QpLmZpbHRlcigoW2ssIHZdKSA9PiB2KS5tYXAoKFtrLCB2XSkgPT4gYCR7ZW5jb2RlVVJJQ29tcG9uZW50KGspfT0ke2VuY29kZVVSSUNvbXBvbmVudCh2KX1gKS5qb2luKCcmJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBdXRoVG9rZW4oKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmVyID0+XG4gICAgICAgIGNocm9tZS5pZGVudGl0eS5nZXRBdXRoVG9rZW4oXG4gICAgICAgICAgICB7aW50ZXJhY3RpdmU6IHRydWV9LCB0b2tlbiA9PiByZXNvbHZlcih0b2tlbikpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENhbGVuZGFycyh0b2tlbikge1xuICAgIHJldHVybiBmZXRjaChgJHtnYXBpX2Jhc2V9L3VzZXJzL21lL2NhbGVuZGFyTGlzdD8ke3RvX3BhcmFtcyh7YWNjZXNzX3Rva2VuOiB0b2tlbn0pfWAsXG4gICAgICAgICAgICB7IG1ldGhvZDogJ0dFVCcsIGFzeW5jOiB0cnVlIH0pXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHJlc3BvbnNlLmpzb24oKSlcbiAgICAgICAgLnRoZW4oZGF0YSA9PiBkYXRhLml0ZW1zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbG9ycyh0b2tlbikge1xuICAgIHJldHVybiBmZXRjaChgJHtnYXBpX2Jhc2V9L2NvbG9ycz8ke3RvX3BhcmFtcyh7YWNjZXNzX3Rva2VuOiB0b2tlbn0pfWAsXG4gICAgICAgIHsgbWV0aG9kOiAnR0VUJywgYXN5bmM6IHRydWUgfSlcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4gcmVzcG9uc2UuanNvbigpKTtcbn1cblxuZnVuY3Rpb24gZ2V0RXZlbnQoY2FsSWQsIGV2ZW50SWQsIHRva2VuKSB7XG4gICAgcmV0dXJuIGZldGNoKGAke2dhcGlfYmFzZX0vY2FsZW5kYXJzLyR7Y2FsSWR9L2V2ZW50cy8ke2V2ZW50SWR9PyR7dG9fcGFyYW1zKHthY2Nlc3NfdG9rZW46IHRva2VufSl9YCxcbiAgICAgICAgeyBtZXRob2Q6ICdHRVQnLCBhc3luYzogdHJ1ZSB9KVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiByZXNwb25zZS5qc29uKCkpO1xufVxuXG5mdW5jdGlvbiBnZXRFdmVudHMoY2FsSWQsIHRva2VuLCBzeW5jVG9rZW49bnVsbCwgdGltZU1pbj1udWxsLCB0aW1lTWF4PW51bGwsIHJlc3VsdHNQZXJSZXF1ZXN0PTEwMCkge1xuICAgIGxldCByZXN1bHRzID0gW107XG4gICAgY29uc3Qgc2luZ2xlRmV0Y2ggPSAocGFnZVRva2VuLCBzeW5jVG9rZW4pID0+IGZldGNoKGAke2dhcGlfYmFzZX0vY2FsZW5kYXJzLyR7Y2FsSWR9L2V2ZW50cz8ke3RvX3BhcmFtcyh7XG4gICAgICAgICAgICBhY2Nlc3NfdG9rZW46IHRva2VuLFxuICAgICAgICAgICAgcGFnZVRva2VuLFxuICAgICAgICAgICAgc3luY1Rva2VuLFxuICAgICAgICAgICAgdGltZU1pbixcbiAgICAgICAgICAgIHRpbWVNYXgsXG4gICAgICAgICAgICBtYXhSZXN1bHRzOiByZXN1bHRzUGVyUmVxdWVzdFxuICAgICAgICB9KX1gLCB7IG1ldGhvZDogJ0dFVCcsIGFzeW5jOiB0cnVlIH0pXG4gICAgICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gMjAwKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2UuanNvbigpO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDEwKVxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBHQXBpRXJyb3IuaW52YWxpZFN5bmNUb2tlbjtcbiAgICAgICAgICAgICAgICBlbHNlIHRocm93IEdBcGlFcnJvci5vdGhlckVycm9ycztcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihkYXRhID0+IHtcbiAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2goLi4uZGF0YS5pdGVtcyk7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEubmV4dFBhZ2VUb2tlbikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc2luZ2xlRmV0Y2goZGF0YS5uZXh0UGFnZVRva2VuLCAnJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICh7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXh0U3luY1Rva2VuOiBkYXRhLm5leHRTeW5jVG9rZW4sXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG5cbiAgICByZXR1cm4gc2luZ2xlRmV0Y2goJycsIHN5bmNUb2tlbik7XG59XG5cbmV4cG9ydCBjbGFzcyBHQ2FsZW5kYXIge1xuICAgIGNvbnN0cnVjdG9yKGNhbElkLCBuYW1lLCBvcHRpb25zPXttYXhDYWNoZWRJdGVtczogMTAwLCBuRGF5c1BlclNsb3Q6IDEwLCBsYXJnZVF1ZXJ5OiAxMH0pIHtcbiAgICAgICAgdGhpcy5jYWxJZCA9IGNhbElkO1xuICAgICAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgICAgICB0aGlzLnRva2VuID0gZ2V0QXV0aFRva2VuKCk7XG4gICAgICAgIHRoaXMuc3luY1Rva2VuID0gJyc7XG4gICAgICAgIHRoaXMuY2FjaGUgPSBuZXcgTFJVKHtcbiAgICAgICAgICAgIG1heDogb3B0aW9ucy5tYXhDYWNoZWRJdGVtcyxcbiAgICAgICAgICAgIGRpc3Bvc2U6IChrLCB2KSA9PiB0aGlzLm9uUmVtb3ZlU2xvdChrLCB2KVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5ldmVudE1ldGEgPSB7fTtcbiAgICAgICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgICAgICAgdGhpcy5kaXZpZGVyID0gOC42NGU3ICogdGhpcy5vcHRpb25zLm5EYXlzUGVyU2xvdDtcbiAgICB9XG5cbiAgICBkYXRlVG9DYWNoZUtleShkYXRlKSB7XG4gICAgICAgIHJldHVybiBNYXRoLmZsb29yKGRhdGUgLyB0aGlzLmRpdmlkZXIpO1xuICAgIH1cblxuICAgIGRhdGVSYW5nZVRvQ2FjaGVLZXlzKHJhbmdlKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdGFydDogdGhpcy5kYXRlVG9DYWNoZUtleShyYW5nZS5zdGFydCksXG4gICAgICAgICAgICBlbmQ6IHRoaXMuZGF0ZVRvQ2FjaGVLZXkobmV3IERhdGUocmFuZ2UuZW5kLmdldFRpbWUoKSAtIDEpKVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGdldFNsb3Qoaykge1xuICAgICAgICBpZiAoIXRoaXMuY2FjaGUuaGFzKGspKVxuICAgICAgICB7XG4gICAgICAgICAgICBsZXQgcmVzID0ge307XG4gICAgICAgICAgICB0aGlzLmNhY2hlLnNldChrLCByZXMpO1xuICAgICAgICAgICAgcmV0dXJuIHJlcztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHJldHVybiB0aGlzLmNhY2hlLmdldChrKTtcbiAgICB9XG5cbiAgICBvblJlbW92ZVNsb3Qoaywgdikge1xuICAgICAgICBmb3IgKGxldCBpZCBpbiB2KSB7XG4gICAgICAgICAgICBjb25zb2xlLmFzc2VydCh0aGlzLmV2ZW50TWV0YVtpZF0pO1xuICAgICAgICAgICAgbGV0IGtleXMgPSB0aGlzLmV2ZW50TWV0YVtpZF0ua2V5cztcbiAgICAgICAgICAgIGtleXMuZGVsZXRlKGspO1xuICAgICAgICAgICAgaWYgKGtleXMuc2l6ZSA9PT0gMClcbiAgICAgICAgICAgICAgICBkZWxldGUgdGhpcy5ldmVudE1ldGFbaWRdO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc2xvdFN0YXJ0RGF0ZShrKSB7IHJldHVybiBuZXcgRGF0ZShrICogdGhpcy5kaXZpZGVyKTsgfVxuICAgIHNsb3RFbmREYXRlKGspIHsgcmV0dXJuIG5ldyBEYXRlKChrICsgMSkgKiB0aGlzLmRpdmlkZXIpOyB9XG5cbiAgICBhZGRFdmVudChlLCBldmljdCA9IGZhbHNlKSB7XG4gICAgICAgIC8vY29uc29sZS5sb2coJ2FkZGluZyBldmVudCcsIGUpO1xuICAgICAgICBpZiAodGhpcy5ldmVudE1ldGEuaGFzT3duUHJvcGVydHkoZS5pZCkpXG4gICAgICAgICAgICB0aGlzLnJlbW92ZUV2ZW50KGUpO1xuICAgICAgICBsZXQgciA9IHRoaXMuZGF0ZVJhbmdlVG9DYWNoZUtleXMoZSk7XG4gICAgICAgIGxldCBrcyA9IHIuc3RhcnQ7XG4gICAgICAgIGxldCBrZSA9IHIuZW5kO1xuICAgICAgICBsZXQgdCA9IHRoaXMuY2FjaGUubGVuZ3RoO1xuICAgICAgICBsZXQga2V5cyA9IG5ldyBTZXQoKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IGtzOyBpIDw9IGtlOyBpKyspXG4gICAgICAgIHtcbiAgICAgICAgICAgIGtleXMuYWRkKGkpO1xuICAgICAgICAgICAgaWYgKCF0aGlzLmNhY2hlLmhhcyhpKSkgdCsrO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZXZlbnRNZXRhW2UuaWRdID0ge1xuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHN1bW1hcnk6IGUuc3VtbWFyeSxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKCFldmljdCAmJiB0ID4gdGhpcy5vcHRpb25zLm1heENhY2hlZEl0ZW1zKSByZXR1cm47XG4gICAgICAgIGlmIChrcyA9PT0ga2UpXG4gICAgICAgICAgICB0aGlzLmdldFNsb3Qoa3MpW2UuaWRdID0ge1xuICAgICAgICAgICAgICAgIHN0YXJ0OiBlLnN0YXJ0LFxuICAgICAgICAgICAgICAgIGVuZDogZS5lbmQsXG4gICAgICAgICAgICAgICAgaWQ6IGUuaWQgfTtcbiAgICAgICAgZWxzZVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLmdldFNsb3Qoa3MpW2UuaWRdID0ge1xuICAgICAgICAgICAgICAgIHN0YXJ0OiBlLnN0YXJ0LFxuICAgICAgICAgICAgICAgIGVuZDogdGhpcy5zbG90RW5kRGF0ZShrcyksXG4gICAgICAgICAgICAgICAgaWQ6IGUuaWQgfTtcbiAgICAgICAgICAgIHRoaXMuZ2V0U2xvdChrZSlbZS5pZF0gPSB7XG4gICAgICAgICAgICAgICAgc3RhcnQ6IHRoaXMuc2xvdFN0YXJ0RGF0ZShrZSksXG4gICAgICAgICAgICAgICAgZW5kOiBlLmVuZCxcbiAgICAgICAgICAgICAgICBpZDogZS5pZCB9O1xuICAgICAgICAgICAgZm9yIChsZXQgayA9IGtzICsgMTsgayA8IGtlOyBrKyspXG4gICAgICAgICAgICAgICAgdGhpcy5nZXRTbG90KGspW2UuaWRdID0ge1xuICAgICAgICAgICAgICAgICAgICBzdGFydDogdGhpcy5zbG90U3RhcnREYXRlKGspLFxuICAgICAgICAgICAgICAgICAgICBlbmQ6IHRoaXMuc2xvdEVuZERhdGUoayksXG4gICAgICAgICAgICAgICAgICAgIGlkOiBlLmlkfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlbW92ZUV2ZW50KGUpIHtcbiAgICAgICAgbGV0IGtleXMgPSB0aGlzLmV2ZW50TWV0YVtlLmlkXS5rZXlzO1xuICAgICAgICBjb25zb2xlLmFzc2VydChrZXlzKTtcbiAgICAgICAga2V5cy5mb3JFYWNoKGsgPT4gZGVsZXRlIHRoaXMuZ2V0U2xvdChrKVtlLmlkXSk7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmV2ZW50TWV0YVtlLmlkXTtcbiAgICB9XG5cbiAgICBnZXRTbG90RXZlbnRzKGssIHN0YXJ0LCBlbmQpIHtcbiAgICAgICAgbGV0IHMgPSB0aGlzLmdldFNsb3Qoayk7XG4gICAgICAgIC8vY29uc29sZS5sb2cocyk7XG4gICAgICAgIGxldCByZXN1bHRzID0gW107XG4gICAgICAgIGZvciAobGV0IGlkIGluIHMpIHtcbiAgICAgICAgICAgIGlmICghKHNbaWRdLnN0YXJ0ID49IGVuZCB8fCBzW2lkXS5lbmQgPD0gc3RhcnQpKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICAgICAgICBzdGFydDogc1tpZF0uc3RhcnQgPCBzdGFydCA/IHN0YXJ0OiBzW2lkXS5zdGFydCxcbiAgICAgICAgICAgICAgICAgICAgZW5kOiBzW2lkXS5lbmQgPiBlbmQgPyBlbmQ6IHNbaWRdLmVuZCxcbiAgICAgICAgICAgICAgICAgICAgc3VtbWFyeTogdGhpcy5ldmVudE1ldGFbaWRdLnN1bW1hcnlcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICBnZXRDYWNoZWRFdmVudHMoX3IpIHtcbiAgICAgICAgbGV0IHIgPSB0aGlzLmRhdGVSYW5nZVRvQ2FjaGVLZXlzKF9yKTtcbiAgICAgICAgbGV0IGtzID0gci5zdGFydDtcbiAgICAgICAgbGV0IGtlID0gci5lbmQ7XG4gICAgICAgIGxldCByZXN1bHRzID0gdGhpcy5nZXRTbG90RXZlbnRzKGtzLCBfci5zdGFydCwgX3IuZW5kKTtcbiAgICAgICAgZm9yIChsZXQgayA9IGtzICsgMTsgayA8IGtlOyBrKyspXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCBzID0gdGhpcy5nZXRTbG90KGspO1xuICAgICAgICAgICAgZm9yIChsZXQgaWQgaW4gcylcbiAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2goc1tpZF0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChrZSA+IGtzKVxuICAgICAgICAgICAgcmVzdWx0cy5wdXNoKC4uLnRoaXMuZ2V0U2xvdEV2ZW50cyhrZSwgX3Iuc3RhcnQsIF9yLmVuZCkpO1xuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICBzeW5jKCkge1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbi50aGVuKHRva2VuID0+IGdldEV2ZW50cyh0aGlzLmNhbElkLCB0b2tlbiwgdGhpcy5zeW5jVG9rZW4pLnRoZW4ociA9PiB7XG4gICAgICAgICAgICB0aGlzLnN5bmNUb2tlbiA9IHIubmV4dFN5bmNUb2tlbjtcbiAgICAgICAgICAgIGxldCBwbV9yZXN1bHRzID0gci5yZXN1bHRzLm1hcChlID0+IGUuc3RhcnQgPyBQcm9taXNlLnJlc29sdmUoZSkgOiBnZXRFdmVudCh0aGlzLmNhbElkLCBlLmlkLCB0b2tlbikpO1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHBtX3Jlc3VsdHMpLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLmZvckVhY2goZSA9PiB7XG4gICAgICAgICAgICAgICAgZS5zdGFydCA9IG5ldyBEYXRlKGUuc3RhcnQuZGF0ZVRpbWUpO1xuICAgICAgICAgICAgICAgIGUuZW5kID0gbmV3IERhdGUoZS5lbmQuZGF0ZVRpbWUpO1xuICAgICAgICAgICAgICAgIGlmIChlLnN0YXR1cyA9PT0gJ2NvbmZpcm1lZCcpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkRXZlbnQoZSk7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoZS5zdGF0dXMgPT09ICdjYW5jZWxsZWQnKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUV2ZW50KGUpO1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KSkuY2F0Y2goZSA9PiB7XG4gICAgICAgICAgICBpZiAoZSA9PT0gR0FwaUVycm9yLmludmFsaWRTeW5jVG9rZW4pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnN5bmNUb2tlbiA9ICcnO1xuICAgICAgICAgICAgICAgIHRoaXMuc3luYygpO1xuICAgICAgICAgICAgfSBlbHNlIHRocm93IGU7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGdldEV2ZW50cyhzdGFydCwgZW5kKSB7XG4gICAgICAgIGxldCByID0gdGhpcy5kYXRlUmFuZ2VUb0NhY2hlS2V5cyh7IHN0YXJ0LCBlbmQgfSk7XG4gICAgICAgIGxldCBxdWVyeSA9IHt9O1xuICAgICAgICBmb3IgKGxldCBrID0gci5zdGFydDsgayA8PSByLmVuZDsgaysrKVxuICAgICAgICAgICAgaWYgKCF0aGlzLmNhY2hlLmhhcyhrKSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBpZiAoIXF1ZXJ5Lmhhc093blByb3BlcnR5KCdzdGFydCcpKVxuICAgICAgICAgICAgICAgICAgICBxdWVyeS5zdGFydCA9IGs7XG4gICAgICAgICAgICAgICAgcXVlcnkuZW5kID0gaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgY29uc29sZS5sb2coYHN0YXJ0OiAke3N0YXJ0fSBlbmQ6ICR7ZW5kfWApO1xuICAgICAgICBpZiAocXVlcnkuaGFzT3duUHJvcGVydHkoJ3N0YXJ0JykpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGNvbnNvbGUuYXNzZXJ0KHF1ZXJ5LnN0YXJ0IDw9IHF1ZXJ5LmVuZCk7XG4gICAgICAgICAgICBpZiAocXVlcnkuZW5kIC0gcXVlcnkuc3RhcnQgKyAxID4gdGhpcy5vcHRpb25zLmxhcmdlUXVlcnkpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgZW5jb3VudGVyIGxhcmdlIHF1ZXJ5LCB1c2UgZGlyZWN0IGZldGNoYCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9rZW4udGhlbih0b2tlbiA9PiBnZXRFdmVudHModGhpcy5jYWxJZCwgdG9rZW4sIG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydC50b0lTT1N0cmluZygpLCBlbmQudG9JU09TdHJpbmcoKSkudGhlbihyID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHJlc3VsdHMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgci5yZXN1bHRzLmZvckVhY2goZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmFzc2VydChlLnN0YXJ0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGUuc3RhcnQgPSBuZXcgRGF0ZShlLnN0YXJ0LmRhdGVUaW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGUuZW5kID0gbmV3IERhdGUoZS5lbmQuZGF0ZVRpbWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKGUpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdHMuZmlsdGVyKGUgPT4gIShlLnN0YXJ0ID49IGVuZCB8fCBlLmVuZCA8PSBzdGFydCkpLm1hcChlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ6IGUuaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IGUuc3RhcnQgPCBzdGFydCA/IHN0YXJ0OiBlLnN0YXJ0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZDogZS5lbmQgPiBlbmQgPyBlbmQ6IGUuZW5kLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1bW1hcnk6IGUuc3VtbWFyeSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc29sZS5sb2coYGZldGNoaW5nIHNob3J0IGV2ZW50IGxpc3RgKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRva2VuLnRoZW4odG9rZW4gPT4gZ2V0RXZlbnRzKHRoaXMuY2FsSWQsIHRva2VuLCBudWxsLFxuICAgICAgICAgICAgICAgIHRoaXMuc2xvdFN0YXJ0RGF0ZShxdWVyeS5zdGFydCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICB0aGlzLnNsb3RFbmREYXRlKHF1ZXJ5LmVuZCkudG9JU09TdHJpbmcoKSkudGhlbihyID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc3luY1Rva2VuID09PSAnJylcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3luY1Rva2VuID0gci5uZXh0U3luY1Rva2VuO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gci5yZXN1bHRzLmZvckVhY2goZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZS5zdGF0dXMgPT09ICdjb25maXJtZWQnKVxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuYXNzZXJ0KGUuc3RhcnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUuc3RhcnQgPSBuZXcgRGF0ZShlLnN0YXJ0LmRhdGVUaW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLmVuZCA9IG5ldyBEYXRlKGUuZW5kLmRhdGVUaW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZEV2ZW50KGUsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KSkudGhlbigoKSA9PiB0aGlzLnN5bmMoKSlcbiAgICAgICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLmdldENhY2hlZEV2ZW50cyh7IHN0YXJ0LCBlbmQgfSkpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYGNhY2hlIGhpdGApO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3luYygpLnRoZW4oKCkgPT4gdGhpcy5nZXRDYWNoZWRFdmVudHMoeyBzdGFydCwgZW5kIH0pKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiJdfQ==
