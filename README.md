![ngTunes](graphics/ngtunes-logo-sm.jpg)

# ngTunes

ngTunes is a music player application built with [Angular 2](https://angular.io/). Users can search Spotify for tracks to customize a playlist to sample their favorite tunes. Users can also tweet about what they're listening to as well as see what others are enjoying via a live tweet stream.

[Listen to music now!](http://www.angulartunes.com)

## Contribute!

Want to make ngTunes better?
Submit a Pull Request. Take a look at the [TODO List](#todo-list) for ideas on what to play around with.

Contributions will be reviewed by a core community team and end up on the live audio player at [angulartunes.com](http://www.angulartunes.com).

## TODO List

- [ ] Plug/play visualizers (https://github.com/NathanWalker/ngTunes/issues/1)
- [ ] Allow playlists to be shared via AngularFire2 integration (https://github.com/NathanWalker/ngTunes/issues/2)
- [ ] Make playlist loop through all tracks instead of repeat the same one over and over (https://github.com/NathanWalker/ngTunes/issues/3)
- [ ] Create a NativeScript app of the player (https://github.com/NathanWalker/ngTunes/issues/4)
- [ ] Allow more customizations to visualizers (https://github.com/NathanWalker/ngTunes/issues/5)
- [ ] Create standalone plugin widget of just the Spotify search (https://github.com/NathanWalker/ngTunes/issues/6)
- [ ] Integrate Webpack for the production build (https://github.com/NathanWalker/ngTunes/issues/7)
- [ ] Fix bug with removing tracks (https://github.com/NathanWalker/ngTunes/issues/8)

## Overview

A mashup of many technologies were used to bring this experience to users. 
The project was scaffolded up using the angular CLI and utilized to build 
the application. The visualization engine is a port of audiograph which 
was brought in as it's own angular 2 component. The music catalog takes 
advantage of Spotify's API for searching and track playback. Twitter's 
API was used for both the ability to retrieve related tweets via live 
stream and for posting to the user's timeline if they choose to share. 
(Add screenshot info if we get that working too)

Credits and libs used:

* [Angular CLI](https://cli.angular.io/)
* [angulartics2](https://github.com/angulartics/angulartics2)
* [@ngrx/store](https://github.com/ngrx/store)
* [pusher-js](https://github.com/pusher/pusher-js)
* [three.js](http://threejs.org/)
* [audiograph.xyz](https://github.com/mattdesl/audiograph.xyz)
* [Infowrap](http://www.infowrap.com/2159/overview?token=5c3064c7-4bab-455c-b133-c5bbaee31f0f)
  * productivity tool to keep everyone on same page
  * Files area contains animated gifs of some progress along the way
* [angular2-color-picker](https://github.com/Alberplz/angular2-color-picker)
* [Spotify web api](https://developer.spotify.com/web-api/)
* [Twitter api](https://dev.twitter.com/rest/public)
* [Font Awesome](http://fontawesome.io/)
* [hint.css](http://kushagragour.in/lab/hint/)
* [Bootstrap](http://getbootstrap.com/)

[Angular Attack](https://www.angularattack.com/entries/all) 2016 submission. [View Original Entry](https://www.angularattack.com/entries/1393-48angles).

The founding team:
- The dreamer - Nathan Walker ([@wwwalkerrun](http://twitter.com/wwwalkerrun))
- The work horse - James Churchill ([@SmashDev](http://twitter.com/SmashDev))
- The energy - Sean Larkin ([@TheLarkInn](http://twitter.com/TheLarkInn))
- The other guy - Mike Brocchi ([@brocco](http://twitter.com/brocco))

## License

MIT
