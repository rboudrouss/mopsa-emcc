// === DEBUG: persistent invoke_iii ring buffer (survives make final) ===
// Wraps invoke_iii to record the last 64 call indices, then on crash logs
// them along with the bad index and fn.name so we can identify which C
// primitive is at fault.
(function () {
  var _ring = new Int32Array(64);
  var _ringPos = 0;

  var _origInvokeIii = invoke_iii;
  invoke_iii = function (index, a1, a2) {
    _ring[_ringPos++ & 63] = index;
    try {
      return _origInvokeIii(index, a1, a2);
    } catch (e) {
      var n = Math.min(_ringPos, 64);
      var log = [];
      for (var i = 0; i < n; i++) {
        log.push(_ring[(_ringPos - n + i) & 63]);
      }
      var fnName = '?';
      try {
        var fn = wasmTable.get(index);
        fnName = fn ? (fn.name || '(no-name)') : 'null-entry';
      } catch (_) {
        fnName = 'oob-index';
      }
      console.error('[invoke_iii CRASH] index=' + index +
        ' (0x' + index.toString(16) + ')' +
        ' fn.name=' + fnName +
        ' table.length=' + wasmTable.length);
      console.error('[invoke_iii CRASH] last ' + n + ' indices: [' + log.join(',') + ']');
      console.error('[invoke_iii CRASH] error: ' + e);
      throw e;
    }
  };
})();
