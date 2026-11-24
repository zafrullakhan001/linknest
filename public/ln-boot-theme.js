(function () {
  try {
    document.documentElement.classList.add('ln-bootstrapping');

    var parseHHMM = function (value, fallbackMinutes) {
      if (!value) return fallbackMinutes;
      var parts = String(value).split(':');
      var hours = parseInt(parts[0], 10);
      var mins = parseInt(parts[1], 10);
      if (isNaN(hours) || isNaN(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) {
        return fallbackMinutes;
      }
      return hours * 60 + mins;
    };
    var dayStart = parseHHMM(localStorage.getItem('linknest_day_start'), 7 * 60);
    var nightStart = parseHHMM(localStorage.getItem('linknest_night_start'), 18 * 60);
    if (dayStart === nightStart) {
      dayStart = 7 * 60;
      nightStart = 18 * 60;
    }
    var now = new Date();
    var minutes = now.getHours() * 60 + now.getMinutes();
    var scheduledDark = dayStart < nightStart
      ? (minutes < dayStart || minutes >= nightStart)
      : (minutes >= nightStart && minutes < dayStart);

    var mode = localStorage.getItem('linknest_theme_mode');
    if (mode !== 'light' && mode !== 'dark' && mode !== 'automatic') {
      var autoSwitch = localStorage.getItem('linknest_auto_switch');
      if (autoSwitch === 'false') {
        mode = localStorage.getItem('linknest_theme') === 'light' ? 'light' : 'dark';
      } else {
        mode = 'automatic';
      }
    }
    var isDark = mode === 'dark' ? true : mode === 'light' ? false : scheduledDark;

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    var themeName = localStorage.getItem('linknest_theme_name') || 'default';
    document.documentElement.classList.add('theme-' + themeName);

    var styleTag = document.getElementById('linknest-custom-styles');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'linknest-custom-styles';
      document.head.appendChild(styleTag);
    }

    var cssKey = isDark ? 'linknest_styles_css_dark' : 'linknest_styles_css_light';
    var cachedCss = localStorage.getItem(cssKey);
    if (cachedCss) {
      styleTag.textContent = cachedCss;
    } else {
      var zoom = 100;
      var userZoom = localStorage.getItem('linknest_user_page_zoom');
      if (userZoom) {
        zoom = parseInt(userZoom, 10) || 100;
      } else {
        var cachedStyles = localStorage.getItem('linknest_styles_cache');
        if (cachedStyles) {
          try {
            var parsed = JSON.parse(cachedStyles);
            zoom = parsed.pageZoom || 100;
          } catch (e) { /* ignore */ }
        }
      }
      if (!isNaN(zoom) && zoom !== 100) {
        document.documentElement.style.zoom = String(zoom / 100);
      }
    }

    var brandingCss = localStorage.getItem('linknest_branding_css');
    if (brandingCss) {
      var brandingTag = document.getElementById('linknest-branding-styles');
      if (!brandingTag) {
        brandingTag = document.createElement('style');
        brandingTag.id = 'linknest-branding-styles';
        document.head.appendChild(brandingTag);
      }
      brandingTag.textContent = brandingCss;
      document.documentElement.classList.add('ln-branding-ready');
    }

    window.addEventListener('load', function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          document.documentElement.classList.remove('ln-bootstrapping');
        });
      });
    });
  } catch (error) {
    try {
      document.documentElement.classList.remove('ln-bootstrapping');
    } catch (e) { /* ignore */ }
  }
})();
