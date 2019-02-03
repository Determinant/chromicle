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

var patterns = [];
var calendars = {};
var calData = {};
chrome.runtime.onConnect.addListener(function (port) {
  console.assert(port.name == 'main');
  port.onMessage.addListener(function (_msg) {
    var msg = _msg2.Msg.inflate(_msg);

    console.log(msg);

    if (msg.type == _msg2.msgType.updatePatterns) {
      patterns = msg.data;
    } else if (msg.type == _msg2.msgType.getPatterns) {
      port.postMessage(msg.genResp(patterns));
    } else if (msg.type == _msg2.msgType.updateCalendars) {
      calendars = msg.data;

      for (var id in calendars) {
        if (!calData.hasOwnProperty(id)) calData[id] = new gapi.GCalendar(id, calendars[id].summary);
      }
    } else if (msg.type == _msg2.msgType.getCalendars) {
      port.postMessage(msg.genResp(calendars));
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
  }]);

  return GCalendar;
}();

exports.GCalendar = GCalendar;

},{"lru-cache":1}],6:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Msg = exports.msgType = void 0;

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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

},{}]},{},[4])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvbHJ1LWNhY2hlL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3lhbGxpc3QvaXRlcmF0b3IuanMiLCJub2RlX21vZHVsZXMveWFsbGlzdC95YWxsaXN0LmpzIiwic3JjL2JhY2tncm91bmQuanMiLCJzcmMvZ2FwaS5qcyIsInNyYy9tc2cuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3hYQTs7QUFDQTs7OztBQUVBLElBQUksUUFBUSxHQUFHLEVBQWY7QUFDQSxJQUFJLFNBQVMsR0FBRyxFQUFoQjtBQUNBLElBQUksT0FBTyxHQUFHLEVBQWQ7QUFFQSxNQUFNLENBQUMsT0FBUCxDQUFlLFNBQWYsQ0FBeUIsV0FBekIsQ0FBcUMsVUFBUyxJQUFULEVBQWU7QUFDaEQsRUFBQSxPQUFPLENBQUMsTUFBUixDQUFlLElBQUksQ0FBQyxJQUFMLElBQWEsTUFBNUI7QUFDQSxFQUFBLElBQUksQ0FBQyxTQUFMLENBQWUsV0FBZixDQUEyQixVQUFTLElBQVQsRUFBZTtBQUN0QyxRQUFJLEdBQUcsR0FBRyxVQUFJLE9BQUosQ0FBWSxJQUFaLENBQVY7O0FBQ0EsSUFBQSxPQUFPLENBQUMsR0FBUixDQUFZLEdBQVo7O0FBQ0EsUUFBSSxHQUFHLENBQUMsSUFBSixJQUFZLGNBQVEsY0FBeEIsRUFBd0M7QUFDcEMsTUFBQSxRQUFRLEdBQUcsR0FBRyxDQUFDLElBQWY7QUFDSCxLQUZELE1BR0ssSUFBSSxHQUFHLENBQUMsSUFBSixJQUFZLGNBQVEsV0FBeEIsRUFBcUM7QUFDdEMsTUFBQSxJQUFJLENBQUMsV0FBTCxDQUFpQixHQUFHLENBQUMsT0FBSixDQUFZLFFBQVosQ0FBakI7QUFDSCxLQUZJLE1BR0EsSUFBSSxHQUFHLENBQUMsSUFBSixJQUFZLGNBQVEsZUFBeEIsRUFBeUM7QUFDMUMsTUFBQSxTQUFTLEdBQUcsR0FBRyxDQUFDLElBQWhCOztBQUNBLFdBQUssSUFBSSxFQUFULElBQWUsU0FBZixFQUEwQjtBQUN0QixZQUFJLENBQUMsT0FBTyxDQUFDLGNBQVIsQ0FBdUIsRUFBdkIsQ0FBTCxFQUNJLE9BQU8sQ0FBQyxFQUFELENBQVAsR0FBYyxJQUFJLElBQUksQ0FBQyxTQUFULENBQW1CLEVBQW5CLEVBQXVCLFNBQVMsQ0FBQyxFQUFELENBQVQsQ0FBYyxPQUFyQyxDQUFkO0FBQ1A7QUFDSixLQU5JLE1BT0EsSUFBSSxHQUFHLENBQUMsSUFBSixJQUFZLGNBQVEsWUFBeEIsRUFBc0M7QUFDdkMsTUFBQSxJQUFJLENBQUMsV0FBTCxDQUFpQixHQUFHLENBQUMsT0FBSixDQUFZLFNBQVosQ0FBakI7QUFDSCxLQUZJLE1BR0EsSUFBSSxHQUFHLENBQUMsSUFBSixJQUFZLGNBQVEsWUFBeEIsRUFBc0M7QUFDdkMsTUFBQSxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUosQ0FBUyxFQUFWLENBQVAsQ0FBcUIsU0FBckIsQ0FBK0IsSUFBSSxJQUFKLENBQVMsR0FBRyxDQUFDLElBQUosQ0FBUyxLQUFsQixDQUEvQixFQUF5RCxJQUFJLElBQUosQ0FBUyxHQUFHLENBQUMsSUFBSixDQUFTLEdBQWxCLENBQXpELEVBQ0ssS0FETCxDQUNXLFVBQUEsQ0FBQyxFQUFJO0FBQ1IsUUFBQSxPQUFPLENBQUMsR0FBUixnQ0FBb0MsR0FBRyxDQUFDLElBQUosQ0FBUyxFQUE3QyxHQUFtRCxDQUFuRDtBQUNBLGVBQU8sRUFBUDtBQUNILE9BSkwsRUFLSyxJQUxMLENBS1UsVUFBQSxJQUFJLEVBQUk7QUFDZCxRQUFBLE9BQU8sQ0FBQyxHQUFSLENBQVksSUFBWjtBQUNBLFlBQUksSUFBSSxHQUFHLEdBQUcsQ0FBQyxPQUFKLENBQVksSUFBSSxDQUFDLEdBQUwsQ0FBUyxVQUFBLENBQUMsRUFBSTtBQUNqQyxpQkFBTztBQUNILFlBQUEsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQURIO0FBRUgsWUFBQSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUYsQ0FBUSxPQUFSLEVBRko7QUFHSCxZQUFBLEdBQUcsRUFBRSxDQUFDLENBQUMsR0FBRixDQUFNLE9BQU47QUFIRixXQUFQO0FBS0gsU0FOc0IsQ0FBWixDQUFYO0FBT0EsUUFBQSxPQUFPLENBQUMsR0FBUixDQUFZLElBQVo7QUFDQSxRQUFBLElBQUksQ0FBQyxXQUFMLENBQWlCLElBQWpCO0FBQ0gsT0FoQkQ7QUFpQkgsS0FsQkksTUFtQkE7QUFDRCxNQUFBLE9BQU8sQ0FBQyxLQUFSLENBQWMsa0JBQWQ7QUFDSDtBQUNKLEdBekNEO0FBMENILENBNUNEO0FBOENBLE1BQU0sQ0FBQyxhQUFQLENBQXFCLFNBQXJCLENBQStCLFdBQS9CLENBQTJDLFlBQVc7QUFDbEQsRUFBQSxNQUFNLENBQUMsSUFBUCxDQUFZLE1BQVosQ0FBbUI7QUFBQyxJQUFBLEdBQUcsRUFBRTtBQUFOLEdBQW5CO0FBQ0gsQ0FGRDs7Ozs7Ozs7Ozs7OztBQ3BEQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSxJQUFNLFNBQVMsR0FBRyx3Q0FBbEI7QUFFQSxJQUFNLFNBQVMsR0FBRztBQUNkLEVBQUEsZ0JBQWdCLEVBQUUsQ0FESjtBQUVkLEVBQUEsVUFBVSxFQUFFO0FBRkUsQ0FBbEI7O0FBS0EsU0FBUyxTQUFULENBQW1CLElBQW5CLEVBQXlCO0FBQ3JCLFNBQU8sTUFBTSxDQUFDLE9BQVAsQ0FBZSxJQUFmLEVBQXFCLE1BQXJCLENBQTRCO0FBQUE7QUFBQSxRQUFFLENBQUY7QUFBQSxRQUFLLENBQUw7O0FBQUEsV0FBWSxDQUFaO0FBQUEsR0FBNUIsRUFBMkMsR0FBM0MsQ0FBK0M7QUFBQTtBQUFBLFFBQUUsQ0FBRjtBQUFBLFFBQUssQ0FBTDs7QUFBQSxxQkFBZSxrQkFBa0IsQ0FBQyxDQUFELENBQWpDLGNBQXdDLGtCQUFrQixDQUFDLENBQUQsQ0FBMUQ7QUFBQSxHQUEvQyxFQUFnSCxJQUFoSCxDQUFxSCxHQUFySCxDQUFQO0FBQ0g7O0FBRU0sU0FBUyxZQUFULEdBQXdCO0FBQzNCLFNBQU8sSUFBSSxPQUFKLENBQVksVUFBQSxRQUFRO0FBQUEsV0FDdkIsTUFBTSxDQUFDLFFBQVAsQ0FBZ0IsWUFBaEIsQ0FDSTtBQUFDLE1BQUEsV0FBVyxFQUFFO0FBQWQsS0FESixFQUN5QixVQUFBLEtBQUs7QUFBQSxhQUFJLFFBQVEsQ0FBQyxLQUFELENBQVo7QUFBQSxLQUQ5QixDQUR1QjtBQUFBLEdBQXBCLENBQVA7QUFHSDs7QUFFTSxTQUFTLFlBQVQsQ0FBc0IsS0FBdEIsRUFBNkI7QUFDaEMsU0FBTyxLQUFLLFdBQUksU0FBSixvQ0FBdUMsU0FBUyxDQUFDO0FBQUMsSUFBQSxZQUFZLEVBQUU7QUFBZixHQUFELENBQWhELEdBQ0o7QUFBRSxJQUFBLE1BQU0sRUFBRSxLQUFWO0FBQWlCLElBQUEsS0FBSyxFQUFFO0FBQXhCLEdBREksQ0FBTCxDQUVGLElBRkUsQ0FFRyxVQUFBLFFBQVE7QUFBQSxXQUFJLFFBQVEsQ0FBQyxJQUFULEVBQUo7QUFBQSxHQUZYLEVBR0YsSUFIRSxDQUdHLFVBQUEsSUFBSTtBQUFBLFdBQUksSUFBSSxDQUFDLEtBQVQ7QUFBQSxHQUhQLENBQVA7QUFJSDs7QUFFTSxTQUFTLFNBQVQsQ0FBbUIsS0FBbkIsRUFBMEI7QUFDN0IsU0FBTyxLQUFLLFdBQUksU0FBSixxQkFBd0IsU0FBUyxDQUFDO0FBQUMsSUFBQSxZQUFZLEVBQUU7QUFBZixHQUFELENBQWpDLEdBQ1I7QUFBRSxJQUFBLE1BQU0sRUFBRSxLQUFWO0FBQWlCLElBQUEsS0FBSyxFQUFFO0FBQXhCLEdBRFEsQ0FBTCxDQUVGLElBRkUsQ0FFRyxVQUFBLFFBQVE7QUFBQSxXQUFJLFFBQVEsQ0FBQyxJQUFULEVBQUo7QUFBQSxHQUZYLENBQVA7QUFHSDs7QUFFRCxTQUFTLFFBQVQsQ0FBa0IsS0FBbEIsRUFBeUIsT0FBekIsRUFBa0MsS0FBbEMsRUFBeUM7QUFDckMsU0FBTyxLQUFLLFdBQUksU0FBSix3QkFBMkIsS0FBM0IscUJBQTJDLE9BQTNDLGNBQXNELFNBQVMsQ0FBQztBQUFDLElBQUEsWUFBWSxFQUFFO0FBQWYsR0FBRCxDQUEvRCxHQUNSO0FBQUUsSUFBQSxNQUFNLEVBQUUsS0FBVjtBQUFpQixJQUFBLEtBQUssRUFBRTtBQUF4QixHQURRLENBQUwsQ0FFRixJQUZFLENBRUcsVUFBQSxRQUFRO0FBQUEsV0FBSSxRQUFRLENBQUMsSUFBVCxFQUFKO0FBQUEsR0FGWCxDQUFQO0FBR0g7O0FBRUQsU0FBUyxVQUFULENBQW1CLEtBQW5CLEVBQTBCLEtBQTFCLEVBQW9HO0FBQUEsTUFBbkUsU0FBbUUsdUVBQXpELElBQXlEO0FBQUEsTUFBbkQsT0FBbUQsdUVBQTNDLElBQTJDO0FBQUEsTUFBckMsT0FBcUMsdUVBQTdCLElBQTZCO0FBQUEsTUFBdkIsaUJBQXVCLHVFQUFMLEdBQUs7QUFDaEcsTUFBSSxPQUFPLEdBQUcsRUFBZDs7QUFDQSxNQUFNLFdBQVcsR0FBRyxTQUFkLFdBQWMsQ0FBQyxTQUFELEVBQVksU0FBWjtBQUFBLFdBQTBCLEtBQUssV0FBSSxTQUFKLHdCQUEyQixLQUEzQixxQkFBMkMsU0FBUyxDQUFDO0FBQ2hHLE1BQUEsWUFBWSxFQUFFLEtBRGtGO0FBRWhHLE1BQUEsU0FBUyxFQUFULFNBRmdHO0FBR2hHLE1BQUEsU0FBUyxFQUFULFNBSGdHO0FBSWhHLE1BQUEsT0FBTyxFQUFQLE9BSmdHO0FBS2hHLE1BQUEsT0FBTyxFQUFQLE9BTGdHO0FBTWhHLE1BQUEsVUFBVSxFQUFFO0FBTm9GLEtBQUQsQ0FBcEQsR0FPekM7QUFBRSxNQUFBLE1BQU0sRUFBRSxLQUFWO0FBQWlCLE1BQUEsS0FBSyxFQUFFO0FBQXhCLEtBUHlDLENBQUwsQ0FRckMsSUFScUMsQ0FRaEMsVUFBQSxRQUFRLEVBQUk7QUFDZCxVQUFJLFFBQVEsQ0FBQyxNQUFULEtBQW9CLEdBQXhCLEVBQ0ksT0FBTyxRQUFRLENBQUMsSUFBVCxFQUFQLENBREosS0FFSyxJQUFJLFFBQVEsQ0FBQyxNQUFULEtBQW9CLEdBQXhCLEVBQ0QsTUFBTSxTQUFTLENBQUMsZ0JBQWhCLENBREMsS0FFQSxNQUFNLFNBQVMsQ0FBQyxXQUFoQjtBQUNSLEtBZHFDLEVBZXJDLElBZnFDLENBZWhDLFVBQUEsSUFBSSxFQUFJO0FBQ1YsTUFBQSxPQUFPLENBQUMsSUFBUixPQUFBLE9BQU8scUJBQVMsSUFBSSxDQUFDLEtBQWQsRUFBUDs7QUFDQSxVQUFJLElBQUksQ0FBQyxhQUFULEVBQXdCO0FBQ3BCLGVBQU8sV0FBVyxDQUFDLElBQUksQ0FBQyxhQUFOLEVBQXFCLEVBQXJCLENBQWxCO0FBQ0gsT0FGRCxNQUVPO0FBQ0gsZUFBUTtBQUNKLFVBQUEsYUFBYSxFQUFFLElBQUksQ0FBQyxhQURoQjtBQUVKLFVBQUEsT0FBTyxFQUFQO0FBRkksU0FBUjtBQUlIO0FBQ0osS0F6QnFDLENBQTFCO0FBQUEsR0FBcEI7O0FBMkJBLFNBQU8sV0FBVyxDQUFDLEVBQUQsRUFBSyxTQUFMLENBQWxCO0FBQ0g7O0lBRVksUzs7O0FBQ1QscUJBQVksS0FBWixFQUFtQixJQUFuQixFQUEwRjtBQUFBOztBQUFBLFFBQWpFLE9BQWlFLHVFQUF6RDtBQUFDLE1BQUEsY0FBYyxFQUFFLEdBQWpCO0FBQXNCLE1BQUEsWUFBWSxFQUFFLEVBQXBDO0FBQXdDLE1BQUEsVUFBVSxFQUFFO0FBQXBELEtBQXlEOztBQUFBOztBQUN0RixTQUFLLEtBQUwsR0FBYSxLQUFiO0FBQ0EsU0FBSyxJQUFMLEdBQVksSUFBWjtBQUNBLFNBQUssS0FBTCxHQUFhLFlBQVksRUFBekI7QUFDQSxTQUFLLFNBQUwsR0FBaUIsRUFBakI7QUFDQSxTQUFLLEtBQUwsR0FBYSxJQUFJLGlCQUFKLENBQVE7QUFDakIsTUFBQSxHQUFHLEVBQUUsT0FBTyxDQUFDLGNBREk7QUFFakIsTUFBQSxPQUFPLEVBQUUsaUJBQUMsQ0FBRCxFQUFJLENBQUo7QUFBQSxlQUFVLEtBQUksQ0FBQyxZQUFMLENBQWtCLENBQWxCLEVBQXFCLENBQXJCLENBQVY7QUFBQTtBQUZRLEtBQVIsQ0FBYjtBQUlBLFNBQUssU0FBTCxHQUFpQixFQUFqQjtBQUNBLFNBQUssT0FBTCxHQUFlLE9BQWY7QUFDQSxTQUFLLE9BQUwsR0FBZSxTQUFTLEtBQUssT0FBTCxDQUFhLFlBQXJDO0FBQ0g7Ozs7bUNBRWMsSSxFQUFNO0FBQ2pCLGFBQU8sSUFBSSxDQUFDLEtBQUwsQ0FBVyxJQUFJLEdBQUcsS0FBSyxPQUF2QixDQUFQO0FBQ0g7Ozt5Q0FFb0IsSyxFQUFPO0FBQ3hCLGFBQU87QUFDSCxRQUFBLEtBQUssRUFBRSxLQUFLLGNBQUwsQ0FBb0IsS0FBSyxDQUFDLEtBQTFCLENBREo7QUFFSCxRQUFBLEdBQUcsRUFBRSxLQUFLLGNBQUwsQ0FBb0IsSUFBSSxJQUFKLENBQVMsS0FBSyxDQUFDLEdBQU4sQ0FBVSxPQUFWLEtBQXNCLENBQS9CLENBQXBCO0FBRkYsT0FBUDtBQUlIOzs7NEJBRU8sQyxFQUFHO0FBQ1AsVUFBSSxDQUFDLEtBQUssS0FBTCxDQUFXLEdBQVgsQ0FBZSxDQUFmLENBQUwsRUFDQTtBQUNJLFlBQUksR0FBRyxHQUFHLEVBQVY7QUFDQSxhQUFLLEtBQUwsQ0FBVyxHQUFYLENBQWUsQ0FBZixFQUFrQixHQUFsQjtBQUNBLGVBQU8sR0FBUDtBQUNILE9BTEQsTUFNSyxPQUFPLEtBQUssS0FBTCxDQUFXLEdBQVgsQ0FBZSxDQUFmLENBQVA7QUFDUjs7O2lDQUVZLEMsRUFBRyxDLEVBQUc7QUFDZixXQUFLLElBQUksRUFBVCxJQUFlLENBQWYsRUFBa0I7QUFDZCxRQUFBLE9BQU8sQ0FBQyxNQUFSLENBQWUsS0FBSyxTQUFMLENBQWUsRUFBZixDQUFmO0FBQ0EsWUFBSSxJQUFJLEdBQUcsS0FBSyxTQUFMLENBQWUsRUFBZixFQUFtQixJQUE5QjtBQUNBLFFBQUEsSUFBSSxDQUFDLE1BQUwsQ0FBWSxDQUFaO0FBQ0EsWUFBSSxJQUFJLENBQUMsSUFBTCxLQUFjLENBQWxCLEVBQ0ksT0FBTyxLQUFLLFNBQUwsQ0FBZSxFQUFmLENBQVA7QUFDUDtBQUNKOzs7a0NBRWEsQyxFQUFHO0FBQUUsYUFBTyxJQUFJLElBQUosQ0FBUyxDQUFDLEdBQUcsS0FBSyxPQUFsQixDQUFQO0FBQW9DOzs7Z0NBQzNDLEMsRUFBRztBQUFFLGFBQU8sSUFBSSxJQUFKLENBQVMsQ0FBQyxDQUFDLEdBQUcsQ0FBTCxJQUFVLEtBQUssT0FBeEIsQ0FBUDtBQUEwQzs7OzZCQUVsRCxDLEVBQWtCO0FBQUEsVUFBZixLQUFlLHVFQUFQLEtBQU87QUFDdkI7QUFDQSxVQUFJLEtBQUssU0FBTCxDQUFlLGNBQWYsQ0FBOEIsQ0FBQyxDQUFDLEVBQWhDLENBQUosRUFDSSxLQUFLLFdBQUwsQ0FBaUIsQ0FBakI7QUFDSixVQUFJLENBQUMsR0FBRyxLQUFLLG9CQUFMLENBQTBCLENBQTFCLENBQVI7QUFDQSxVQUFJLEVBQUUsR0FBRyxDQUFDLENBQUMsS0FBWDtBQUNBLFVBQUksRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFYO0FBQ0EsVUFBSSxDQUFDLEdBQUcsS0FBSyxLQUFMLENBQVcsTUFBbkI7QUFDQSxVQUFJLElBQUksR0FBRyxJQUFJLEdBQUosRUFBWDs7QUFDQSxXQUFLLElBQUksQ0FBQyxHQUFHLEVBQWIsRUFBaUIsQ0FBQyxJQUFJLEVBQXRCLEVBQTBCLENBQUMsRUFBM0IsRUFDQTtBQUNJLFFBQUEsSUFBSSxDQUFDLEdBQUwsQ0FBUyxDQUFUO0FBQ0EsWUFBSSxDQUFDLEtBQUssS0FBTCxDQUFXLEdBQVgsQ0FBZSxDQUFmLENBQUwsRUFBd0IsQ0FBQztBQUM1Qjs7QUFDRCxXQUFLLFNBQUwsQ0FBZSxDQUFDLENBQUMsRUFBakIsSUFBdUI7QUFDbkIsUUFBQSxJQUFJLEVBQUosSUFEbUI7QUFFbkIsUUFBQSxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBRlEsT0FBdkI7QUFJQSxVQUFJLENBQUMsS0FBRCxJQUFVLENBQUMsR0FBRyxLQUFLLE9BQUwsQ0FBYSxjQUEvQixFQUErQztBQUMvQyxVQUFJLEVBQUUsS0FBSyxFQUFYLEVBQ0ksS0FBSyxPQUFMLENBQWEsRUFBYixFQUFpQixDQUFDLENBQUMsRUFBbkIsSUFBeUI7QUFDckIsUUFBQSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBRFk7QUFFckIsUUFBQSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBRmM7QUFHckIsUUFBQSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBSGUsT0FBekIsQ0FESixLQU1BO0FBQ0ksYUFBSyxPQUFMLENBQWEsRUFBYixFQUFpQixDQUFDLENBQUMsRUFBbkIsSUFBeUI7QUFDckIsVUFBQSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBRFk7QUFFckIsVUFBQSxHQUFHLEVBQUUsS0FBSyxXQUFMLENBQWlCLEVBQWpCLENBRmdCO0FBR3JCLFVBQUEsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUhlLFNBQXpCO0FBSUEsYUFBSyxPQUFMLENBQWEsRUFBYixFQUFpQixDQUFDLENBQUMsRUFBbkIsSUFBeUI7QUFDckIsVUFBQSxLQUFLLEVBQUUsS0FBSyxhQUFMLENBQW1CLEVBQW5CLENBRGM7QUFFckIsVUFBQSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBRmM7QUFHckIsVUFBQSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBSGUsU0FBekI7O0FBSUEsYUFBSyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBbEIsRUFBcUIsQ0FBQyxHQUFHLEVBQXpCLEVBQTZCLENBQUMsRUFBOUI7QUFDSSxlQUFLLE9BQUwsQ0FBYSxDQUFiLEVBQWdCLENBQUMsQ0FBQyxFQUFsQixJQUF3QjtBQUNwQixZQUFBLEtBQUssRUFBRSxLQUFLLGFBQUwsQ0FBbUIsQ0FBbkIsQ0FEYTtBQUVwQixZQUFBLEdBQUcsRUFBRSxLQUFLLFdBQUwsQ0FBaUIsQ0FBakIsQ0FGZTtBQUdwQixZQUFBLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFIYyxXQUF4QjtBQURKO0FBS0g7QUFDSjs7O2dDQUVXLEMsRUFBRztBQUFBOztBQUNYLFVBQUksSUFBSSxHQUFHLEtBQUssU0FBTCxDQUFlLENBQUMsQ0FBQyxFQUFqQixFQUFxQixJQUFoQztBQUNBLE1BQUEsT0FBTyxDQUFDLE1BQVIsQ0FBZSxJQUFmO0FBQ0EsTUFBQSxJQUFJLENBQUMsT0FBTCxDQUFhLFVBQUEsQ0FBQztBQUFBLGVBQUksT0FBTyxNQUFJLENBQUMsT0FBTCxDQUFhLENBQWIsRUFBZ0IsQ0FBQyxDQUFDLEVBQWxCLENBQVg7QUFBQSxPQUFkO0FBQ0EsYUFBTyxLQUFLLFNBQUwsQ0FBZSxDQUFDLENBQUMsRUFBakIsQ0FBUDtBQUNIOzs7a0NBRWEsQyxFQUFHLEssRUFBTyxHLEVBQUs7QUFDekIsVUFBSSxDQUFDLEdBQUcsS0FBSyxPQUFMLENBQWEsQ0FBYixDQUFSLENBRHlCLENBRXpCOztBQUNBLFVBQUksT0FBTyxHQUFHLEVBQWQ7O0FBQ0EsV0FBSyxJQUFJLEVBQVQsSUFBZSxDQUFmLEVBQWtCO0FBQ2QsWUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFELENBQUQsQ0FBTSxLQUFOLElBQWUsR0FBZixJQUFzQixDQUFDLENBQUMsRUFBRCxDQUFELENBQU0sR0FBTixJQUFhLEtBQXJDLENBQUosRUFDQTtBQUNJLFVBQUEsT0FBTyxDQUFDLElBQVIsQ0FBYTtBQUNULFlBQUEsRUFBRSxFQUFGLEVBRFM7QUFFVCxZQUFBLEtBQUssRUFBRSxDQUFDLENBQUMsRUFBRCxDQUFELENBQU0sS0FBTixHQUFjLEtBQWQsR0FBc0IsS0FBdEIsR0FBNkIsQ0FBQyxDQUFDLEVBQUQsQ0FBRCxDQUFNLEtBRmpDO0FBR1QsWUFBQSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUQsQ0FBRCxDQUFNLEdBQU4sR0FBWSxHQUFaLEdBQWtCLEdBQWxCLEdBQXVCLENBQUMsQ0FBQyxFQUFELENBQUQsQ0FBTSxHQUh6QjtBQUlULFlBQUEsT0FBTyxFQUFFLEtBQUssU0FBTCxDQUFlLEVBQWYsRUFBbUI7QUFKbkIsV0FBYjtBQU1IO0FBQ0o7O0FBQ0QsYUFBTyxPQUFQO0FBQ0g7OztvQ0FFZSxFLEVBQUk7QUFDaEIsVUFBSSxDQUFDLEdBQUcsS0FBSyxvQkFBTCxDQUEwQixFQUExQixDQUFSO0FBQ0EsVUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQVg7QUFDQSxVQUFJLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBWDtBQUNBLFVBQUksT0FBTyxHQUFHLEtBQUssYUFBTCxDQUFtQixFQUFuQixFQUF1QixFQUFFLENBQUMsS0FBMUIsRUFBaUMsRUFBRSxDQUFDLEdBQXBDLENBQWQ7O0FBQ0EsV0FBSyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBbEIsRUFBcUIsQ0FBQyxHQUFHLEVBQXpCLEVBQTZCLENBQUMsRUFBOUIsRUFDQTtBQUNJLFlBQUksQ0FBQyxHQUFHLEtBQUssT0FBTCxDQUFhLENBQWIsQ0FBUjs7QUFDQSxhQUFLLElBQUksRUFBVCxJQUFlLENBQWY7QUFDSSxVQUFBLE9BQU8sQ0FBQyxJQUFSLENBQWEsQ0FBQyxDQUFDLEVBQUQsQ0FBZDtBQURKO0FBRUg7O0FBQ0QsVUFBSSxFQUFFLEdBQUcsRUFBVCxFQUNJLE9BQU8sQ0FBQyxJQUFSLE9BQUEsT0FBTyxxQkFBUyxLQUFLLGFBQUwsQ0FBbUIsRUFBbkIsRUFBdUIsRUFBRSxDQUFDLEtBQTFCLEVBQWlDLEVBQUUsQ0FBQyxHQUFwQyxDQUFULEVBQVA7QUFDSixhQUFPLE9BQVA7QUFDSDs7OzJCQUVNO0FBQUE7O0FBQ0gsYUFBTyxLQUFLLEtBQUwsQ0FBVyxJQUFYLENBQWdCLFVBQUEsS0FBSztBQUFBLGVBQUksVUFBUyxDQUFDLE1BQUksQ0FBQyxLQUFOLEVBQWEsS0FBYixFQUFvQixNQUFJLENBQUMsU0FBekIsQ0FBVCxDQUE2QyxJQUE3QyxDQUFrRCxVQUFBLENBQUMsRUFBSTtBQUNuRixjQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsT0FBRixDQUFVLEdBQVYsQ0FBYyxVQUFBLENBQUM7QUFBQSxtQkFBSSxDQUFDLENBQUMsS0FBRixHQUFVLE9BQU8sQ0FBQyxPQUFSLENBQWdCLENBQWhCLENBQVYsR0FBK0IsUUFBUSxDQUFDLE1BQUksQ0FBQyxLQUFOLEVBQWEsQ0FBQyxDQUFDLEVBQWYsRUFBbUIsS0FBbkIsQ0FBM0M7QUFBQSxXQUFmLENBQVY7QUFDQSxpQkFBTyxPQUFPLENBQUMsR0FBUixDQUFZLEdBQVosRUFBaUIsSUFBakIsQ0FBc0IsVUFBQSxPQUFPLEVBQUk7QUFDcEMsWUFBQSxPQUFPLENBQUMsT0FBUixDQUFnQixVQUFBLENBQUMsRUFBSTtBQUNqQixjQUFBLENBQUMsQ0FBQyxLQUFGLEdBQVUsSUFBSSxJQUFKLENBQVMsQ0FBQyxDQUFDLEtBQUYsQ0FBUSxRQUFqQixDQUFWO0FBQ0EsY0FBQSxDQUFDLENBQUMsR0FBRixHQUFRLElBQUksSUFBSixDQUFTLENBQUMsQ0FBQyxHQUFGLENBQU0sUUFBZixDQUFSO0FBQ0Esa0JBQUksQ0FBQyxDQUFDLE1BQUYsS0FBYSxXQUFqQixFQUNJLE1BQUksQ0FBQyxRQUFMLENBQWMsQ0FBZCxFQURKLEtBRUssSUFBSSxDQUFDLENBQUMsTUFBRixLQUFhLFdBQWpCLEVBQ0QsTUFBSSxDQUFDLFdBQUwsQ0FBaUIsQ0FBakI7QUFDUCxhQVBEO0FBUUEsWUFBQSxNQUFJLENBQUMsU0FBTCxHQUFpQixDQUFDLENBQUMsYUFBbkI7QUFDSCxXQVZNLENBQVA7QUFXSCxTQWIrQixDQUFKO0FBQUEsT0FBckIsRUFhSCxLQWJHLENBYUcsVUFBQSxDQUFDLEVBQUk7QUFDWCxZQUFJLENBQUMsS0FBSyxTQUFTLENBQUMsZ0JBQXBCLEVBQXNDO0FBQ2xDLFVBQUEsTUFBSSxDQUFDLFNBQUwsR0FBaUIsRUFBakI7O0FBQ0EsVUFBQSxNQUFJLENBQUMsSUFBTDtBQUNILFNBSEQsTUFHTyxNQUFNLENBQU47QUFDVixPQWxCTSxDQUFQO0FBbUJIOzs7OEJBRVMsSyxFQUFPLEcsRUFBSztBQUFBOztBQUNsQixVQUFJLENBQUMsR0FBRyxLQUFLLG9CQUFMLENBQTBCO0FBQUUsUUFBQSxLQUFLLEVBQUwsS0FBRjtBQUFTLFFBQUEsR0FBRyxFQUFIO0FBQVQsT0FBMUIsQ0FBUjtBQUNBLFVBQUksS0FBSyxHQUFHLEVBQVo7O0FBQ0EsV0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBZixFQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDLEdBQTdCLEVBQWtDLENBQUMsRUFBbkM7QUFDSSxZQUFJLENBQUMsS0FBSyxLQUFMLENBQVcsR0FBWCxDQUFlLENBQWYsQ0FBTCxFQUNBO0FBQ0ksY0FBSSxDQUFDLEtBQUssQ0FBQyxjQUFOLENBQXFCLE9BQXJCLENBQUwsRUFDSSxLQUFLLENBQUMsS0FBTixHQUFjLENBQWQ7QUFDSixVQUFBLEtBQUssQ0FBQyxHQUFOLEdBQVksQ0FBWjtBQUNIO0FBTkw7O0FBT0EsTUFBQSxPQUFPLENBQUMsR0FBUixrQkFBc0IsS0FBdEIsbUJBQW9DLEdBQXBDOztBQUNBLFVBQUksS0FBSyxDQUFDLGNBQU4sQ0FBcUIsT0FBckIsQ0FBSixFQUNBO0FBQ0ksUUFBQSxPQUFPLENBQUMsTUFBUixDQUFlLEtBQUssQ0FBQyxLQUFOLElBQWUsS0FBSyxDQUFDLEdBQXBDOztBQUNBLFlBQUksS0FBSyxDQUFDLEdBQU4sR0FBWSxLQUFLLENBQUMsS0FBbEIsR0FBMEIsQ0FBMUIsR0FBOEIsS0FBSyxPQUFMLENBQWEsVUFBL0MsRUFBMkQ7QUFDdkQsVUFBQSxPQUFPLENBQUMsR0FBUjtBQUNBLGlCQUFPLEtBQUssS0FBTCxDQUFXLElBQVgsQ0FBZ0IsVUFBQSxLQUFLO0FBQUEsbUJBQUksVUFBUyxDQUFDLE1BQUksQ0FBQyxLQUFOLEVBQWEsS0FBYixFQUFvQixJQUFwQixFQUNqQyxLQUFLLENBQUMsV0FBTixFQURpQyxFQUNaLEdBQUcsQ0FBQyxXQUFKLEVBRFksQ0FBVCxDQUNnQixJQURoQixDQUNxQixVQUFBLENBQUMsRUFBSTtBQUN0RCxrQkFBSSxPQUFPLEdBQUcsRUFBZDtBQUNBLGNBQUEsQ0FBQyxDQUFDLE9BQUYsQ0FBVSxPQUFWLENBQWtCLFVBQUEsQ0FBQyxFQUFJO0FBQ25CLGdCQUFBLE9BQU8sQ0FBQyxNQUFSLENBQWUsQ0FBQyxDQUFDLEtBQWpCO0FBQ0EsZ0JBQUEsQ0FBQyxDQUFDLEtBQUYsR0FBVSxJQUFJLElBQUosQ0FBUyxDQUFDLENBQUMsS0FBRixDQUFRLFFBQWpCLENBQVY7QUFDQSxnQkFBQSxDQUFDLENBQUMsR0FBRixHQUFRLElBQUksSUFBSixDQUFTLENBQUMsQ0FBQyxHQUFGLENBQU0sUUFBZixDQUFSO0FBQ0EsZ0JBQUEsT0FBTyxDQUFDLElBQVIsQ0FBYSxDQUFiO0FBQ0gsZUFMRDtBQU1BLHFCQUFPLE9BQU8sQ0FBQyxNQUFSLENBQWUsVUFBQSxDQUFDO0FBQUEsdUJBQUksRUFBRSxDQUFDLENBQUMsS0FBRixJQUFXLEdBQVgsSUFBa0IsQ0FBQyxDQUFDLEdBQUYsSUFBUyxLQUE3QixDQUFKO0FBQUEsZUFBaEIsRUFBeUQsR0FBekQsQ0FBNkQsVUFBQSxDQUFDLEVBQUk7QUFDckUsdUJBQU87QUFDSCxrQkFBQSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBREg7QUFFSCxrQkFBQSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUYsR0FBVSxLQUFWLEdBQWtCLEtBQWxCLEdBQXlCLENBQUMsQ0FBQyxLQUYvQjtBQUdILGtCQUFBLEdBQUcsRUFBRSxDQUFDLENBQUMsR0FBRixHQUFRLEdBQVIsR0FBYyxHQUFkLEdBQW1CLENBQUMsQ0FBQyxHQUh2QjtBQUlILGtCQUFBLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFKUixpQkFBUDtBQU1ILGVBUE0sQ0FBUDtBQVFILGFBakIrQixDQUFKO0FBQUEsV0FBckIsQ0FBUDtBQWtCSDs7QUFFRCxRQUFBLE9BQU8sQ0FBQyxHQUFSO0FBQ0EsZUFBTyxLQUFLLEtBQUwsQ0FBVyxJQUFYLENBQWdCLFVBQUEsS0FBSztBQUFBLGlCQUFJLFVBQVMsQ0FBQyxNQUFJLENBQUMsS0FBTixFQUFhLEtBQWIsRUFBb0IsSUFBcEIsRUFDckMsTUFBSSxDQUFDLGFBQUwsQ0FBbUIsS0FBSyxDQUFDLEtBQXpCLEVBQWdDLFdBQWhDLEVBRHFDLEVBRXJDLE1BQUksQ0FBQyxXQUFMLENBQWlCLEtBQUssQ0FBQyxHQUF2QixFQUE0QixXQUE1QixFQUZxQyxDQUFULENBRWUsSUFGZixDQUVvQixVQUFBLENBQUMsRUFBSTtBQUNqRCxZQUFBLENBQUMsQ0FBQyxPQUFGLENBQVUsT0FBVixDQUFrQixVQUFBLENBQUMsRUFBSTtBQUNuQixrQkFBSSxDQUFDLENBQUMsTUFBRixLQUFhLFdBQWpCLEVBQ0E7QUFDSSxnQkFBQSxPQUFPLENBQUMsTUFBUixDQUFlLENBQUMsQ0FBQyxLQUFqQjtBQUNBLGdCQUFBLENBQUMsQ0FBQyxLQUFGLEdBQVUsSUFBSSxJQUFKLENBQVMsQ0FBQyxDQUFDLEtBQUYsQ0FBUSxRQUFqQixDQUFWO0FBQ0EsZ0JBQUEsQ0FBQyxDQUFDLEdBQUYsR0FBUSxJQUFJLElBQUosQ0FBUyxDQUFDLENBQUMsR0FBRixDQUFNLFFBQWYsQ0FBUjs7QUFDQSxnQkFBQSxNQUFJLENBQUMsUUFBTCxDQUFjLENBQWQsRUFBaUIsSUFBakI7QUFDSDtBQUNKLGFBUkQ7QUFTQSxnQkFBSSxNQUFJLENBQUMsU0FBTCxLQUFtQixFQUF2QixFQUNJLE1BQUksQ0FBQyxTQUFMLEdBQWlCLENBQUMsQ0FBQyxhQUFuQjtBQUNQLFdBZDJCLENBQUo7QUFBQSxTQUFyQixFQWNDLElBZEQsQ0FjTTtBQUFBLGlCQUFNLE1BQUksQ0FBQyxJQUFMLEVBQU47QUFBQSxTQWROLEVBZUYsSUFmRSxDQWVHO0FBQUEsaUJBQU0sTUFBSSxDQUFDLGVBQUwsQ0FBcUI7QUFBRSxZQUFBLEtBQUssRUFBTCxLQUFGO0FBQVMsWUFBQSxHQUFHLEVBQUg7QUFBVCxXQUFyQixDQUFOO0FBQUEsU0FmSCxDQUFQO0FBZ0JILE9BMUNELE1BNENBO0FBQ0ksUUFBQSxPQUFPLENBQUMsR0FBUjtBQUNBLGVBQU8sS0FBSyxJQUFMLEdBQVksSUFBWixDQUFpQjtBQUFBLGlCQUFNLE1BQUksQ0FBQyxlQUFMLENBQXFCO0FBQUUsWUFBQSxLQUFLLEVBQUwsS0FBRjtBQUFTLFlBQUEsR0FBRyxFQUFIO0FBQVQsV0FBckIsQ0FBTjtBQUFBLFNBQWpCLENBQVA7QUFDSDtBQUNKOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUMzUkwsSUFBTSxlQUFlLEdBQUcsZ0JBQXhCO0FBQ0EsSUFBTSxZQUFZLEdBQUcsYUFBckI7QUFDQSxJQUFNLGdCQUFnQixHQUFHLGlCQUF6QjtBQUNBLElBQU0sYUFBYSxHQUFHLGNBQXRCO0FBQ0EsSUFBTSxhQUFhLEdBQUcsY0FBdEI7QUFFTyxJQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsTUFBUCxDQUFjO0FBQ2pDLEVBQUEsY0FBYyxFQUFFLE1BQU0sQ0FBQyxlQUFELENBRFc7QUFFakMsRUFBQSxXQUFXLEVBQUUsTUFBTSxDQUFDLFlBQUQsQ0FGYztBQUdqQyxFQUFBLGVBQWUsRUFBRSxNQUFNLENBQUMsZ0JBQUQsQ0FIVTtBQUlqQyxFQUFBLFlBQVksRUFBRSxNQUFNLENBQUMsYUFBRCxDQUphO0FBS2pDLEVBQUEsWUFBWSxFQUFFLE1BQU0sQ0FBQyxhQUFEO0FBTGEsQ0FBZCxDQUFoQjs7O0FBUVAsU0FBUyxnQkFBVCxDQUEwQixFQUExQixFQUE4QjtBQUMxQixVQUFRLEVBQVI7QUFDSSxTQUFLLE9BQU8sQ0FBQyxjQUFiO0FBQTZCLGFBQU8sZUFBUDs7QUFDN0IsU0FBSyxPQUFPLENBQUMsV0FBYjtBQUEwQixhQUFPLFlBQVA7O0FBQzFCLFNBQUssT0FBTyxDQUFDLGVBQWI7QUFBOEIsYUFBTyxnQkFBUDs7QUFDOUIsU0FBSyxPQUFPLENBQUMsWUFBYjtBQUEyQixhQUFPLGFBQVA7O0FBQzNCLFNBQUssT0FBTyxDQUFDLFlBQWI7QUFBMkIsYUFBTyxhQUFQO0FBTC9CO0FBT0g7O0FBRUQsU0FBUyxZQUFULENBQXNCLENBQXRCLEVBQXlCO0FBQ3JCLFVBQU8sQ0FBUDtBQUNJLFNBQUssZUFBTDtBQUFzQixhQUFPLE9BQU8sQ0FBQyxjQUFmOztBQUN0QixTQUFLLFlBQUw7QUFBbUIsYUFBTyxPQUFPLENBQUMsV0FBZjs7QUFDbkIsU0FBSyxnQkFBTDtBQUF1QixhQUFPLE9BQU8sQ0FBQyxlQUFmOztBQUN2QixTQUFLLGFBQUw7QUFBb0IsYUFBTyxPQUFPLENBQUMsWUFBZjs7QUFDcEIsU0FBSyxhQUFMO0FBQW9CLGFBQU8sT0FBTyxDQUFDLFlBQWY7QUFMeEI7QUFPSDs7SUFFWSxHOzs7QUFDVCxlQUFZLEVBQVosRUFBZ0IsSUFBaEIsRUFBc0IsSUFBdEIsRUFBNEI7QUFBQTs7QUFDeEIsU0FBSyxFQUFMLEdBQVUsRUFBVjtBQUNBLFNBQUssSUFBTCxHQUFZLElBQVo7QUFDQSxTQUFLLElBQUwsR0FBWSxJQUFaO0FBQ0g7Ozs7NEJBQ08sSSxFQUFNO0FBQUUsYUFBTyxJQUFJLEdBQUosQ0FBUSxLQUFLLEVBQWIsRUFBaUIsS0FBSyxJQUF0QixFQUE0QixJQUE1QixDQUFQO0FBQTJDOzs7OEJBQ2pEO0FBQ04sYUFBTztBQUNILFFBQUEsRUFBRSxFQUFFLEtBQUssRUFETjtBQUVILFFBQUEsSUFBSSxFQUFFLGdCQUFnQixDQUFDLEtBQUssSUFBTixDQUZuQjtBQUdILFFBQUEsSUFBSSxFQUFFLEtBQUs7QUFIUixPQUFQO0FBS0g7Ozs7Ozs7O2dCQWJRLEcsYUFjUSxVQUFBLEdBQUc7QUFBQSxTQUFJLElBQUksR0FBSixDQUFRLEdBQUcsQ0FBQyxFQUFaLEVBQWdCLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBTCxDQUE1QixFQUF3QyxHQUFHLENBQUMsSUFBNUMsQ0FBSjtBQUFBLEMiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIndXNlIHN0cmljdCdcblxuLy8gQSBsaW5rZWQgbGlzdCB0byBrZWVwIHRyYWNrIG9mIHJlY2VudGx5LXVzZWQtbmVzc1xuY29uc3QgWWFsbGlzdCA9IHJlcXVpcmUoJ3lhbGxpc3QnKVxuXG5jb25zdCBNQVggPSBTeW1ib2woJ21heCcpXG5jb25zdCBMRU5HVEggPSBTeW1ib2woJ2xlbmd0aCcpXG5jb25zdCBMRU5HVEhfQ0FMQ1VMQVRPUiA9IFN5bWJvbCgnbGVuZ3RoQ2FsY3VsYXRvcicpXG5jb25zdCBBTExPV19TVEFMRSA9IFN5bWJvbCgnYWxsb3dTdGFsZScpXG5jb25zdCBNQVhfQUdFID0gU3ltYm9sKCdtYXhBZ2UnKVxuY29uc3QgRElTUE9TRSA9IFN5bWJvbCgnZGlzcG9zZScpXG5jb25zdCBOT19ESVNQT1NFX09OX1NFVCA9IFN5bWJvbCgnbm9EaXNwb3NlT25TZXQnKVxuY29uc3QgTFJVX0xJU1QgPSBTeW1ib2woJ2xydUxpc3QnKVxuY29uc3QgQ0FDSEUgPSBTeW1ib2woJ2NhY2hlJylcbmNvbnN0IFVQREFURV9BR0VfT05fR0VUID0gU3ltYm9sKCd1cGRhdGVBZ2VPbkdldCcpXG5cbmNvbnN0IG5haXZlTGVuZ3RoID0gKCkgPT4gMVxuXG4vLyBscnVMaXN0IGlzIGEgeWFsbGlzdCB3aGVyZSB0aGUgaGVhZCBpcyB0aGUgeW91bmdlc3Rcbi8vIGl0ZW0sIGFuZCB0aGUgdGFpbCBpcyB0aGUgb2xkZXN0LiAgdGhlIGxpc3QgY29udGFpbnMgdGhlIEhpdFxuLy8gb2JqZWN0cyBhcyB0aGUgZW50cmllcy5cbi8vIEVhY2ggSGl0IG9iamVjdCBoYXMgYSByZWZlcmVuY2UgdG8gaXRzIFlhbGxpc3QuTm9kZS4gIFRoaXNcbi8vIG5ldmVyIGNoYW5nZXMuXG4vL1xuLy8gY2FjaGUgaXMgYSBNYXAgKG9yIFBzZXVkb01hcCkgdGhhdCBtYXRjaGVzIHRoZSBrZXlzIHRvXG4vLyB0aGUgWWFsbGlzdC5Ob2RlIG9iamVjdC5cbmNsYXNzIExSVUNhY2hlIHtcbiAgY29uc3RydWN0b3IgKG9wdGlvbnMpIHtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKVxuICAgICAgb3B0aW9ucyA9IHsgbWF4OiBvcHRpb25zIH1cblxuICAgIGlmICghb3B0aW9ucylcbiAgICAgIG9wdGlvbnMgPSB7fVxuXG4gICAgaWYgKG9wdGlvbnMubWF4ICYmICh0eXBlb2Ygb3B0aW9ucy5tYXggIT09ICdudW1iZXInIHx8IG9wdGlvbnMubWF4IDwgMCkpXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtYXggbXVzdCBiZSBhIG5vbi1uZWdhdGl2ZSBudW1iZXInKVxuICAgIC8vIEtpbmQgb2Ygd2VpcmQgdG8gaGF2ZSBhIGRlZmF1bHQgbWF4IG9mIEluZmluaXR5LCBidXQgb2ggd2VsbC5cbiAgICBjb25zdCBtYXggPSB0aGlzW01BWF0gPSBvcHRpb25zLm1heCB8fCBJbmZpbml0eVxuXG4gICAgY29uc3QgbGMgPSBvcHRpb25zLmxlbmd0aCB8fCBuYWl2ZUxlbmd0aFxuICAgIHRoaXNbTEVOR1RIX0NBTENVTEFUT1JdID0gKHR5cGVvZiBsYyAhPT0gJ2Z1bmN0aW9uJykgPyBuYWl2ZUxlbmd0aCA6IGxjXG4gICAgdGhpc1tBTExPV19TVEFMRV0gPSBvcHRpb25zLnN0YWxlIHx8IGZhbHNlXG4gICAgaWYgKG9wdGlvbnMubWF4QWdlICYmIHR5cGVvZiBvcHRpb25zLm1heEFnZSAhPT0gJ251bWJlcicpXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtYXhBZ2UgbXVzdCBiZSBhIG51bWJlcicpXG4gICAgdGhpc1tNQVhfQUdFXSA9IG9wdGlvbnMubWF4QWdlIHx8IDBcbiAgICB0aGlzW0RJU1BPU0VdID0gb3B0aW9ucy5kaXNwb3NlXG4gICAgdGhpc1tOT19ESVNQT1NFX09OX1NFVF0gPSBvcHRpb25zLm5vRGlzcG9zZU9uU2V0IHx8IGZhbHNlXG4gICAgdGhpc1tVUERBVEVfQUdFX09OX0dFVF0gPSBvcHRpb25zLnVwZGF0ZUFnZU9uR2V0IHx8IGZhbHNlXG4gICAgdGhpcy5yZXNldCgpXG4gIH1cblxuICAvLyByZXNpemUgdGhlIGNhY2hlIHdoZW4gdGhlIG1heCBjaGFuZ2VzLlxuICBzZXQgbWF4IChtTCkge1xuICAgIGlmICh0eXBlb2YgbUwgIT09ICdudW1iZXInIHx8IG1MIDwgMClcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ21heCBtdXN0IGJlIGEgbm9uLW5lZ2F0aXZlIG51bWJlcicpXG5cbiAgICB0aGlzW01BWF0gPSBtTCB8fCBJbmZpbml0eVxuICAgIHRyaW0odGhpcylcbiAgfVxuICBnZXQgbWF4ICgpIHtcbiAgICByZXR1cm4gdGhpc1tNQVhdXG4gIH1cblxuICBzZXQgYWxsb3dTdGFsZSAoYWxsb3dTdGFsZSkge1xuICAgIHRoaXNbQUxMT1dfU1RBTEVdID0gISFhbGxvd1N0YWxlXG4gIH1cbiAgZ2V0IGFsbG93U3RhbGUgKCkge1xuICAgIHJldHVybiB0aGlzW0FMTE9XX1NUQUxFXVxuICB9XG5cbiAgc2V0IG1heEFnZSAobUEpIHtcbiAgICBpZiAodHlwZW9mIG1BICE9PSAnbnVtYmVyJylcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ21heEFnZSBtdXN0IGJlIGEgbm9uLW5lZ2F0aXZlIG51bWJlcicpXG5cbiAgICB0aGlzW01BWF9BR0VdID0gbUFcbiAgICB0cmltKHRoaXMpXG4gIH1cbiAgZ2V0IG1heEFnZSAoKSB7XG4gICAgcmV0dXJuIHRoaXNbTUFYX0FHRV1cbiAgfVxuXG4gIC8vIHJlc2l6ZSB0aGUgY2FjaGUgd2hlbiB0aGUgbGVuZ3RoQ2FsY3VsYXRvciBjaGFuZ2VzLlxuICBzZXQgbGVuZ3RoQ2FsY3VsYXRvciAobEMpIHtcbiAgICBpZiAodHlwZW9mIGxDICE9PSAnZnVuY3Rpb24nKVxuICAgICAgbEMgPSBuYWl2ZUxlbmd0aFxuXG4gICAgaWYgKGxDICE9PSB0aGlzW0xFTkdUSF9DQUxDVUxBVE9SXSkge1xuICAgICAgdGhpc1tMRU5HVEhfQ0FMQ1VMQVRPUl0gPSBsQ1xuICAgICAgdGhpc1tMRU5HVEhdID0gMFxuICAgICAgdGhpc1tMUlVfTElTVF0uZm9yRWFjaChoaXQgPT4ge1xuICAgICAgICBoaXQubGVuZ3RoID0gdGhpc1tMRU5HVEhfQ0FMQ1VMQVRPUl0oaGl0LnZhbHVlLCBoaXQua2V5KVxuICAgICAgICB0aGlzW0xFTkdUSF0gKz0gaGl0Lmxlbmd0aFxuICAgICAgfSlcbiAgICB9XG4gICAgdHJpbSh0aGlzKVxuICB9XG4gIGdldCBsZW5ndGhDYWxjdWxhdG9yICgpIHsgcmV0dXJuIHRoaXNbTEVOR1RIX0NBTENVTEFUT1JdIH1cblxuICBnZXQgbGVuZ3RoICgpIHsgcmV0dXJuIHRoaXNbTEVOR1RIXSB9XG4gIGdldCBpdGVtQ291bnQgKCkgeyByZXR1cm4gdGhpc1tMUlVfTElTVF0ubGVuZ3RoIH1cblxuICByZm9yRWFjaCAoZm4sIHRoaXNwKSB7XG4gICAgdGhpc3AgPSB0aGlzcCB8fCB0aGlzXG4gICAgZm9yIChsZXQgd2Fsa2VyID0gdGhpc1tMUlVfTElTVF0udGFpbDsgd2Fsa2VyICE9PSBudWxsOykge1xuICAgICAgY29uc3QgcHJldiA9IHdhbGtlci5wcmV2XG4gICAgICBmb3JFYWNoU3RlcCh0aGlzLCBmbiwgd2Fsa2VyLCB0aGlzcClcbiAgICAgIHdhbGtlciA9IHByZXZcbiAgICB9XG4gIH1cblxuICBmb3JFYWNoIChmbiwgdGhpc3ApIHtcbiAgICB0aGlzcCA9IHRoaXNwIHx8IHRoaXNcbiAgICBmb3IgKGxldCB3YWxrZXIgPSB0aGlzW0xSVV9MSVNUXS5oZWFkOyB3YWxrZXIgIT09IG51bGw7KSB7XG4gICAgICBjb25zdCBuZXh0ID0gd2Fsa2VyLm5leHRcbiAgICAgIGZvckVhY2hTdGVwKHRoaXMsIGZuLCB3YWxrZXIsIHRoaXNwKVxuICAgICAgd2Fsa2VyID0gbmV4dFxuICAgIH1cbiAgfVxuXG4gIGtleXMgKCkge1xuICAgIHJldHVybiB0aGlzW0xSVV9MSVNUXS50b0FycmF5KCkubWFwKGsgPT4gay5rZXkpXG4gIH1cblxuICB2YWx1ZXMgKCkge1xuICAgIHJldHVybiB0aGlzW0xSVV9MSVNUXS50b0FycmF5KCkubWFwKGsgPT4gay52YWx1ZSlcbiAgfVxuXG4gIHJlc2V0ICgpIHtcbiAgICBpZiAodGhpc1tESVNQT1NFXSAmJlxuICAgICAgICB0aGlzW0xSVV9MSVNUXSAmJlxuICAgICAgICB0aGlzW0xSVV9MSVNUXS5sZW5ndGgpIHtcbiAgICAgIHRoaXNbTFJVX0xJU1RdLmZvckVhY2goaGl0ID0+IHRoaXNbRElTUE9TRV0oaGl0LmtleSwgaGl0LnZhbHVlKSlcbiAgICB9XG5cbiAgICB0aGlzW0NBQ0hFXSA9IG5ldyBNYXAoKSAvLyBoYXNoIG9mIGl0ZW1zIGJ5IGtleVxuICAgIHRoaXNbTFJVX0xJU1RdID0gbmV3IFlhbGxpc3QoKSAvLyBsaXN0IG9mIGl0ZW1zIGluIG9yZGVyIG9mIHVzZSByZWNlbmN5XG4gICAgdGhpc1tMRU5HVEhdID0gMCAvLyBsZW5ndGggb2YgaXRlbXMgaW4gdGhlIGxpc3RcbiAgfVxuXG4gIGR1bXAgKCkge1xuICAgIHJldHVybiB0aGlzW0xSVV9MSVNUXS5tYXAoaGl0ID0+XG4gICAgICBpc1N0YWxlKHRoaXMsIGhpdCkgPyBmYWxzZSA6IHtcbiAgICAgICAgazogaGl0LmtleSxcbiAgICAgICAgdjogaGl0LnZhbHVlLFxuICAgICAgICBlOiBoaXQubm93ICsgKGhpdC5tYXhBZ2UgfHwgMClcbiAgICAgIH0pLnRvQXJyYXkoKS5maWx0ZXIoaCA9PiBoKVxuICB9XG5cbiAgZHVtcExydSAoKSB7XG4gICAgcmV0dXJuIHRoaXNbTFJVX0xJU1RdXG4gIH1cblxuICBzZXQgKGtleSwgdmFsdWUsIG1heEFnZSkge1xuICAgIG1heEFnZSA9IG1heEFnZSB8fCB0aGlzW01BWF9BR0VdXG5cbiAgICBpZiAobWF4QWdlICYmIHR5cGVvZiBtYXhBZ2UgIT09ICdudW1iZXInKVxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbWF4QWdlIG11c3QgYmUgYSBudW1iZXInKVxuXG4gICAgY29uc3Qgbm93ID0gbWF4QWdlID8gRGF0ZS5ub3coKSA6IDBcbiAgICBjb25zdCBsZW4gPSB0aGlzW0xFTkdUSF9DQUxDVUxBVE9SXSh2YWx1ZSwga2V5KVxuXG4gICAgaWYgKHRoaXNbQ0FDSEVdLmhhcyhrZXkpKSB7XG4gICAgICBpZiAobGVuID4gdGhpc1tNQVhdKSB7XG4gICAgICAgIGRlbCh0aGlzLCB0aGlzW0NBQ0hFXS5nZXQoa2V5KSlcbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5vZGUgPSB0aGlzW0NBQ0hFXS5nZXQoa2V5KVxuICAgICAgY29uc3QgaXRlbSA9IG5vZGUudmFsdWVcblxuICAgICAgLy8gZGlzcG9zZSBvZiB0aGUgb2xkIG9uZSBiZWZvcmUgb3ZlcndyaXRpbmdcbiAgICAgIC8vIHNwbGl0IG91dCBpbnRvIDIgaWZzIGZvciBiZXR0ZXIgY292ZXJhZ2UgdHJhY2tpbmdcbiAgICAgIGlmICh0aGlzW0RJU1BPU0VdKSB7XG4gICAgICAgIGlmICghdGhpc1tOT19ESVNQT1NFX09OX1NFVF0pXG4gICAgICAgICAgdGhpc1tESVNQT1NFXShrZXksIGl0ZW0udmFsdWUpXG4gICAgICB9XG5cbiAgICAgIGl0ZW0ubm93ID0gbm93XG4gICAgICBpdGVtLm1heEFnZSA9IG1heEFnZVxuICAgICAgaXRlbS52YWx1ZSA9IHZhbHVlXG4gICAgICB0aGlzW0xFTkdUSF0gKz0gbGVuIC0gaXRlbS5sZW5ndGhcbiAgICAgIGl0ZW0ubGVuZ3RoID0gbGVuXG4gICAgICB0aGlzLmdldChrZXkpXG4gICAgICB0cmltKHRoaXMpXG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIGNvbnN0IGhpdCA9IG5ldyBFbnRyeShrZXksIHZhbHVlLCBsZW4sIG5vdywgbWF4QWdlKVxuXG4gICAgLy8gb3ZlcnNpemVkIG9iamVjdHMgZmFsbCBvdXQgb2YgY2FjaGUgYXV0b21hdGljYWxseS5cbiAgICBpZiAoaGl0Lmxlbmd0aCA+IHRoaXNbTUFYXSkge1xuICAgICAgaWYgKHRoaXNbRElTUE9TRV0pXG4gICAgICAgIHRoaXNbRElTUE9TRV0oa2V5LCB2YWx1ZSlcblxuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gICAgdGhpc1tMRU5HVEhdICs9IGhpdC5sZW5ndGhcbiAgICB0aGlzW0xSVV9MSVNUXS51bnNoaWZ0KGhpdClcbiAgICB0aGlzW0NBQ0hFXS5zZXQoa2V5LCB0aGlzW0xSVV9MSVNUXS5oZWFkKVxuICAgIHRyaW0odGhpcylcbiAgICByZXR1cm4gdHJ1ZVxuICB9XG5cbiAgaGFzIChrZXkpIHtcbiAgICBpZiAoIXRoaXNbQ0FDSEVdLmhhcyhrZXkpKSByZXR1cm4gZmFsc2VcbiAgICBjb25zdCBoaXQgPSB0aGlzW0NBQ0hFXS5nZXQoa2V5KS52YWx1ZVxuICAgIHJldHVybiAhaXNTdGFsZSh0aGlzLCBoaXQpXG4gIH1cblxuICBnZXQgKGtleSkge1xuICAgIHJldHVybiBnZXQodGhpcywga2V5LCB0cnVlKVxuICB9XG5cbiAgcGVlayAoa2V5KSB7XG4gICAgcmV0dXJuIGdldCh0aGlzLCBrZXksIGZhbHNlKVxuICB9XG5cbiAgcG9wICgpIHtcbiAgICBjb25zdCBub2RlID0gdGhpc1tMUlVfTElTVF0udGFpbFxuICAgIGlmICghbm9kZSlcbiAgICAgIHJldHVybiBudWxsXG5cbiAgICBkZWwodGhpcywgbm9kZSlcbiAgICByZXR1cm4gbm9kZS52YWx1ZVxuICB9XG5cbiAgZGVsIChrZXkpIHtcbiAgICBkZWwodGhpcywgdGhpc1tDQUNIRV0uZ2V0KGtleSkpXG4gIH1cblxuICBsb2FkIChhcnIpIHtcbiAgICAvLyByZXNldCB0aGUgY2FjaGVcbiAgICB0aGlzLnJlc2V0KClcblxuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KClcbiAgICAvLyBBIHByZXZpb3VzIHNlcmlhbGl6ZWQgY2FjaGUgaGFzIHRoZSBtb3N0IHJlY2VudCBpdGVtcyBmaXJzdFxuICAgIGZvciAobGV0IGwgPSBhcnIubGVuZ3RoIC0gMTsgbCA+PSAwOyBsLS0pIHtcbiAgICAgIGNvbnN0IGhpdCA9IGFycltsXVxuICAgICAgY29uc3QgZXhwaXJlc0F0ID0gaGl0LmUgfHwgMFxuICAgICAgaWYgKGV4cGlyZXNBdCA9PT0gMClcbiAgICAgICAgLy8gdGhlIGl0ZW0gd2FzIGNyZWF0ZWQgd2l0aG91dCBleHBpcmF0aW9uIGluIGEgbm9uIGFnZWQgY2FjaGVcbiAgICAgICAgdGhpcy5zZXQoaGl0LmssIGhpdC52KVxuICAgICAgZWxzZSB7XG4gICAgICAgIGNvbnN0IG1heEFnZSA9IGV4cGlyZXNBdCAtIG5vd1xuICAgICAgICAvLyBkb250IGFkZCBhbHJlYWR5IGV4cGlyZWQgaXRlbXNcbiAgICAgICAgaWYgKG1heEFnZSA+IDApIHtcbiAgICAgICAgICB0aGlzLnNldChoaXQuaywgaGl0LnYsIG1heEFnZSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHBydW5lICgpIHtcbiAgICB0aGlzW0NBQ0hFXS5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiBnZXQodGhpcywga2V5LCBmYWxzZSkpXG4gIH1cbn1cblxuY29uc3QgZ2V0ID0gKHNlbGYsIGtleSwgZG9Vc2UpID0+IHtcbiAgY29uc3Qgbm9kZSA9IHNlbGZbQ0FDSEVdLmdldChrZXkpXG4gIGlmIChub2RlKSB7XG4gICAgY29uc3QgaGl0ID0gbm9kZS52YWx1ZVxuICAgIGlmIChpc1N0YWxlKHNlbGYsIGhpdCkpIHtcbiAgICAgIGRlbChzZWxmLCBub2RlKVxuICAgICAgaWYgKCFzZWxmW0FMTE9XX1NUQUxFXSlcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZFxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZG9Vc2UpIHtcbiAgICAgICAgaWYgKHNlbGZbVVBEQVRFX0FHRV9PTl9HRVRdKVxuICAgICAgICAgIG5vZGUudmFsdWUubm93ID0gRGF0ZS5ub3coKVxuICAgICAgICBzZWxmW0xSVV9MSVNUXS51bnNoaWZ0Tm9kZShub2RlKVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gaGl0LnZhbHVlXG4gIH1cbn1cblxuY29uc3QgaXNTdGFsZSA9IChzZWxmLCBoaXQpID0+IHtcbiAgaWYgKCFoaXQgfHwgKCFoaXQubWF4QWdlICYmICFzZWxmW01BWF9BR0VdKSlcbiAgICByZXR1cm4gZmFsc2VcblxuICBjb25zdCBkaWZmID0gRGF0ZS5ub3coKSAtIGhpdC5ub3dcbiAgcmV0dXJuIGhpdC5tYXhBZ2UgPyBkaWZmID4gaGl0Lm1heEFnZVxuICAgIDogc2VsZltNQVhfQUdFXSAmJiAoZGlmZiA+IHNlbGZbTUFYX0FHRV0pXG59XG5cbmNvbnN0IHRyaW0gPSBzZWxmID0+IHtcbiAgaWYgKHNlbGZbTEVOR1RIXSA+IHNlbGZbTUFYXSkge1xuICAgIGZvciAobGV0IHdhbGtlciA9IHNlbGZbTFJVX0xJU1RdLnRhaWw7XG4gICAgICBzZWxmW0xFTkdUSF0gPiBzZWxmW01BWF0gJiYgd2Fsa2VyICE9PSBudWxsOykge1xuICAgICAgLy8gV2Uga25vdyB0aGF0IHdlJ3JlIGFib3V0IHRvIGRlbGV0ZSB0aGlzIG9uZSwgYW5kIGFsc29cbiAgICAgIC8vIHdoYXQgdGhlIG5leHQgbGVhc3QgcmVjZW50bHkgdXNlZCBrZXkgd2lsbCBiZSwgc28ganVzdFxuICAgICAgLy8gZ28gYWhlYWQgYW5kIHNldCBpdCBub3cuXG4gICAgICBjb25zdCBwcmV2ID0gd2Fsa2VyLnByZXZcbiAgICAgIGRlbChzZWxmLCB3YWxrZXIpXG4gICAgICB3YWxrZXIgPSBwcmV2XG4gICAgfVxuICB9XG59XG5cbmNvbnN0IGRlbCA9IChzZWxmLCBub2RlKSA9PiB7XG4gIGlmIChub2RlKSB7XG4gICAgY29uc3QgaGl0ID0gbm9kZS52YWx1ZVxuICAgIGlmIChzZWxmW0RJU1BPU0VdKVxuICAgICAgc2VsZltESVNQT1NFXShoaXQua2V5LCBoaXQudmFsdWUpXG5cbiAgICBzZWxmW0xFTkdUSF0gLT0gaGl0Lmxlbmd0aFxuICAgIHNlbGZbQ0FDSEVdLmRlbGV0ZShoaXQua2V5KVxuICAgIHNlbGZbTFJVX0xJU1RdLnJlbW92ZU5vZGUobm9kZSlcbiAgfVxufVxuXG5jbGFzcyBFbnRyeSB7XG4gIGNvbnN0cnVjdG9yIChrZXksIHZhbHVlLCBsZW5ndGgsIG5vdywgbWF4QWdlKSB7XG4gICAgdGhpcy5rZXkgPSBrZXlcbiAgICB0aGlzLnZhbHVlID0gdmFsdWVcbiAgICB0aGlzLmxlbmd0aCA9IGxlbmd0aFxuICAgIHRoaXMubm93ID0gbm93XG4gICAgdGhpcy5tYXhBZ2UgPSBtYXhBZ2UgfHwgMFxuICB9XG59XG5cbmNvbnN0IGZvckVhY2hTdGVwID0gKHNlbGYsIGZuLCBub2RlLCB0aGlzcCkgPT4ge1xuICBsZXQgaGl0ID0gbm9kZS52YWx1ZVxuICBpZiAoaXNTdGFsZShzZWxmLCBoaXQpKSB7XG4gICAgZGVsKHNlbGYsIG5vZGUpXG4gICAgaWYgKCFzZWxmW0FMTE9XX1NUQUxFXSlcbiAgICAgIGhpdCA9IHVuZGVmaW5lZFxuICB9XG4gIGlmIChoaXQpXG4gICAgZm4uY2FsbCh0aGlzcCwgaGl0LnZhbHVlLCBoaXQua2V5LCBzZWxmKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IExSVUNhY2hlXG4iLCIndXNlIHN0cmljdCdcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKFlhbGxpc3QpIHtcbiAgWWFsbGlzdC5wcm90b3R5cGVbU3ltYm9sLml0ZXJhdG9yXSA9IGZ1bmN0aW9uKiAoKSB7XG4gICAgZm9yIChsZXQgd2Fsa2VyID0gdGhpcy5oZWFkOyB3YWxrZXI7IHdhbGtlciA9IHdhbGtlci5uZXh0KSB7XG4gICAgICB5aWVsZCB3YWxrZXIudmFsdWVcbiAgICB9XG4gIH1cbn1cbiIsIid1c2Ugc3RyaWN0J1xubW9kdWxlLmV4cG9ydHMgPSBZYWxsaXN0XG5cbllhbGxpc3QuTm9kZSA9IE5vZGVcbllhbGxpc3QuY3JlYXRlID0gWWFsbGlzdFxuXG5mdW5jdGlvbiBZYWxsaXN0IChsaXN0KSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoIShzZWxmIGluc3RhbmNlb2YgWWFsbGlzdCkpIHtcbiAgICBzZWxmID0gbmV3IFlhbGxpc3QoKVxuICB9XG5cbiAgc2VsZi50YWlsID0gbnVsbFxuICBzZWxmLmhlYWQgPSBudWxsXG4gIHNlbGYubGVuZ3RoID0gMFxuXG4gIGlmIChsaXN0ICYmIHR5cGVvZiBsaXN0LmZvckVhY2ggPT09ICdmdW5jdGlvbicpIHtcbiAgICBsaXN0LmZvckVhY2goZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgIHNlbGYucHVzaChpdGVtKVxuICAgIH0pXG4gIH0gZWxzZSBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IGFyZ3VtZW50cy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIHNlbGYucHVzaChhcmd1bWVudHNbaV0pXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHNlbGZcbn1cblxuWWFsbGlzdC5wcm90b3R5cGUucmVtb3ZlTm9kZSA9IGZ1bmN0aW9uIChub2RlKSB7XG4gIGlmIChub2RlLmxpc3QgIT09IHRoaXMpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3JlbW92aW5nIG5vZGUgd2hpY2ggZG9lcyBub3QgYmVsb25nIHRvIHRoaXMgbGlzdCcpXG4gIH1cblxuICB2YXIgbmV4dCA9IG5vZGUubmV4dFxuICB2YXIgcHJldiA9IG5vZGUucHJldlxuXG4gIGlmIChuZXh0KSB7XG4gICAgbmV4dC5wcmV2ID0gcHJldlxuICB9XG5cbiAgaWYgKHByZXYpIHtcbiAgICBwcmV2Lm5leHQgPSBuZXh0XG4gIH1cblxuICBpZiAobm9kZSA9PT0gdGhpcy5oZWFkKSB7XG4gICAgdGhpcy5oZWFkID0gbmV4dFxuICB9XG4gIGlmIChub2RlID09PSB0aGlzLnRhaWwpIHtcbiAgICB0aGlzLnRhaWwgPSBwcmV2XG4gIH1cblxuICBub2RlLmxpc3QubGVuZ3RoLS1cbiAgbm9kZS5uZXh0ID0gbnVsbFxuICBub2RlLnByZXYgPSBudWxsXG4gIG5vZGUubGlzdCA9IG51bGxcbn1cblxuWWFsbGlzdC5wcm90b3R5cGUudW5zaGlmdE5vZGUgPSBmdW5jdGlvbiAobm9kZSkge1xuICBpZiAobm9kZSA9PT0gdGhpcy5oZWFkKSB7XG4gICAgcmV0dXJuXG4gIH1cblxuICBpZiAobm9kZS5saXN0KSB7XG4gICAgbm9kZS5saXN0LnJlbW92ZU5vZGUobm9kZSlcbiAgfVxuXG4gIHZhciBoZWFkID0gdGhpcy5oZWFkXG4gIG5vZGUubGlzdCA9IHRoaXNcbiAgbm9kZS5uZXh0ID0gaGVhZFxuICBpZiAoaGVhZCkge1xuICAgIGhlYWQucHJldiA9IG5vZGVcbiAgfVxuXG4gIHRoaXMuaGVhZCA9IG5vZGVcbiAgaWYgKCF0aGlzLnRhaWwpIHtcbiAgICB0aGlzLnRhaWwgPSBub2RlXG4gIH1cbiAgdGhpcy5sZW5ndGgrK1xufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5wdXNoTm9kZSA9IGZ1bmN0aW9uIChub2RlKSB7XG4gIGlmIChub2RlID09PSB0aGlzLnRhaWwpIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIGlmIChub2RlLmxpc3QpIHtcbiAgICBub2RlLmxpc3QucmVtb3ZlTm9kZShub2RlKVxuICB9XG5cbiAgdmFyIHRhaWwgPSB0aGlzLnRhaWxcbiAgbm9kZS5saXN0ID0gdGhpc1xuICBub2RlLnByZXYgPSB0YWlsXG4gIGlmICh0YWlsKSB7XG4gICAgdGFpbC5uZXh0ID0gbm9kZVxuICB9XG5cbiAgdGhpcy50YWlsID0gbm9kZVxuICBpZiAoIXRoaXMuaGVhZCkge1xuICAgIHRoaXMuaGVhZCA9IG5vZGVcbiAgfVxuICB0aGlzLmxlbmd0aCsrXG59XG5cbllhbGxpc3QucHJvdG90eXBlLnB1c2ggPSBmdW5jdGlvbiAoKSB7XG4gIGZvciAodmFyIGkgPSAwLCBsID0gYXJndW1lbnRzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIHB1c2godGhpcywgYXJndW1lbnRzW2ldKVxuICB9XG4gIHJldHVybiB0aGlzLmxlbmd0aFxufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS51bnNoaWZ0ID0gZnVuY3Rpb24gKCkge1xuICBmb3IgKHZhciBpID0gMCwgbCA9IGFyZ3VtZW50cy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICB1bnNoaWZ0KHRoaXMsIGFyZ3VtZW50c1tpXSlcbiAgfVxuICByZXR1cm4gdGhpcy5sZW5ndGhcbn1cblxuWWFsbGlzdC5wcm90b3R5cGUucG9wID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMudGFpbCkge1xuICAgIHJldHVybiB1bmRlZmluZWRcbiAgfVxuXG4gIHZhciByZXMgPSB0aGlzLnRhaWwudmFsdWVcbiAgdGhpcy50YWlsID0gdGhpcy50YWlsLnByZXZcbiAgaWYgKHRoaXMudGFpbCkge1xuICAgIHRoaXMudGFpbC5uZXh0ID0gbnVsbFxuICB9IGVsc2Uge1xuICAgIHRoaXMuaGVhZCA9IG51bGxcbiAgfVxuICB0aGlzLmxlbmd0aC0tXG4gIHJldHVybiByZXNcbn1cblxuWWFsbGlzdC5wcm90b3R5cGUuc2hpZnQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5oZWFkKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZFxuICB9XG5cbiAgdmFyIHJlcyA9IHRoaXMuaGVhZC52YWx1ZVxuICB0aGlzLmhlYWQgPSB0aGlzLmhlYWQubmV4dFxuICBpZiAodGhpcy5oZWFkKSB7XG4gICAgdGhpcy5oZWFkLnByZXYgPSBudWxsXG4gIH0gZWxzZSB7XG4gICAgdGhpcy50YWlsID0gbnVsbFxuICB9XG4gIHRoaXMubGVuZ3RoLS1cbiAgcmV0dXJuIHJlc1xufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5mb3JFYWNoID0gZnVuY3Rpb24gKGZuLCB0aGlzcCkge1xuICB0aGlzcCA9IHRoaXNwIHx8IHRoaXNcbiAgZm9yICh2YXIgd2Fsa2VyID0gdGhpcy5oZWFkLCBpID0gMDsgd2Fsa2VyICE9PSBudWxsOyBpKyspIHtcbiAgICBmbi5jYWxsKHRoaXNwLCB3YWxrZXIudmFsdWUsIGksIHRoaXMpXG4gICAgd2Fsa2VyID0gd2Fsa2VyLm5leHRcbiAgfVxufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5mb3JFYWNoUmV2ZXJzZSA9IGZ1bmN0aW9uIChmbiwgdGhpc3ApIHtcbiAgdGhpc3AgPSB0aGlzcCB8fCB0aGlzXG4gIGZvciAodmFyIHdhbGtlciA9IHRoaXMudGFpbCwgaSA9IHRoaXMubGVuZ3RoIC0gMTsgd2Fsa2VyICE9PSBudWxsOyBpLS0pIHtcbiAgICBmbi5jYWxsKHRoaXNwLCB3YWxrZXIudmFsdWUsIGksIHRoaXMpXG4gICAgd2Fsa2VyID0gd2Fsa2VyLnByZXZcbiAgfVxufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAobikge1xuICBmb3IgKHZhciBpID0gMCwgd2Fsa2VyID0gdGhpcy5oZWFkOyB3YWxrZXIgIT09IG51bGwgJiYgaSA8IG47IGkrKykge1xuICAgIC8vIGFib3J0IG91dCBvZiB0aGUgbGlzdCBlYXJseSBpZiB3ZSBoaXQgYSBjeWNsZVxuICAgIHdhbGtlciA9IHdhbGtlci5uZXh0XG4gIH1cbiAgaWYgKGkgPT09IG4gJiYgd2Fsa2VyICE9PSBudWxsKSB7XG4gICAgcmV0dXJuIHdhbGtlci52YWx1ZVxuICB9XG59XG5cbllhbGxpc3QucHJvdG90eXBlLmdldFJldmVyc2UgPSBmdW5jdGlvbiAobikge1xuICBmb3IgKHZhciBpID0gMCwgd2Fsa2VyID0gdGhpcy50YWlsOyB3YWxrZXIgIT09IG51bGwgJiYgaSA8IG47IGkrKykge1xuICAgIC8vIGFib3J0IG91dCBvZiB0aGUgbGlzdCBlYXJseSBpZiB3ZSBoaXQgYSBjeWNsZVxuICAgIHdhbGtlciA9IHdhbGtlci5wcmV2XG4gIH1cbiAgaWYgKGkgPT09IG4gJiYgd2Fsa2VyICE9PSBudWxsKSB7XG4gICAgcmV0dXJuIHdhbGtlci52YWx1ZVxuICB9XG59XG5cbllhbGxpc3QucHJvdG90eXBlLm1hcCA9IGZ1bmN0aW9uIChmbiwgdGhpc3ApIHtcbiAgdGhpc3AgPSB0aGlzcCB8fCB0aGlzXG4gIHZhciByZXMgPSBuZXcgWWFsbGlzdCgpXG4gIGZvciAodmFyIHdhbGtlciA9IHRoaXMuaGVhZDsgd2Fsa2VyICE9PSBudWxsOykge1xuICAgIHJlcy5wdXNoKGZuLmNhbGwodGhpc3AsIHdhbGtlci52YWx1ZSwgdGhpcykpXG4gICAgd2Fsa2VyID0gd2Fsa2VyLm5leHRcbiAgfVxuICByZXR1cm4gcmVzXG59XG5cbllhbGxpc3QucHJvdG90eXBlLm1hcFJldmVyc2UgPSBmdW5jdGlvbiAoZm4sIHRoaXNwKSB7XG4gIHRoaXNwID0gdGhpc3AgfHwgdGhpc1xuICB2YXIgcmVzID0gbmV3IFlhbGxpc3QoKVxuICBmb3IgKHZhciB3YWxrZXIgPSB0aGlzLnRhaWw7IHdhbGtlciAhPT0gbnVsbDspIHtcbiAgICByZXMucHVzaChmbi5jYWxsKHRoaXNwLCB3YWxrZXIudmFsdWUsIHRoaXMpKVxuICAgIHdhbGtlciA9IHdhbGtlci5wcmV2XG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5yZWR1Y2UgPSBmdW5jdGlvbiAoZm4sIGluaXRpYWwpIHtcbiAgdmFyIGFjY1xuICB2YXIgd2Fsa2VyID0gdGhpcy5oZWFkXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgIGFjYyA9IGluaXRpYWxcbiAgfSBlbHNlIGlmICh0aGlzLmhlYWQpIHtcbiAgICB3YWxrZXIgPSB0aGlzLmhlYWQubmV4dFxuICAgIGFjYyA9IHRoaXMuaGVhZC52YWx1ZVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1JlZHVjZSBvZiBlbXB0eSBsaXN0IHdpdGggbm8gaW5pdGlhbCB2YWx1ZScpXG4gIH1cblxuICBmb3IgKHZhciBpID0gMDsgd2Fsa2VyICE9PSBudWxsOyBpKyspIHtcbiAgICBhY2MgPSBmbihhY2MsIHdhbGtlci52YWx1ZSwgaSlcbiAgICB3YWxrZXIgPSB3YWxrZXIubmV4dFxuICB9XG5cbiAgcmV0dXJuIGFjY1xufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS5yZWR1Y2VSZXZlcnNlID0gZnVuY3Rpb24gKGZuLCBpbml0aWFsKSB7XG4gIHZhciBhY2NcbiAgdmFyIHdhbGtlciA9IHRoaXMudGFpbFxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICBhY2MgPSBpbml0aWFsXG4gIH0gZWxzZSBpZiAodGhpcy50YWlsKSB7XG4gICAgd2Fsa2VyID0gdGhpcy50YWlsLnByZXZcbiAgICBhY2MgPSB0aGlzLnRhaWwudmFsdWVcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdSZWR1Y2Ugb2YgZW1wdHkgbGlzdCB3aXRoIG5vIGluaXRpYWwgdmFsdWUnKVxuICB9XG5cbiAgZm9yICh2YXIgaSA9IHRoaXMubGVuZ3RoIC0gMTsgd2Fsa2VyICE9PSBudWxsOyBpLS0pIHtcbiAgICBhY2MgPSBmbihhY2MsIHdhbGtlci52YWx1ZSwgaSlcbiAgICB3YWxrZXIgPSB3YWxrZXIucHJldlxuICB9XG5cbiAgcmV0dXJuIGFjY1xufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS50b0FycmF5ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgYXJyID0gbmV3IEFycmF5KHRoaXMubGVuZ3RoKVxuICBmb3IgKHZhciBpID0gMCwgd2Fsa2VyID0gdGhpcy5oZWFkOyB3YWxrZXIgIT09IG51bGw7IGkrKykge1xuICAgIGFycltpXSA9IHdhbGtlci52YWx1ZVxuICAgIHdhbGtlciA9IHdhbGtlci5uZXh0XG4gIH1cbiAgcmV0dXJuIGFyclxufVxuXG5ZYWxsaXN0LnByb3RvdHlwZS50b0FycmF5UmV2ZXJzZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGFyciA9IG5ldyBBcnJheSh0aGlzLmxlbmd0aClcbiAgZm9yICh2YXIgaSA9IDAsIHdhbGtlciA9IHRoaXMudGFpbDsgd2Fsa2VyICE9PSBudWxsOyBpKyspIHtcbiAgICBhcnJbaV0gPSB3YWxrZXIudmFsdWVcbiAgICB3YWxrZXIgPSB3YWxrZXIucHJldlxuICB9XG4gIHJldHVybiBhcnJcbn1cblxuWWFsbGlzdC5wcm90b3R5cGUuc2xpY2UgPSBmdW5jdGlvbiAoZnJvbSwgdG8pIHtcbiAgdG8gPSB0byB8fCB0aGlzLmxlbmd0aFxuICBpZiAodG8gPCAwKSB7XG4gICAgdG8gKz0gdGhpcy5sZW5ndGhcbiAgfVxuICBmcm9tID0gZnJvbSB8fCAwXG4gIGlmIChmcm9tIDwgMCkge1xuICAgIGZyb20gKz0gdGhpcy5sZW5ndGhcbiAgfVxuICB2YXIgcmV0ID0gbmV3IFlhbGxpc3QoKVxuICBpZiAodG8gPCBmcm9tIHx8IHRvIDwgMCkge1xuICAgIHJldHVybiByZXRcbiAgfVxuICBpZiAoZnJvbSA8IDApIHtcbiAgICBmcm9tID0gMFxuICB9XG4gIGlmICh0byA+IHRoaXMubGVuZ3RoKSB7XG4gICAgdG8gPSB0aGlzLmxlbmd0aFxuICB9XG4gIGZvciAodmFyIGkgPSAwLCB3YWxrZXIgPSB0aGlzLmhlYWQ7IHdhbGtlciAhPT0gbnVsbCAmJiBpIDwgZnJvbTsgaSsrKSB7XG4gICAgd2Fsa2VyID0gd2Fsa2VyLm5leHRcbiAgfVxuICBmb3IgKDsgd2Fsa2VyICE9PSBudWxsICYmIGkgPCB0bzsgaSsrLCB3YWxrZXIgPSB3YWxrZXIubmV4dCkge1xuICAgIHJldC5wdXNoKHdhbGtlci52YWx1ZSlcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbllhbGxpc3QucHJvdG90eXBlLnNsaWNlUmV2ZXJzZSA9IGZ1bmN0aW9uIChmcm9tLCB0bykge1xuICB0byA9IHRvIHx8IHRoaXMubGVuZ3RoXG4gIGlmICh0byA8IDApIHtcbiAgICB0byArPSB0aGlzLmxlbmd0aFxuICB9XG4gIGZyb20gPSBmcm9tIHx8IDBcbiAgaWYgKGZyb20gPCAwKSB7XG4gICAgZnJvbSArPSB0aGlzLmxlbmd0aFxuICB9XG4gIHZhciByZXQgPSBuZXcgWWFsbGlzdCgpXG4gIGlmICh0byA8IGZyb20gfHwgdG8gPCAwKSB7XG4gICAgcmV0dXJuIHJldFxuICB9XG4gIGlmIChmcm9tIDwgMCkge1xuICAgIGZyb20gPSAwXG4gIH1cbiAgaWYgKHRvID4gdGhpcy5sZW5ndGgpIHtcbiAgICB0byA9IHRoaXMubGVuZ3RoXG4gIH1cbiAgZm9yICh2YXIgaSA9IHRoaXMubGVuZ3RoLCB3YWxrZXIgPSB0aGlzLnRhaWw7IHdhbGtlciAhPT0gbnVsbCAmJiBpID4gdG87IGktLSkge1xuICAgIHdhbGtlciA9IHdhbGtlci5wcmV2XG4gIH1cbiAgZm9yICg7IHdhbGtlciAhPT0gbnVsbCAmJiBpID4gZnJvbTsgaS0tLCB3YWxrZXIgPSB3YWxrZXIucHJldikge1xuICAgIHJldC5wdXNoKHdhbGtlci52YWx1ZSlcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbllhbGxpc3QucHJvdG90eXBlLnJldmVyc2UgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBoZWFkID0gdGhpcy5oZWFkXG4gIHZhciB0YWlsID0gdGhpcy50YWlsXG4gIGZvciAodmFyIHdhbGtlciA9IGhlYWQ7IHdhbGtlciAhPT0gbnVsbDsgd2Fsa2VyID0gd2Fsa2VyLnByZXYpIHtcbiAgICB2YXIgcCA9IHdhbGtlci5wcmV2XG4gICAgd2Fsa2VyLnByZXYgPSB3YWxrZXIubmV4dFxuICAgIHdhbGtlci5uZXh0ID0gcFxuICB9XG4gIHRoaXMuaGVhZCA9IHRhaWxcbiAgdGhpcy50YWlsID0gaGVhZFxuICByZXR1cm4gdGhpc1xufVxuXG5mdW5jdGlvbiBwdXNoIChzZWxmLCBpdGVtKSB7XG4gIHNlbGYudGFpbCA9IG5ldyBOb2RlKGl0ZW0sIHNlbGYudGFpbCwgbnVsbCwgc2VsZilcbiAgaWYgKCFzZWxmLmhlYWQpIHtcbiAgICBzZWxmLmhlYWQgPSBzZWxmLnRhaWxcbiAgfVxuICBzZWxmLmxlbmd0aCsrXG59XG5cbmZ1bmN0aW9uIHVuc2hpZnQgKHNlbGYsIGl0ZW0pIHtcbiAgc2VsZi5oZWFkID0gbmV3IE5vZGUoaXRlbSwgbnVsbCwgc2VsZi5oZWFkLCBzZWxmKVxuICBpZiAoIXNlbGYudGFpbCkge1xuICAgIHNlbGYudGFpbCA9IHNlbGYuaGVhZFxuICB9XG4gIHNlbGYubGVuZ3RoKytcbn1cblxuZnVuY3Rpb24gTm9kZSAodmFsdWUsIHByZXYsIG5leHQsIGxpc3QpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIE5vZGUpKSB7XG4gICAgcmV0dXJuIG5ldyBOb2RlKHZhbHVlLCBwcmV2LCBuZXh0LCBsaXN0KVxuICB9XG5cbiAgdGhpcy5saXN0ID0gbGlzdFxuICB0aGlzLnZhbHVlID0gdmFsdWVcblxuICBpZiAocHJldikge1xuICAgIHByZXYubmV4dCA9IHRoaXNcbiAgICB0aGlzLnByZXYgPSBwcmV2XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5wcmV2ID0gbnVsbFxuICB9XG5cbiAgaWYgKG5leHQpIHtcbiAgICBuZXh0LnByZXYgPSB0aGlzXG4gICAgdGhpcy5uZXh0ID0gbmV4dFxuICB9IGVsc2Uge1xuICAgIHRoaXMubmV4dCA9IG51bGxcbiAgfVxufVxuXG50cnkge1xuICAvLyBhZGQgaWYgc3VwcG9ydCBmb3IgU3ltYm9sLml0ZXJhdG9yIGlzIHByZXNlbnRcbiAgcmVxdWlyZSgnLi9pdGVyYXRvci5qcycpKFlhbGxpc3QpXG59IGNhdGNoIChlcikge31cbiIsImltcG9ydCAqIGFzIGdhcGkgZnJvbSAnLi9nYXBpJztcbmltcG9ydCB7IG1zZ1R5cGUsIE1zZyB9IGZyb20gJy4vbXNnJztcblxubGV0IHBhdHRlcm5zID0gW107XG5sZXQgY2FsZW5kYXJzID0ge307XG5sZXQgY2FsRGF0YSA9IHt9O1xuXG5jaHJvbWUucnVudGltZS5vbkNvbm5lY3QuYWRkTGlzdGVuZXIoZnVuY3Rpb24ocG9ydCkge1xuICAgIGNvbnNvbGUuYXNzZXJ0KHBvcnQubmFtZSA9PSAnbWFpbicpO1xuICAgIHBvcnQub25NZXNzYWdlLmFkZExpc3RlbmVyKGZ1bmN0aW9uKF9tc2cpIHtcbiAgICAgICAgbGV0IG1zZyA9IE1zZy5pbmZsYXRlKF9tc2cpO1xuICAgICAgICBjb25zb2xlLmxvZyhtc2cpO1xuICAgICAgICBpZiAobXNnLnR5cGUgPT0gbXNnVHlwZS51cGRhdGVQYXR0ZXJucykge1xuICAgICAgICAgICAgcGF0dGVybnMgPSBtc2cuZGF0YTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChtc2cudHlwZSA9PSBtc2dUeXBlLmdldFBhdHRlcm5zKSB7XG4gICAgICAgICAgICBwb3J0LnBvc3RNZXNzYWdlKG1zZy5nZW5SZXNwKHBhdHRlcm5zKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobXNnLnR5cGUgPT0gbXNnVHlwZS51cGRhdGVDYWxlbmRhcnMpIHtcbiAgICAgICAgICAgIGNhbGVuZGFycyA9IG1zZy5kYXRhO1xuICAgICAgICAgICAgZm9yIChsZXQgaWQgaW4gY2FsZW5kYXJzKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjYWxEYXRhLmhhc093blByb3BlcnR5KGlkKSlcbiAgICAgICAgICAgICAgICAgICAgY2FsRGF0YVtpZF0gPSBuZXcgZ2FwaS5HQ2FsZW5kYXIoaWQsIGNhbGVuZGFyc1tpZF0uc3VtbWFyeSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobXNnLnR5cGUgPT0gbXNnVHlwZS5nZXRDYWxlbmRhcnMpIHtcbiAgICAgICAgICAgIHBvcnQucG9zdE1lc3NhZ2UobXNnLmdlblJlc3AoY2FsZW5kYXJzKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobXNnLnR5cGUgPT0gbXNnVHlwZS5nZXRDYWxFdmVudHMpIHtcbiAgICAgICAgICAgIGNhbERhdGFbbXNnLmRhdGEuaWRdLmdldEV2ZW50cyhuZXcgRGF0ZShtc2cuZGF0YS5zdGFydCksIG5ldyBEYXRlKG1zZy5kYXRhLmVuZCkpXG4gICAgICAgICAgICAgICAgLmNhdGNoKGUgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgY2Fubm90IGxvYWQgY2FsZW5kYXIgJHttc2cuZGF0YS5pZH1gLCBlKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coZGF0YSk7XG4gICAgICAgICAgICAgICAgbGV0IHJlc3AgPSBtc2cuZ2VuUmVzcChkYXRhLm1hcChlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlkOiBlLmlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IGUuc3RhcnQuZ2V0VGltZSgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgZW5kOiBlLmVuZC5nZXRUaW1lKClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhyZXNwKTtcbiAgICAgICAgICAgICAgICBwb3J0LnBvc3RNZXNzYWdlKHJlc3ApO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwidW5rbm93biBtc2cgdHlwZVwiKTtcbiAgICAgICAgfVxuICAgIH0pO1xufSk7XG5cbmNocm9tZS5icm93c2VyQWN0aW9uLm9uQ2xpY2tlZC5hZGRMaXN0ZW5lcihmdW5jdGlvbigpIHtcbiAgICBjaHJvbWUudGFicy5jcmVhdGUoe3VybDogJ2luZGV4Lmh0bWwnfSk7XG59KTtcblxuIiwiLyogZ2xvYmFsIGNocm9tZSAqL1xuaW1wb3J0IExSVSBmcm9tIFwibHJ1LWNhY2hlXCI7XG5jb25zdCBnYXBpX2Jhc2UgPSAnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vY2FsZW5kYXIvdjMnO1xuXG5jb25zdCBHQXBpRXJyb3IgPSB7XG4gICAgaW52YWxpZFN5bmNUb2tlbjogMSxcbiAgICBvdGhlckVycm9yOiAyLFxufTtcblxuZnVuY3Rpb24gdG9fcGFyYW1zKGRpY3QpIHtcbiAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMoZGljdCkuZmlsdGVyKChbaywgdl0pID0+IHYpLm1hcCgoW2ssIHZdKSA9PiBgJHtlbmNvZGVVUklDb21wb25lbnQoayl9PSR7ZW5jb2RlVVJJQ29tcG9uZW50KHYpfWApLmpvaW4oJyYnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEF1dGhUb2tlbigpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZXIgPT5cbiAgICAgICAgY2hyb21lLmlkZW50aXR5LmdldEF1dGhUb2tlbihcbiAgICAgICAgICAgIHtpbnRlcmFjdGl2ZTogdHJ1ZX0sIHRva2VuID0+IHJlc29sdmVyKHRva2VuKSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2FsZW5kYXJzKHRva2VuKSB7XG4gICAgcmV0dXJuIGZldGNoKGAke2dhcGlfYmFzZX0vdXNlcnMvbWUvY2FsZW5kYXJMaXN0PyR7dG9fcGFyYW1zKHthY2Nlc3NfdG9rZW46IHRva2VufSl9YCxcbiAgICAgICAgICAgIHsgbWV0aG9kOiAnR0VUJywgYXN5bmM6IHRydWUgfSlcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4gcmVzcG9uc2UuanNvbigpKVxuICAgICAgICAudGhlbihkYXRhID0+IGRhdGEuaXRlbXMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29sb3JzKHRva2VuKSB7XG4gICAgcmV0dXJuIGZldGNoKGAke2dhcGlfYmFzZX0vY29sb3JzPyR7dG9fcGFyYW1zKHthY2Nlc3NfdG9rZW46IHRva2VufSl9YCxcbiAgICAgICAgeyBtZXRob2Q6ICdHRVQnLCBhc3luYzogdHJ1ZSB9KVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiByZXNwb25zZS5qc29uKCkpO1xufVxuXG5mdW5jdGlvbiBnZXRFdmVudChjYWxJZCwgZXZlbnRJZCwgdG9rZW4pIHtcbiAgICByZXR1cm4gZmV0Y2goYCR7Z2FwaV9iYXNlfS9jYWxlbmRhcnMvJHtjYWxJZH0vZXZlbnRzLyR7ZXZlbnRJZH0/JHt0b19wYXJhbXMoe2FjY2Vzc190b2tlbjogdG9rZW59KX1gLFxuICAgICAgICB7IG1ldGhvZDogJ0dFVCcsIGFzeW5jOiB0cnVlIH0pXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHJlc3BvbnNlLmpzb24oKSk7XG59XG5cbmZ1bmN0aW9uIGdldEV2ZW50cyhjYWxJZCwgdG9rZW4sIHN5bmNUb2tlbj1udWxsLCB0aW1lTWluPW51bGwsIHRpbWVNYXg9bnVsbCwgcmVzdWx0c1BlclJlcXVlc3Q9MTAwKSB7XG4gICAgbGV0IHJlc3VsdHMgPSBbXTtcbiAgICBjb25zdCBzaW5nbGVGZXRjaCA9IChwYWdlVG9rZW4sIHN5bmNUb2tlbikgPT4gZmV0Y2goYCR7Z2FwaV9iYXNlfS9jYWxlbmRhcnMvJHtjYWxJZH0vZXZlbnRzPyR7dG9fcGFyYW1zKHtcbiAgICAgICAgICAgIGFjY2Vzc190b2tlbjogdG9rZW4sXG4gICAgICAgICAgICBwYWdlVG9rZW4sXG4gICAgICAgICAgICBzeW5jVG9rZW4sXG4gICAgICAgICAgICB0aW1lTWluLFxuICAgICAgICAgICAgdGltZU1heCxcbiAgICAgICAgICAgIG1heFJlc3VsdHM6IHJlc3VsdHNQZXJSZXF1ZXN0XG4gICAgICAgIH0pfWAsIHsgbWV0aG9kOiAnR0VUJywgYXN5bmM6IHRydWUgfSlcbiAgICAgICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSAyMDApXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5qc29uKCk7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MTApXG4gICAgICAgICAgICAgICAgICAgIHRocm93IEdBcGlFcnJvci5pbnZhbGlkU3luY1Rva2VuO1xuICAgICAgICAgICAgICAgIGVsc2UgdGhyb3cgR0FwaUVycm9yLm90aGVyRXJyb3JzO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKGRhdGEgPT4ge1xuICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaCguLi5kYXRhLml0ZW1zKTtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5uZXh0UGFnZVRva2VuKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzaW5nbGVGZXRjaChkYXRhLm5leHRQYWdlVG9rZW4sICcnKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5leHRTeW5jVG9rZW46IGRhdGEubmV4dFN5bmNUb2tlbixcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHNcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcblxuICAgIHJldHVybiBzaW5nbGVGZXRjaCgnJywgc3luY1Rva2VuKTtcbn1cblxuZXhwb3J0IGNsYXNzIEdDYWxlbmRhciB7XG4gICAgY29uc3RydWN0b3IoY2FsSWQsIG5hbWUsIG9wdGlvbnM9e21heENhY2hlZEl0ZW1zOiAxMDAsIG5EYXlzUGVyU2xvdDogMTAsIGxhcmdlUXVlcnk6IDEwfSkge1xuICAgICAgICB0aGlzLmNhbElkID0gY2FsSWQ7XG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgICAgIHRoaXMudG9rZW4gPSBnZXRBdXRoVG9rZW4oKTtcbiAgICAgICAgdGhpcy5zeW5jVG9rZW4gPSAnJztcbiAgICAgICAgdGhpcy5jYWNoZSA9IG5ldyBMUlUoe1xuICAgICAgICAgICAgbWF4OiBvcHRpb25zLm1heENhY2hlZEl0ZW1zLFxuICAgICAgICAgICAgZGlzcG9zZTogKGssIHYpID0+IHRoaXMub25SZW1vdmVTbG90KGssIHYpXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmV2ZW50TWV0YSA9IHt9O1xuICAgICAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICAgICAgICB0aGlzLmRpdmlkZXIgPSA4LjY0ZTcgKiB0aGlzLm9wdGlvbnMubkRheXNQZXJTbG90O1xuICAgIH1cblxuICAgIGRhdGVUb0NhY2hlS2V5KGRhdGUpIHtcbiAgICAgICAgcmV0dXJuIE1hdGguZmxvb3IoZGF0ZSAvIHRoaXMuZGl2aWRlcik7XG4gICAgfVxuXG4gICAgZGF0ZVJhbmdlVG9DYWNoZUtleXMocmFuZ2UpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0YXJ0OiB0aGlzLmRhdGVUb0NhY2hlS2V5KHJhbmdlLnN0YXJ0KSxcbiAgICAgICAgICAgIGVuZDogdGhpcy5kYXRlVG9DYWNoZUtleShuZXcgRGF0ZShyYW5nZS5lbmQuZ2V0VGltZSgpIC0gMSkpXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZ2V0U2xvdChrKSB7XG4gICAgICAgIGlmICghdGhpcy5jYWNoZS5oYXMoaykpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCByZXMgPSB7fTtcbiAgICAgICAgICAgIHRoaXMuY2FjaGUuc2V0KGssIHJlcyk7XG4gICAgICAgICAgICByZXR1cm4gcmVzO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgcmV0dXJuIHRoaXMuY2FjaGUuZ2V0KGspO1xuICAgIH1cblxuICAgIG9uUmVtb3ZlU2xvdChrLCB2KSB7XG4gICAgICAgIGZvciAobGV0IGlkIGluIHYpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuYXNzZXJ0KHRoaXMuZXZlbnRNZXRhW2lkXSk7XG4gICAgICAgICAgICBsZXQga2V5cyA9IHRoaXMuZXZlbnRNZXRhW2lkXS5rZXlzO1xuICAgICAgICAgICAga2V5cy5kZWxldGUoayk7XG4gICAgICAgICAgICBpZiAoa2V5cy5zaXplID09PSAwKVxuICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmV2ZW50TWV0YVtpZF07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzbG90U3RhcnREYXRlKGspIHsgcmV0dXJuIG5ldyBEYXRlKGsgKiB0aGlzLmRpdmlkZXIpOyB9XG4gICAgc2xvdEVuZERhdGUoaykgeyByZXR1cm4gbmV3IERhdGUoKGsgKyAxKSAqIHRoaXMuZGl2aWRlcik7IH1cblxuICAgIGFkZEV2ZW50KGUsIGV2aWN0ID0gZmFsc2UpIHtcbiAgICAgICAgLy9jb25zb2xlLmxvZygnYWRkaW5nIGV2ZW50JywgZSk7XG4gICAgICAgIGlmICh0aGlzLmV2ZW50TWV0YS5oYXNPd25Qcm9wZXJ0eShlLmlkKSlcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlRXZlbnQoZSk7XG4gICAgICAgIGxldCByID0gdGhpcy5kYXRlUmFuZ2VUb0NhY2hlS2V5cyhlKTtcbiAgICAgICAgbGV0IGtzID0gci5zdGFydDtcbiAgICAgICAgbGV0IGtlID0gci5lbmQ7XG4gICAgICAgIGxldCB0ID0gdGhpcy5jYWNoZS5sZW5ndGg7XG4gICAgICAgIGxldCBrZXlzID0gbmV3IFNldCgpO1xuICAgICAgICBmb3IgKGxldCBpID0ga3M7IGkgPD0ga2U7IGkrKylcbiAgICAgICAge1xuICAgICAgICAgICAga2V5cy5hZGQoaSk7XG4gICAgICAgICAgICBpZiAoIXRoaXMuY2FjaGUuaGFzKGkpKSB0Kys7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5ldmVudE1ldGFbZS5pZF0gPSB7XG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgc3VtbWFyeTogZS5zdW1tYXJ5LFxuICAgICAgICB9O1xuICAgICAgICBpZiAoIWV2aWN0ICYmIHQgPiB0aGlzLm9wdGlvbnMubWF4Q2FjaGVkSXRlbXMpIHJldHVybjtcbiAgICAgICAgaWYgKGtzID09PSBrZSlcbiAgICAgICAgICAgIHRoaXMuZ2V0U2xvdChrcylbZS5pZF0gPSB7XG4gICAgICAgICAgICAgICAgc3RhcnQ6IGUuc3RhcnQsXG4gICAgICAgICAgICAgICAgZW5kOiBlLmVuZCxcbiAgICAgICAgICAgICAgICBpZDogZS5pZCB9O1xuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMuZ2V0U2xvdChrcylbZS5pZF0gPSB7XG4gICAgICAgICAgICAgICAgc3RhcnQ6IGUuc3RhcnQsXG4gICAgICAgICAgICAgICAgZW5kOiB0aGlzLnNsb3RFbmREYXRlKGtzKSxcbiAgICAgICAgICAgICAgICBpZDogZS5pZCB9O1xuICAgICAgICAgICAgdGhpcy5nZXRTbG90KGtlKVtlLmlkXSA9IHtcbiAgICAgICAgICAgICAgICBzdGFydDogdGhpcy5zbG90U3RhcnREYXRlKGtlKSxcbiAgICAgICAgICAgICAgICBlbmQ6IGUuZW5kLFxuICAgICAgICAgICAgICAgIGlkOiBlLmlkIH07XG4gICAgICAgICAgICBmb3IgKGxldCBrID0ga3MgKyAxOyBrIDwga2U7IGsrKylcbiAgICAgICAgICAgICAgICB0aGlzLmdldFNsb3QoaylbZS5pZF0gPSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0OiB0aGlzLnNsb3RTdGFydERhdGUoayksXG4gICAgICAgICAgICAgICAgICAgIGVuZDogdGhpcy5zbG90RW5kRGF0ZShrKSxcbiAgICAgICAgICAgICAgICAgICAgaWQ6IGUuaWR9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmVtb3ZlRXZlbnQoZSkge1xuICAgICAgICBsZXQga2V5cyA9IHRoaXMuZXZlbnRNZXRhW2UuaWRdLmtleXM7XG4gICAgICAgIGNvbnNvbGUuYXNzZXJ0KGtleXMpO1xuICAgICAgICBrZXlzLmZvckVhY2goayA9PiBkZWxldGUgdGhpcy5nZXRTbG90KGspW2UuaWRdKTtcbiAgICAgICAgZGVsZXRlIHRoaXMuZXZlbnRNZXRhW2UuaWRdO1xuICAgIH1cblxuICAgIGdldFNsb3RFdmVudHMoaywgc3RhcnQsIGVuZCkge1xuICAgICAgICBsZXQgcyA9IHRoaXMuZ2V0U2xvdChrKTtcbiAgICAgICAgLy9jb25zb2xlLmxvZyhzKTtcbiAgICAgICAgbGV0IHJlc3VsdHMgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaWQgaW4gcykge1xuICAgICAgICAgICAgaWYgKCEoc1tpZF0uc3RhcnQgPj0gZW5kIHx8IHNbaWRdLmVuZCA8PSBzdGFydCkpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBzW2lkXS5zdGFydCA8IHN0YXJ0ID8gc3RhcnQ6IHNbaWRdLnN0YXJ0LFxuICAgICAgICAgICAgICAgICAgICBlbmQ6IHNbaWRdLmVuZCA+IGVuZCA/IGVuZDogc1tpZF0uZW5kLFxuICAgICAgICAgICAgICAgICAgICBzdW1tYXJ5OiB0aGlzLmV2ZW50TWV0YVtpZF0uc3VtbWFyeVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH1cblxuICAgIGdldENhY2hlZEV2ZW50cyhfcikge1xuICAgICAgICBsZXQgciA9IHRoaXMuZGF0ZVJhbmdlVG9DYWNoZUtleXMoX3IpO1xuICAgICAgICBsZXQga3MgPSByLnN0YXJ0O1xuICAgICAgICBsZXQga2UgPSByLmVuZDtcbiAgICAgICAgbGV0IHJlc3VsdHMgPSB0aGlzLmdldFNsb3RFdmVudHMoa3MsIF9yLnN0YXJ0LCBfci5lbmQpO1xuICAgICAgICBmb3IgKGxldCBrID0ga3MgKyAxOyBrIDwga2U7IGsrKylcbiAgICAgICAge1xuICAgICAgICAgICAgbGV0IHMgPSB0aGlzLmdldFNsb3Qoayk7XG4gICAgICAgICAgICBmb3IgKGxldCBpZCBpbiBzKVxuICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaChzW2lkXSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGtlID4ga3MpXG4gICAgICAgICAgICByZXN1bHRzLnB1c2goLi4udGhpcy5nZXRTbG90RXZlbnRzKGtlLCBfci5zdGFydCwgX3IuZW5kKSk7XG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH1cblxuICAgIHN5bmMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRva2VuLnRoZW4odG9rZW4gPT4gZ2V0RXZlbnRzKHRoaXMuY2FsSWQsIHRva2VuLCB0aGlzLnN5bmNUb2tlbikudGhlbihyID0+IHtcbiAgICAgICAgICAgIGxldCBwbXMgPSByLnJlc3VsdHMubWFwKGUgPT4gZS5zdGFydCA/IFByb21pc2UucmVzb2x2ZShlKSA6IGdldEV2ZW50KHRoaXMuY2FsSWQsIGUuaWQsIHRva2VuKSk7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocG1zKS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgICAgIHJlc3VsdHMuZm9yRWFjaChlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZS5zdGFydCA9IG5ldyBEYXRlKGUuc3RhcnQuZGF0ZVRpbWUpO1xuICAgICAgICAgICAgICAgICAgICBlLmVuZCA9IG5ldyBEYXRlKGUuZW5kLmRhdGVUaW1lKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGUuc3RhdHVzID09PSAnY29uZmlybWVkJylcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkRXZlbnQoZSk7XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGUuc3RhdHVzID09PSAnY2FuY2VsbGVkJylcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRXZlbnQoZSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy5zeW5jVG9rZW4gPSByLm5leHRTeW5jVG9rZW47XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSkpLmNhdGNoKGUgPT4ge1xuICAgICAgICAgICAgaWYgKGUgPT09IEdBcGlFcnJvci5pbnZhbGlkU3luY1Rva2VuKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zeW5jVG9rZW4gPSAnJztcbiAgICAgICAgICAgICAgICB0aGlzLnN5bmMoKTtcbiAgICAgICAgICAgIH0gZWxzZSB0aHJvdyBlO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZXRFdmVudHMoc3RhcnQsIGVuZCkge1xuICAgICAgICBsZXQgciA9IHRoaXMuZGF0ZVJhbmdlVG9DYWNoZUtleXMoeyBzdGFydCwgZW5kIH0pO1xuICAgICAgICBsZXQgcXVlcnkgPSB7fTtcbiAgICAgICAgZm9yIChsZXQgayA9IHIuc3RhcnQ7IGsgPD0gci5lbmQ7IGsrKylcbiAgICAgICAgICAgIGlmICghdGhpcy5jYWNoZS5oYXMoaykpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgaWYgKCFxdWVyeS5oYXNPd25Qcm9wZXJ0eSgnc3RhcnQnKSlcbiAgICAgICAgICAgICAgICAgICAgcXVlcnkuc3RhcnQgPSBrO1xuICAgICAgICAgICAgICAgIHF1ZXJ5LmVuZCA9IGs7XG4gICAgICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUubG9nKGBzdGFydDogJHtzdGFydH0gZW5kOiAke2VuZH1gKTtcbiAgICAgICAgaWYgKHF1ZXJ5Lmhhc093blByb3BlcnR5KCdzdGFydCcpKVxuICAgICAgICB7XG4gICAgICAgICAgICBjb25zb2xlLmFzc2VydChxdWVyeS5zdGFydCA8PSBxdWVyeS5lbmQpO1xuICAgICAgICAgICAgaWYgKHF1ZXJ5LmVuZCAtIHF1ZXJ5LnN0YXJ0ICsgMSA+IHRoaXMub3B0aW9ucy5sYXJnZVF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYGVuY291bnRlciBsYXJnZSBxdWVyeSwgdXNlIGRpcmVjdCBmZXRjaGApO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnRva2VuLnRoZW4odG9rZW4gPT4gZ2V0RXZlbnRzKHRoaXMuY2FsSWQsIHRva2VuLCBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnQudG9JU09TdHJpbmcoKSwgZW5kLnRvSVNPU3RyaW5nKCkpLnRoZW4ociA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGxldCByZXN1bHRzID0gW107XG4gICAgICAgICAgICAgICAgICAgIHIucmVzdWx0cy5mb3JFYWNoKGUgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5hc3NlcnQoZS5zdGFydCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBlLnN0YXJ0ID0gbmV3IERhdGUoZS5zdGFydC5kYXRlVGltZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBlLmVuZCA9IG5ldyBEYXRlKGUuZW5kLmRhdGVUaW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaChlKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHRzLmZpbHRlcihlID0+ICEoZS5zdGFydCA+PSBlbmQgfHwgZS5lbmQgPD0gc3RhcnQpKS5tYXAoZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkOiBlLmlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBlLnN0YXJ0IDwgc3RhcnQgPyBzdGFydDogZS5zdGFydCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmQ6IGUuZW5kID4gZW5kID8gZW5kOiBlLmVuZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdW1tYXJ5OiBlLnN1bW1hcnksXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBmZXRjaGluZyBzaG9ydCBldmVudCBsaXN0YCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b2tlbi50aGVuKHRva2VuID0+IGdldEV2ZW50cyh0aGlzLmNhbElkLCB0b2tlbiwgbnVsbCxcbiAgICAgICAgICAgICAgICB0aGlzLnNsb3RTdGFydERhdGUocXVlcnkuc3RhcnQpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgdGhpcy5zbG90RW5kRGF0ZShxdWVyeS5lbmQpLnRvSVNPU3RyaW5nKCkpLnRoZW4ociA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHIucmVzdWx0cy5mb3JFYWNoKGUgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGUuc3RhdHVzID09PSAnY29uZmlybWVkJylcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmFzc2VydChlLnN0YXJ0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLnN0YXJ0ID0gbmV3IERhdGUoZS5zdGFydC5kYXRlVGltZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZS5lbmQgPSBuZXcgRGF0ZShlLmVuZC5kYXRlVGltZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGRFdmVudChlLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnN5bmNUb2tlbiA9PT0gJycpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN5bmNUb2tlbiA9IHIubmV4dFN5bmNUb2tlbjtcbiAgICAgICAgICAgICAgICB9KSkudGhlbigoKSA9PiB0aGlzLnN5bmMoKSlcbiAgICAgICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLmdldENhY2hlZEV2ZW50cyh7IHN0YXJ0LCBlbmQgfSkpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYGNhY2hlIGhpdGApO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3luYygpLnRoZW4oKCkgPT4gdGhpcy5nZXRDYWNoZWRFdmVudHMoeyBzdGFydCwgZW5kIH0pKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsImNvbnN0IF91cGRhdGVQYXR0ZXJucyA9IFwidXBkYXRlUGF0dGVybnNcIjtcbmNvbnN0IF9nZXRQYXR0ZXJucyA9IFwiZ2V0UGF0dGVybnNcIjtcbmNvbnN0IF91cGRhdGVDYWxlbmRhcnMgPSBcInVwZGF0ZUNhbGVuZGFyc1wiO1xuY29uc3QgX2dldENhbGVuZGFycyA9IFwiZ2V0Q2FsZW5kYXJzXCI7XG5jb25zdCBfZ2V0Q2FsRXZlbnRzID0gXCJnZXRDYWxFdmVudHNcIjtcblxuZXhwb3J0IGNvbnN0IG1zZ1R5cGUgPSBPYmplY3QuZnJlZXplKHtcbiAgICB1cGRhdGVQYXR0ZXJuczogU3ltYm9sKF91cGRhdGVQYXR0ZXJucyksXG4gICAgZ2V0UGF0dGVybnM6IFN5bWJvbChfZ2V0UGF0dGVybnMpLFxuICAgIHVwZGF0ZUNhbGVuZGFyczogU3ltYm9sKF91cGRhdGVDYWxlbmRhcnMpLFxuICAgIGdldENhbGVuZGFyczogU3ltYm9sKF9nZXRDYWxlbmRhcnMpLFxuICAgIGdldENhbEV2ZW50czogU3ltYm9sKF9nZXRDYWxFdmVudHMpLFxufSk7XG5cbmZ1bmN0aW9uIHN0cmluZ2lmeU1zZ1R5cGUobXQpIHtcbiAgICBzd2l0Y2ggKG10KSB7XG4gICAgICAgIGNhc2UgbXNnVHlwZS51cGRhdGVQYXR0ZXJuczogcmV0dXJuIF91cGRhdGVQYXR0ZXJucztcbiAgICAgICAgY2FzZSBtc2dUeXBlLmdldFBhdHRlcm5zOiByZXR1cm4gX2dldFBhdHRlcm5zO1xuICAgICAgICBjYXNlIG1zZ1R5cGUudXBkYXRlQ2FsZW5kYXJzOiByZXR1cm4gX3VwZGF0ZUNhbGVuZGFycztcbiAgICAgICAgY2FzZSBtc2dUeXBlLmdldENhbGVuZGFyczogcmV0dXJuIF9nZXRDYWxlbmRhcnM7XG4gICAgICAgIGNhc2UgbXNnVHlwZS5nZXRDYWxFdmVudHM6IHJldHVybiBfZ2V0Q2FsRXZlbnRzO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcGFyc2VNc2dUeXBlKHMpIHtcbiAgICBzd2l0Y2gocykge1xuICAgICAgICBjYXNlIF91cGRhdGVQYXR0ZXJuczogcmV0dXJuIG1zZ1R5cGUudXBkYXRlUGF0dGVybnM7XG4gICAgICAgIGNhc2UgX2dldFBhdHRlcm5zOiByZXR1cm4gbXNnVHlwZS5nZXRQYXR0ZXJucztcbiAgICAgICAgY2FzZSBfdXBkYXRlQ2FsZW5kYXJzOiByZXR1cm4gbXNnVHlwZS51cGRhdGVDYWxlbmRhcnM7XG4gICAgICAgIGNhc2UgX2dldENhbGVuZGFyczogcmV0dXJuIG1zZ1R5cGUuZ2V0Q2FsZW5kYXJzO1xuICAgICAgICBjYXNlIF9nZXRDYWxFdmVudHM6IHJldHVybiBtc2dUeXBlLmdldENhbEV2ZW50cztcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBNc2cge1xuICAgIGNvbnN0cnVjdG9yKGlkLCB0eXBlLCBkYXRhKSB7XG4gICAgICAgIHRoaXMuaWQgPSBpZDtcbiAgICAgICAgdGhpcy50eXBlID0gdHlwZTtcbiAgICAgICAgdGhpcy5kYXRhID0gZGF0YTtcbiAgICB9XG4gICAgZ2VuUmVzcChkYXRhKSB7IHJldHVybiBuZXcgTXNnKHRoaXMuaWQsIHRoaXMudHlwZSwgZGF0YSk7IH1cbiAgICBkZWZsYXRlKCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaWQ6IHRoaXMuaWQsXG4gICAgICAgICAgICB0eXBlOiBzdHJpbmdpZnlNc2dUeXBlKHRoaXMudHlwZSksXG4gICAgICAgICAgICBkYXRhOiB0aGlzLmRhdGFcbiAgICAgICAgfVxuICAgIH1cbiAgICBzdGF0aWMgaW5mbGF0ZSA9IG9iaiA9PiBuZXcgTXNnKG9iai5pZCwgcGFyc2VNc2dUeXBlKG9iai50eXBlKSwgb2JqLmRhdGEpO1xufVxuIl19
