import PokemonGO from 'pokemon-go-node-api'
import minimist from 'minimist'
import Promise from 'bluebird'
import request from 'request'
import fs from 'fs'
import getLocation from './utils/getLocation'
import promisifyTrainer from './utils/promisifyTrainer'

var trainer = new PokemonGO.Pokeio()

const contents = fs.readFileSync("credentials.json")
const credentials = JSON.parse(contents)

const username = credentials.username
const password = credentials.password
const provider = credentials.provider
const walkingSpeed = 0.01
let caught = {}
let fortTime = {}
let pokemonFilter = {
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
  58: true,
  59: true,
  63: true,
  64: true,
  65: true,
  66: true,
  67: true,
  68: true,
  74: true,
  75: true,
  76: true,
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

const argv = minimist(process.argv.slice(2))
if (typeof(argv.l) !== "string") {
  console.log("Location must be provided after -l flag")
  process.exit(1)
}

const ballNames = ["Poke Ball", "Great Ball", "Ultra ball"]
const pokeballFlag = argv.b || 1
let pokeballType = argv.b || 1
console.log("Using %s", ballNames[pokeballType - 1])

const locationString = argv.l
trainer = promisifyTrainer(trainer)
getLocation(locationString)
  .then(packAPICoords, printErrAndExit)
  .then((location) => trainer.initAsync(username, password, location, provider))
  .then(() => trainer.GetProfileAsync())
  .then(() => trainer.HeartbeatAsync)
  .then(() => sisyphean(trainer))

function packAPICoords ({ latitude, longitude }) {
  return {
      type: 'coords',
      coords: {
        latitude: latitude,
        longitude: longitude
      }
  }
}

function printErrAndExit (err) {
  console.err(err)
  process.exit(1)
}

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
  if (target === undefined) {
    var now = new Date().getTime()
    setTimeout(() => sisyphean(me), until - now)
  } else {
    walkAndSpinPokestop(target, me, function(err, shouldRest) {
      var now = new Date().getTime()
      if (shouldRest) {
        setTimeout(() => sisyphean(me), until - now)
        return
      }
      if (now < until) {
        console.log('Continue hunting pokestops, %s seconds remaining', (until - now) / 1000)
        _huntPokestops(pokestops, me, until)
      } else {
        sisyphean(me)
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
    }
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

          if (xdat) {
            if (xdat.Status === null) {
              // No more balls or pokemon storage is full
              getItemList(me, function (err, itemList) {
                if (err) {
                  console.log(err)
                }
                var numPokeball = 0
                var numGreatball = 0
                itemList.forEach(function (item) {
                  if (item.item === 1) {
                    numPokeball = nullToZero(item.count)
                  } else if (item.item === 2) {
                    numGreatball = nullToZero(item.count)
                  }
                })
                console.log('POKE: %s, GREAT: %s', numPokeball, numGreatball)
                if (numPokeball === 0 && numGreatball === 0) {
                  var until = new Date().getTime() + 120 * 1000
                  return huntPokestops(me, until)
                }
                if (pokeballFlag === 1) {
                  if (pokeballType === 1 && numPokeball > 0 || pokeballType === 2 && numGreatball > 0) {
                    if (argv.t) {
                      return transferLowIVPokemons(me, function (err) {
                        if (err) {
                          console.log('TRNASFER ERR: %s', err)
                        }
                        cb()
                      })
                    }
                  } else if (numPokeball === 0 && numGreatball > 0) {
                    pokeballType = 2
                    console.log('No more pokeballs, using great ball')
                    return cb()
                  } else if (numGreatball === 0 && numPokeball > 0) {
                    pokeballType = 1
                    console.log('No more greatballs, using pokeball')
                    return cb()
                  }
                } else if (pokeballFlag === 2) {
                  if (numGreatball === 0) {
                    dropInventoryItems(me, function (err) {
                      if (err) {
                        console.log('DROP INV ERR: %s', err)
                      }
                      var until = new Date().getTime() + 120 * 1000
                      return huntPokestops(me, until)
                    })
                  } else {
                    if (argv.t) {
                      return transferLowIVPokemons(me, function (err) {
                        if (err) {
                          console.log('TRNASFER ERR: %s', err)
                        }
                        cb()
                      })
                    }
                  }
                }
              })
            } else {
              return cb()
            }
          }
        })
      })
    } else {
      caught[target.encounter_id] = true
      cb()
    }
    // console.log(util.inspect(hb, showHidden=false, depth=10, colorize=true))
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
    if (response.result === 3 || response.result === 1 || response.result === null) {
      fortTime[pokestop.pokestop_id] = new Date().getTime()
    }
    if (response.result === 4) {
      dropInventoryItems(me, function (err, dropped) {
        if (dropped === 0) {
          cb(null, true)
        } else {
          cb(null, false)
        }
      })
      return
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
    cb(null, false)
  })
}

