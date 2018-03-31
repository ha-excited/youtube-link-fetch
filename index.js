#!/usr/bin/env node

let chromeLauncher = require('chrome-launcher')
let CDP = require("chrome-remote-interface")
let { JSDOM } = require("jsdom")
let jQuery = require('jquery')

//html -> jquery
let htmlToJq = (html) => jQuery(new JSDOM(html).window)

//delay
let sleep = (ms) => new Promise(resolve=>setTimeout(resolve, ms))

//load url to html page
async function loadUrl(client, url) {
  let {Page, DOM, Runtime} = client

  await Page.navigate({ url })
  await Page.loadEventFired()
  process.stderr.write('page loading.')

  //scroll to bottom, until no more videos loaded
  let height = "document.querySelector('#content').clientHeight"
  let scrollToEnd = (height = 0) => `scrollTo(0, ${height + 1000000})`

  let maxCount = 10
  var retryCount = maxCount
  while(retryCount > 0) {
    var currentHeight = await Runtime.evaluate({expression: height})
    await Runtime.evaluate({expression: scrollToEnd()})
    await sleep(1000)
    var newHeight = await Runtime.evaluate({expression: height})
    process.stderr.write('.')
    if ( newHeight.result.value == currentHeight.result.value ) {
      if(retryCount > 0) {
        --retryCount
      } else {
        break
      }
    } else {
      retryCount = maxCount
    }
  }

  console.error()
  console.error('page analysed')

  let root = (await DOM.getDocument()).root
  let html = (await DOM.getOuterHTML({nodeId: root.nodeId})).outerHTML

  return html
}

async function fetch(client, url) {
  let $ = htmlToJq(await loadUrl(client, url))
  let links = []
  $('ytd-thumbnail a').each( function () {
    links.push('https://www.youtube.com' + $(this).attr('href'))
  })
  return links
}

async function youLinkFetch(url, flags = []) {
  //load chrome args
  let chromeFlags = ['--headless'].concat(flags)

  //start chrome
  let chrome = await chromeLauncher.launch({chromeFlags})

  //connect chrome, enable components
  let client = await CDP({port: chrome.port})
  await client.Page.enable()
  await client.DOM.enable()
  await client.Runtime.enable()

  let result = await fetch(client, url)

  //disconnect and close chrome
  client.close()
  chrome.kill()

  return result
}

async function main() {
  let url = process.argv[2]
  if(url == undefined) {
    console.error('usage: ')
    console.error('   youtube-link-fetch <youtube-link> [chrome flags1] [chrome flags2]')
    console.error('   youtube-link-fetch https://www.youtube.com/')
    console.error('   youtube-link-fetch https://www.youtube.com/user/[foobar]/videos')
    console.error('   youtube-link-fetch https://www.youtube.com/user/[foobar]/videos --proxy=socks5://localhost:1080')
    return
  }
  console.error(`target: >> ${url} <<`)

  try {
    let links = await youLinkFetch(url, process.argv.slice(3, process.argv.length))
    links.forEach( (link) => console.log(link) )
  } catch(e) {
    console.error(e)
  }
}

main()

