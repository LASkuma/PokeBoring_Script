'use strict'

var PokemonGO = require('pokemon-go-node-api')
var request = require('request')
var sleep = require('sleep')
var fs = require('fs')
var nodeGeocoder = require('node-geocoder')
var minimist = require('minimist')

// using var so you can login with multiple users
var a = new PokemonGO.Pokeio()

//Set environment variables or replace placeholder text
var location = {
    type: 'coords',
    coords: {}
}

var contents = fs.readFileSync("credentials.json")
var credentials = JSON.parse(contents)

var username = credentials.username
var password = credentials.password
var provider = credentials.provider
var walkingSpeed = 0.01
var caught = {}
var fortTime = {}
var pokemonFilter = {
  1: true,
  2: true,
  3: true,
  4: true,
  5: true,
  6: true,
  7: true,
  8: true,
  9: true,
  25: true,
  26: true,
  63: true,
  64: true,
  65: true,
  92: true,
  93: true,
  94: true,
  102: true,
  103: true,
  131: true,
  137: true,
  138: true,
  139: true,
  140: true,
  141: true,
  143: true,
  147: true,
  148: true,
  149: true
}

var argv = minimist(process.argv.slice(2))
var pokeballType = argv.b || 1
var ballNames = ["Poke Ball", "Great Ball", "Ultra ball"]
console.log("Using %s", ballNames[pokeballType - 1])

if (typeof(argv.l) !== "string") {
  console.log("Location must be provided after -l flag")
  process.exit(1)
}
var locationString = argv.l
getLocation(locationString, function(err, result) {
  if (err) {
    console.log(err)
  }

  location.coords.latitude = result.latitude
  location.coords.longitude = result.longitude

  a.init(username, password, location, provider, function(err) {
    if (err) throw err

    console.log('1[i] Current location: ' + a.playerInfo.locationName)
    console.log('1[i] lat/long/alt: : ' + a.playerInfo.latitude + ' ' + a.playerInfo.longitude + ' ' + a.playerInfo.altitude)

    a.GetProfile(function(err, profile) {
      if (err) throw err

      console.log('1[i] Username: ' + profile.username)
      console.log('1[i] Poke Storage: ' + profile.poke_storage)
      console.log('1[i] Item Storage: ' + profile.item_storage)

      var poke = 0
      if (profile.currency[0].amount) {
          poke = profile.currency[0].amount
      }

      console.log('1[i] Pokecoin: ' + poke)
      console.log('1[i] Stardust: ' + profile.currency[1].amount)

      a.Heartbeat(function(err,hb) {
        callMyself(a)()
      })
    })
  })
})

function getPokestops (cb) {
  request('http://localhost:5000/raw_data?pokestops=true', function(err, response, body) {
    if (err) {
      cb(err, null)
    }
    var pokestops = JSON.parse(body).pokestops
    cb(null, pokestops)
  })
}

function huntPokestops (me, until) {
  getPokestops(function (err, pokestops) {
    if (err) {
      console.log(err)
    }
    _huntPokestops(pokestops, me, until)
  })
}

function _huntPokestops (pokestops, me, until) {
  pokestops = filterCoolDownStops(pokestops)
  var target = nextTarget(pokestops, me)
  var now = new Date().getTime()
  if (target === undefined) {
    setTimeout(callMyself(me), until - now)
  } else {
    walkAndSpinPokestop(target, me, function() {
      if (now < until) {
        console.log('Continue hunting pokestops, %s seconds remaining', (until - now) / 1000)
        _huntPokestops(pokestops, me, until)
      } else {
        callMyself(me)()
      }
    })
  }
}

function filterCoolDownStops (pokestops) {
  var now = new Date().getTime()
  return pokestops.filter(function (stop) {
    var lastTime = fortTime[stop.pokestop_id]
    if (lastTime === undefined || now > lastTime + 300 * 1000) {
      return true
    }
    return false
  })
}

