'use strict'

var fs = require('fs')
var redis = require('redis')
var RedisClient = require('../../lib/redis-client')
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
      waitForFormInput,
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
      redisClient = new RedisClient(
        redis.createClient({ port: serverInfo.redis.port }))
    })
  })

  test.beforeEach(function() {
    driver.get(url)
    return waitForActiveLink('Create a new custom link')
  })

  test.afterEach(function() {
    return new Promise(function(resolve, reject) {
      redisClient.client.flushdb(err => err ? reject(err) : resolve())
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
    driver.wait(until.urlIs(url + '#create'))
    waitForFormInput().click()
    activeElement().sendKeys(
      Key.HOME, Key.chord(Key.SHIFT, Key.END), link + Key.TAB)
    activeElement().sendKeys(
      Key.HOME, Key.chord(Key.SHIFT, Key.END), target + Key.TAB)
    activeElement().sendKeys(Key.SPACE)
    waitForActiveLink(url + link)
  }

  waitForFormInput = () => {
    return driver.wait(until.elementLocated(By.css('input'), 3000,
      'timeout waiting for form input element to appear'))
  }

  waitForActiveLink = (linkText) => {
    var link = driver.wait(until.elementLocated(By.linkText(linkText)), 3000,
      'timeout waiting for "' + linkText + '" link to appear')

    driver.wait(() => webdriver.WebElement.equals(activeElement(), link), 3000,
      'timeout waiting for "' + linkText + '" link to become active')
    return link
  }

  test.it('shows the no-links message before any links created', function() {
    activeElement().getAttribute('href').should.become(url + '#create')
    activeElement().sendKeys(Key.ENTER)
    driver.wait(until.urlIs(url + '#create'))
  })

  test.it('logs out of the application', function() {
    activeElement().sendKeys(Key.chord(Key.SHIFT, Key.TAB))
    activeElement().getText().should.become('Log out')
    activeElement().getAttribute('href').should.become(url + 'logout')
    activeElement().sendKeys(Key.ENTER)
    // Note that since we're using the dummy test auth instance, we'll get
    // redirected back to the landing page.
    driver.wait(until.urlIs(url))
  })

  test.it('creates a new short link', function() {
    // Rather than click on the active "Create a new custom link" link, let's
    // make sure we can navigate to "New link" in the nav bar as expected.
    activeElement().sendKeys(Key.chord(Key.SHIFT, Key.TAB))
    activeElement().sendKeys(Key.chord(Key.SHIFT, Key.TAB))
    activeElement().getText().should.become('New link')
    activeElement().sendKeys(Key.ENTER)
    driver.wait(until.urlIs(url + '#create'))
    waitForFormInput()

    activeElement().sendKeys('foo' + Key.TAB)
    activeElement().sendKeys(targetLocation + Key.TAB)
    activeElement().sendKeys(Key.SPACE)
    waitForActiveLink(url + 'foo').sendKeys(Key.ENTER)
    driver.wait(until.urlIs(targetLocation))
  })

  test.it('opens the new link form for an unknown link', function() {
    driver.get(url + 'foo')
    driver.wait(until.urlIs(url + '#create-/foo'))
    waitForFormInput().getAttribute('value').should.become('foo')
    activeElement().sendKeys(targetLocation + Key.TAB)
    activeElement().sendKeys(Key.SPACE)
    waitForActiveLink(url + 'foo')
  })

  test.it('fails to create a link that already exists', function() {
    createNewLink('foo', targetLocation)
    // Back up to the "Create link" button and submit a second time.
    activeElement().sendKeys(Key.chord(Key.SHIFT, Key.TAB), Key.SPACE)

    driver.wait(until.elementLocated(By.css('.result .failure')), 3000,
      'timeout waiting for failure message link to appear')
      .getText().should.eventually.contain(url + 'foo already exists')
  })

  test.it('shows user\'s links on the "My links" page', function() {
    this.timeout(10000)
    createNewLink('foo', targetLocation)
    createNewLink('baz', targetLocation)
    createNewLink('bar', targetLocation)

    driver.findElement(By.linkText('My links')).click()
    driver.wait(until.urlIs(url + '#'))
    waitForActiveLink('/bar')
    driver.findElement(By.linkText('/baz'))
    driver.findElement(By.linkText('/foo'))
    driver.findElement(By.xpath('//*[text() = "3 links"]'))
  })

  test.it('deletes a link from the "My links" page', function() {
    createNewLink('foo', targetLocation)
    driver.findElement(By.linkText('My links')).click()
    driver.wait(until.urlIs(url + '#'))

    // Tab over to the "Delete" button.
    waitForActiveLink('/foo')
    driver.findElement(By.xpath('//*[text() = "1 link"]'))
    activeElement().sendKeys(Key.TAB, Key.TAB, Key.TAB)

    // Open the dialog, then cancel the operation (default option).
    activeElement().sendKeys(Key.SPACE, Key.SPACE)
    driver.findElement(By.linkText('/foo'))

    // Open it again, and now delete the link.
    activeElement().sendKeys(Key.SPACE, Key.TAB, Key.SPACE)
    driver.wait(until.elementLocated(
      By.xpath('//*[text() = "/foo has been deleted"]')))
    driver.findElement(By.xpath('//*[text() = "0 links"]'))
    driver.findElement(By.linkText('/foo')).should.be.rejected
  })

  test.it('edits the target URL', function() {
    var updatedTarget = url + 'tests/updated-target.html'

    createNewLink('foo', targetLocation)
    driver.findElement(By.linkText('My links')).click()
    driver.wait(until.urlIs(url + '#'))

    // Tab over to the "Edit" button and open the dialog.
    waitForActiveLink('/foo')
    activeElement().sendKeys(Key.TAB, Key.TAB, Key.SPACE)
    driver.wait(until.urlIs(url + '#edit-/foo'))
    waitForFormInput().getAttribute('value').should.become(targetLocation)

    // Replace the already-selected target URL, tab to the button, and submit.
    activeElement().sendKeys(updatedTarget, Key.TAB, Key.SPACE)
    waitForActiveLink(url + 'foo').sendKeys(Key.ENTER)
    driver.wait(until.urlIs(updatedTarget))
  })

  test.it('transfers ownership of the link', function() {
    createNewLink('foo', targetLocation)
    driver.findElement(By.linkText('My links')).click()
    driver.wait(until.urlIs(url + '#'))

    // Tab over to the "Edit" button and open the dialog.
    waitForActiveLink('/foo')
    activeElement().sendKeys(Key.TAB, Key.TAB, Key.SPACE)
    driver.wait(until.urlIs(url + '#edit-/foo'))
    waitForFormInput()

    // Tab over to the owner input
    activeElement().sendKeys(Key.TAB, Key.TAB)
    activeElement().getAttribute('value').should.become('mbland@acm.org')

    // Create a user to which we will transfer ownership.
    redisClient.findOrCreateUser('foo@example.com')

    // Enter the user ID, tab to the button, submit, then confirm our decision
    // in the dialog box.
    activeElement().sendKeys('foo@example.com', Key.TAB, Key.SPACE)
    activeElement().sendKeys(Key.TAB, Key.SPACE)
    driver.wait(until.elementLocated(By.css('.result .success'), 3000,
      'timeout waiting for success element to appear'))
    driver.findElement(By.css('.result .success')).getText()
      .should.eventually.contain('foo@example.com')

    // We should no longer see the link in "My links".
    driver.findElement(By.linkText('My links')).click()
    driver.wait(until.urlIs(url + '#'))
    waitForActiveLink('Create a new custom link')
  })
})
