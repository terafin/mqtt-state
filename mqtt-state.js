// Requirements
const mqtt = require('mqtt')
const Redis = require('redis')
const express = require('express')
const _ = require('lodash')

const logging = require('homeautomation-js-lib/logging.js')
require('homeautomation-js-lib/devices.js')
require('homeautomation-js-lib/redis_helpers.js')
require('homeautomation-js-lib/mqtt_helpers.js')


function isInterestingDevice(deviceTopic) {
    if (_.isNil(deviceTopic)) return false
    if (!deviceTopic.startsWith('/')) return false
    if (deviceTopic.length == 1) return false
    if (deviceTopic.includes('/isy')) return false
    if (deviceTopic.includes('test')) return false
    if (deviceTopic.endsWith('/set')) return false
    if (deviceTopic.startsWith('/homeseer/action/')) return false
    if (deviceTopic.startsWith('happy')) return false
    if (deviceTopic.startsWith('/deconz')) return false
    if (deviceTopic.startsWith('/hubitat')) return false
    if (deviceTopic.startsWith('/openmqtt')) return false
    if (deviceTopic.startsWith('/xiaomi')) return false

    return true
}

// Config
const port = process.env.LISTENING_PORT
const expireAfterMinutes = process.env.EXPIRE_KEYS_AFTER_MINUTES

const redis = Redis.setupClient(null)
const client = mqtt.setupClient(function() {
    client.subscribe('/#')
}, null)

client.on('message', (topic, message, packet) => {
    if (!isInterestingDevice(topic)) {
        return
    }

    redis.valueForTopic(topic, function(err, result) {
        var timeToExpire = expireAfterMinutes

        if (err !== null) {
            logging.info(' => redis error')
            return
        }

        if (result !== null) {
            //logging.info('topic: ' + topic + ' value: ' + result)
            logging.info(JSON.stringify({ topic: topic, value: ('' + message) }))
        } else {
            logging.debug('adding: ' + topic + ' value: ' + message)
        }
        if (_.isNil(timeToExpire)) {
            redis.set(topic, message)
        } else {
            redis.set(topic, message, 'EX', (timeToExpire * 60)) // redis takes seconds
        }

    })
})

// Express
const app = express()

app.use(function(req, res, next) {
    console.log('incoming request: ' + req)
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    next()
})

app.get('/', function(req, res) {
    redis.keys('*', function(err, result) {
        const keys = result.sort()
        redis.mget(keys, function(err, values) {
            var html = ''

            html += '<!DOCTYPE html>\n'
            html += '<html>\n'
            html += '<head>\n'

            html += '<style>'
            html += '#devices {'
            html += '    font-family: "Trebuchet MS", Arial, Helvetica, sans-serif;'
            html += '    border-collapse: collapse;'
            html += '    width: 100%;'
            html += '}'
            html += ''
            html += '#devices td, #customers th {'
            html += '    border: 1px solid #ddd;'
            html += '    padding: 8px;'
            html += '}'
            html += ''
            html += '#devices tr:nth-child(even){background-color: #f2f2f2;}'
            html += ''
            html += '#devices tr:hover {background-color: #ddd;}'
            html += ''
            html += '#devices th {'
            html += '    padding-top: 12px;'
            html += '    padding-bottom: 12px;'
            html += '    text-align: left;'
            html += '    background-color: #4CAF50;'
            html += '    color: white;'
            html += '}'
            html += '</style>'

            html += '</head>\n'
            html += '<body>\n'
            html += '<h1>All Devices</h1>\n'
            html += '<form action="/action" method="post" form="main_form">'
            html += '<input type="submit" value="Generate Device File">'

            html += '<table style="width:100%" id="devices">\n'

            html += '<thead>\n'
            html += '<tr>\n'
            html += '<th>\n'
            html += ''
            html += '</th>\n'

            html += '<th>\n'
            html += 'Name'
            html += '</th>\n'

            html += '<th>\n'
            html += 'Other Topic'
            html += '</th>\n'

            html += '<th>\n'
            html += 'Topic'
            html += '</th>\n'
            html += '<th>\n'
            html += 'Value'
            html += '</th>\n'

            html += '</tr>\n'
            html += '</thead>\n'

            html += '<tbody>\n'

            for (var index = 0; index < keys.length; index++) {
                var key = keys[index]
                var value = values[index]

                if (!isInterestingDevice(key)) continue

                html += '<tr>\n'
                html += '<td>\n'
                html += '<input type="checkbox" name="enabled_' + key + '" value="checked" id="enabled" form="main_form"/>'
                html += '</td>\n'

                html += '<td>\n'
                html += '<input type="text" name="name_' + key + '" id="name" form="main_form"/>'
                html += '</td>\n'

                html += '<td>\n'
                html += '<input type="text" name="topic_' + key + '" id="alttopic" form="main_form"/>'
                html += '</td>\n'

                html += '<td>\n'
                html += key
                html += '</td>\n'
                html += '<td>\n'
                html += value
                html += '</td>\n'

                html += '</tr>\n'
            }
            html += '</tbody>\n'

            html += '</table>\n'

            html += '</form>\n'


            html += '</body>\n'
            html += '</html>'

            res.send(html)
        })
    })
})

app.get('/device-file/', function(req, res) {
    redis.keys('*', function(err, result) {
        if (result === null) {
            res.send('err' + err)
            return
        }
        const keys = result.sort()
        redis.mget(keys, function(err, values) {
            var html = ''
            for (var index = 0; index < keys.length; index++) {
                var key = keys[index]

                if (!isInterestingDevice(key)) continue

                var components = key.split('/')
                var lastComponents = components.slice(components.length - 2, components.length)
                var baseString = lastComponents.join(' ')
                var name = baseString.replace(/\//g, ' ').replace(/_/g, ' ')

                var title = baseString.replace(/\//g, '_').replace(/ /g, '_')
                if (title.startsWith('_')) title = title.slice(1, title.length)
                if (name.startsWith(' ')) name = name.slice(1, name.length)
                html += '<code>'
                html += '' + title + ':<br>'
                html += '&nbsp;&nbsp;name: "' + name + '"<br>'
                html += '&nbsp;&nbsp;topic: "' + key + '"<br>'
                html += '&nbsp;&nbsp;change_topic: "' + key + '"<br>'
                html += '&nbsp;&nbsp;voice_control: false<br>'
                html += '</code>'
            }

            res.send(html)
        })
    })
})

app.get('/json/', function(req, res) {
    redis.keys('*', function(err, result) {
        if (result === null) {
            res.send('err' + err)
            return
        }
        const keys = result.sort()
        redis.mget(keys, function(err, values) {
            var devices = {}
            for (var index = 0; index < keys.length; index++) {
                var key = keys[index]
                if (!isInterestingDevice(key)) continue

                devices[key] = values[index]

            }

            res.send(JSON.stringify(devices))
        })
    })
})

app.listen(port, function() {
    logging.info('MQTT Store listening on port: ', port)
})