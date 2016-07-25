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
var walkingSpeed = 0.05
var caught = {}

var argv = minimist(process.argv.slice(2))
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

          a.Heartbeat(function(err,hb) {})

          callMyself(a)()

      })
  })
})



function getTargets (cb) {
  request('http://localhost:5000/raw_data', function(err, response, body) {
    var pokemons = JSON.parse(body).pokemons
    var targets = pokemons.filter(function(pokemon) {
      if (pokemon.pokemon_id !== 147) {
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

function walkAndCatch(target, me, cb) {
  var distance = target.distance
  while (distance > 0.01) {
    console.log('pump')
    moveTowardsTarget(target, me, distance)
    me.Heartbeat(function(err) {
      console.log(err)
    })
    distance = getDistanceFromLatLonInKm(target.latitude, target.longitude, me.playerInfo.latitude, me.playerInfo.longitude)
    sleep.sleep(5)
  }
  console.log(distance)
  console.log('My location: %s, %s', me.playerInfo.latitude, me.playerInfo.longitude)
  console.log('Target location: %s, %s', target.latitude, target.longitude)

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
            // Filter here, modify it
            if (pokeid === 147) {
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
  				me.CatchPokemon(currentPokemon, 1, 1.950, 1, 1, function(xsuc, xdat) {
            if (xsuc) {
              console.log('ERR:')
              console.log(xsuc)
            }
            console.log(xdat)
            if (typeof xdat !== 'undefined' && xdat.Status === null) {
              caught[target.encounter_id] = true
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

function moveTowardsTarget(target, me, distance) {
  var numOfIntervals = distance / walkingSpeed
  if (numOfIntervals < 1) {
    me.playerInfo.latitude = target.latitude
    me.playerInfo.longitude = target.longitude
  } else {
    var dLat = target.latitude - me.playerInfo.latitude
    var dLng = target.longitude - me.playerInfo.longitude
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
        console.log('Found One, Preparing')

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
        console.log('NO MORE')
        sleep.sleep(300)
        callMyself(me)()
      }
    })
  }
}

// Helper functions
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
