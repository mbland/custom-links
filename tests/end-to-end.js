'use strict'

var helpers = require('./helpers')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var test = require('selenium-webdriver/testing')
var webdriver = require('selenium-webdriver')

chai.should()
chai.use(chaiAsPromised)

test.describe('End-to-end test', function() {
  var driver, serverInfo, url

  this.timeout(5000)

  test.before(function() {
    driver = new webdriver.Builder()
      .forBrowser('chrome')
      .build()

    return helpers.launchAll().then(function(result) {
      serverInfo = result
      url = 'http://localhost:' + serverInfo.port + '/'
    })
  })

  test.after(function() {
    return helpers.killServer(serverInfo.server).then(function() {
      return helpers.killServer(serverInfo.redis.server)
    })
  })

  test.it('WORK IN PROGRESS — creates a new short link', function() {
    driver.get(url)
    driver.findElement(webdriver.By.css('*[data-name=url]')).sendKeys('foo')
    driver.findElement(webdriver.By.css('*[data-name=location]'))
      .sendKeys('https://mike-bland.com/')
    driver.findElement(webdriver.By.css('*[data-name=submit]')).click()
    driver.get(url + 'foo')
    driver.quit()
  })
})
