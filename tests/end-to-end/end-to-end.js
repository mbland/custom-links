'use strict'

var fs = require('fs')
var redis = require('redis')
var helpers = require('../helpers')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var test = require('selenium-webdriver/testing')
var webdriver = require('selenium-webdriver')
var Key = webdriver.Key

chai.should()
chai.use(chaiAsPromised)

test.describe('End-to-end test', function() {
  var driver, serverInfo, redisClient, url, targetLocation, activeElement

  // eslint-disable-next-line no-unused-vars
  var takeScreenshot

  this.timeout(5000)

  test.before(function() {
    driver = new webdriver.Builder()
      .forBrowser('chrome')
      .build()

    return helpers.launchAll().then(result => {
      serverInfo = result
      url = 'http://localhost:' + serverInfo.port + '/'
      targetLocation = url + 'tests/redirect-target.html'
      redisClient = redis.createClient({ port: serverInfo.redis.port })
    })
  })

  test.afterEach(function() {
    return driver.close()
      .then(function() {
        return new Promise(function(resolve, reject) {
          redisClient.flushdb(err => err ? reject(err) : resolve())
        })
      })
  })

  test.after(function() {
    return driver.quit()
      .then(() => helpers.killServer(serverInfo.server))
      .then(() => helpers.killServer(serverInfo.redis.server))
  })

  activeElement = () => driver.switchTo().activeElement()

  takeScreenshot = (filename) => {
    driver.takeScreenshot().then(screenshot => {
      return new Promise((resolve, reject) => {
        fs.writeFile('screenshot' + (filename ? ('-' + filename) : '') + '.png',
          screenshot, 'base64', err => err ? reject(err) : resolve())
      })
    })
  }

  test.it('creates a new short link', function() {
    driver.get(url)
    activeElement().sendKeys('foo' + Key.TAB)
    activeElement().sendKeys(targetLocation + Key.TAB)
    activeElement().sendKeys(Key.ENTER)
    driver.wait(() => {
      return activeElement().getText()
        .then(text => text === url + 'foo')
    }, 1250)
    activeElement().click()
    driver.getCurrentUrl().should.become(targetLocation)
  })
})