function getTargets (cb) {
  request('http://localhost:5000/raw_data', function(err, response, body) {
    var pokemons = JSON.parse(body).pokemons
    var targets = pokemons.filter(function(pokemon) {
      if (pokemonFilter[pokemon.pokemon_id] === undefined) {
        return false
      }
      var now = new Date().getTime()
      if (pokemon.disappear_time < now + 60 * 1000) {
        return false
      }
      if (typeof caught[pokemon.encounter_id] !== 'undefined') {
        return false
      }
      return true
    })
    cb(null, targets)
  })
}

function nextTarget (targets, me) {
  return sortTargetsByDistance(targets, me.playerInfo.latitude, me.playerInfo.longitude)[0]
}

function sortTargetsByDistance(targets, lat, lng) {
  function compare(a, b) {
    var distanceA = getDistanceFromLatLonInKm(lat, lng, a.latitude, a.longitude)
    var distanceB = getDistanceFromLatLonInKm(lat, lng, b.latitude, b.longitude)
    a.distance = distanceA
    b.distance = distanceB
    return distanceA - distanceB
  }
  return targets.sort(compare)
}

function walkToTarget(latitude, longitude, me, cb) {
  moveTowardsTarget(latitude, longitude, me)
  me.Heartbeat(function(err) {
    if (err) {
      console.log('ERR: %s', err)
      var currentLocation = {
          type: 'coords',
          coords: {
            latitude: me.playerInfo.latitude,
            longitude: me.playerInfo.longitude
          }
      }
      me.init(username, password, currentLocation, provider, function(err) {
          me.GetProfile(function(err, profile) {
            walkToTarget(latitude, longitude, me, cb)
          })
      })
      return
    }

    console.log('[Getting closer] My location: %s, %s', me.playerInfo.latitude, me.playerInfo.longitude)
    var distance = distanceBetweenCoordsAndMe(latitude, longitude, me)
    console.log('Distance to target: %sm', distance * 1000)
    if (distance > 0.01) {
      setTimeout(function() {
        walkToTarget(latitude, longitude, me, cb)
      }, 1000)
    } else {
      cb()
    }
  })
}

function catchPokemonsAtCurrentLocation (target, me, cb) {
  me.Heartbeat(function(err,hb) {
    if(err !== null) {
      console.log('There appeared to be an error...')
    } else {
      var found = false
      var currentPokemon
      for (var i = hb.cells.length - 1; i >= 0; i--) {
        if(hb.cells[i].WildPokemon[0]) {
          for (var x = hb.cells[i].WildPokemon.length - 1; x >= 0; x--) {
            currentPokemon = hb.cells[i].WildPokemon[x]
            var pokeid = parseInt(currentPokemon.pokemon.PokemonId)
            console.log("Nearby is %s", pokeid)
            // Filter here, modify it
            if (pokemonFilter[pokeid] !== undefined) {
              found = true
              break;
            }
          }
        }
        if (found) {
          break;
        }
      }
      if (found) {
        var iPokedex = me.pokemonlist[parseInt(currentPokemon.pokemon.PokemonId)-1]
        me.EncounterPokemon(currentPokemon, function(suc, dat) {
          console.log('Encountering pokemon ' + iPokedex.name + '...')
          me.CatchPokemon(currentPokemon, 1, 1.950, 1, pokeballType, function(xsuc, xdat) {
            if (xsuc) {
              console.log('ERR:')
              console.log(xsuc)
            }
            console.log(xdat)
            if (xdat !== null && xdat !== undefined && xdat.Status === null) {
              // No more balls
              caught[target.encounter_id] = true
              var until = new Date().getTime() + 300 * 1000
              huntPokestops(me, until)
              return
            }
            // var status = ['Unexpected error', 'Successful catch', 'Catch Escape', 'Catch Flee', 'Missed Catch']
            // console.log(status[xdat.Status])
            cb()
          })
        })
      } else {
        caught[target.encounter_id] = true
        cb()
      }
      // console.log(util.inspect(hb, showHidden=false, depth=10, colorize=true))
    }
  })
}

