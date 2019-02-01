(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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
        console.log("cannot load calendar ".concat(msg.data.id));
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

},{"./gapi":2}],2:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getAuthToken = getAuthToken;
exports.getCalendars = getCalendars;
exports.getColors = getColors;
exports.GCalendar = void 0;

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

/* global chrome */
var gapi_base = 'https://www.googleapis.com/calendar/v3';
var GApiError = {
  invalidSyncToken: 1,
  otherError: 2
};

function to_params(dict) {
  return Object.entries(dict).map(function (_ref) {
    var _ref2 = _slicedToArray(_ref, 2),
        k = _ref2[0],
        v = _ref2[1];

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

function getEvents(calId, token, syncToken) {
  var resultsPerRequest = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 100;
  var results = [];

  var singleFetch = function singleFetch(pageToken, syncToken) {
    return fetch("".concat(gapi_base, "/calendars/").concat(calId, "/events?").concat(to_params({
      access_token: token,
      pageToken: pageToken,
      syncToken: syncToken,
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
    _classCallCheck(this, GCalendar);

    this.calId = calId;
    this.name = name;
    this.token = getAuthToken();
    this.syncToken = '';
    this.cache = {};
  }

  _createClass(GCalendar, [{
    key: "getSlot",
    value: function getSlot(k) {
      if (!this.cache[k]) this.cache[k] = {};
      return this.cache[k];
    }
  }, {
    key: "addEvent",
    value: function addEvent(e) {
      var ks = GCalendar.dateToCacheKey(e.start);
      var ke = GCalendar.dateToCacheKey(new Date(e.end.getTime() - 1));
      if (ks === ke) this.getSlot(ks)[e.id] = {
        start: e.start,
        end: e.end,
        id: e.id,
        summary: e.summary
      };else {
        this.getSlot(ks)[e.id] = {
          start: e.start,
          end: GCalendar.slotEndDate(ks),
          id: e.id,
          summary: e.summary
        };
        this.getSlot(ke)[e.id] = {
          start: GCalendar.slotStartDate(ke),
          end: e.end,
          id: e.id,
          summary: e.summary
        };

        for (var k = ks + 1; k < ke; k++) {
          this.getSlot(k)[e.id] = {
            start: GCalendar.slotStartDate(k),
            end: GCalendar.slotEndDate(k),
            id: e.id,
            summary: e.summary
          };
        }
      }
    }
  }, {
    key: "removeEvent",
    value: function removeEvent(e) {
      var ks = GCalendar.dateToCacheKey(e.start);
      var ke = GCalendar.dateToCacheKey(new Date(e.end.getTime() - 1));

      for (var k = ks; k <= ke; k++) {
        delete this.getSlot(k)[e.id];
      }
    }
  }, {
    key: "getSlotEvents",
    value: function getSlotEvents(k, start, end) {
      var s = this.getSlot(k);
      var results = [];

      for (var id in s) {
        if (!(s[id].start >= end || s[id].end <= start)) {
          results.push({
            id: id,
            start: s[id].start < start ? start : s[id].start,
            end: s[id].end > end ? end : s[id].end,
            summary: s[id].summary
          });
        }
      }

      return results;
    }
  }, {
    key: "getCachedEvents",
    value: function getCachedEvents(start, end) {
      var ks = GCalendar.dateToCacheKey(start);
      var ke = GCalendar.dateToCacheKey(new Date(end.getTime() - 1));
      var results = this.getSlotEvents(ks, start, end);

      for (var k = ks + 1; k < ke; k++) {
        var s = this.getSlot(k);

        for (var id in s) {
          results.push(s[id]);
        }
      }

      if (ke > ks) results.push.apply(results, _toConsumableArray(this.getSlotEvents(ke, start, end)));
      return results;
    }
  }, {
    key: "sync",
    value: function sync() {
      var _this = this;

      return this.token.then(function (token) {
        return getEvents(_this.calId, token, _this.syncToken).then(function (r) {
          _this.syncToken = r.nextSyncToken;
          var pm_results = r.results.map(function (e) {
            return e.start ? Promise.resolve(e) : getEvent(_this.calId, e.id, token);
          });
          return Promise.all(pm_results).then(function (results) {
            return results.forEach(function (e) {
              e.start = new Date(e.start.dateTime);
              e.end = new Date(e.end.dateTime);
              if (e.status === 'confirmed') _this.addEvent(e);else if (e.status === 'cancelled') _this.removeEvent(e);
            });
          });
        });
      }).catch(function (e) {
        if (e === GApiError.invalidSyncToken) {
          _this.syncToken = '';

          _this.sync();
        } else throw e;
      });
    }
  }, {
    key: "getEvents",
    value: function getEvents(start, end) {
      var _this2 = this;

      return this.sync().then(function () {
        return _this2.getCachedEvents(start, end);
      });
    }
  }], [{
    key: "dateToCacheKey",
    value: function dateToCacheKey(date) {
      return Math.floor(date / 8.64e7);
    }
  }, {
    key: "slotStartDate",
    value: function slotStartDate(k) {
      return new Date(k * 8.64e7);
    }
  }, {
    key: "slotEndDate",
    value: function slotEndDate(k) {
      return new Date((k + 1) * 8.64e7);
    }
  }]);

  return GCalendar;
}();

exports.GCalendar = GCalendar;

},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYmFja2dyb3VuZC5qcyIsInNyYy9nYXBpLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7QUNBQTs7OztBQUVBLElBQUksUUFBUSxHQUFHLEVBQWY7QUFDQSxJQUFJLFNBQVMsR0FBRyxFQUFoQjtBQUNBLElBQUksT0FBTyxHQUFHLEVBQWQ7QUFFQSxNQUFNLENBQUMsT0FBUCxDQUFlLFNBQWYsQ0FBeUIsV0FBekIsQ0FBcUMsVUFBUyxJQUFULEVBQWU7QUFDaEQsRUFBQSxPQUFPLENBQUMsTUFBUixDQUFlLElBQUksQ0FBQyxJQUFMLElBQWEsTUFBNUI7QUFDQSxFQUFBLElBQUksQ0FBQyxTQUFMLENBQWUsV0FBZixDQUEyQixVQUFTLEdBQVQsRUFBYztBQUNyQyxJQUFBLE9BQU8sQ0FBQyxHQUFSLENBQVksR0FBWjs7QUFDQSxRQUFJLEdBQUcsQ0FBQyxJQUFKLElBQVksQ0FBaEIsRUFBbUI7QUFDZixNQUFBLFFBQVEsR0FBRyxHQUFHLENBQUMsSUFBZjtBQUNILEtBRkQsTUFHSyxJQUFJLEdBQUcsQ0FBQyxJQUFKLElBQVksQ0FBaEIsRUFBbUI7QUFDcEIsTUFBQSxJQUFJLENBQUMsV0FBTCxDQUFpQjtBQUFFLFFBQUEsRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFWO0FBQWMsUUFBQSxJQUFJLEVBQUUsQ0FBcEI7QUFBdUIsUUFBQSxJQUFJLEVBQUU7QUFBN0IsT0FBakI7QUFDSCxLQUZJLE1BR0EsSUFBSSxHQUFHLENBQUMsSUFBSixJQUFZLENBQWhCLEVBQW1CO0FBQ3BCLE1BQUEsU0FBUyxHQUFHLEdBQUcsQ0FBQyxJQUFoQjtBQUNILEtBRkksTUFHQSxJQUFJLEdBQUcsQ0FBQyxJQUFKLElBQVksQ0FBaEIsRUFBbUI7QUFDcEIsTUFBQSxJQUFJLENBQUMsV0FBTCxDQUFpQjtBQUFFLFFBQUEsRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFWO0FBQWMsUUFBQSxJQUFJLEVBQUUsQ0FBcEI7QUFBdUIsUUFBQSxJQUFJLEVBQUU7QUFBN0IsT0FBakI7QUFDSCxLQUZJLE1BR0EsSUFBSSxHQUFHLENBQUMsSUFBSixJQUFZLENBQWhCLEVBQW1CO0FBQ3BCLE1BQUEsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFKLENBQVMsRUFBVixDQUFQLENBQXFCLFNBQXJCLENBQStCLElBQUksSUFBSixDQUFTLEdBQUcsQ0FBQyxJQUFKLENBQVMsS0FBbEIsQ0FBL0IsRUFBeUQsSUFBSSxJQUFKLENBQVMsR0FBRyxDQUFDLElBQUosQ0FBUyxHQUFsQixDQUF6RCxFQUNLLEtBREwsQ0FDVyxVQUFBLENBQUMsRUFBSTtBQUNSLFFBQUEsT0FBTyxDQUFDLEdBQVIsZ0NBQW9DLEdBQUcsQ0FBQyxJQUFKLENBQVMsRUFBN0M7QUFDQSxlQUFPLEVBQVA7QUFDSCxPQUpMLEVBS0ssSUFMTCxDQUtVLFVBQUEsSUFBSSxFQUFJO0FBQ2QsUUFBQSxPQUFPLENBQUMsR0FBUixDQUFZLElBQVo7QUFDQSxZQUFJLElBQUksR0FBRztBQUFFLFVBQUEsRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFWO0FBQWMsVUFBQSxJQUFJLEVBQUUsQ0FBcEI7QUFBdUIsVUFBQSxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUwsQ0FBUyxVQUFBLENBQUMsRUFBSTtBQUNsRCxtQkFBTztBQUNILGNBQUEsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQURIO0FBRUgsY0FBQSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUYsQ0FBUSxPQUFSLEVBRko7QUFHSCxjQUFBLEdBQUcsRUFBRSxDQUFDLENBQUMsR0FBRixDQUFNLE9BQU47QUFIRixhQUFQO0FBS0gsV0FOdUM7QUFBN0IsU0FBWDtBQU9BLFFBQUEsT0FBTyxDQUFDLEdBQVIsQ0FBWSxJQUFaO0FBQ0EsUUFBQSxJQUFJLENBQUMsV0FBTCxDQUFpQixJQUFqQjtBQUNILE9BaEJEO0FBaUJILEtBbEJJLE1BbUJBLElBQUksR0FBRyxDQUFDLElBQUosSUFBWSxDQUFoQixFQUFtQjtBQUNwQixNQUFBLFNBQVMsR0FBRyxHQUFHLENBQUMsSUFBaEI7O0FBQ0EsV0FBSyxJQUFJLEVBQVQsSUFBZSxTQUFmLEVBQTBCO0FBQ3RCLFlBQUksQ0FBQyxPQUFPLENBQUMsY0FBUixDQUF1QixFQUF2QixDQUFMLEVBQ0ksT0FBTyxDQUFDLEVBQUQsQ0FBUCxHQUFjLElBQUksSUFBSSxDQUFDLFNBQVQsQ0FBbUIsRUFBbkIsRUFBdUIsU0FBUyxDQUFDLEVBQUQsQ0FBVCxDQUFjLE9BQXJDLENBQWQ7QUFDUDtBQUNKLEtBTkksTUFPQTtBQUNELE1BQUEsT0FBTyxDQUFDLEtBQVIsQ0FBYyxrQkFBZDtBQUNIO0FBQ0osR0EzQ0Q7QUE0Q0gsQ0E5Q0Q7QUFnREEsTUFBTSxDQUFDLGFBQVAsQ0FBcUIsU0FBckIsQ0FBK0IsV0FBL0IsQ0FBMkMsWUFBVztBQUNsRCxFQUFBLE1BQU0sQ0FBQyxJQUFQLENBQVksTUFBWixDQUFtQjtBQUFDLElBQUEsR0FBRyxFQUFFO0FBQU4sR0FBbkI7QUFDSCxDQUZEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ3REQTtBQUNBLElBQU0sU0FBUyxHQUFHLHdDQUFsQjtBQUVBLElBQU0sU0FBUyxHQUFHO0FBQ2QsRUFBQSxnQkFBZ0IsRUFBRSxDQURKO0FBRWQsRUFBQSxVQUFVLEVBQUU7QUFGRSxDQUFsQjs7QUFLQSxTQUFTLFNBQVQsQ0FBbUIsSUFBbkIsRUFBeUI7QUFDckIsU0FBTyxNQUFNLENBQUMsT0FBUCxDQUFlLElBQWYsRUFBcUIsR0FBckIsQ0FBeUI7QUFBQTtBQUFBLFFBQUUsQ0FBRjtBQUFBLFFBQUssQ0FBTDs7QUFBQSxxQkFBZSxrQkFBa0IsQ0FBQyxDQUFELENBQWpDLGNBQXdDLGtCQUFrQixDQUFDLENBQUQsQ0FBMUQ7QUFBQSxHQUF6QixFQUEwRixJQUExRixDQUErRixHQUEvRixDQUFQO0FBQ0g7O0FBRU0sU0FBUyxZQUFULEdBQXdCO0FBQzNCLFNBQU8sSUFBSSxPQUFKLENBQVksVUFBQSxRQUFRO0FBQUEsV0FDdkIsTUFBTSxDQUFDLFFBQVAsQ0FBZ0IsWUFBaEIsQ0FDSTtBQUFDLE1BQUEsV0FBVyxFQUFFO0FBQWQsS0FESixFQUN5QixVQUFBLEtBQUs7QUFBQSxhQUFJLFFBQVEsQ0FBQyxLQUFELENBQVo7QUFBQSxLQUQ5QixDQUR1QjtBQUFBLEdBQXBCLENBQVA7QUFHSDs7QUFFTSxTQUFTLFlBQVQsQ0FBc0IsS0FBdEIsRUFBNkI7QUFDaEMsU0FBTyxLQUFLLFdBQUksU0FBSixvQ0FBdUMsU0FBUyxDQUFDO0FBQUMsSUFBQSxZQUFZLEVBQUU7QUFBZixHQUFELENBQWhELEdBQ0o7QUFBRSxJQUFBLE1BQU0sRUFBRSxLQUFWO0FBQWlCLElBQUEsS0FBSyxFQUFFO0FBQXhCLEdBREksQ0FBTCxDQUVGLElBRkUsQ0FFRyxVQUFBLFFBQVE7QUFBQSxXQUFJLFFBQVEsQ0FBQyxJQUFULEVBQUo7QUFBQSxHQUZYLEVBR0YsSUFIRSxDQUdHLFVBQUEsSUFBSTtBQUFBLFdBQUksSUFBSSxDQUFDLEtBQVQ7QUFBQSxHQUhQLENBQVA7QUFJSDs7QUFFTSxTQUFTLFNBQVQsQ0FBbUIsS0FBbkIsRUFBMEI7QUFDN0IsU0FBTyxLQUFLLFdBQUksU0FBSixxQkFBd0IsU0FBUyxDQUFDO0FBQUMsSUFBQSxZQUFZLEVBQUU7QUFBZixHQUFELENBQWpDLEdBQ1I7QUFBRSxJQUFBLE1BQU0sRUFBRSxLQUFWO0FBQWlCLElBQUEsS0FBSyxFQUFFO0FBQXhCLEdBRFEsQ0FBTCxDQUVGLElBRkUsQ0FFRyxVQUFBLFFBQVE7QUFBQSxXQUFJLFFBQVEsQ0FBQyxJQUFULEVBQUo7QUFBQSxHQUZYLENBQVA7QUFHSDs7QUFFRCxTQUFTLFFBQVQsQ0FBa0IsS0FBbEIsRUFBeUIsT0FBekIsRUFBa0MsS0FBbEMsRUFBeUM7QUFDckMsU0FBTyxLQUFLLFdBQUksU0FBSix3QkFBMkIsS0FBM0IscUJBQTJDLE9BQTNDLGNBQXNELFNBQVMsQ0FBQztBQUFDLElBQUEsWUFBWSxFQUFFO0FBQWYsR0FBRCxDQUEvRCxHQUNSO0FBQUUsSUFBQSxNQUFNLEVBQUUsS0FBVjtBQUFpQixJQUFBLEtBQUssRUFBRTtBQUF4QixHQURRLENBQUwsQ0FFRixJQUZFLENBRUcsVUFBQSxRQUFRO0FBQUEsV0FBSSxRQUFRLENBQUMsSUFBVCxFQUFKO0FBQUEsR0FGWCxDQUFQO0FBR0g7O0FBRUQsU0FBUyxTQUFULENBQW1CLEtBQW5CLEVBQTBCLEtBQTFCLEVBQWlDLFNBQWpDLEVBQW1FO0FBQUEsTUFBdkIsaUJBQXVCLHVFQUFMLEdBQUs7QUFDL0QsTUFBSSxPQUFPLEdBQUcsRUFBZDs7QUFDQSxNQUFNLFdBQVcsR0FBRyxTQUFkLFdBQWMsQ0FBQyxTQUFELEVBQVksU0FBWjtBQUFBLFdBQTBCLEtBQUssV0FBSSxTQUFKLHdCQUEyQixLQUEzQixxQkFBMkMsU0FBUyxDQUFDO0FBQ2hHLE1BQUEsWUFBWSxFQUFFLEtBRGtGO0FBRWhHLE1BQUEsU0FBUyxFQUFULFNBRmdHO0FBR2hHLE1BQUEsU0FBUyxFQUFULFNBSGdHO0FBSWhHLE1BQUEsVUFBVSxFQUFFO0FBSm9GLEtBQUQsQ0FBcEQsR0FLekM7QUFBRSxNQUFBLE1BQU0sRUFBRSxLQUFWO0FBQWlCLE1BQUEsS0FBSyxFQUFFO0FBQXhCLEtBTHlDLENBQUwsQ0FNckMsSUFOcUMsQ0FNaEMsVUFBQSxRQUFRLEVBQUk7QUFDZCxVQUFJLFFBQVEsQ0FBQyxNQUFULEtBQW9CLEdBQXhCLEVBQ0ksT0FBTyxRQUFRLENBQUMsSUFBVCxFQUFQLENBREosS0FFSyxJQUFJLFFBQVEsQ0FBQyxNQUFULEtBQW9CLEdBQXhCLEVBQ0QsTUFBTSxTQUFTLENBQUMsZ0JBQWhCLENBREMsS0FFQSxNQUFNLFNBQVMsQ0FBQyxXQUFoQjtBQUNSLEtBWnFDLEVBYXJDLElBYnFDLENBYWhDLFVBQUEsSUFBSSxFQUFJO0FBQ1YsTUFBQSxPQUFPLENBQUMsSUFBUixPQUFBLE9BQU8scUJBQVMsSUFBSSxDQUFDLEtBQWQsRUFBUDs7QUFDQSxVQUFJLElBQUksQ0FBQyxhQUFULEVBQXdCO0FBQ3BCLGVBQU8sV0FBVyxDQUFDLElBQUksQ0FBQyxhQUFOLEVBQXFCLEVBQXJCLENBQWxCO0FBQ0gsT0FGRCxNQUVPO0FBQ0gsZUFBUTtBQUNKLFVBQUEsYUFBYSxFQUFFLElBQUksQ0FBQyxhQURoQjtBQUVKLFVBQUEsT0FBTyxFQUFQO0FBRkksU0FBUjtBQUlIO0FBQ0osS0F2QnFDLENBQTFCO0FBQUEsR0FBcEI7O0FBeUJBLFNBQU8sV0FBVyxDQUFDLEVBQUQsRUFBSyxTQUFMLENBQWxCO0FBQ0g7O0lBRVksUzs7O0FBQ1QscUJBQVksS0FBWixFQUFtQixJQUFuQixFQUF5QjtBQUFBOztBQUNyQixTQUFLLEtBQUwsR0FBYSxLQUFiO0FBQ0EsU0FBSyxJQUFMLEdBQVksSUFBWjtBQUNBLFNBQUssS0FBTCxHQUFhLFlBQVksRUFBekI7QUFDQSxTQUFLLFNBQUwsR0FBaUIsRUFBakI7QUFDQSxTQUFLLEtBQUwsR0FBYSxFQUFiO0FBQ0g7Ozs7NEJBTU8sQyxFQUFHO0FBQ1AsVUFBSSxDQUFDLEtBQUssS0FBTCxDQUFXLENBQVgsQ0FBTCxFQUNJLEtBQUssS0FBTCxDQUFXLENBQVgsSUFBZ0IsRUFBaEI7QUFDSixhQUFPLEtBQUssS0FBTCxDQUFXLENBQVgsQ0FBUDtBQUNIOzs7NkJBS1EsQyxFQUFHO0FBQ1IsVUFBSSxFQUFFLEdBQUcsU0FBUyxDQUFDLGNBQVYsQ0FBeUIsQ0FBQyxDQUFDLEtBQTNCLENBQVQ7QUFDQSxVQUFJLEVBQUUsR0FBRyxTQUFTLENBQUMsY0FBVixDQUF5QixJQUFJLElBQUosQ0FBUyxDQUFDLENBQUMsR0FBRixDQUFNLE9BQU4sS0FBa0IsQ0FBM0IsQ0FBekIsQ0FBVDtBQUNBLFVBQUksRUFBRSxLQUFLLEVBQVgsRUFDSSxLQUFLLE9BQUwsQ0FBYSxFQUFiLEVBQWlCLENBQUMsQ0FBQyxFQUFuQixJQUF5QjtBQUNyQixRQUFBLEtBQUssRUFBRSxDQUFDLENBQUMsS0FEWTtBQUVyQixRQUFBLEdBQUcsRUFBRSxDQUFDLENBQUMsR0FGYztBQUdyQixRQUFBLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFIZTtBQUlyQixRQUFBLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFKVSxPQUF6QixDQURKLEtBT0E7QUFDSSxhQUFLLE9BQUwsQ0FBYSxFQUFiLEVBQWlCLENBQUMsQ0FBQyxFQUFuQixJQUF5QjtBQUNyQixVQUFBLEtBQUssRUFBRSxDQUFDLENBQUMsS0FEWTtBQUVyQixVQUFBLEdBQUcsRUFBRSxTQUFTLENBQUMsV0FBVixDQUFzQixFQUF0QixDQUZnQjtBQUdyQixVQUFBLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFIZTtBQUlyQixVQUFBLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFKVSxTQUF6QjtBQUtBLGFBQUssT0FBTCxDQUFhLEVBQWIsRUFBaUIsQ0FBQyxDQUFDLEVBQW5CLElBQXlCO0FBQ3JCLFVBQUEsS0FBSyxFQUFFLFNBQVMsQ0FBQyxhQUFWLENBQXdCLEVBQXhCLENBRGM7QUFFckIsVUFBQSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBRmM7QUFHckIsVUFBQSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBSGU7QUFJckIsVUFBQSxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBSlUsU0FBekI7O0FBS0EsYUFBSyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBbEIsRUFBcUIsQ0FBQyxHQUFHLEVBQXpCLEVBQTZCLENBQUMsRUFBOUI7QUFDSSxlQUFLLE9BQUwsQ0FBYSxDQUFiLEVBQWdCLENBQUMsQ0FBQyxFQUFsQixJQUF3QjtBQUNwQixZQUFBLEtBQUssRUFBRSxTQUFTLENBQUMsYUFBVixDQUF3QixDQUF4QixDQURhO0FBRXBCLFlBQUEsR0FBRyxFQUFFLFNBQVMsQ0FBQyxXQUFWLENBQXNCLENBQXRCLENBRmU7QUFHcEIsWUFBQSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBSGM7QUFJcEIsWUFBQSxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBSlMsV0FBeEI7QUFESjtBQU1IO0FBQ0o7OztnQ0FFVyxDLEVBQUc7QUFDWCxVQUFJLEVBQUUsR0FBRyxTQUFTLENBQUMsY0FBVixDQUF5QixDQUFDLENBQUMsS0FBM0IsQ0FBVDtBQUNBLFVBQUksRUFBRSxHQUFHLFNBQVMsQ0FBQyxjQUFWLENBQXlCLElBQUksSUFBSixDQUFTLENBQUMsQ0FBQyxHQUFGLENBQU0sT0FBTixLQUFrQixDQUEzQixDQUF6QixDQUFUOztBQUNBLFdBQUssSUFBSSxDQUFDLEdBQUcsRUFBYixFQUFpQixDQUFDLElBQUksRUFBdEIsRUFBMEIsQ0FBQyxFQUEzQjtBQUNJLGVBQU8sS0FBSyxPQUFMLENBQWEsQ0FBYixFQUFnQixDQUFDLENBQUMsRUFBbEIsQ0FBUDtBQURKO0FBRUg7OztrQ0FFYSxDLEVBQUcsSyxFQUFPLEcsRUFBSztBQUN6QixVQUFJLENBQUMsR0FBRyxLQUFLLE9BQUwsQ0FBYSxDQUFiLENBQVI7QUFDQSxVQUFJLE9BQU8sR0FBRyxFQUFkOztBQUNBLFdBQUssSUFBSSxFQUFULElBQWUsQ0FBZixFQUFrQjtBQUNkLFlBQUksRUFBRSxDQUFDLENBQUMsRUFBRCxDQUFELENBQU0sS0FBTixJQUFlLEdBQWYsSUFBc0IsQ0FBQyxDQUFDLEVBQUQsQ0FBRCxDQUFNLEdBQU4sSUFBYSxLQUFyQyxDQUFKLEVBQ0E7QUFDSSxVQUFBLE9BQU8sQ0FBQyxJQUFSLENBQWE7QUFDVCxZQUFBLEVBQUUsRUFBRixFQURTO0FBRVQsWUFBQSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEVBQUQsQ0FBRCxDQUFNLEtBQU4sR0FBYyxLQUFkLEdBQXNCLEtBQXRCLEdBQTZCLENBQUMsQ0FBQyxFQUFELENBQUQsQ0FBTSxLQUZqQztBQUdULFlBQUEsR0FBRyxFQUFFLENBQUMsQ0FBQyxFQUFELENBQUQsQ0FBTSxHQUFOLEdBQVksR0FBWixHQUFrQixHQUFsQixHQUF1QixDQUFDLENBQUMsRUFBRCxDQUFELENBQU0sR0FIekI7QUFJVCxZQUFBLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRCxDQUFELENBQU07QUFKTixXQUFiO0FBTUg7QUFDSjs7QUFDRCxhQUFPLE9BQVA7QUFDSDs7O29DQUVlLEssRUFBTyxHLEVBQUs7QUFDeEIsVUFBSSxFQUFFLEdBQUcsU0FBUyxDQUFDLGNBQVYsQ0FBeUIsS0FBekIsQ0FBVDtBQUNBLFVBQUksRUFBRSxHQUFHLFNBQVMsQ0FBQyxjQUFWLENBQXlCLElBQUksSUFBSixDQUFTLEdBQUcsQ0FBQyxPQUFKLEtBQWdCLENBQXpCLENBQXpCLENBQVQ7QUFDQSxVQUFJLE9BQU8sR0FBRyxLQUFLLGFBQUwsQ0FBbUIsRUFBbkIsRUFBdUIsS0FBdkIsRUFBOEIsR0FBOUIsQ0FBZDs7QUFDQSxXQUFLLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFsQixFQUFxQixDQUFDLEdBQUcsRUFBekIsRUFBNkIsQ0FBQyxFQUE5QixFQUNBO0FBQ0ksWUFBSSxDQUFDLEdBQUcsS0FBSyxPQUFMLENBQWEsQ0FBYixDQUFSOztBQUNBLGFBQUssSUFBSSxFQUFULElBQWUsQ0FBZjtBQUNJLFVBQUEsT0FBTyxDQUFDLElBQVIsQ0FBYSxDQUFDLENBQUMsRUFBRCxDQUFkO0FBREo7QUFFSDs7QUFDRCxVQUFJLEVBQUUsR0FBRyxFQUFULEVBQ0ksT0FBTyxDQUFDLElBQVIsT0FBQSxPQUFPLHFCQUFTLEtBQUssYUFBTCxDQUFtQixFQUFuQixFQUF1QixLQUF2QixFQUE4QixHQUE5QixDQUFULEVBQVA7QUFDSixhQUFPLE9BQVA7QUFDSDs7OzJCQUVNO0FBQUE7O0FBQ0gsYUFBTyxLQUFLLEtBQUwsQ0FBVyxJQUFYLENBQWdCLFVBQUEsS0FBSztBQUFBLGVBQUksU0FBUyxDQUFDLEtBQUksQ0FBQyxLQUFOLEVBQWEsS0FBYixFQUFvQixLQUFJLENBQUMsU0FBekIsQ0FBVCxDQUE2QyxJQUE3QyxDQUFrRCxVQUFBLENBQUMsRUFBSTtBQUNuRixVQUFBLEtBQUksQ0FBQyxTQUFMLEdBQWlCLENBQUMsQ0FBQyxhQUFuQjtBQUNBLGNBQUksVUFBVSxHQUFHLENBQUMsQ0FBQyxPQUFGLENBQVUsR0FBVixDQUFjLFVBQUEsQ0FBQztBQUFBLG1CQUFJLENBQUMsQ0FBQyxLQUFGLEdBQVUsT0FBTyxDQUFDLE9BQVIsQ0FBZ0IsQ0FBaEIsQ0FBVixHQUErQixRQUFRLENBQUMsS0FBSSxDQUFDLEtBQU4sRUFBYSxDQUFDLENBQUMsRUFBZixFQUFtQixLQUFuQixDQUEzQztBQUFBLFdBQWYsQ0FBakI7QUFDQSxpQkFBTyxPQUFPLENBQUMsR0FBUixDQUFZLFVBQVosRUFBd0IsSUFBeEIsQ0FBNkIsVUFBQSxPQUFPO0FBQUEsbUJBQUksT0FBTyxDQUFDLE9BQVIsQ0FBZ0IsVUFBQSxDQUFDLEVBQUk7QUFDaEUsY0FBQSxDQUFDLENBQUMsS0FBRixHQUFVLElBQUksSUFBSixDQUFTLENBQUMsQ0FBQyxLQUFGLENBQVEsUUFBakIsQ0FBVjtBQUNBLGNBQUEsQ0FBQyxDQUFDLEdBQUYsR0FBUSxJQUFJLElBQUosQ0FBUyxDQUFDLENBQUMsR0FBRixDQUFNLFFBQWYsQ0FBUjtBQUNBLGtCQUFJLENBQUMsQ0FBQyxNQUFGLEtBQWEsV0FBakIsRUFDSSxLQUFJLENBQUMsUUFBTCxDQUFjLENBQWQsRUFESixLQUVLLElBQUksQ0FBQyxDQUFDLE1BQUYsS0FBYSxXQUFqQixFQUNELEtBQUksQ0FBQyxXQUFMLENBQWlCLENBQWpCO0FBQ1AsYUFQOEMsQ0FBSjtBQUFBLFdBQXBDLENBQVA7QUFRSCxTQVgrQixDQUFKO0FBQUEsT0FBckIsRUFXSCxLQVhHLENBV0csVUFBQSxDQUFDLEVBQUk7QUFDWCxZQUFJLENBQUMsS0FBSyxTQUFTLENBQUMsZ0JBQXBCLEVBQXNDO0FBQ2xDLFVBQUEsS0FBSSxDQUFDLFNBQUwsR0FBaUIsRUFBakI7O0FBQ0EsVUFBQSxLQUFJLENBQUMsSUFBTDtBQUNILFNBSEQsTUFHTyxNQUFNLENBQU47QUFDVixPQWhCTSxDQUFQO0FBaUJIOzs7OEJBRVMsSyxFQUFPLEcsRUFBSztBQUFBOztBQUNsQixhQUFPLEtBQUssSUFBTCxHQUFZLElBQVosQ0FBaUI7QUFBQSxlQUFNLE1BQUksQ0FBQyxlQUFMLENBQXFCLEtBQXJCLEVBQTRCLEdBQTVCLENBQU47QUFBQSxPQUFqQixDQUFQO0FBQ0g7OzttQ0F4R3FCLEksRUFBTTtBQUN4QixhQUFPLElBQUksQ0FBQyxLQUFMLENBQVcsSUFBSSxHQUFHLE1BQWxCLENBQVA7QUFDSDs7O2tDQVFvQixDLEVBQUc7QUFBRSxhQUFPLElBQUksSUFBSixDQUFTLENBQUMsR0FBRyxNQUFiLENBQVA7QUFBOEI7OztnQ0FDckMsQyxFQUFHO0FBQUUsYUFBTyxJQUFJLElBQUosQ0FBUyxDQUFDLENBQUMsR0FBRyxDQUFMLElBQVUsTUFBbkIsQ0FBUDtBQUFvQyIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsImltcG9ydCAqIGFzIGdhcGkgZnJvbSAnLi9nYXBpJztcblxubGV0IHBhdHRlcm5zID0gW107XG5sZXQgY2FsZW5kYXJzID0ge307XG5sZXQgY2FsRGF0YSA9IHt9O1xuXG5jaHJvbWUucnVudGltZS5vbkNvbm5lY3QuYWRkTGlzdGVuZXIoZnVuY3Rpb24ocG9ydCkge1xuICAgIGNvbnNvbGUuYXNzZXJ0KHBvcnQubmFtZSA9PSAnbWFpbicpO1xuICAgIHBvcnQub25NZXNzYWdlLmFkZExpc3RlbmVyKGZ1bmN0aW9uKG1zZykge1xuICAgICAgICBjb25zb2xlLmxvZyhtc2cpO1xuICAgICAgICBpZiAobXNnLnR5cGUgPT0gMCkge1xuICAgICAgICAgICAgcGF0dGVybnMgPSBtc2cuZGF0YTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChtc2cudHlwZSA9PSAxKSB7XG4gICAgICAgICAgICBwb3J0LnBvc3RNZXNzYWdlKHsgaWQ6IG1zZy5pZCwgdHlwZTogMSwgZGF0YTogcGF0dGVybnMgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobXNnLnR5cGUgPT0gMikge1xuICAgICAgICAgICAgY2FsZW5kYXJzID0gbXNnLmRhdGE7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobXNnLnR5cGUgPT0gMykge1xuICAgICAgICAgICAgcG9ydC5wb3N0TWVzc2FnZSh7IGlkOiBtc2cuaWQsIHR5cGU6IDMsIGRhdGE6IGNhbGVuZGFycyB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChtc2cudHlwZSA9PSA0KSB7XG4gICAgICAgICAgICBjYWxEYXRhW21zZy5kYXRhLmlkXS5nZXRFdmVudHMobmV3IERhdGUobXNnLmRhdGEuc3RhcnQpLCBuZXcgRGF0ZShtc2cuZGF0YS5lbmQpKVxuICAgICAgICAgICAgICAgIC5jYXRjaChlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYGNhbm5vdCBsb2FkIGNhbGVuZGFyICR7bXNnLmRhdGEuaWR9YCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC50aGVuKGRhdGEgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGRhdGEpO1xuICAgICAgICAgICAgICAgIGxldCByZXNwID0geyBpZDogbXNnLmlkLCB0eXBlOiA0LCBkYXRhOiBkYXRhLm1hcChlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlkOiBlLmlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IGUuc3RhcnQuZ2V0VGltZSgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgZW5kOiBlLmVuZC5nZXRUaW1lKClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pfTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhyZXNwKTtcbiAgICAgICAgICAgICAgICBwb3J0LnBvc3RNZXNzYWdlKHJlc3ApO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobXNnLnR5cGUgPT0gNSkge1xuICAgICAgICAgICAgY2FsZW5kYXJzID0gbXNnLmRhdGE7XG4gICAgICAgICAgICBmb3IgKGxldCBpZCBpbiBjYWxlbmRhcnMpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNhbERhdGEuaGFzT3duUHJvcGVydHkoaWQpKVxuICAgICAgICAgICAgICAgICAgICBjYWxEYXRhW2lkXSA9IG5ldyBnYXBpLkdDYWxlbmRhcihpZCwgY2FsZW5kYXJzW2lkXS5zdW1tYXJ5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJ1bmtub3duIG1zZyB0eXBlXCIpO1xuICAgICAgICB9XG4gICAgfSk7XG59KTtcblxuY2hyb21lLmJyb3dzZXJBY3Rpb24ub25DbGlja2VkLmFkZExpc3RlbmVyKGZ1bmN0aW9uKCkge1xuICAgIGNocm9tZS50YWJzLmNyZWF0ZSh7dXJsOiAnaW5kZXguaHRtbCd9KTtcbn0pO1xuXG4iLCIvKiBnbG9iYWwgY2hyb21lICovXG5jb25zdCBnYXBpX2Jhc2UgPSAnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vY2FsZW5kYXIvdjMnO1xuXG5jb25zdCBHQXBpRXJyb3IgPSB7XG4gICAgaW52YWxpZFN5bmNUb2tlbjogMSxcbiAgICBvdGhlckVycm9yOiAyLFxufTtcblxuZnVuY3Rpb24gdG9fcGFyYW1zKGRpY3QpIHtcbiAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMoZGljdCkubWFwKChbaywgdl0pID0+IGAke2VuY29kZVVSSUNvbXBvbmVudChrKX09JHtlbmNvZGVVUklDb21wb25lbnQodil9YCkuam9pbignJicpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QXV0aFRva2VuKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlciA9PlxuICAgICAgICBjaHJvbWUuaWRlbnRpdHkuZ2V0QXV0aFRva2VuKFxuICAgICAgICAgICAge2ludGVyYWN0aXZlOiB0cnVlfSwgdG9rZW4gPT4gcmVzb2x2ZXIodG9rZW4pKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDYWxlbmRhcnModG9rZW4pIHtcbiAgICByZXR1cm4gZmV0Y2goYCR7Z2FwaV9iYXNlfS91c2Vycy9tZS9jYWxlbmRhckxpc3Q/JHt0b19wYXJhbXMoe2FjY2Vzc190b2tlbjogdG9rZW59KX1gLFxuICAgICAgICAgICAgeyBtZXRob2Q6ICdHRVQnLCBhc3luYzogdHJ1ZSB9KVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiByZXNwb25zZS5qc29uKCkpXG4gICAgICAgIC50aGVuKGRhdGEgPT4gZGF0YS5pdGVtcyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb2xvcnModG9rZW4pIHtcbiAgICByZXR1cm4gZmV0Y2goYCR7Z2FwaV9iYXNlfS9jb2xvcnM/JHt0b19wYXJhbXMoe2FjY2Vzc190b2tlbjogdG9rZW59KX1gLFxuICAgICAgICB7IG1ldGhvZDogJ0dFVCcsIGFzeW5jOiB0cnVlIH0pXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHJlc3BvbnNlLmpzb24oKSk7XG59XG5cbmZ1bmN0aW9uIGdldEV2ZW50KGNhbElkLCBldmVudElkLCB0b2tlbikge1xuICAgIHJldHVybiBmZXRjaChgJHtnYXBpX2Jhc2V9L2NhbGVuZGFycy8ke2NhbElkfS9ldmVudHMvJHtldmVudElkfT8ke3RvX3BhcmFtcyh7YWNjZXNzX3Rva2VuOiB0b2tlbn0pfWAsXG4gICAgICAgIHsgbWV0aG9kOiAnR0VUJywgYXN5bmM6IHRydWUgfSlcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4gcmVzcG9uc2UuanNvbigpKTtcbn1cblxuZnVuY3Rpb24gZ2V0RXZlbnRzKGNhbElkLCB0b2tlbiwgc3luY1Rva2VuLCByZXN1bHRzUGVyUmVxdWVzdD0xMDApIHtcbiAgICBsZXQgcmVzdWx0cyA9IFtdO1xuICAgIGNvbnN0IHNpbmdsZUZldGNoID0gKHBhZ2VUb2tlbiwgc3luY1Rva2VuKSA9PiBmZXRjaChgJHtnYXBpX2Jhc2V9L2NhbGVuZGFycy8ke2NhbElkfS9ldmVudHM/JHt0b19wYXJhbXMoe1xuICAgICAgICAgICAgYWNjZXNzX3Rva2VuOiB0b2tlbixcbiAgICAgICAgICAgIHBhZ2VUb2tlbixcbiAgICAgICAgICAgIHN5bmNUb2tlbixcbiAgICAgICAgICAgIG1heFJlc3VsdHM6IHJlc3VsdHNQZXJSZXF1ZXN0XG4gICAgICAgIH0pfWAsIHsgbWV0aG9kOiAnR0VUJywgYXN5bmM6IHRydWUgfSlcbiAgICAgICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSAyMDApXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5qc29uKCk7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MTApXG4gICAgICAgICAgICAgICAgICAgIHRocm93IEdBcGlFcnJvci5pbnZhbGlkU3luY1Rva2VuO1xuICAgICAgICAgICAgICAgIGVsc2UgdGhyb3cgR0FwaUVycm9yLm90aGVyRXJyb3JzO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKGRhdGEgPT4ge1xuICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaCguLi5kYXRhLml0ZW1zKTtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5uZXh0UGFnZVRva2VuKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzaW5nbGVGZXRjaChkYXRhLm5leHRQYWdlVG9rZW4sICcnKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5leHRTeW5jVG9rZW46IGRhdGEubmV4dFN5bmNUb2tlbixcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHNcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcblxuICAgIHJldHVybiBzaW5nbGVGZXRjaCgnJywgc3luY1Rva2VuKTtcbn1cblxuZXhwb3J0IGNsYXNzIEdDYWxlbmRhciB7XG4gICAgY29uc3RydWN0b3IoY2FsSWQsIG5hbWUpIHtcbiAgICAgICAgdGhpcy5jYWxJZCA9IGNhbElkO1xuICAgICAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgICAgICB0aGlzLnRva2VuID0gZ2V0QXV0aFRva2VuKCk7XG4gICAgICAgIHRoaXMuc3luY1Rva2VuID0gJyc7XG4gICAgICAgIHRoaXMuY2FjaGUgPSB7fTtcbiAgICB9XG5cbiAgICBzdGF0aWMgZGF0ZVRvQ2FjaGVLZXkoZGF0ZSkge1xuICAgICAgICByZXR1cm4gTWF0aC5mbG9vcihkYXRlIC8gOC42NGU3KTtcbiAgICB9XG5cbiAgICBnZXRTbG90KGspIHtcbiAgICAgICAgaWYgKCF0aGlzLmNhY2hlW2tdKVxuICAgICAgICAgICAgdGhpcy5jYWNoZVtrXSA9IHt9O1xuICAgICAgICByZXR1cm4gdGhpcy5jYWNoZVtrXTtcbiAgICB9XG5cbiAgICBzdGF0aWMgc2xvdFN0YXJ0RGF0ZShrKSB7IHJldHVybiBuZXcgRGF0ZShrICogOC42NGU3KTsgfVxuICAgIHN0YXRpYyBzbG90RW5kRGF0ZShrKSB7IHJldHVybiBuZXcgRGF0ZSgoayArIDEpICogOC42NGU3KTsgfVxuXG4gICAgYWRkRXZlbnQoZSkge1xuICAgICAgICBsZXQga3MgPSBHQ2FsZW5kYXIuZGF0ZVRvQ2FjaGVLZXkoZS5zdGFydCk7XG4gICAgICAgIGxldCBrZSA9IEdDYWxlbmRhci5kYXRlVG9DYWNoZUtleShuZXcgRGF0ZShlLmVuZC5nZXRUaW1lKCkgLSAxKSk7XG4gICAgICAgIGlmIChrcyA9PT0ga2UpXG4gICAgICAgICAgICB0aGlzLmdldFNsb3Qoa3MpW2UuaWRdID0ge1xuICAgICAgICAgICAgICAgIHN0YXJ0OiBlLnN0YXJ0LFxuICAgICAgICAgICAgICAgIGVuZDogZS5lbmQsXG4gICAgICAgICAgICAgICAgaWQ6IGUuaWQsXG4gICAgICAgICAgICAgICAgc3VtbWFyeTogZS5zdW1tYXJ5fTtcbiAgICAgICAgZWxzZVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLmdldFNsb3Qoa3MpW2UuaWRdID0ge1xuICAgICAgICAgICAgICAgIHN0YXJ0OiBlLnN0YXJ0LFxuICAgICAgICAgICAgICAgIGVuZDogR0NhbGVuZGFyLnNsb3RFbmREYXRlKGtzKSxcbiAgICAgICAgICAgICAgICBpZDogZS5pZCxcbiAgICAgICAgICAgICAgICBzdW1tYXJ5OiBlLnN1bW1hcnl9O1xuICAgICAgICAgICAgdGhpcy5nZXRTbG90KGtlKVtlLmlkXSA9IHtcbiAgICAgICAgICAgICAgICBzdGFydDogR0NhbGVuZGFyLnNsb3RTdGFydERhdGUoa2UpLFxuICAgICAgICAgICAgICAgIGVuZDogZS5lbmQsXG4gICAgICAgICAgICAgICAgaWQ6IGUuaWQsXG4gICAgICAgICAgICAgICAgc3VtbWFyeTogZS5zdW1tYXJ5fTtcbiAgICAgICAgICAgIGZvciAobGV0IGsgPSBrcyArIDE7IGsgPCBrZTsgaysrKVxuICAgICAgICAgICAgICAgIHRoaXMuZ2V0U2xvdChrKVtlLmlkXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IEdDYWxlbmRhci5zbG90U3RhcnREYXRlKGspLFxuICAgICAgICAgICAgICAgICAgICBlbmQ6IEdDYWxlbmRhci5zbG90RW5kRGF0ZShrKSxcbiAgICAgICAgICAgICAgICAgICAgaWQ6IGUuaWQsXG4gICAgICAgICAgICAgICAgICAgIHN1bW1hcnk6IGUuc3VtbWFyeX07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZW1vdmVFdmVudChlKSB7XG4gICAgICAgIGxldCBrcyA9IEdDYWxlbmRhci5kYXRlVG9DYWNoZUtleShlLnN0YXJ0KTtcbiAgICAgICAgbGV0IGtlID0gR0NhbGVuZGFyLmRhdGVUb0NhY2hlS2V5KG5ldyBEYXRlKGUuZW5kLmdldFRpbWUoKSAtIDEpKTtcbiAgICAgICAgZm9yIChsZXQgayA9IGtzOyBrIDw9IGtlOyBrKyspXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5nZXRTbG90KGspW2UuaWRdO1xuICAgIH1cblxuICAgIGdldFNsb3RFdmVudHMoaywgc3RhcnQsIGVuZCkge1xuICAgICAgICBsZXQgcyA9IHRoaXMuZ2V0U2xvdChrKTtcbiAgICAgICAgbGV0IHJlc3VsdHMgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaWQgaW4gcykge1xuICAgICAgICAgICAgaWYgKCEoc1tpZF0uc3RhcnQgPj0gZW5kIHx8IHNbaWRdLmVuZCA8PSBzdGFydCkpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBzW2lkXS5zdGFydCA8IHN0YXJ0ID8gc3RhcnQ6IHNbaWRdLnN0YXJ0LFxuICAgICAgICAgICAgICAgICAgICBlbmQ6IHNbaWRdLmVuZCA+IGVuZCA/IGVuZDogc1tpZF0uZW5kLFxuICAgICAgICAgICAgICAgICAgICBzdW1tYXJ5OiBzW2lkXS5zdW1tYXJ5XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfVxuXG4gICAgZ2V0Q2FjaGVkRXZlbnRzKHN0YXJ0LCBlbmQpIHtcbiAgICAgICAgbGV0IGtzID0gR0NhbGVuZGFyLmRhdGVUb0NhY2hlS2V5KHN0YXJ0KTtcbiAgICAgICAgbGV0IGtlID0gR0NhbGVuZGFyLmRhdGVUb0NhY2hlS2V5KG5ldyBEYXRlKGVuZC5nZXRUaW1lKCkgLSAxKSk7XG4gICAgICAgIGxldCByZXN1bHRzID0gdGhpcy5nZXRTbG90RXZlbnRzKGtzLCBzdGFydCwgZW5kKTtcbiAgICAgICAgZm9yIChsZXQgayA9IGtzICsgMTsgayA8IGtlOyBrKyspXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCBzID0gdGhpcy5nZXRTbG90KGspO1xuICAgICAgICAgICAgZm9yIChsZXQgaWQgaW4gcylcbiAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2goc1tpZF0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChrZSA+IGtzKVxuICAgICAgICAgICAgcmVzdWx0cy5wdXNoKC4uLnRoaXMuZ2V0U2xvdEV2ZW50cyhrZSwgc3RhcnQsIGVuZCkpO1xuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICBzeW5jKCkge1xuICAgICAgICByZXR1cm4gdGhpcy50b2tlbi50aGVuKHRva2VuID0+IGdldEV2ZW50cyh0aGlzLmNhbElkLCB0b2tlbiwgdGhpcy5zeW5jVG9rZW4pLnRoZW4ociA9PiB7XG4gICAgICAgICAgICB0aGlzLnN5bmNUb2tlbiA9IHIubmV4dFN5bmNUb2tlbjtcbiAgICAgICAgICAgIGxldCBwbV9yZXN1bHRzID0gci5yZXN1bHRzLm1hcChlID0+IGUuc3RhcnQgPyBQcm9taXNlLnJlc29sdmUoZSkgOiBnZXRFdmVudCh0aGlzLmNhbElkLCBlLmlkLCB0b2tlbikpO1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHBtX3Jlc3VsdHMpLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLmZvckVhY2goZSA9PiB7XG4gICAgICAgICAgICAgICAgZS5zdGFydCA9IG5ldyBEYXRlKGUuc3RhcnQuZGF0ZVRpbWUpO1xuICAgICAgICAgICAgICAgIGUuZW5kID0gbmV3IERhdGUoZS5lbmQuZGF0ZVRpbWUpO1xuICAgICAgICAgICAgICAgIGlmIChlLnN0YXR1cyA9PT0gJ2NvbmZpcm1lZCcpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkRXZlbnQoZSk7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoZS5zdGF0dXMgPT09ICdjYW5jZWxsZWQnKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUV2ZW50KGUpO1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KSkuY2F0Y2goZSA9PiB7XG4gICAgICAgICAgICBpZiAoZSA9PT0gR0FwaUVycm9yLmludmFsaWRTeW5jVG9rZW4pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnN5bmNUb2tlbiA9ICcnO1xuICAgICAgICAgICAgICAgIHRoaXMuc3luYygpO1xuICAgICAgICAgICAgfSBlbHNlIHRocm93IGU7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGdldEV2ZW50cyhzdGFydCwgZW5kKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnN5bmMoKS50aGVuKCgpID0+IHRoaXMuZ2V0Q2FjaGVkRXZlbnRzKHN0YXJ0LCBlbmQpKTtcbiAgICB9XG59XG4iXX0=
