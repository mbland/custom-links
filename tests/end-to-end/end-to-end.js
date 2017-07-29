'use strict'

var fs = require('fs')
var redis = require('redis')
var helpers = require('../helpers')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var test = require('selenium-webdriver/testing')
var webdriver = require('selenium-webdriver')
var By = webdriver.By
var Key = webdriver.Key

chai.should()
chai.use(chaiAsPromised)

test.describe('End-to-end test', function() {
  var driver,
      serverInfo,
      redisClient,
      url,
      targetLocation,
      activeElement,
      createNewLink

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
    return new Promise(function(resolve, reject) {
      redisClient.flushdb(err => err ? reject(err) : resolve())
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

  createNewLink = (link, target) => {
    driver.findElement(By.linkText('New link')).click()
    driver.getCurrentUrl().should.become(url + '#')
    driver.findElement(By.tagName('input')).click()
    activeElement().sendKeys(
      Key.HOME, Key.chord(Key.SHIFT, Key.END), link + Key.TAB)
    activeElement().sendKeys(
      Key.HOME, Key.chord(Key.SHIFT, Key.END), target + Key.TAB)
    activeElement().sendKeys(Key.ENTER)
    driver.wait(() => {
      return activeElement().getText().then(text => text === url + link)
    }, 2000, 'timed out waiting for link: ' + link + ' => ' + target)
  }

  test.it('creates a new short link', function() {
    driver.get(url)
    activeElement().sendKeys('foo' + Key.TAB)
    activeElement().sendKeys(targetLocation + Key.TAB)
    activeElement().sendKeys(Key.ENTER)
    driver.wait(() => {
      return activeElement().getText().then(text => text === url + 'foo')
    }, 2000)
    activeElement().click()
    driver.getCurrentUrl().should.become(targetLocation)
  })

  test.it('logs out of the application', function() {
    driver.get(url)
    activeElement().sendKeys(Key.chord(Key.SHIFT, Key.TAB))
    activeElement().getText().should.become('Log out')
    activeElement().getAttribute('href').should.become(url + 'logout')
    activeElement().click()
    // Note that since we're using the dummy test auth instance, we'll get
    // redirected back to the landing page.
    driver.getCurrentUrl().should.become(url)
  })

  test.it('shows the no-links message before any links created', function() {
    driver.get(url)
    activeElement().sendKeys(Key.chord(Key.SHIFT, Key.TAB))
    activeElement().sendKeys(Key.chord(Key.SHIFT, Key.TAB))
    activeElement().getText().should.become('My links')
    activeElement().click()

    driver.getCurrentUrl().should.become(url + '#links')
    driver.wait(() => {
      return activeElement().getText()
        .then(text => text === 'Create a new custom link')
    }, 1000)
    activeElement().click()
    driver.getCurrentUrl().should.become(url)
  })

  test.it('shows user\'s links on the "My links" page', function() {
    this.timeout(10000)
    createNewLink('foo', 'https://foo.com')
    createNewLink('baz', 'https://baz.com')
    createNewLink('bar', 'https://bar.com')

    driver.findElement(By.linkText('My links')).click()
    driver.getCurrentUrl().should.become(url + '#links')
    driver.wait(() => {
      return activeElement().getText().then(text => text === '/bar')
    }, 2000)
    driver.findElement(By.linkText('/baz'))
    driver.findElement(By.linkText('/foo'))
  })
})
