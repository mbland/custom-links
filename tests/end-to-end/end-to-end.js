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
var until = webdriver.until

chai.should()
chai.use(chaiAsPromised)

test.describe('End-to-end test', function() {
  var driver,
      serverInfo,
      redisClient,
      url,
      targetLocation,
      activeElement,
      createNewLink,
      waitForActiveLink

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

  test.beforeEach(function() {
    return driver.get(url)
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
    driver.wait(until.urlIs(url + '#'))
    driver.findElement(By.css('input')).click()
    activeElement().sendKeys(
      Key.HOME, Key.chord(Key.SHIFT, Key.END), link + Key.TAB)
    activeElement().sendKeys(
      Key.HOME, Key.chord(Key.SHIFT, Key.END), target + Key.TAB)
    activeElement().sendKeys(Key.ENTER)
    waitForActiveLink(url + link)
  }

  waitForActiveLink = (linkText) => {
    var link = driver.wait(until.elementLocated(By.linkText(linkText)), 3000,
      'timeout waiting for "' + linkText + '" link to appear')

    driver.wait(() => webdriver.WebElement.equals(activeElement(), link), 3000,
      'timeout waiting for "' + linkText + '" link to become active')
    return link
  }

  test.it('logs out of the application', function() {
    activeElement().sendKeys(Key.chord(Key.SHIFT, Key.TAB))
    activeElement().getText().should.become('Log out')
    activeElement().getAttribute('href').should.become(url + 'logout')
    activeElement().click()
    // Note that since we're using the dummy test auth instance, we'll get
    // redirected back to the landing page.
    driver.wait(until.urlIs(url))
  })

  test.it('shows the no-links message before any links created', function() {
    activeElement().sendKeys(Key.chord(Key.SHIFT, Key.TAB))
    activeElement().sendKeys(Key.chord(Key.SHIFT, Key.TAB))
    activeElement().getText().should.become('My links')
    activeElement().click()

    driver.wait(until.urlIs(url + '#links'))
    waitForActiveLink('Create a new custom link').click()
    driver.wait(until.urlIs(url))
  })

  test.it('creates a new short link', function() {
    activeElement().sendKeys('foo' + Key.TAB)
    activeElement().sendKeys(targetLocation + Key.TAB)
    activeElement().sendKeys(Key.ENTER)
    waitForActiveLink(url + 'foo').click()
    driver.wait(until.urlIs(targetLocation))
  })

  test.it('opens the new link form for an unknown link', function() {
    driver.get(url + 'foo')
    driver.wait(until.urlIs(url + '#-/foo'))
    driver.findElement(By.css('input')).getAttribute('value')
      .should.become('foo')
    activeElement().sendKeys(targetLocation + Key.TAB)
    activeElement().sendKeys(Key.ENTER)
    waitForActiveLink(url + 'foo')
  })

  test.it('shows user\'s links on the "My links" page', function() {
    this.timeout(10000)
    createNewLink('foo', targetLocation)
    createNewLink('baz', targetLocation)
    createNewLink('bar', targetLocation)

    driver.findElement(By.linkText('My links')).click()
    driver.wait(until.urlIs(url + '#links'))
    waitForActiveLink('/bar')
    driver.findElement(By.linkText('/baz'))
    driver.findElement(By.linkText('/foo'))
    driver.findElement(By.xpath('//*[text() = "3 links"]'))
  })

  test.it('deletes a link from the "My links" page', function() {
    createNewLink('foo', targetLocation)
    driver.findElement(By.linkText('My links')).click()
    driver.wait(until.urlIs(url + '#links'))

    // Tab over to the "Delete" button.
    waitForActiveLink('/foo')
    driver.findElement(By.xpath('//*[text() = "1 link"]'))
    activeElement().sendKeys(Key.TAB, Key.TAB, Key.TAB)

    // Open the dialog, then cancel the operation (default option).
    activeElement().sendKeys(Key.ENTER, Key.ENTER)
    driver.findElement(By.linkText('/foo'))

    // Open it again, and now delete the link.
    activeElement().sendKeys(Key.ENTER, Key.TAB, Key.ENTER)
    driver.wait(until.elementLocated(
      By.xpath('//*[text() = "/foo has been deleted"]')))
    driver.findElement(By.xpath('//*[text() = "0 links"]'))
    driver.findElement(By.linkText('/foo')).should.be.rejected
  })
})
