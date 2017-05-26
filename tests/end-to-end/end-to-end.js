'use strict'

var fs = require('fs')
var helpers = require('../helpers')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var test = require('selenium-webdriver/testing')
var webdriver = require('selenium-webdriver')
var Key = webdriver.Key

chai.should()
chai.use(chaiAsPromised)

test.describe('End-to-end test', function() {
  var driver, serverInfo, url, targetLocation, activeElement

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
    })
  })

  test.after(function() {
    return helpers.killServer(serverInfo.server)
      .then(() => helpers.killServer(serverInfo.redis.server))
  })

  test.afterEach(function() {
    driver.quit()
  })

  activeElement = () => driver.switchTo().activeElement()

  takeScreenshot = () => {
    driver.takeScreenshot().then(screenshot => {
      return new Promise((resolve, reject) => {
        fs.writeFile('screenshot.png', screenshot, 'base64',
          err => err ? reject(err) : resolve())
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
