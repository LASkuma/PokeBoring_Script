# PokeBoring_Script
Gonna catch them all...tomaticly.

## Overview
You will need [AHAAAAAAA/PokemonGo-Map](https://github.com/AHAAAAAAA/PokemonGo-Map) to make this script work. Basically what this script does is retrieve pokemon locations from AHAAAAAAA's map and catch them all...

Currently, it would only catch dratini, you can modify the code to make it catch something else. It's still under heavy development :)

## Usage
  1. Install [AHAAAAAAA/PokemonGo-Map](https://github.com/AHAAAAAAA/PokemonGo-Map)
  2. Set [AHAAAAAAA/PokemonGo-Map](https://github.com/AHAAAAAAA/PokemonGo-Map) to the specific location and radius that you want to hunt pokemons
  3. Modify `credentials.example.json` to your login information and rename it into `credentials.json`
  4. run my script with `node main.js -l "location"`. You should use the same location string which you provided to [AHAAAAAAA/PokemonGo-Map](https://github.com/AHAAAAAAA/PokemonGo-Map)
  5. Enjoy

## Parameters
  1. -t would turn on transferLowIVPokemons when pokemon storage is full. It would transfer all of the pokemons that have IV sum less than 30 and is not your favorite.
  2. -b [1 or 2] would set your pokeball type. 1 uses pokeball, 2 uses greatball. If 2 is provided, script would automatically delete normal pokeballs when inventory is full.

## Notice
Due to some unknown protobuf issue, this script would print out some exceptions. Don't worry, that just means you caught that pokemon! Congratulations!

## Credits
[AHAAAAAAA/PokemonGo-Map](https://github.com/AHAAAAAAA/PokemonGo-Map)

[Armax/Pokemon-GO-node-api](https://github.com/Armax/Pokemon-GO-node-api/)
