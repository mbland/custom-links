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
      // Work around karma-detect-browsers adding multiple Firefox builds.
      postDetection(browsers) {
        if (process.platform !== 'linux') {
          return browsers
        }
        return browsers.filter(b => !b.startsWith('Firefox') || b === 'Firefox')
      }
    },

    plugins: [ 'karma-*' ],

    singleRun: process.env.KARMA_SINGLE_RUN === 'true',

    concurrency: Infinity
  }

  if (process.env.CI === 'true') {
    options.autoWatch = false
    options.singleRun = true
    options.browsers.push('Chrome', 'Firefox')
    options.detectBrowsers.enabled = false
  }

  config.set(options)
}