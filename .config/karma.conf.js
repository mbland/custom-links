var path = require('path')

module.exports = function(config) {
  config.set({
    basePath: path.resolve(__dirname, '../public'),

    // frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['mocha', 'sinon', 'chai', 'browserify', 'detectBrowsers'],

    files: [
      'app.js',
      path.resolve(__dirname, '../tests/helpers/browser.js'),
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

    autoWatch: process.env.CI !== 'true',

    // launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['Chrome', 'Firefox'],

    detectBrowsers: {
      enabled: process.env.CI !== 'true',
      usePhantomJS: false
    },

    plugins: [ 'karma-*' ],

    singleRun: process.env.CI === 'true' ||
      process.env.KARMA_SINGLE_RUN == 'true',

    concurrency: Infinity
  })
}
