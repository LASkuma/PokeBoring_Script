import Promise from 'bluebird'

export default function promisifyTrainer (trainer) {
  let newTrainer = {}
  newTrainer.GetProfileAsync = naivePromisifyWithDelay(trainer.GetProfile, 1000)

  newTrainer.HeartbeatAsync = naivePromisifyWithDelay(trainer.Heartbeat, 100)

  Promise.promisifyAll(trainer)

  return Object.assign({}, trainer, newTrainer)
}

function naivePromisifyWithDelay (fn, delay) {
  return function() {
    const that = this
    const args = Array.prototype.slice.call(arguments)
    return new Promise(
      (resolve, reject) => {
        const callback = (err, ret) => {
          if (err) {
            reject(err)
          } else {
            resolve(ret)
          }
        }
        setTimeout(() => {
          fn.apply(that, args.concat([callback]))
        }, delay)
      }
    )
  }
}
