module.exports = function(config) {
  var options = {
    basePath: '../public',

    // frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['mocha', 'sinon', 'chai', 'browserify', 'detectBrowsers'],

    files: [
      'app.js',
      '../tests/helpers/browser.js',
      'tests/*.js',
      {pattern: 'index.html', include: false},
      {pattern: 'css/**/*.css', include: false}
      //{pattern: 'css/**/*.ttf', watched:false, include: false}
    ],

    exclude: [],

    // preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
      '../tests/helpers/browser.js': ['browserify']
    },

    proxies: {
      '/app.js': '/base/app.js',
      '/index.html': '/base/index.html'
    },

    // possible values: 'dots', 'progress'
    // reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['mocha'],
    port: 9876,
    colors: true,

    // possible values: LOG_{DISABLE,ERROR,WARN,INFO,DEBUG}
    logLevel: config.LOG_INFO,

    // launchers: https://npmjs.org/browse/keyword/karma-launcher
    // When not running under CI, `browsers` will actually get set by
    // karma-detect-browsers.
    browsers: [],
    detectBrowsers: {
      // Work around karma-detect-browsers adding multiple Firefox builds, and
      // force Chrome to run in headless mode by default on integration systems:
      // - https://developers.google.com/web/updates/2017/04/headless-chrome
      // eslint-disable-next-line max-len
      // - https://developers.google.com/web/updates/2017/06/headless-karma-mocha-chai
      postDetection(browsers) {
        return browsers
          .filter(b => !b.startsWith('Firefox') || b === 'Firefox')
          .map(browser => {
            if ((browser === 'Chrome' || browser.startsWith('Chrome')) &&
                process.env.CI === 'true') {
              return 'ChromeHeadlessNoSandbox'
            }
            return browser
          })
      }
    },

    // See https://docs.travis-ci.com/user/chrome#Sandboxing for details on why
    // sandboxing is disabled.
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: [ '--no-sandbox' ]
      }
    },

    plugins: [ 'karma-*' ],

    concurrency: Infinity
  }

  if (process.env.CI === 'true') {
    options.autoWatch = false
    options.singleRun = true
  }

  if (process.env.KARMA_BROWSERS !== undefined) {
    options.browsers = process.env.KARMA_BROWSERS.split(',')
    options.detectBrowsers.enabled = false
  }

  config.set(options)
}