function walkAndCatch(target, me, cb) {
  console.log('Target location: %s, %s', target.latitude, target.longitude)
  walkToTarget(target.latitude, target.longitude, me, function() {
    setTimeout(() => catchPokemonsAtCurrentLocation(target, me, cb), 5000)
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

function sisyphean (me) {
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
      walkAndCatch(target, me, function () {
        setTimeout(() => sisyphean(me), 1000)
      })
    } else {
      console.log('NO MORE, start hunting pokestops')
      var until = new Date().getTime() + 120 * 1000
      huntPokestops(me, until)
    }
  })
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

function getItemList (me, cb) {
  me.GetInventory(function (err, inv) {
    if (err) {
      cb(err, null)
    }
    if (inv === undefined) {
      cb("No result")
    }
    var itemList = inv.inventory_delta.inventory_items.filter(function (element) {
      var item = element.inventory_item_data.item
      if (item !== null) {
        return true
      }
      return false
    }).map(function (element) {
      return element.inventory_item_data.item
    })
    cb(null, itemList)
  })
}

function dropInventoryItems (me, cb) {
  getItemList(me, function (err, itemList) {
    if (err) {
      cb(err, null)
      console.log("INVENTORY ERR: %s", err)
    }
    dropItems(me, itemList, 0, cb)
  })
}

function dropItems (me, list, dropped, cb) {
  var item = list.pop()
  var dropNum = 0
  if (item !== undefined) {
    switch (item.item) {
      case 1:
        if (pokeballFlag === 2) {
          dropNum = item.count
        }
        break
      case 101:
      case 102:
        dropNum = item.count
        break
      case 103:
        dropNum = item.count - 20
        break
      case 201:
        dropNum = item.count - 10
        break
      case 701:
        dropNum = item.count - 30
        break
      default:
        dropItems(me, list, dropped, cb)
        return
    }

    if (dropNum !== null) {
      me.DropItem(item.item, dropNum, function (err, result) {
        if (err) {
          console.log('Drop ERR: %s', err)
        }
        console.log('drop complete')
        console.log(result)
        setTimeout(function() {
          dropItems(me, list, dropped + dropNum, cb)
        }, 500)
      })
    } else {
      dropItems(me, list, dropped, cb)
    }
  }
  if (item === undefined && list.length === 0) {
    cb(null, dropped)
  }
}

function transferLowIVPokemons (me, cb) {
  me.GetInventory(function (err, inv) {
    if (err) {
      console.log('Get INV ERR: %s', err)
    }
    var pokemonList = inv.inventory_delta.inventory_items.filter(function (element) {
      var pokemon = element.inventory_item_data.pokemon
      if (pokemon !== null && pokemon.pokemon_id !== null) {
        if (pokemon.id === undefined) {
          console.log(pokemon)
        } else {
          var indAttack = nullToZero(pokemon.individual_attack)
          var indDefense = nullToZero(pokemon.individual_defense)
          var indStamina = nullToZero(pokemon.individual_stamina)
          if (indAttack + indDefense + indStamina < 30 && pokemon.favorite === null) {
            return true
          }
        }
      }
      return false
    }).map(function (element) {
      var pokemon = element.inventory_item_data.pokemon
      return pokemon.id
    })
    transferPokemon(me, pokemonList, cb)
  })
}

function transferPokemon (me, list, cb) {
  var id = list.pop()
  if (id !== undefined) {
    me.TransferPokemon(id, function (err, result) {
      if (err) {
        cb(err, null)
        console.log('Transfer ERR: %s', err)
      }
      console.log('Transfer complete')
      console.log(result)
      setTimeout(function() {
        transferPokemon(me, list, cb)
      }, 500)
    })
  }
  if (id === undefined && list.length === 0){
    console.log(id)
    cb()
  }
}

const nullToZero = (object) => {
  if (object === null) {
    return 0
  }
  return object
}
