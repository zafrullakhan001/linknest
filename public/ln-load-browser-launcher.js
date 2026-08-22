(function () {
  var load = function () {
    var s = document.createElement('script');
    s.type = 'module';
    s.src = 'land/browser-launcher-integration.js?v=2.1';
    document.head.appendChild(s);
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(load, { timeout: 4000 });
  } else {
    window.addEventListener('load', function () { setTimeout(load, 1); });
  }
})();