function walkAndSpinPokestop(pokestop, me, cb) {
  console.log('Stop location: %s, %s', pokestop.latitude, pokestop.longitude)
  walkToTarget(pokestop.latitude, pokestop.longitude, me, function() {
    spinPokestop(pokestop, me, cb)
  })
}

function spinPokestop(pokestop, me, cb) {
  me.GetFort(pokestop.pokestop_id, pokestop.latitude, pokestop.longitude, function(err, response) {
    if (err) {
      console.log(err)
    }
    if (response.result === 3 || response.result === 1) {
      fortTime[pokestop.pokestop_id] = new Date().getTime()
    }
    response.items_awarded.forEach(function(item) {
      if (item.item_id === 1) {
        console.log('Get one Pokeball')
      } else if (item.item_id === 2) {
        console.log('Get one Great Ball')
      } else if (item.item_id === 3) {
        console.log('Get one Ultra Ball')
      } else if (item.item_id === 4) {
        console.log('Get one Master Ball')
      }
    })
    cb()
  })
}

function walkAndCatch(target, me, cb) {
  console.log('Target location: %s, %s', target.latitude, target.longitude)
  walkToTarget(target.latitude, target.longitude, me, function() {
    catchPokemonsAtCurrentLocation(target, me, cb)
  })
}

function moveTowardsTarget(latitude, longitude, me) {
  var distance = getDistanceFromLatLonInKm(latitude, longitude, me.playerInfo.latitude, me.playerInfo.longitude)
  var numOfIntervals = distance / walkingSpeed
  if (numOfIntervals > 1) {
    var dLat = latitude - me.playerInfo.latitude
    var dLng = longitude - me.playerInfo.longitude
    dLat /= numOfIntervals
    dLng /= numOfIntervals
    me.playerInfo.latitude += dLat
    me.playerInfo.longitude += dLng
  }
}

function callMyself (me) {
  return function () {
    getTargets(function (err, targets) {
      var target = nextTarget(targets, me)
      if (typeof target !== 'undefined') {
        console.log('Found One, Preparing: %s', target.pokemon_id)

        var currentLocation = {
            type: 'coords',
            coords: {
              latitude: me.playerInfo.latitude,
              longitude: me.playerInfo.longitude
            }
        }
        me.init(username, password, currentLocation, provider, function(err) {
          if (err) throw err

          me.GetProfile(function(err, profile) {
            me.Heartbeat(function(err,hb) {})
            console.log('Start walking')

            walkAndCatch(target, me, function() {
              me.Heartbeat(function(err,hb) {
                console.log('ok')
                callMyself(me)()
              })
            })
          })
        })
      } else {
        console.log('NO MORE, start hunting pokestops')
        var until = new Date().getTime() + 300 * 1000
        huntPokestops(me, until)
      }
    })
  }
}

// Helper functions
function distanceBetweenCoordsAndMe(lat, lon, me) {
  return getDistanceFromLatLonInKm(lat, lon, me.playerInfo.latitude, me.playerInfo.longitude)
}
function getDistanceFromLatLonInKm(lat1,lon1,lat2,lon2) {
  var R = 6371 // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1)  // deg2rad below
  var dLon = deg2rad(lon2-lon1)
  var a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2)

  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  var d = R * c // Distance in km
  return d
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}

function getLocation(locationString, cb) {
  var isCoord = /^(\-?\d+\.\d+)?,\s*(\-?\d+\.\d+?)$/.test(locationString)

  if (isCoord) {
    var coords = locationString.split(',')
    var result = {
      latitude: parseFloat(coords[0]),
      longitude: parseFloat(coords[1]),
      altitude: 0
    }

    cb(null, result)
  } else {
    const options = {
      provider: 'google'
    }

    const geocoder = nodeGeocoder(options)

    geocoder.geocode(locationString, (err, res) => {
      if (err) {
        cb(err, null)
      }
      const result = {
        latitude: res[0].latitude,
        longitude: res[0].longitude,
        altitude: 0
      }

      cb(null, result)
    })
  }
}
