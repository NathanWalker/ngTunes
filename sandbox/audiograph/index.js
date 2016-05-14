
// build an array of playlist objects that includes the frequencies
// NOTE not crazy about the `src` property name
// but using this name prevents having to make other code changes in this library 
var playlists = [
  {
    src: 'assets/audio/pilotpriest/01_-_Matter.mp3',
    // TODO not sure what this is doing... 
    // we might not be able to get meaningful numbers for the Spotify tracks
    frequencies: [[40, 55], [40, 55]]
  },
  {
    src: 'assets/audio/pilotpriest/02_-_Now_Be_The_Light.mp3',
    frequencies: [[145, 5000], [145, 5000]]
  }
];

$audiograph.init(playlists);
