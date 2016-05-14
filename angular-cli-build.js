/* global require, module */

var Angular2App = require('angular-cli/lib/broccoli/angular2-app');

module.exports = function(defaults) {
  return new Angular2App(defaults, {
    vendorNpmFiles: [
      'systemjs/dist/system-polyfills.js',
      'systemjs/dist/system.src.js',
      'zone.js/dist/*.js',
      'es6-shim/es6-shim.js',
      'reflect-metadata/*.js',
      'rxjs/**/*.js',
      '@angular/**/*.js',
      '@ngrx/**/*.js',
      'angulartics2/**/*.js',
      'html2canvas/dist/html2canvas.js',
      'pusher-js/dist/web/*.js',
      'three/three.min.js'
    ],
    sassCompiler: {
      includePaths: [
        'src/app/style'
      ]
    }
  });
};
