
// public api object in the global namespace
var $audiograph = {};

(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var createLoop = require('raf-loop');
var createApp = require('./lib/app');
var newArray = require('new-array');
var geoScene = require('./lib/geoScene');
var getPalette = require('./lib/palette');
var rightNow = require('right-now');
var setupInteractions = require('./lib/setupInteractions');
var log = require('./lib/log');

var isMobile = require('./lib/isMobile');
var showIntro = require('./lib/intro');
var EffectComposer = require('./lib/EffectComposer');
var BloomPass = require('./lib/BloomPass');
var SSAOShader = require('./lib/shader/SSAOShader');
var createAudio = require('./lib/audio');

var white = new THREE.Color('white');
var opt = { antialias: false, alpha: false, stencil: false };

var _createApp = createApp(opt);

var updateProjectionMatrix = _createApp.updateProjectionMatrix;
var camera = _createApp.camera;
var scene = _createApp.scene;
var renderer = _createApp.renderer;
var controls = _createApp.controls;
var canvas = _createApp.canvas;

var supportsDepth = true;
if (!renderer.extensions.get('WEBGL_depth_texture')) {
  if (window.ga) window.ga('send', 'event', 'error', 'WEBGL_depth_texture', 0);
  console.warn('Requires WEBGL_depth_texture for certain post-processing effects.');
  supportsDepth = false;
}

var floatDepth = false;
renderer.gammaInput = true;
renderer.gammaOutput = true;
renderer.gammaFactor = 2.2;

var rt1 = createRenderTarget();
var rt2 = createRenderTarget();
var rtDepth = floatDepth ? rt1.clone() : null;
var rtInitial = createRenderTarget();
var composer = new EffectComposer(renderer, rt1, rt2, rtInitial);
var targets = [rt1, rt2, rtInitial, rtDepth].filter(Boolean);

if (floatDepth) {
  composer.depthTexture = rtDepth;
  rtDepth.texture.type = THREE.FloatType;
} else if (supportsDepth) {
  rtInitial.depthTexture = new THREE.DepthTexture();
}

var depthTarget = floatDepth ? rtDepth : rtInitial.depthTexture;

var depthMaterial = new THREE.MeshDepthMaterial();
depthMaterial.depthPacking = THREE.BasicDepthPacking;
depthMaterial.blending = THREE.NoBlending;

var time = 0;
var mesh = null;

var loop = createLoop(render).start();
resize();
window.addEventListener('resize', resize);
window.addEventListener('touchstart', function (ev) {
  return ev.preventDefault();
});
helloWorld();

// ensure we are at top on iPhone in landscape
var isIOS = /(iPhone|iPad)/i.test(navigator.userAgent);
if (isIOS) {
  (function () {
    var fixScroll = function fixScroll() {
      setTimeout(function () {
        window.scrollTo(0, 1);
      }, 500);
    };

    fixScroll();
    window.addEventListener('orientationchange', function () {
      fixScroll();
    }, false);
  })();
}

window.onkeydown = function (e) {
  if (e.keyCode === 32) return false;
};
setupPost();

var supportsMedia = !isIOS;

// define the public api
$audiograph.init = init;

function init(playlists) {
  setupScene({ palettes: getPalette(), supportsMedia: supportsMedia, playlists: playlists });
}

function setupPost() {
  composer.addPass(new EffectComposer.RenderPass(scene, camera));

  if (supportsDepth) {
    var pass = new EffectComposer.ShaderPass(SSAOShader);
    pass.material.precision = 'highp';
    composer.addPass(pass);
    pass.uniforms.tDepth.value = depthTarget;
    pass.uniforms.cameraNear.value = camera.near;
    pass.uniforms.cameraFar.value = camera.far;
  }

  composer.addPass(new BloomPass(scene, camera));
  composer.passes[composer.passes.length - 1].renderToScreen = true;
}

function createRenderTarget(numAttachments) {
  numAttachments = numAttachments || 0;
  var target = numAttachments > 1 ? new THREE.WebGLMultiRenderTarget(window.innerWidth, window.innerHeight) : new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
  target.texture.format = THREE.RGBFormat;
  target.texture.minFilter = THREE.NearestFilter;
  target.texture.magFilter = THREE.NearestFilter;
  target.texture.generateMipmaps = false;
  target.stencilBuffer = false;
  target.depthBuffer = true;
  if (numAttachments > 1) {
    var gBufferNormalRoughness = target.texture.clone();
    gBufferNormalRoughness.format = THREE.RGBAFormat;
    gBufferNormalRoughness.type = THREE.FloatType;
    target.attachments.push(gBufferNormalRoughness);
  }
  return target;
}

function resize() {
  var dpr = renderer.getPixelRatio();
  var size = renderer.getSize();
  var width = size.width * dpr;
  var height = size.height * dpr;
  targets.forEach(function (t) {
    t.setSize(width, height);
  });
}

function render(dt) {
  time += Math.min(30, dt) / 1000;
  if (mesh) {
    mesh.position.y = Math.sin(time) * 0.25 + 1;
    mesh.rotation.y += dt * 0.00005;
  }

  updateProjectionMatrix();

  var oldClear = renderer.getClearColor();
  if (floatDepth) {
    scene.overrideMaterial = depthMaterial;
    renderer.setRenderTarget(rtDepth);
    renderer.setClearColor(white, 1);
    renderer.clear(true, true, true);
    renderer.render(scene, camera, rtDepth);
  }

  composer.passes.forEach(function (pass) {
    if (pass.uniforms && pass.uniforms.resolution) {
      pass.uniforms.resolution.value.set(rtInitial.width, rtInitial.height);
    }
  });

  renderer.setRenderTarget(null);
  renderer.setClearColor(oldClear, 1);
  scene.overrideMaterial = null;
  if (composer.passes.length > 1) composer.render();else renderer.render(scene, camera);
}

function setupScene(_ref) {
  var palettes = _ref.palettes;
  var envMap = _ref.envMap;
  var playlists = _ref.playlists;

  document.querySelector('#canvas').style.display = 'block';

  // console.log('Total palettes', palettes.length);
  var geo = geoScene({ palettes: palettes, scene: scene, envMap: envMap, loop: loop, camera: camera, renderer: renderer });

  var initialPalette = ['#fff', '#e2e2e2'];
  geo.setPalette(initialPalette);
  document.body.style.background = '#F9F9F9';

  var audio = createAudio();
  audio.playlists = playlists;
  
  var started = false;
  var time = 0;
  var switchPalettes = false;
  var readyForGeometry = newArray(audio.binCount, true);
  var readyForPaletteChange = false;
  var paletteInterval = void 0;

  var whitePalette = ['#fff', '#d3d3d3', '#a5a5a5'];
  var interactions = setupInteractions({ whitePalette: whitePalette, scene: scene, controls: controls, audio: audio, camera: camera, geo: geo });

  var introAutoGeo = setInterval(function () {
    geo.nextGeometry();
  }, 400);

  if (isMobile) {
    audio.skip();
  } else {
    audio.queue();
    audio.once('ready', function () {
      audio.playQueued();
    });
  }

  // every time we release spacebar, we reset the counter here
  interactions.on('stop', function () {
    resetPaletteSwapping();
    readyForPaletteChange = false;
  });

  // handle slow internet on first track
  interactions.once('stop', function (isLoaded) {
    var firstSwapTimeout = null;
    var onAudioPlaying = function onAudioPlaying() {
      var firstSwapDelay = 7721;
      firstSwapTimeout = setTimeout(function () {
        firstSwap();
      }, firstSwapDelay);
    };
    if (!isLoaded) audio.once('ready', onAudioPlaying);else onAudioPlaying();
    interactions.once('start', function () {
      if (firstSwapTimeout) clearTimeout(firstSwapTimeout);
    });
  });

  showIntro({ interactions: interactions }, function () {
    started = true;
    clearInterval(introAutoGeo);
  });

  setInterval(function () {
    for (var i = 0; i < readyForGeometry.length; i++) {
      readyForGeometry[i] = true;
    }
  }, 100);

  loop.on('tick', function (dt) {
    time += dt;
    if (!started) return;

    audio.update(dt);

    for (var i = 0; i < audio.beats.length; i++) {
      if (readyForGeometry[i] && audio.beats[i]) {
        geo.nextGeometry({ type: i });
        readyForGeometry[i] = false;
      }
    }
    if (!interactions.keyDown && readyForPaletteChange && audio.beats[1] && switchPalettes) {
      geo.nextPalette();
      readyForPaletteChange = false;
    }
  });

  function firstSwap() {
    switchPalettes = true;
    geo.nextPalette();
    resetPaletteSwapping();
  }

  function resetPaletteSwapping() {
    readyForPaletteChange = false;
    if (paletteInterval) clearInterval(paletteInterval);
    paletteInterval = setInterval(function () {
      readyForPaletteChange = true;
    }, 2000);
  }
}

function helloWorld() {
  log.intro();
}

},{"./lib/BloomPass":2,"./lib/EffectComposer":3,"./lib/app":4,"./lib/audio":5,"./lib/geoScene":8,"./lib/intro":10,"./lib/isMobile":11,"./lib/log":12,"./lib/palette":13,"./lib/setupInteractions":14,"./lib/shader/SSAOShader":15,"new-array":32,"raf-loop":60,"right-now":66}],2:[function(require,module,exports){
'use strict';


var clamp = require('clamp');
var CopyShader = require('three-copyshader');
var isMobile = require('./isMobile');
var downsample = 2;
var maxSize = 4096;

module.exports = BloomPass;
function BloomPass(scene, camera) {
  var opt = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

  this.scene = scene;
  this.camera = camera;

  this.debugCopyShader = new THREE.ShaderMaterial(CopyShader);

  this._lastWidth = null;
  this._lastHeight = null;
  this._blurTarget = null; // lazily created
  this._thresholdTarget = null;

  this.enabled = true;
  this.needsSwap = true;
  this.oldColor = new THREE.Color();
  this.oldAlpha = 1;
  this.clearColor = new THREE.Color('#fff');
  this.clearAlpha = 0;

  this.postShader = new THREE.RawShaderMaterial({
    vertexShader: "#define GLSLIFY 1\nattribute vec4 position;\nattribute vec2 uv;\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nvarying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * position;\n}\n",
    fragmentShader: "precision highp float;\n#define GLSLIFY 1\n\nvarying vec2 vUv;\nuniform sampler2D tDiffuse;\nuniform vec2 resolution;\n\nvec3 tex(vec2 uv);\n\nhighp float random(vec2 co)\n{\n    highp float a = 12.9898;\n    highp float b = 78.233;\n    highp float c = 43758.5453;\n    highp float dt= dot(co.xy ,vec2(a,b));\n    highp float sn= mod(dt,3.14);\n    return fract(sin(sn) * c);\n}\n\n#ifndef TAU\n  #define TAU 6.28318530718\n#endif\n\n//Use last part of hash function to generate new random radius and angle\nvec2 mult(inout vec2 r) {\n  r = fract(r * vec2(12.9898,78.233));\n  return sqrt(r.x + .001) * vec2(sin(r.y * TAU), cos(r.y * TAU));\n}\n\nvec3 blur(vec2 uv, float radius, float aspect, float offset) {\n  vec2 circle = vec2(radius);\n  circle.x *= aspect;\n  vec2 rnd = vec2(random(vec2(uv + offset)));\n\n  vec3 acc = vec3(0.0);\n  for (int i = 0; i < 10; i++) {\n    acc += tex(uv + circle * mult(rnd)).xyz;\n  }\n  return acc / float(10);\n}\n\nvec3 blur(vec2 uv, float radius, float aspect) {\n  return blur(uv, radius, aspect, 0.0);\n}\n\nvec3 blur(vec2 uv, float radius) {\n  return blur(uv, radius, 1.0);\n}\n\nfloat luma(vec3 color) {\n  return dot(color, vec3(0.299, 0.587, 0.114));\n}\n\nfloat luma(vec4 color) {\n  return dot(color.rgb, vec3(0.299, 0.587, 0.114));\n}\n\nvec3 tex(vec2 uv) {\n  vec3 rgb = texture2D(tDiffuse, uv).rgb;\n  // float threshold = luma(rgb);\n  return rgb;\n  // return threshold > 0.2 ? rgb : vec3(0.0);\n  // return step(1.0 - t, rgb);\n  // return smoothstep(vec3(0.0), vec3(, threshold);\n}\n\nvoid main () {\n  float aspect = resolution.x / resolution.y;\n  \n  //jitter the noise but not every frame\n  float tick = 0.0;//floor(fract(iGlobalTime)*20.0);\n  float jitter = mod(tick * 382.0231, 21.321);\n  \n  // vec3 blurred = vec3(0.0);\n  // blurred += 0.6 * blur(vUv, 0.3, 1.0 / aspect, jitter);\n  \n  vec3 blurred = blur(vUv, 0.25, 1.0 / aspect);\n  gl_FragColor.rgb = blurred;\n  gl_FragColor.a = 1.0;\n  // gl_FragColor = texture2D(tDiffuse, vUv);\n}",
    uniforms: {
      tDiffuse: { type: 't', value: null },
      resolution: { type: 'v2', value: new THREE.Vector2(1, 1) }
    }
  });
  this.postShader.name = 'bloom-blur-material';

  this.combineShader = new THREE.RawShaderMaterial({
    vertexShader: "#define GLSLIFY 1\nattribute vec4 position;\nattribute vec2 uv;\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nvarying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * position;\n}\n",
    fragmentShader: "precision mediump float;\n#define GLSLIFY 1\n\nvarying vec2 vUv;\nuniform sampler2D tDiffuse;\nuniform sampler2D tBloomDiffuse;\nuniform vec2 resolution;\n\nvoid main () {\n  vec4 blurred = texture2D(tBloomDiffuse, vUv);\n  blurred.rgb *= 0.5;\n  gl_FragColor = texture2D(tDiffuse, vUv) + blurred;\n}",
    uniforms: {
      resolution: { type: 'v2', value: new THREE.Vector2() },
      tDiffuse: { type: 't', value: null },
      tBloomDiffuse: { type: 't', value: null }
    }
  });
  this.combineShader.name = 'bloom-combine-material';

  this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  this.postScene = new THREE.Scene();

  this.postQuad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2));
  this.postQuad.name = 'godray-post-quad';
  this.postScene.add(this.postQuad);

  this.renderToScreen = false;
}

BloomPass.prototype = {

  _updateTargets: function _updateTargets(renderTarget) {
    var width = renderTarget.width;
    var height = renderTarget.height;
    var downWidth = clamp(Math.floor(width / downsample), 2, maxSize);
    var downHeight = clamp(Math.floor(height / downsample), 2, maxSize);
    if (!this._thresholdTarget || !this._blurTarget) {
      this._blurTarget = new THREE.WebGLRenderTarget(downWidth, downHeight);
      this._blurTarget.texture.minFilter = THREE.LinearFilter;
      this._blurTarget.texture.magFilter = THREE.LinearFilter;
      this._blurTarget.texture.generateMipmaps = false;
      this._blurTarget.depthBuffer = true;
      this._blurTarget.stencilBuffer = false;
      this._thresholdTarget = this._blurTarget.clone();
    } else if (this._thresholdTarget.width !== width || this._thresholdTarget.height !== height) {
      this._thresholdTarget.setSize(downWidth, downHeight);
      this._blurTarget.setSize(downWidth, downHeight);
    }
  },

  render: function render(renderer, writeBuffer, readBuffer, delta) {
    this._updateTargets(readBuffer);
    var finalBuffer = this.renderToScreen ? undefined : writeBuffer;

    // 1. First, render scene into downsampled FBO and threshold color
    this.oldColor.copy(renderer.getClearColor());
    this.oldAlpha = renderer.getClearAlpha();
    var oldAutoClear = renderer.autoClear;

    // Clear target
    renderer.setClearColor(this.clearColor, this.clearAlpha);
    renderer.autoClear = false;
    renderer.clearTarget(this._thresholdTarget, true, true, false);

    // Draw scene
    renderer.render(this.scene, this.camera, this._thresholdTarget, false);

    // 3. Now blur the threshold target
    this.postScene.overrideMaterial = this.postShader;

    this.postShader.uniforms.resolution.value.set(this._thresholdTarget.width, this._thresholdTarget.height);
    this.postShader.uniforms.tDiffuse.value = this._thresholdTarget;
    renderer.render(this.postScene, this.postCamera, this._blurTarget, true);

    // Now we render back to original scene, with additive blending!
    this.postScene.overrideMaterial = this.combineShader;
    this.combineShader.uniforms.tDiffuse.value = readBuffer;
    this.combineShader.uniforms.tBloomDiffuse.value = this._blurTarget;

    var dpr = renderer.getPixelRatio();
    this.combineShader.uniforms.resolution.value.set(finalBuffer ? finalBuffer.width : window.innerWidth * dpr, finalBuffer ? finalBuffer.height : window.innerHeight * dpr);
    renderer.render(this.postScene, this.postCamera, finalBuffer, true);

    renderer.setClearColor(this.oldColor, this.oldAlpha);
    renderer.autoClear = oldAutoClear;
  }

};

},{"./isMobile":11,"clamp":19,"three-copyshader":69}],3:[function(require,module,exports){
'use strict';

/**
 * @author alteredq / http://alteredqualia.com/
 */

module.exports = EffectComposer;

var CopyShader = EffectComposer.CopyShader = require('three-copyshader'),
    RenderPass = EffectComposer.RenderPass = require('three-effectcomposer/lib/renderpass')(THREE),
    ShaderPass = EffectComposer.ShaderPass = require('three-effectcomposer/lib/shaderpass')(THREE, EffectComposer),
    MaskPass = EffectComposer.MaskPass = require('three-effectcomposer/lib/maskpass')(THREE),
    ClearMaskPass = EffectComposer.ClearMaskPass = require('three-effectcomposer/lib/clearmaskpass')(THREE);

function EffectComposer(renderer, renderTarget1, renderTarget2, initialRenderTarget) {
  this.renderer = renderer;

  if (renderTarget1 === undefined) {
    throw new Error('must specify targets');
  }

  this.renderTarget1 = renderTarget1;
  this.renderTarget2 = renderTarget2;
  this.initialRenderTarget = initialRenderTarget;

  this.writeBuffer = this.renderTarget1;
  this.readBuffer = this.renderTarget2;

  this.passes = [];

  this.copyPass = new ShaderPass(CopyShader);
};

EffectComposer.prototype = {
  swapBuffers: function swapBuffers() {

    var tmp = this.readBuffer;
    this.readBuffer = this.writeBuffer;
    this.writeBuffer = tmp;
  },

  addPass: function addPass(pass) {

    this.passes.push(pass);
  },

  clearPasses: function clearPasses() {
    this.passes.length = 0;
  },

  insertPass: function insertPass(pass, index) {

    this.passes.splice(index, 0, pass);
    this.initialClearColor = new THREE.Color(1, 0, 0);
  },

  render: function render(delta) {

    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;

    var maskActive = false;

    var pass,
        i,
        passIndex,
        il = this.passes.length;

    for (i = 0, passIndex = 0; i < il; i++) {

      pass = this.passes[i];

      if (!pass.enabled) {
        continue;
      }

      var readTarget;
      var writeTarget;
      if (passIndex <= 1) {
        // First pass: Write into MSAA target
        writeTarget = this.writeBuffer;
        readTarget = this.initialRenderTarget;
      } else {
        // Subsequent passes: Read from MSAA target
        writeTarget = this.writeBuffer;
        readTarget = this.readBuffer;
      }

      var depthTexture;
      if (this.depthTexture) {
        depthTexture = this.depthTexture;
      } else {
        depthTexture = passIndex === 0 ? undefined : this.initialRenderTarget.depthTexture;
      }
      var attachments = this.initialRenderTarget.attachments;
      pass.render(this.renderer, writeTarget, readTarget, delta, maskActive, depthTexture, attachments);

      if (pass.needsSwap) {

        if (maskActive) {

          var context = this.renderer.context;

          context.stencilFunc(context.NOTEQUAL, 1, 0xffffffff);

          this.copyPass.render(this.renderer, this.writeBuffer, this.readBuffer, delta);

          context.stencilFunc(context.EQUAL, 1, 0xffffffff);
        }

        this.swapBuffers();
      }

      if (pass instanceof MaskPass) {

        maskActive = true;
      } else if (pass instanceof ClearMaskPass) {

        maskActive = false;
      }

      passIndex++;
    }
  },

  reset: function reset(renderTarget) {

    if (renderTarget === undefined) {

      renderTarget = this.renderTarget1.clone();

      renderTarget.width = window.innerWidth;
      renderTarget.height = window.innerHeight;
    }

    this.renderTarget1 = renderTarget;
    this.renderTarget2 = renderTarget.clone();

    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;
  },

  setSize: function setSize(width, height) {

    var renderTarget = this.renderTarget1.clone();

    renderTarget.width = width;
    renderTarget.height = height;

    this.reset(renderTarget);
  }

};

// shared ortho camera

EffectComposer.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

EffectComposer.quad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), null);

EffectComposer.scene = new THREE.Scene();
EffectComposer.scene.add(EffectComposer.quad);

},{"three-copyshader":69,"three-effectcomposer/lib/clearmaskpass":70,"three-effectcomposer/lib/maskpass":71,"three-effectcomposer/lib/renderpass":72,"three-effectcomposer/lib/shaderpass":73}],4:[function(require,module,exports){
'use strict';

/*
  This is a generic "ThreeJS Application"
  helper which sets up a renderer and camera
  controls.
 */

var createControls = require('orbit-controls');
var assign = require('object-assign');

module.exports = createApp;
function createApp() {
  var opt = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

  // Scale for retina
  var dpr = Math.min(1.5, window.devicePixelRatio);
  var isIOS = /(iPhone|iPad|iPod)/i.test(navigator.userAgent);

  // Our WebGL renderer with alpha and device-scaled
  var renderer = new THREE.WebGLRenderer(assign({
    canvas: document.querySelector('#canvas'),
    antialias: true // default enabled
  }, opt));
  renderer.setPixelRatio(dpr);

  // 3D camera looking
  var camera = new THREE.PerspectiveCamera(75, 1, 0.01, 100);
  var target = new THREE.Vector3();

  // 3D scene
  var scene = new THREE.Scene();

  // 3D orbit controller with damping
  var controls = createControls(assign({
    canvas: canvas,
    rotateSpeed: 0,
    zoomSpeed: 0,
    pinchSpeed: 0,
    // theta: 0,
    phi: 0,
    distance: 1,
    // phiBounds: [ 0, 1 ],
    // phiBounds: [ 0, 0 ],
    distanceBounds: [0, 100]
  }, opt));

  // Update frame size
  window.addEventListener('resize', resize);

  // Setup initial size
  resize();

  return {
    updateProjectionMatrix: updateProjectionMatrix,
    camera: camera,
    scene: scene,
    renderer: renderer,
    controls: controls,
    canvas: canvas
  };

  function updateProjectionMatrix() {
    var width = window.innerWidth;
    var height = window.innerHeight;
    var aspect = width / height;

    // update camera controls
    controls.update();
    camera.position.fromArray(controls.position);
    camera.up.fromArray(controls.up);
    camera.lookAt(target.fromArray(controls.direction));

    // Update camera matrices
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  function resize() {
    var width = window.innerWidth;
    var height = window.innerHeight;
    if (isIOS) {
      // fix landscape bug with iOS
      width++;
      height++;
    }
    renderer.setSize(width, height);
    updateProjectionMatrix();
  }
}

},{"object-assign":33,"orbit-controls":34}],5:[function(require,module,exports){
'use strict';

// TODO lib-audio file start

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var audioPlayer = require('web-audio-player');
var frequencyToIndex = require('audio-frequency-to-index');
var createAudioContext = require('ios-safe-audio-context');
var createBeatDetection = require('beats');
var EventEmitter = require('events').EventEmitter;
var newArray = require('new-array');
var Reverb = require('soundbank-reverb');
var path = require('path');
var log = require('./log');
var NUM_BINS = 2;

var canPlayDDS = testCanPlayDDPlus();

module.exports = function () {
  if (canPlayDDS) log('Dolby Digital Plus supported!');

  var audioCache = {};
  var audioTimeCache = {};
  var playlistCounter = 0;

  var audioContext = createAudioContext();
  setTimeout(function () {
    return resume();
  }, 1000);

  // console.log(audioContext.sampleRate)
  //new (window.AudioContext || window.webkitAudioContext)();
  var analyserNode = audioContext.createAnalyser();
  var freqArray = new Uint8Array(analyserNode.frequencyBinCount);

  // If rate is not 44100, the reverb module bugs out
  var supportReverb = audioContext.sampleRate === 44100;

  var effectNode = createEffectNode(audioContext.destination);
  analyserNode.connect(effectNode);

  var sampleRate = audioContext.sampleRate;
  var freqBinCount = analyserNode.frequencyBinCount;

  var effect = 0;
  var player = new EventEmitter();

  var loadingAudio = false;
  var queueing = false;
  var waitingForNext = false;
  var queuedAudio = void 0,
      playingAudio = void 0;
  var dataIsInvalid = false;
  var dataValidationInterval = null;
  var fillWithFakeData = false;
  var lastTrackName = void 0;
  var VALIDATION_TIME = 3000;

  Object.defineProperty(player, 'effect', {
    get: function get() {
      return effect;
    },
    set: function set(val) {
      effect = val;
      effectNode.wet.value = val;
      effectNode.dry.value = 1 - val;
    }
  });

  player.update = update;
  player.binCount = NUM_BINS;
  player.beats = newArray(NUM_BINS, 0);

  player.queue = queue;
  player.playQueued = playQueued;
  player.skip = skip;
  return player;

  function skip() {
    playlistCounter++;
  }

  function resume() {
    if (audioContext.state === 'suspended' && typeof audioContext.resume === 'function') {
      audioContext.resume();
    }
  }

  function createEffectNode(output) {
    if (supportReverb) {
      var reverb = Reverb(audioContext);
      reverb.time = 4.5; // seconds
      reverb.wet.value = 0;
      reverb.dry.value = 1;
      reverb.filterType = 'highpass';
      reverb.cutoff.value = 200; // Hz
      reverb.connect(output);
      return reverb;
    } else {
      var _ret = function () {
        var node = audioContext.createGain();
        var dry = audioContext.createGain();
        var wet = audioContext.createGain();
        var filter = audioContext.createBiquadFilter();

        node.connect(dry);
        node.connect(wet);

        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        dry.connect(output);
        wet.connect(filter);
        filter.connect(output);

        Object.defineProperties(node, {
          wet: { get: function get() {
              return wet.gain;
            } },
          dry: { get: function get() {
              return dry.gain;
            } }
        });
        node.wet.value = 0;
        node.dry.value = 1;
        return {
          v: node
        };
      }();

      if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
    }
  }

  function update(dt) {
    if (!playingAudio) return;
    analyserNode.getByteTimeDomainData(freqArray);
    player.beats = playingAudio.detectBeats(freqArray);

    if (!isDataValid()) {
      dataIsInvalid = true;
    }

    if (fillWithFakeData) fillFakeData();
  }

  // Safari (iOS/Desktop) returns garbage audio
  // frequency data since we are using a media
  // element source, not a fully decoded source.
  // For these browsers we will just "fake" the
  // visualization.
  function isDataValid() {
    var test = freqArray[0];
    for (var i = 0; i < freqArray.length; i++) {
      if (freqArray[i] !== test) return true;
    }
    return false;
  }

  function dataValidation() {
    if (dataIsInvalid) {
      // console.log('Data has been invalid for X frames, filling with fake frequencies.');
      dataIsInvalid = false;
      fillWithFakeData = true;
    }
  }

  function fillFakeData() {
    for (var i = 0; i < freqArray.length; i++) {
      freqArray[i] = 127;
    }
  }

  function queue() {
    if (queueing) return lastTrackName;

    queueing = true;
    var newIdx = playlistCounter++ % this.playlists.length;
    var playlist = this.playlists[newIdx];
    var frequencyBand = playlist.frequencies;
    var sourceUrl = playlist.src;

    loadAudio(playlist, frequencyBand, function (audio) {
      queuedAudio = audio;
      queueing = false;
      player.emit('ready');
    });
    
    lastTrackName = playlist.trackName;
    
    // Send original track name so we know what is being played
    if (window.ga) {
      window.ga('send', 'event', 'audio', 'queue', lastTrackName);
    }

    return lastTrackName.trim();
  }

  function playQueued() {
    // console.log('About to play...');
    if (waitingForNext) return;
    if (queueing) {
      stopLast();
      waitingForNext = true;
      player.once('ready', function () {
        waitingForNext = false;
        playQueued();
      });
      // console.log('Deferring next load...');
      return;
    }
    stopLast();
    dataIsInvalid = false;
    fillWithFakeData = false;
    queuedAudio.play();
    playingAudio = queuedAudio;
    if (dataValidationInterval) clearTimeout(dataValidationInterval);
    dataValidationInterval = setTimeout(dataValidation, VALIDATION_TIME);
    // console.log('Playing...');
  }

  function stopLast() {
    if (playingAudio) {
      audioTimeCache[playingAudio.urlKey] = playingAudio.element.currentTime;
      playingAudio.stop();

      var lastSources = [];
      var element = playingAudio.element;
      while (element.firstChild) {
        lastSources.push(element.firstChild);
        element.removeChild(element.firstChild);
      }

      playingAudio.lastSources = lastSources;
      playingAudio.element.load();
      playingAudio.node.disconnect();
    }
  }

  function loadAudio(sources, ranges, cb) {
    if (loadingAudio) return;
    if (!Array.isArray(sources)) sources = [sources];
    var urlKey = typeof sources[0] === 'string' ? sources[0] : sources[0].src;
    loadingAudio = true;

    // if (urlKey in audioCache) {
    //   const ret = audioCache[urlKey];
    //   ret.lastSources.forEach(source => {
    //     ret.element.appendChild(source);
    //   });
    //   ret.lastSources.length = 0;
    //   ret.element.currentTime = ret.lastTime;
    //   ret.element.load();
    //   process.nextTick(() => {
    //     cb(ret);
    //     loadingAudio = false;
    //   });
    //   return ret;
    // }

    // Fix Safari 9 bug
    resume();

    var audio = audioPlayer(sources, {
      loop: true,
      buffer: false,
      context: audioContext
    });
    audioCache[urlKey] = audio;
    audio.urlKey = urlKey;

    audio.on('error', function (err) {
      console.error(err);
    });

    var bins = ranges.map(function (range) {
      return {
        lo: frequencyToIndex(range[0], sampleRate, freqBinCount),
        hi: frequencyToIndex(range[1], sampleRate, freqBinCount),
        threshold: 100,
        decay: 0.001
      };
    });
    audio.detectBeats = createBeatDetection(bins);

    audio.on('decoding', function () {
      // console.log('Decoding', urlKey);
    });
    audio.on('load', function () {
      // console.log('Audio loaded...');
      // start playing audio file

      if (urlKey in audioTimeCache) {
        audio.element.currentTime = audioTimeCache[urlKey];
      }

      cb(audio);
      loadingAudio = false;
    });
    audio.node.connect(analyserNode);
    return audio;
  }
};

function testCanPlayDDPlus() {
  // create audio element to test Dolby Digital Plus playback
  var audio = new window.Audio();

  // check to see if EC-3 (Dolby Digital Plus) can be played
  if (audio.canPlayType('audio/mp4;codecs="ec-3"') !== '') {
    if (navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf('Mac OS X 10_11') !== -1 && navigator.userAgent.indexOf('Version/9') !== -1) {
      // everything checks out so we can play Dolby Digital Plus
      return true;
    }
    if (navigator.userAgent.indexOf('Edge') !== -1) {
      return true;
    }
  }
  return false;
}

// TODO end lib-audio file

},{"./log":12,"audio-frequency-to-index":17,"beats":18,"events":26,"ios-safe-audio-context":31,"new-array":32,"path":58,"soundbank-reverb":68,"web-audio-player":124}],6:[function(require,module,exports){
module.exports=[["#69D2E7","#A7DBD8","#E0E4CC","#F38630","#FA6900"],["#FE4365","#FC9D9A","#F9CDAD","#C8C8A9","#83AF9B"],["#ECD078","#D95B43","#C02942","#542437","#53777A"],["#556270","#4ECDC4","#C7F464","#FF6B6B","#C44D58"],["#774F38","#E08E79","#F1D4AF","#ECE5CE","#C5E0DC"],["#E8DDCB","#CDB380","#036564","#033649","#031634"],["#490A3D","#BD1550","#E97F02","#F8CA00","#8A9B0F"],["#594F4F","#547980","#45ADA8","#9DE0AD","#E5FCC2"],["#00A0B0","#6A4A3C","#CC333F","#EB6841","#EDC951"],["#E94E77","#D68189","#C6A49A","#C6E5D9","#F4EAD5"],["#D9CEB2","#948C75","#D5DED9","#7A6A53","#99B2B7"],["#FFFFFF","#CBE86B","#F2E9E1","#1C140D","#CBE86B"],["#EFFFCD","#DCE9BE","#555152","#2E2633","#99173C"],["#3FB8AF","#7FC7AF","#DAD8A7","#FF9E9D","#FF3D7F"],["#343838","#005F6B","#008C9E","#00B4CC","#00DFFC"],["#413E4A","#73626E","#B38184","#F0B49E","#F7E4BE"],["#99B898","#FECEA8","#FF847C","#E84A5F","#2A363B"],["#FF4E50","#FC913A","#F9D423","#EDE574","#E1F5C4"],["#554236","#F77825","#D3CE3D","#F1EFA5","#60B99A"],["#351330","#424254","#64908A","#E8CAA4","#CC2A41"],["#00A8C6","#40C0CB","#F9F2E7","#AEE239","#8FBE00"],["#FF4242","#F4FAD2","#D4EE5E","#E1EDB9","#F0F2EB"],["#655643","#80BCA3","#F6F7BD","#E6AC27","#BF4D28"],["#8C2318","#5E8C6A","#88A65E","#BFB35A","#F2C45A"],["#FAD089","#FF9C5B","#F5634A","#ED303C","#3B8183"],["#BCBDAC","#CFBE27","#F27435","#F02475","#3B2D38"],["#D1E751","#FFFFFF","#000000","#4DBCE9","#26ADE4"],["#FF9900","#424242","#E9E9E9","#BCBCBC","#3299BB"],["#5D4157","#838689","#A8CABA","#CAD7B2","#EBE3AA"],["#5E412F","#FCEBB6","#78C0A8","#F07818","#F0A830"],["#EEE6AB","#C5BC8E","#696758","#45484B","#36393B"],["#1B676B","#519548","#88C425","#BEF202","#EAFDE6"],["#F8B195","#F67280","#C06C84","#6C5B7B","#355C7D"],["#452632","#91204D","#E4844A","#E8BF56","#E2F7CE"],["#F04155","#FF823A","#F2F26F","#FFF7BD","#95CFB7"],["#F0D8A8","#3D1C00","#86B8B1","#F2D694","#FA2A00"],["#2A044A","#0B2E59","#0D6759","#7AB317","#A0C55F"],["#67917A","#170409","#B8AF03","#CCBF82","#E33258"],["#B9D7D9","#668284","#2A2829","#493736","#7B3B3B"],["#BBBB88","#CCC68D","#EEDD99","#EEC290","#EEAA88"],["#A3A948","#EDB92E","#F85931","#CE1836","#009989"],["#E8D5B7","#0E2430","#FC3A51","#F5B349","#E8D5B9"],["#B3CC57","#ECF081","#FFBE40","#EF746F","#AB3E5B"],["#AB526B","#BCA297","#C5CEAE","#F0E2A4","#F4EBC3"],["#607848","#789048","#C0D860","#F0F0D8","#604848"],["#515151","#FFFFFF","#00B4FF","#EEEEEE"],["#3E4147","#FFFEDF","#DFBA69","#5A2E2E","#2A2C31"],["#300030","#480048","#601848","#C04848","#F07241"],["#1C2130","#028F76","#B3E099","#FFEAAD","#D14334"],["#A8E6CE","#DCEDC2","#FFD3B5","#FFAAA6","#FF8C94"],["#EDEBE6","#D6E1C7","#94C7B6","#403B33","#D3643B"],["#FDF1CC","#C6D6B8","#987F69","#E3AD40","#FCD036"],["#AAB3AB","#C4CBB7","#EBEFC9","#EEE0B7","#E8CAAF"],["#CC0C39","#E6781E","#C8CF02","#F8FCC1","#1693A7"],["#3A111C","#574951","#83988E","#BCDEA5","#E6F9BC"],["#FC354C","#29221F","#13747D","#0ABFBC","#FCF7C5"],["#B9D3B0","#81BDA4","#B28774","#F88F79","#F6AA93"],["#5E3929","#CD8C52","#B7D1A3","#DEE8BE","#FCF7D3"],["#230F2B","#F21D41","#EBEBBC","#BCE3C5","#82B3AE"],["#5C323E","#A82743","#E15E32","#C0D23E","#E5F04C"],["#4E395D","#827085","#8EBE94","#CCFC8E","#DC5B3E"],["#DAD6CA","#1BB0CE","#4F8699","#6A5E72","#563444"],["#C2412D","#D1AA34","#A7A844","#A46583","#5A1E4A"],["#D1313D","#E5625C","#F9BF76","#8EB2C5","#615375"],["#9D7E79","#CCAC95","#9A947C","#748B83","#5B756C"],["#1C0113","#6B0103","#A30006","#C21A01","#F03C02"],["#8DCCAD","#988864","#FEA6A2","#F9D6AC","#FFE9AF"],["#CFFFDD","#B4DEC1","#5C5863","#A85163","#FF1F4C"],["#75616B","#BFCFF7","#DCE4F7","#F8F3BF","#D34017"],["#382F32","#FFEAF2","#FCD9E5","#FBC5D8","#F1396D"],["#B6D8C0","#C8D9BF","#DADABD","#ECDBBC","#FEDCBA"],["#E3DFBA","#C8D6BF","#93CCC6","#6CBDB5","#1A1F1E"],["#A7C5BD","#E5DDCB","#EB7B59","#CF4647","#524656"],["#9DC9AC","#FFFEC7","#F56218","#FF9D2E","#919167"],["#413D3D","#040004","#C8FF00","#FA023C","#4B000F"],["#EDF6EE","#D1C089","#B3204D","#412E28","#151101"],["#A8A7A7","#CC527A","#E8175D","#474747","#363636"],["#7E5686","#A5AAD9","#E8F9A2","#F8A13F","#BA3C3D"],["#FFEDBF","#F7803C","#F54828","#2E0D23","#F8E4C1"],["#C1B398","#605951","#FBEEC2","#61A6AB","#ACCEC0"],["#5E9FA3","#DCD1B4","#FAB87F","#F87E7B","#B05574"],["#951F2B","#F5F4D7","#E0DFB1","#A5A36C","#535233"],["#FFFBB7","#A6F6AF","#66B6AB","#5B7C8D","#4F2958"],["#000000","#9F111B","#B11623","#292C37","#CCCCCC"],["#9CDDC8","#BFD8AD","#DDD9AB","#F7AF63","#633D2E"],["#EFF3CD","#B2D5BA","#61ADA0","#248F8D","#605063"],["#84B295","#ECCF8D","#BB8138","#AC2005","#2C1507"],["#FCFEF5","#E9FFE1","#CDCFB7","#D6E6C3","#FAFBE3"],["#0CA5B0","#4E3F30","#FEFEEB","#F8F4E4","#A5B3AA"],["#4D3B3B","#DE6262","#FFB88C","#FFD0B3","#F5E0D3"],["#B5AC01","#ECBA09","#E86E1C","#D41E45","#1B1521"],["#379F7A","#78AE62","#BBB749","#E0FBAC","#1F1C0D"],["#FFE181","#EEE9E5","#FAD3B2","#FFBA7F","#FF9C97"],["#4E4D4A","#353432","#94BA65","#2790B0","#2B4E72"],["#A70267","#F10C49","#FB6B41","#F6D86B","#339194"],["#30261C","#403831","#36544F","#1F5F61","#0B8185"],["#2D2D29","#215A6D","#3CA2A2","#92C7A3","#DFECE6"],["#F38A8A","#55443D","#A0CAB5","#CDE9CA","#F1EDD0"],["#793A57","#4D3339","#8C873E","#D1C5A5","#A38A5F"],["#11766D","#410936","#A40B54","#E46F0A","#F0B300"],["#AAFF00","#FFAA00","#FF00AA","#AA00FF","#00AAFF"],["#C75233","#C78933","#D6CEAA","#79B5AC","#5E2F46"],["#F8EDD1","#D88A8A","#474843","#9D9D93","#C5CFC6"],["#6DA67A","#77B885","#86C28B","#859987","#4A4857"],["#1B325F","#9CC4E4","#E9F2F9","#3A89C9","#F26C4F"],["#BED6C7","#ADC0B4","#8A7E66","#A79B83","#BBB2A1"],["#046D8B","#309292","#2FB8AC","#93A42A","#ECBE13"],["#82837E","#94B053","#BDEB07","#BFFA37","#E0E0E0"],["#312736","#D4838F","#D6ABB1","#D9D9D9","#C4FFEB"],["#E5EAA4","#A8C4A2","#69A5A4","#616382","#66245B"],["#6DA67A","#99A66D","#A9BD68","#B5CC6A","#C0DE5D"],["#395A4F","#432330","#853C43","#F25C5E","#FFA566"],["#331327","#991766","#D90F5A","#F34739","#FF6E27"],["#FDFFD9","#FFF0B8","#FFD6A3","#FAAD8E","#142F30"],["#E21B5A","#9E0C39","#333333","#FBFFE3","#83A300"],["#FBC599","#CDBB93","#9EAE8A","#335650","#F35F55"],["#C7FCD7","#D9D5A7","#D9AB91","#E6867A","#ED4A6A"],["#EC4401","#CC9B25","#13CD4A","#7B6ED6","#5E525C"],["#BF496A","#B39C82","#B8C99D","#F0D399","#595151"],["#FFEFD3","#FFFEE4","#D0ECEA","#9FD6D2","#8B7A5E"],["#F1396D","#FD6081","#F3FFEB","#ACC95F","#8F9924"],["#F6F6F6","#E8E8E8","#333333","#990100","#B90504"],["#261C21","#6E1E62","#B0254F","#DE4126","#EB9605"],["#E9E0D1","#91A398","#33605A","#070001","#68462B"],["#F2E3C6","#FFC6A5","#E6324B","#2B2B2B","#353634"],["#FFAB07","#E9D558","#72AD75","#0E8D94","#434D53"],["#59B390","#F0DDAA","#E47C5D","#E32D40","#152B3C"],["#FDE6BD","#A1C5AB","#F4DD51","#D11E48","#632F53"],["#E4E4C5","#B9D48B","#8D2036","#CE0A31","#D3E4C5"],["#512B52","#635274","#7BB0A8","#A7DBAB","#E4F5B1"],["#805841","#DCF7F3","#FFFCDD","#FFD8D8","#F5A2A2"],["#E65540","#F8ECC2","#65A8A6","#79896D"],["#CAFF42","#EBF7F8","#D0E0EB","#88ABC2","#49708A"],["#595643","#4E6B66","#ED834E","#EBCC6E","#EBE1C5"],["#E4DED0","#ABCCBD","#7DBEB8","#181619","#E32F21"],["#058789","#503D2E","#D54B1A","#E3A72F","#F0ECC9"],["#FF003C","#FF8A00","#FABE28","#88C100","#00C176"],["#311D39","#67434F","#9B8E7E","#C3CCAF","#A51A41"],["#EFD9B4","#D6A692","#A39081","#4D6160","#292522"],["#C6CCA5","#8AB8A8","#6B9997","#54787D","#615145"],["#CC5D4C","#FFFEC6","#C7D1AF","#96B49C","#5B5847"],["#111625","#341931","#571B3C","#7A1E48","#9D2053"],["#EFEECC","#FE8B05","#FE0557","#400403","#0AABBA"],["#CCF390","#E0E05A","#F7C41F","#FC930A","#FF003D"],["#73C8A9","#DEE1B6","#E1B866","#BD5532","#373B44"],["#79254A","#795C64","#79927D","#AEB18E","#E3CF9E"],["#E0EFF1","#7DB4B5","#FFFFFF","#680148","#000000"],["#F06D61","#DA825F","#C4975C","#A8AB7B","#8CBF99"],["#2D1B33","#F36A71","#EE887A","#E4E391","#9ABC8A"],["#2B2726","#0A516D","#018790","#7DAD93","#BACCA4"],["#95A131","#C8CD3B","#F6F1DE","#F5B9AE","#EE0B5B"],["#360745","#D61C59","#E7D84B","#EFEAC5","#1B8798"],["#E3E8CD","#BCD8BF","#D3B9A3","#EE9C92","#FE857E"],["#807462","#A69785","#B8FAFF","#E8FDFF","#665C49"],["#4B1139","#3B4058","#2A6E78","#7A907C","#C9B180"],["#FC284F","#FF824A","#FEA887","#F6E7F7","#D1D0D7"],["#FFB884","#F5DF98","#FFF8D4","#C0D1C2","#2E4347"],["#027B7F","#FFA588","#D62957","#BF1E62","#572E4F"],["#80A8A8","#909D9E","#A88C8C","#FF0D51","#7A8C89"],["#A69E80","#E0BA9B","#E7A97E","#D28574","#3B1922"],["#A1DBB2","#FEE5AD","#FACA66","#F7A541","#F45D4C"],["#641F5E","#676077","#65AC92","#C2C092","#EDD48E"],["#FFF3DB","#E7E4D5","#D3C8B4","#C84648","#703E3B"],["#F5DD9D","#BCC499","#92A68A","#7B8F8A","#506266"],["#2B222C","#5E4352","#965D62","#C7956D","#F2D974"],["#D4F7DC","#DBE7B4","#DBC092","#E0846D","#F51441"],["#A32C28","#1C090B","#384030","#7B8055","#BCA875"],["#85847E","#AB6A6E","#F7345B","#353130","#CBCFB4"],["#E6B39A","#E6CBA5","#EDE3B4","#8B9E9B","#6D7578"],["#11644D","#A0B046","#F2C94E","#F78145","#F24E4E"],["#6D9788","#1E2528","#7E1C13","#BF0A0D","#E6E1C2"],["#23192D","#FD0A54","#F57576","#FEBF97","#F5ECB7"],["#EB9C4D","#F2D680","#F3FFCF","#BAC9A9","#697060"],["#D3D5B0","#B5CEA4","#9DC19D","#8C7C62","#71443F"],["#452E3C","#FF3D5A","#FFB969","#EAF27E","#3B8C88"],["#041122","#259073","#7FDA89","#C8E98E","#E6F99D"],["#B1E6D1","#77B1A9","#3D7B80","#270A33","#451A3E"],["#9D9E94","#C99E93","#F59D92","#E5B8AD","#D5D2C8"],["#FDCFBF","#FEB89F","#E23D75","#5F0D3B","#742365"],["#540045","#C60052","#FF714B","#EAFF87","#ACFFE9"],["#B7CBBF","#8C886F","#F9A799","#F4BFAD","#F5DABD"],["#280904","#680E34","#9A151A","#C21B12","#FC4B2A"],["#F0FFC9","#A9DA88","#62997A","#72243D","#3B0819"],["#429398","#6B5D4D","#B0A18F","#DFCDB4","#FBEED3"],["#E6EBA9","#ABBB9F","#6F8B94","#706482","#703D6F"],["#A3C68C","#879676","#6E6662","#4F364A","#340735"],["#44749D","#C6D4E1","#FFFFFF","#EBE7E0","#BDB8AD"],["#322938","#89A194","#CFC89A","#CC883A","#A14016"],["#CFB590","#9E9A41","#758918","#564334","#49281F"],["#FA6A64","#7A4E48","#4A4031","#F6E2BB","#9EC6B8"],["#1D1313","#24B694","#D22042","#A3B808","#30C4C9"],["#F6D76B","#FF9036","#D6254D","#FF5475","#FDEBA9"],["#E7EDEA","#FFC52C","#FB0C06","#030D4F","#CEECEF"],["#373737","#8DB986","#ACCE91","#BADB73","#EFEAE4"],["#161616","#C94D65","#E7C049","#92B35A","#1F6764"],["#26251C","#EB0A44","#F2643D","#F2A73D","#A0E8B7"],["#4B3E4D","#1E8C93","#DBD8A2","#C4AC30","#D74F33"],["#8D7966","#A8A39D","#D8C8B8","#E2DDD9","#F8F1E9"],["#F2E8C4","#98D9B6","#3EC9A7","#2B879E","#616668"],["#5CACC4","#8CD19D","#CEE879","#FCB653","#FF5254"]]
},{}],7:[function(require,module,exports){
'use strict';

var createSimplicialComplex = require('three-simplicial-complex')(THREE);
var unlerp = require('unlerp');

module.exports = function (complex) {
  var opt = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

  var type = opt.type || 0;
  var geometry = createSimplicialComplex(complex);
  geometry.computeBoundingBox();
  var bbox = geometry.boundingBox;

  var faceVertexUvs = [];
  var vertices = geometry.vertices;
  var faces = geometry.faces;

  var A = 'x';
  var B = type === 0 ? 'y' : 'z';
  var radial = type === 0;

  var minX = bbox.min[A];
  var maxX = bbox.max[A];
  var minZ = bbox.min[B];
  var maxZ = bbox.max[B];
  faces.forEach(function (face, i) {
    var a = face.a;
    var b = face.b;
    var c = face.c;
    var va = vertices[a];
    var vb = vertices[b];
    var vc = vertices[c];

    faceVertexUvs.push([getUV(va), getUV(vb), getUV(vc)]);
  });
  geometry.faceVertexUvs[0] = faceVertexUvs;
  geometry.uvsNeedUpdate = true;
  geometry.dynamic = true;
  return geometry;

  function getUV(vert) {
    var u = void 0;

    if (radial) {
      var angle = Math.atan2(vert.z, vert.x);
      if (angle < 0) angle += 2 * Math.PI;
      u = angle / (Math.PI * 2);
    } else {
      u = minX === maxX ? 0 : unlerp(minX, maxX, vert[A]);
    }
    var v = minZ === maxZ ? 0 : unlerp(minZ, maxZ, vert[B]);
    return new THREE.Vector2(u, 1 - v);
  }
};

},{"three-simplicial-complex":74,"unlerp":123}],8:[function(require,module,exports){
'use strict';

var random = require('random-float');
var geoPieceRing = require('geo-piecering');
var geoArc = require('geo-arc');
var shuffle = require('array-shuffle');
var createComplex = require('./createComplex');
var PI = Math.PI;
var tweenr = require('tweenr')();

var isMobile = require('./isMobile');

var RESET_Y = [-12, -2];
var INITIAL_Y = [-10, 0];
var LOWEST_Y = RESET_Y[0];

var ADDITIONAL_PARTS = 4;
var TOTAL_PARTS = isMobile ? 60 : 100;
var INITIAL_PARTS = 50;

module.exports = function (_ref) {
  var renderer = _ref.renderer;
  var camera = _ref.camera;
  var scene = _ref.scene;
  var palettes = _ref.palettes;
  var envMap = _ref.envMap;
  var loop = _ref.loop;

  var wireMat = new THREE.MeshBasicMaterial({
    wireframe: true,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide
  });

  var plainMat = new THREE.MeshBasicMaterial({
    opacity: 1,
    side: THREE.DoubleSide
  });

  var shaderMat = new THREE.RawShaderMaterial({
    opacity: 1,
    transparent: true,
    uniforms: {
      iGlobalTime: { type: 'f', value: 0 },
      aspect: { type: 'v2', value: 1 },
      color: { type: 'c', value: new THREE.Color() },
      dance: { type: 'f', value: 0 }
    },
    vertexShader: "#define GLSLIFY 1\nattribute vec4 position;\nattribute vec2 uv;\nuniform float aspect;\nuniform float iGlobalTime;\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nuniform float dance;\n// varying vec2 vUv;\n\n#define PI 3.14\n//\n// Description : Array and textureless GLSL 2D/3D/4D simplex\n//               noise functions.\n//      Author : Ian McEwan, Ashima Arts.\n//  Maintainer : ijm\n//     Lastmod : 20110822 (ijm)\n//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.\n//               Distributed under the MIT License. See LICENSE file.\n//               https://github.com/ashima/webgl-noise\n//\n\nvec3 mod289(vec3 x) {\n  return x - floor(x * (1.0 / 289.0)) * 289.0;\n}\n\nvec4 mod289(vec4 x) {\n  return x - floor(x * (1.0 / 289.0)) * 289.0;\n}\n\nvec4 permute(vec4 x) {\n     return mod289(((x*34.0)+1.0)*x);\n}\n\nvec4 taylorInvSqrt(vec4 r)\n{\n  return 1.79284291400159 - 0.85373472095314 * r;\n}\n\nfloat snoise(vec3 v)\n  {\n  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;\n  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);\n\n// First corner\n  vec3 i  = floor(v + dot(v, C.yyy) );\n  vec3 x0 =   v - i + dot(i, C.xxx) ;\n\n// Other corners\n  vec3 g = step(x0.yzx, x0.xyz);\n  vec3 l = 1.0 - g;\n  vec3 i1 = min( g.xyz, l.zxy );\n  vec3 i2 = max( g.xyz, l.zxy );\n\n  //   x0 = x0 - 0.0 + 0.0 * C.xxx;\n  //   x1 = x0 - i1  + 1.0 * C.xxx;\n  //   x2 = x0 - i2  + 2.0 * C.xxx;\n  //   x3 = x0 - 1.0 + 3.0 * C.xxx;\n  vec3 x1 = x0 - i1 + C.xxx;\n  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y\n  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y\n\n// Permutations\n  i = mod289(i);\n  vec4 p = permute( permute( permute(\n             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))\n           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))\n           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));\n\n// Gradients: 7x7 points over a square, mapped onto an octahedron.\n// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)\n  float n_ = 0.142857142857; // 1.0/7.0\n  vec3  ns = n_ * D.wyz - D.xzx;\n\n  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)\n\n  vec4 x_ = floor(j * ns.z);\n  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)\n\n  vec4 x = x_ *ns.x + ns.yyyy;\n  vec4 y = y_ *ns.x + ns.yyyy;\n  vec4 h = 1.0 - abs(x) - abs(y);\n\n  vec4 b0 = vec4( x.xy, y.xy );\n  vec4 b1 = vec4( x.zw, y.zw );\n\n  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;\n  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;\n  vec4 s0 = floor(b0)*2.0 + 1.0;\n  vec4 s1 = floor(b1)*2.0 + 1.0;\n  vec4 sh = -step(h, vec4(0.0));\n\n  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;\n  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;\n\n  vec3 p0 = vec3(a0.xy,h.x);\n  vec3 p1 = vec3(a0.zw,h.y);\n  vec3 p2 = vec3(a1.xy,h.z);\n  vec3 p3 = vec3(a1.zw,h.w);\n\n//Normalise gradients\n  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));\n  p0 *= norm.x;\n  p1 *= norm.y;\n  p2 *= norm.z;\n  p3 *= norm.w;\n\n// Mix final noise value\n  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);\n  m = m * m;\n  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),\n                                dot(p2,x2), dot(p3,x3) ) );\n  }\n\nvoid main() {\n  // vUv = uv;\n  vec3 offset = vec3(0.0);\n  float p = uv.x * 2.0 - 1.0;\n\n  if (dance > 0.0) {\n    float nOff = snoise(vec3(position.y, iGlobalTime, p * mix(2.0, 5.0, dance)));\n    offset.y = 0.5 * nOff;\n  }\n\n  vec4 newPosition = vec4(position.xyz + offset.xyz, 1.0);\n  vec4 worldPos = modelViewMatrix * newPosition;\n  vec4 projected = projectionMatrix * worldPos;\n\n  //into NDC space [-1 .. 1]\n  // vec2 currentScreen = projected.xy / projected.w;\n\n  //correct for aspect ratio (screenWidth / screenHeight)\n  // currentScreen.x *= aspect;\n\n  // angle = (atan(-1.0 * currentScreen.y, currentScreen.x) + PI * 1.0) / (PI * 2.0);\n  gl_Position = projected;\n}\n",
    fragmentShader: "// #extension GL_OES_standard_derivatives : enable\nprecision mediump float;\n#define GLSLIFY 1\nuniform vec3 color;\n// varying vec2 vUv;\n// varying float angle;\n\n// #pragma glslify: aastep = require('glsl-aastep');\n\nvoid main () {\n  vec3 rgb = color;\n  // float pattern = sin(angle * 100.0) * 0.5 + 0.5;\n  // pattern = aastep(0.5, pattern);\n  gl_FragColor = vec4(rgb, 1.0);\n  // gl_FragColor.a *= pattern;\n  // if (gl_FragColor.a < 0.001) discard;\n}",
    side: THREE.DoubleSide
  });

  var shaderMatWire = shaderMat.clone();
  shaderMatWire.wireframe = true;

  var materials = [wireMat, plainMat, shaderMat, shaderMatWire];

  var paletteIndex = 0;
  var colors = palettes[paletteIndex].slice();

  //
  var meshes = [];
  setBackground(colors.shift());

  var currentColors = colors.slice();
  // const colorInterval = setInterval(nextColor, 5000);
  // nextColor();
  // const meshInterval = setInterval(emitGeometry, MESH_INTERVAL)

  for (var i = 0; i < TOTAL_PARTS; i++) {
    var mesh = addCore({ active: i < INITIAL_PARTS, type: Math.random() > 0.5 ? 0 : 1 });
    if (mesh && i < INITIAL_PARTS) {
      resetMesh(mesh, { initial: true, animate: false });
    }
  }

  var time = 0;
  var tmpVec = new THREE.Vector3();
  var tmpColor = new THREE.Color();
  tmpVec.copy(camera.position);
  camera.localToWorld(tmpVec);

  loop.on('tick', function (dt) {
    time += dt / 1000;
    meshes.forEach(function (m) {
      if (m.material.uniforms) {
        m.material.uniforms.aspect.value = window.innerWidth / window.innerHeight;
        m.material.uniforms.iGlobalTime.value = time;
      }
      m.rotation.y += dt / 1000 * m.rotationFactor;
      m.position.y += dt / 1000 * m.speed * api.globalSpeed;
      if (m.isGroup) {
        m.children.forEach(function (child) {
          child.rotation.x += dt / 1000;
        });
      }
      var meshHeight = m.boundingRegion.max.y - m.boundingRegion.min.y;
      if (m.active && (m.position.y > meshHeight * 2 + tmpVec.y + 5 || m.position.y < LOWEST_Y - meshHeight * 2)) {
        m.active = false;
        m.visible = false;
      }
    });
  });

  var api = {
    nextGeometry: nextGeometry,
    nextColor: nextColor,
    nextPalette: nextPalette,
    getFullPalette: getFullPalette,
    setPalette: setPalette,
    randomizeMaterials: randomizeMaterials,
    globalSpeed: 1,
    clearGeometry: clearGeometry
  };

  return api;

  function randomizeMaterials() {
    meshes.forEach(function (m) {
      tmpColor.copy(getColor(m));
      m.material = materials[Math.floor(Math.random() * materials.length)].clone();
      setColor(m, tmpColor);
    });
  }

  function clearGeometry() {
    meshes.forEach(function (m) {
      m.active = false;
      m.visible = false;
    });
  }

  function getFullPalette() {
    return palettes[paletteIndex % palettes.length];
  }

  function setPalette(palette) {
    colors.length = 0;
    currentColors.length = 0;

    colors = palette.slice();
    setBackground(colors.shift());
    currentColors = colors.slice();
    // console.log("New colors", currentColors);

    meshes.forEach(function (m) {
      setRandColor(m);
    });
  }

  function nextPalette() {
    var opt = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    var newPalette = palettes[paletteIndex++ % palettes.length];
    // if (opt.shuffle !== false) newPalette = shuffle(newPalette);
    setPalette(newPalette);
  }

  function nextGeometry() {
    var opt = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    for (var _i = 0, count = 0; _i < meshes.length && count < ADDITIONAL_PARTS; _i++) {
      var m = meshes[_i];

      if (!m.active && (opt.type === m.type || typeof opt.type === 'undefined')) {
        resetMesh(m);
        count++;
      }
    }
  }

  function resetMesh(mesh) {
    var opt = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    var yOff = opt.initial ? INITIAL_Y : RESET_Y;
    mesh.position.y = random(yOff[0], yOff[1]);
    mesh.active = true;
    mesh.visible = true;
    if (mesh.material.uniforms) {
      mesh.material.uniforms.dance.value = Math.random() > 0.5 ? random(0, 1) : 0;
    }
    setRandColor(mesh);
    if (opt.animate !== false) {
      (function () {
        var minScale = 1e-10;
        var tween = { value: 0 };
        mesh.scale.set(minScale, minScale, minScale);
        tweenr.to(tween, { duration: 0.5, value: 1, ease: 'expoOut' }).on('update', function () {
          var value = tween.value;
          mesh.scale.set(value, value, value);
        });
      })();
    }
  }

  function nextColor() {
    if (colors.length === 0) {
      return;
    }
    currentColors.push(colors.shift());
  }

  function addCore() {
    var opt = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    var mesh = void 0;
    if (opt.type === 0) {
      var numPieces = Math.floor(random(5, 40));
      var pieceSize = random(0.25, 0.75);
      mesh = addGeom(geoPieceRing({
        y: 0,
        height: random(0.01, 1.0),
        radius: random(0.1, 1.5),
        numPieces: numPieces,
        quadsPerPiece: 1,
        pieceSize: PI * 2 * 1 / numPieces * pieceSize
      }), opt);
    } else if (opt.type === 1) {
      var radius = random(0, 2);
      mesh = addGeom(geoArc({
        y: 0,
        startRadian: random(-PI, PI),
        endRadian: random(-PI, PI),
        innerRadius: radius,
        outerRadius: radius + random(0.005, 0.15),
        numBands: 2,
        numSlices: 90
      }), opt);
    }

    if (mesh && !opt.active) {
      mesh.active = false;
      mesh.visible = false;
    }
    if (mesh) mesh.type = opt.type;
    return mesh;
  }

  function addGeom(complex) {
    var opt = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    if (complex.cells.length === 0) return null;
    var geom = createComplex(complex, opt);
    if (!geom) return;
    var mat = materials[Math.floor(Math.random() * materials.length)].clone();
    var mesh = addMesh(geom, mat, opt);
    setRandColor(mesh);
    return mesh;
  }

  function addMesh(geom, mat, opt) {
    var mesh = new THREE.Mesh(geom, mat);

    if (opt.mirror) {
      var offset = opt.offset || 0;
      var group = new THREE.Object3D();
      var mirrorCount = 4;
      for (var i = 0; i < mirrorCount; i++) {
        var a = PI * 2 * (i / mirrorCount);
        var m2 = mesh.clone();
        // m2.rotation.y = -a;
        // m2.rotation.z = -Math.PI;
        m2.position.x = Math.cos(a) * offset;
        m2.position.z = Math.sin(a) * offset;
        group.add(m2);
      }
      meshes.push(group);
      mesh = group;
      mesh.isGroup = true;
    } else {
      meshes.push(mesh);
    }
    mesh.boundingRegion = new THREE.Box3().setFromObject(mesh);
    mesh.rotationFactor = random(-0.5, 0.5);
    mesh.speed = random(0.8, 1);
    mesh.active = true;
    mesh.position.y = random(INITIAL_Y[0], INITIAL_Y[1]);
    scene.add(mesh);
    return mesh;
  }

  function randColor() {
    return currentColors[Math.floor(Math.random() * currentColors.length)];
  }

  function setRandColor(mesh) {
    var mat = mesh.material;
    if (mat.color) mat.color.setStyle(randColor());else mat.uniforms.color.value.setStyle(randColor());
  }

  function setColor(mesh, color) {
    var mat = mesh.material;
    if (mat.color) mat.color.copy(color);else mat.uniforms.color.value.copy(color);
  }

  function getColor(mesh) {
    var mat = mesh.material;
    if (mat.color) return mat.color;else return mat.uniforms.color.value;
  }

  function setBackground(color) {
    renderer.setClearColor(color, 1);
    document.body.style.background = color;
  }
};

},{"./createComplex":7,"./isMobile":11,"array-shuffle":16,"geo-arc":27,"geo-piecering":28,"random-float":65,"tweenr":76}],9:[function(require,module,exports){
module.exports=[["#300030","#480048","#601848","#C04848","#F07241"],["#E8DDCB","#CDB380","#036564","#033649","#031634"],["#343838","#005F6B","#008C9E","#00B4CC","#00DFFC"],["#B9D7D9","#668284","#2A2829","#493736","#7B3B3B"],["#F0D8A8","#3D1C00","#86B8B1","#F2D694","#FA2A00"],["#5D4157","#838689","#A8CABA","#CAD7B2","#EBE3AA"],["#351330","#424254","#64908A","#E8CAA4","#CC2A41"],["#413E4A","#73626E","#B38184","#F0B49E","#F7E4BE"],["#FE4365","#FC9D9A","#F9CDAD","#C8C8A9","#83AF9B"],["#490A3D","#BD1550","#E97F02","#F8CA00","#8A9B0F"],["#00A0B0","#6A4A3C","#CC333F","#EB6841","#EDC951"]]
},{}],10:[function(require,module,exports){
'use strict';

var tweenr = require('tweenr')();
var css = require('dom-css');
var isMobile = require('./isMobile');
var noop = function noop() {};

module.exports = function () {
  var opt = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];
  var cb = arguments.length <= 1 || arguments[1] === undefined ? noop : arguments[1];

  var intro1a = document.querySelector('.intro-1a');
  var intro1b = document.querySelector('.intro-1b');
  var intro2 = document.querySelector('.intro-2');
  var intro3 = document.querySelector('.intro-3');
  var header = document.querySelector('.header-container');
  var logo = document.querySelector('.logo-container');
  var introContanier = document.querySelector('#intro');
  var yOff = 10;
  var globalDuration = 0.25;
  var elementsToHide = [header, logo].filter(Boolean);
  // const WAIT_TIME_A = 1.5;
  var WAIT_TIME_B = 3.5;

  var finishedEarly = false;
  var interactions = opt.interactions;

  var delayedReleaseSpacebar = null;

  var introHint = isMobile ? intro1a : intro1b;
  if (isMobile) {
    intro2.innerHTML = '<span class="spacebar">tap</span> and hold to load a new track';
    intro3.innerHTML = 'Release <span class="spacebar">tap</span> to play';
  }

  var introDelay = 0.0;
  animateIn(header, {
    childTagName: 'div'
  });
  showIntroTrackName();

  function showIntroTrackName() {
    animateIn(introHint, { delay: introDelay + 0.5 }, function () {
      animateOut(introHint, { delay: WAIT_TIME_B }, function () {
        showIdleSplash();
      });
    });
  }

  function showIdleSplash() {
    animateIn(intro2);
    interactions.enable();
    interactions.once('start', function () {
      hideLogos();
      animateOut(intro2, {}, function () {
        if (!finishedEarly) {
          delayedReleaseSpacebar = setTimeout(function () {
            animateIn(intro3);
          }, 650);
        }
      });
    });
    interactions.once('stop', function () {
      finishedEarly = true;
      animateOut(intro3);
      onFinished();
    });
  }

  function onFinished() {
    if (delayedReleaseSpacebar) clearTimeout(delayedReleaseSpacebar);
    introContanier.style.display = 'none';
    hideLogos();
    cb();
  }

  function hideLogos() {
    elementsToHide.forEach(function (e) {
      // animateOut(e, { duration: 1 });
      e.style.display = 'none';
    });
  }

  function animateIn(element) {
    var opt = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];
    var cb = arguments.length <= 2 || arguments[2] === undefined ? noop : arguments[2];

    var delay = opt.delay || 0;
    element.style.display = 'block';

    var duration = typeof opt.duration === 'number' ? opt.duration : globalDuration;
    var children = getAnimatables(element, opt);
    children.forEach(function (child, i) {
      var tween = { opacity: 0, yOff: yOff, element: child };
      update({ target: tween });
      var lastTween = tweenr.to(tween, { delay: delay, opacity: 1, duration: duration, ease: 'quadOut' }).on('update', update);
      tweenr.to(tween, { delay: delay, yOff: 0, duration: duration * 0.5, ease: 'expoOut' });
      delay += 0.1;
      if (i === children.length - 1) lastTween.on('complete', cb);
    });
  }

  function animateOut(element) {
    var opt = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];
    var cb = arguments.length <= 2 || arguments[2] === undefined ? noop : arguments[2];

    var delay = opt.delay || 0;
    var duration = typeof opt.duration === 'number' ? opt.duration : globalDuration;
    var children = getAnimatables(element, opt);
    children.reverse();
    children.forEach(function (child, i) {
      var tween = { opacity: 1, yOff: 0, element: child };
      update({ target: tween });
      tweenr.to(tween, { delay: delay, opacity: 0, duration: duration * 0.25, ease: 'quadOut' });
      var lastTween = tweenr.to(tween, { delay: delay, yOff: yOff, duration: duration * 0.5, ease: 'expoOut' }).on('update', update);
      delay += 0.075;
      if (i === children.length - 1) {
        lastTween.on('complete', function () {
          element.style.display = 'none';
          cb();
        });
      }
    });
  }

  function update(ev) {
    var tween = ev.target;
    css(tween.element, {
      transform: 'translateY(' + tween.yOff + 'px)',
      opacity: tween.opacity
    });
  }

  function getAnimatables(element) {
    var opt = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    var children = Array.prototype.slice.call(element.querySelectorAll(opt.childTagName || 'p'));
    if (children.length === 0) children.push(element);
    return children;
  }
};

},{"./isMobile":11,"dom-css":20,"tweenr":76}],11:[function(require,module,exports){
"use strict";

module.exports = /(Android|iPhone|iPod|iPad)/i.test(navigator.userAgent);

},{}],12:[function(require,module,exports){
'use strict';

var font = 'font-family: "NotoSans", "Helvetica", sans-serif;';
// const kbd = `
//   display: inline-block;
//   padding: 2px 4px;
//   font-size: 11px;
//   line-height: 10px;
//   color: #555;
//   vertical-align: middle;
//   background-color: #fcfcfc;
//   border: solid 1px #ccc;
//   border-bottom-color: #bbb;
//   border-radius: 3px;
//   box-shadow: inset 0 -1px 0 #bbb;
// `.trim();

var artist = 'Pilotpriest';

module.exports = function (msg) {
  console.log('%c' + msg, font);
};

module.exports.intro = function (msg) {
  console.log(['%c🎹 audiograph.xyz', '%c\t\tCreated by Matt DesLauriers (%chttp://twitter.com/mattdesl/%c)', '%c\t\tAudio by ' + artist, '%c\t\tColor palettes sourced from ColourLovers.com', '%c\t\tWith UX help from Melissa Hernandez'].join('\n'), font + ' background: #efefef; padding: 1px 5px;', font, font + ' color: #3aa3e0;', font, font, font, font);
};

module.exports.easterEgg = function () {
  // to be decided...
  // console.log('%cHint:%c Hold %cC%c for something cool', `${font} color: #ff6600`, font, kbd, font)
};

},{}],13:[function(require,module,exports){
'use strict';

var shuffle = require('array-shuffle');
var indexOfArray = require('index-of-array');
var palettes = require('./color-palettes.json').slice(0, 200);
var introPalettes = require('./intro-palettes.json');

module.exports = function () {
  var first = shuffle(introPalettes)[0];

  var ret = shuffle(palettes);
  var idx = indexOfArray(ret, first);
  if (idx !== -1) ret.splice(idx, 1);
  ret.unshift(first);
  return ret;
};

// const offline = require('./offline-palettes');
// const colorDiff = require('color-diff');
// const hexRgb = require('hex-rgb');
// const luminance = require('color-luminance');
// const rgb2hsl = require('float-rgb2hsl');

// const hexRgbFloat = (hex) => hexRgb(hex).map(x => x / 255);

// module.exports = function (cb) {
//   process.nextTick(() => {
//     let parsed = parse(offline);
//     window.parsed = parsed;
//     console.log(parsed);
//     parsed = shuffle(parsed);
//     // parsed.sort(sorter);

//     cb(parsed);
//   });

//   function sorter (a, b) {
//     const cA = hexRgbFloat(a[0]);
//     const cB = hexRgbFloat(b[0]);
//     // const hslA = rgb2hsl(cA);
//     // const hslB = rgb2hsl(cB);
//     // return hslA[2] - hslB[2];
//     const lA = luminance(cA[0], cA[1], cA[2]);
//     const lB = luminance(cB[0], cB[1], cB[2]);
//     return lA - lB;
//     const cAObj = { R: cA[0], G: cA[1], B: cA[2] };
//     const cBObj = { R: cB[0], G: cB[1], B: cB[2] };
//     const diff = colorDiff.diff(colorDiff.rgb_to_lab(cAObj), colorDiff.rgb_to_lab(cBObj));
//     return diff;
//   }
// };

// function parse (json) {
//   return json.map(result => {
//     return result.colors.slice(0, 15).map(x => `#${x}`);
//   });
// }

},{"./color-palettes.json":6,"./intro-palettes.json":9,"array-shuffle":16,"index-of-array":29}],14:[function(require,module,exports){
'use strict';

var EventEmitter = require('events').EventEmitter;
var isMobile = require('./isMobile');
var log = require('./log');

module.exports = function (_ref) {
  var scene = _ref.scene;
  var whitePalette = _ref.whitePalette;
  var audio = _ref.audio;
  var camera = _ref.camera;
  var controls = _ref.controls;
  var geo = _ref.geo;

  var previousPalette = geo.getFullPalette();
  var ret = new EventEmitter();
  ret.keyDown = false;
  ret.easterEggDown = false;
  ret.enable = enable;
  var isLoaded = false;

  var originalDistance = controls.distance;
  var trackContainer = document.querySelector('.track-aligner');
  var trackName = document.querySelector('.track-name');
  var trackNumber = document.querySelector('.track-number');

  return ret;

  function enable() {
    log.easterEgg();
    window.addEventListener('keydown', function (ev) {
      if (ev.keyCode === 32 && !ret.keyDown) {
        beginEvent();
        return false;
      } else if (ev.keyCode === 67 && !ret.easterEggDown) {
        // ret.easterEggDown = true;
        // controls.position[0] = 10;
        // controls.position[2] = 0;
        // controls.distance = 5;
        // return false;
      }
    });
    window.addEventListener('keyup', function (ev) {
      if (ev.keyCode === 32 && ret.keyDown) {
        endEvent();
        return false;
      } else if (ev.keyCode === 67 && ret.easterEggDown) {
        // ret.easterEggDown = false;
        // controls.position[0] = 0;
        // controls.position[2] = 0;
        // controls.distance = originalDistance;
        // return false;
      }
    });

    if (isMobile) {
      var canvas = document.querySelector('#canvas');
      canvas.addEventListener('touchstart', beginEvent);
      canvas.addEventListener('touchend', endEvent);
    }
  }

  function beginEvent() {
    ret.emit('start');
    previousPalette = geo.getFullPalette();
    geo.setPalette(whitePalette);
    ret.keyDown = true;

    isLoaded = false;
    audio.once('ready', function () {
      isLoaded = true;
    });
    var name = audio.queue();
    setupName(name);
    audio.effect = 1;
    geo.globalSpeed = 0.75;
    controls.position[1] = -1;
  }

  function endEvent() {
    ret.keyDown = false;
    setupName(null);
    geo.setPalette(previousPalette);
    audio.playQueued();
    audio.effect = 0;
    controls.position[1] = 1;
    controls.distance = originalDistance;
    geo.globalSpeed = 1;
    geo.nextPalette();
    ret.emit('stop', isLoaded);
  }

  function setupName(name) {
    if (!name) {
      trackContainer.style.display = 'none';
      return;
    }
    trackContainer.style.display = 'table';


    trackNumber.textContent = 'next track';
    trackName.textContent = name;
  }
};

},{"./isMobile":11,"./log":12,"events":26}],15:[function(require,module,exports){
"use strict";

/**
 * @author alteredq / http://alteredqualia.com/
 *
 * Screen-space ambient occlusion shader
 * - ported from
 *   SSAO GLSL shader v1.2
 *   assembled by Martins Upitis (martinsh) (http://devlog-martinsh.blogspot.com)
 *   original technique is made by ArKano22 (http://www.gamedev.net/topic/550699-ssao-no-halo-artifacts/)
 * - modifications
 * - modified to use RGBA packed depth texture (use clear color 1,1,1,1 for depth pass)
 * - refactoring and optimizations
 */

module.exports = {

  uniforms: {

    "tDiffuse": { type: "t", value: null },
    "tDepth": { type: "t", value: null },
    "resolution": { type: "v2", value: new THREE.Vector2(512, 512) },
    "cameraNear": { type: "f", value: 1 },
    "cameraFar": { type: "f", value: 100 },
    "onlyAO": { type: "i", value: 0 },
    "aoClamp": { type: "f", value: 0.5 },
    "lumInfluence": { type: "f", value: 0.5 }

  },

  vertexShader: ["varying vec2 vUv;", "void main() {", "vUv = uv;", "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );", "}"].join("\n"),

  fragmentShader: ["uniform float cameraNear;", "uniform float cameraFar;", "uniform bool onlyAO;", // use only ambient occlusion pass?

  "uniform vec2 resolution;", // texture width, height
  "uniform float aoClamp;", // depth clamp - reduces haloing at screen edges

  "uniform float lumInfluence;", // how much luminance affects occlusion

  "uniform sampler2D tDiffuse;", "uniform highp sampler2D tDepth;", "varying vec2 vUv;",

  // "#define PI 3.14159265",
  "#define DL 2.399963229728653", // PI * ( 3.0 - sqrt( 5.0 ) )
  "#define EULER 2.718281828459045",

  // user variables

  "const int samples = 4;", // ao sample count
  "const float radius = 5.0;", // ao radius

  "const bool useNoise = false;", // use noise instead of pattern for sample dithering
  "const float noiseAmount = 0.0003;", // dithering amount

  "const float diffArea = 0.4;", // self-shadowing reduction
  "const float gDisplace = 0.4;", // gauss bell center

  // generating noise / pattern texture for dithering
  // "highp float random(vec2 co) {",
  //     "highp float a = 12.9898;",
  //     "highp float b = 78.233;",
  //     "highp float c = 43758.5453;",
  //     "highp float dt= dot(co.xy ,vec2(a,b));",
  //     "highp float sn= mod(dt,3.14);",
  //     "return fract(sin(sn) * c);",
  // "}",

  "highp vec2 rand( const vec2 coord ) {", "highp vec2 noise;", "if ( useNoise ) {", "float nx = dot ( coord, vec2( 12.9898, 78.233 ) );", "float ny = dot ( coord, vec2( 12.9898, 78.233 ) * 2.0 );", "noise = clamp( fract ( 43758.5453 * sin( vec2( nx, ny ) ) ), 0.0, 1.0 );", "} else {", "highp float ff = fract( 1.0 - coord.s * ( resolution.x / 2.0 ) );", "highp float gg = fract( coord.t * ( resolution.y / 2.0 ) );", "noise = vec2( 0.25, 0.75 ) * vec2( ff ) + vec2( 0.75, 0.25 ) * gg;", "}", "return ( noise * 2.0  - 1.0 ) * noiseAmount;", "}", "float readDepth( const in vec2 coord ) {", "float cameraFarPlusNear = cameraFar + cameraNear;", "float cameraFarMinusNear = cameraFar - cameraNear;", "float cameraCoef = 2.0 * cameraNear;", "return cameraCoef / ( cameraFarPlusNear - texture2D( tDepth, coord ).x * cameraFarMinusNear );", "}", "float compareDepths( const in float depth1, const in float depth2, inout int far ) {", "float garea = 2.0;", // gauss bell width
  "float diff = ( depth1 - depth2 ) * 100.0;", // depth difference (0-100)

  // reduce left bell width to avoid self-shadowing

  "if ( diff < gDisplace ) {", "garea = diffArea;", "} else {", "far = 1;", "}", "float dd = diff - gDisplace;", "float gauss = pow( EULER, -2.0 * dd * dd / ( garea * garea ) );", "return gauss;", "}", "float calcAO( float depth, float dw, float dh ) {", "float dd = radius - depth * radius;", "vec2 vv = vec2( dw, dh );", "vec2 coord1 = vUv + dd * vv;", "vec2 coord2 = vUv - dd * vv;", "float temp1 = 0.0;", "float temp2 = 0.0;", "int far = 0;", "temp1 = compareDepths( depth, readDepth( coord1 ), far );",

  // DEPTH EXTRAPOLATION

  "if ( far > 0 ) {", "temp2 = compareDepths( readDepth( coord2 ), depth, far );", "temp1 += ( 1.0 - temp1 ) * temp2;", "}", "return temp1;", "}", "void main() {", "highp vec2 noise = rand( vUv );", "float depth = readDepth( vUv );", "float tt = clamp( depth, aoClamp, 1.0 );", "float w = ( 1.0 / resolution.x )  / tt + ( noise.x * ( 1.0 - noise.x ) );", "float h = ( 1.0 / resolution.y ) / tt + ( noise.y * ( 1.0 - noise.y ) );", "float ao = 0.0;", "float dz = 1.0 / float( samples );", "float z = 1.0 - dz / 2.0;", "float l = 0.0;", "for ( int i = 0; i <= samples; i ++ ) {", "float r = sqrt( 1.0 - z );", "float pw = cos( l ) * r;", "float ph = sin( l ) * r;", "ao += calcAO( depth, pw * w, ph * h );", "z = z - dz;", "l = l + DL;", "}", "ao /= float( samples );", "ao = 1.0 - ao;", "vec3 color = texture2D( tDiffuse, vUv ).rgb;", "vec3 lumcoeff = vec3( 0.299, 0.587, 0.114 );", "float lum = dot( color.rgb, lumcoeff );", "vec3 luminance = vec3( lum );", "vec3 final = vec3( color * mix( vec3( ao ), vec3( 1.0 ), luminance * lumInfluence ) );", // mix( color * ao, white, luminance )

  "if ( onlyAO ) {", "final = vec3( mix( vec3( ao ), vec3( 1.0 ), luminance * lumInfluence ) );", // ambient occlusion only

  "}", "gl_FragColor = vec4( final, 1.0 );", "}"].join("\n")

};

},{}],16:[function(require,module,exports){
'use strict';
module.exports = function (arr) {
	if (!Array.isArray(arr)) {
		throw new TypeError('Expected an array');
	}

	var rand;
	var tmp;
	var len = arr.length;
	var ret = arr.slice();

	while (len) {
		rand = Math.floor(Math.random() * len--);
		tmp = ret[len];
		ret[len] = ret[rand];
		ret[rand] = tmp;
	}

	return ret;
};

},{}],17:[function(require,module,exports){
var clamp = require('clamp')

module.exports = frequencyToIndex
function frequencyToIndex (frequency, sampleRate, frequencyBinCount) {
  var nyquist = sampleRate / 2
  var index = Math.round(frequency / nyquist * frequencyBinCount)
  return clamp(index, 0, frequencyBinCount)
}

},{"clamp":19}],18:[function(require,module,exports){
module.exports = beats

function beats(bins, hold) {
  bins = Array.isArray(bins) ? bins : [bins]

  var minthresholds = bins.map(pick('threshold', 0))
  var thresholds = bins.map(pick('threshold', 0))
  var decays = bins.map(pick('decay', 0.005))
  var his = bins.map(roundFn(pick('hi', 512)))
  var los = bins.map(roundFn(pick('lo', 0)))
  var sizes = diff(his, los)
  var binCount = bins.length
  var times = new Float64Array(binCount)
  var beats = new Uint8Array(binCount)

  hold = hold || 0

  allNumbers(his, 'All "hi" keys must be numbers')
  allNumbers(los, 'All "lo" keys must be numbers')
  allNumbers(thresholds, 'All "threshold" keys must be numbers')
  allNumbers(decays, 'All "decay" keys must be numbers')

  for (var i = 0; i < decays.length; i += 1) {
    decays[i] = 1 - decays[i]
  }

  return function(data, dt) {
    dt = dt || 1

    for (var i = 0; i < binCount; i += 1) {
      var scale = 1 / sizes[i]
      var hi = his[i]
      var lo = los[i]
      var volume = 0

      for (var j = lo; j < hi; j += 1) {
        volume += scale * data[j]
      }

      times[i] += dt

      if (times[i] > hold && volume > thresholds[i]) {
        beats[i] = volume
        times[i] = 0
        thresholds[i] = volume > minthresholds[i]
          ? volume
          : thresholds[i]
      } else {
        beats[i] = 0
      }

      thresholds[i] *= decays[i]
    }

    return beats
  }
}


function pick(key, def) {
  return function(object) {
    return key in object ? object[key] : def
  }
}

function diff(a, b) {
  var arr = []
  for (var i = 0; i < a.length; i += 1) {
    arr[i] = a[i] - b[i]
  }
  return arr
}

function roundFn(fn) {
  return function(value) {
    return Math.round(fn(value))
  }
}

function allNumbers(arr, msg) {
  for (var i = 0; i < arr.length; i += 1) {
    if (typeof arr[i] !== 'number') throw new Error(msg)
  }
  return arr
}

},{}],19:[function(require,module,exports){
module.exports = clamp

function clamp(value, min, max) {
  return min < max
    ? (value < min ? min : value > max ? max : value)
    : (value < max ? max : value > min ? min : value)
}

},{}],20:[function(require,module,exports){
var prefix = require('prefix-style')
var toCamelCase = require('to-camel-case')
var cache = { 'float': 'cssFloat' }
var addPxToStyle = require('add-px-to-style')

function style (element, property, value) {
  var camel = cache[property]
  if (typeof camel === 'undefined') {
    camel = detect(property)
  }

  // may be false if CSS prop is unsupported
  if (camel) {
    if (value === undefined) {
      return element.style[camel]
    }

    element.style[camel] = addPxToStyle(camel, value)
  }
}

function each (element, properties) {
  for (var k in properties) {
    if (properties.hasOwnProperty(k)) {
      style(element, k, properties[k])
    }
  }
}

function detect (cssProp) {
  var camel = toCamelCase(cssProp)
  var result = prefix(camel)
  cache[camel] = cache[cssProp] = cache[result] = result
  return result
}

function set () {
  if (arguments.length === 2) {
    each(arguments[0], arguments[1])
  } else {
    style(arguments[0], arguments[1], arguments[2])
  }
}

module.exports = set
module.exports.set = set

module.exports.get = function (element, properties) {
  if (Array.isArray(properties)) {
    return properties.reduce(function (obj, prop) {
      obj[prop] = style(element, prop || '')
      return obj
    }, {})
  } else {
    return style(element, properties || '')
  }
}

},{"add-px-to-style":21,"prefix-style":22,"to-camel-case":23}],21:[function(require,module,exports){
/* The following list is defined in React's core */
var IS_UNITLESS = {
  animationIterationCount: true,
  boxFlex: true,
  boxFlexGroup: true,
  boxOrdinalGroup: true,
  columnCount: true,
  flex: true,
  flexGrow: true,
  flexPositive: true,
  flexShrink: true,
  flexNegative: true,
  flexOrder: true,
  gridRow: true,
  gridColumn: true,
  fontWeight: true,
  lineClamp: true,
  lineHeight: true,
  opacity: true,
  order: true,
  orphans: true,
  tabSize: true,
  widows: true,
  zIndex: true,
  zoom: true,

  // SVG-related properties
  fillOpacity: true,
  stopOpacity: true,
  strokeDashoffset: true,
  strokeOpacity: true,
  strokeWidth: true
};

module.exports = function(name, value) {
  if(typeof value === 'number' && !IS_UNITLESS[ name ]) {
    return value + 'px';
  } else {
    return value;
  }
};
},{}],22:[function(require,module,exports){
var div = null
var prefixes = [ 'Webkit', 'Moz', 'O', 'ms' ]

module.exports = function prefixStyle (prop) {
  // re-use a dummy div
  if (!div) {
    div = document.createElement('div')
  }

  var style = div.style

  // prop exists without prefix
  if (prop in style) {
    return prop
  }

  // borderRadius -> BorderRadius
  var titleCase = prop.charAt(0).toUpperCase() + prop.slice(1)

  // find the vendor-prefixed prop
  for (var i = prefixes.length; i >= 0; i--) {
    var name = prefixes[i] + titleCase
    // e.g. WebkitBorderRadius or webkitBorderRadius
    if (name in style) {
      return name
    }
  }

  return false
}

},{}],23:[function(require,module,exports){

var toSpace = require('to-space-case');


/**
 * Expose `toCamelCase`.
 */

module.exports = toCamelCase;


/**
 * Convert a `string` to camel case.
 *
 * @param {String} string
 * @return {String}
 */


function toCamelCase (string) {
  return toSpace(string).replace(/\s(\w)/g, function (matches, letter) {
    return letter.toUpperCase();
  });
}
},{"to-space-case":24}],24:[function(require,module,exports){

var clean = require('to-no-case');


/**
 * Expose `toSpaceCase`.
 */

module.exports = toSpaceCase;


/**
 * Convert a `string` to space case.
 *
 * @param {String} string
 * @return {String}
 */


function toSpaceCase (string) {
  return clean(string).replace(/[\W_]+(.|$)/g, function (matches, match) {
    return match ? ' ' + match : '';
  });
}
},{"to-no-case":25}],25:[function(require,module,exports){

/**
 * Expose `toNoCase`.
 */

module.exports = toNoCase;


/**
 * Test whether a string is camel-case.
 */

var hasSpace = /\s/;
var hasCamel = /[a-z][A-Z]/;
var hasSeparator = /[\W_]/;


/**
 * Remove any starting case from a `string`, like camel or snake, but keep
 * spaces and punctuation that may be important otherwise.
 *
 * @param {String} string
 * @return {String}
 */

function toNoCase (string) {
  if (hasSpace.test(string)) return string.toLowerCase();

  if (hasSeparator.test(string)) string = unseparate(string);
  if (hasCamel.test(string)) string = uncamelize(string);
  return string.toLowerCase();
}


/**
 * Separator splitter.
 */

var separatorSplitter = /[\W_]+(.|$)/g;


/**
 * Un-separate a `string`.
 *
 * @param {String} string
 * @return {String}
 */

function unseparate (string) {
  return string.replace(separatorSplitter, function (m, next) {
    return next ? ' ' + next : '';
  });
}


/**
 * Camelcase splitter.
 */

var camelSplitter = /(.)([A-Z]+)/g;


/**
 * Un-camelcase a `string`.
 *
 * @param {String} string
 * @return {String}
 */

function uncamelize (string) {
  return string.replace(camelSplitter, function (m, previous, uppers) {
    return previous + ' ' + uppers.toLowerCase().split('').join(' ');
  });
}
},{}],26:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    args = Array.prototype.slice.call(arguments, 1);
    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else if (listeners) {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.prototype.listenerCount = function(type) {
  if (this._events) {
    var evlistener = this._events[type];

    if (isFunction(evlistener))
      return 1;
    else if (evlistener)
      return evlistener.length;
  }
  return 0;
};

EventEmitter.listenerCount = function(emitter, type) {
  return emitter.listenerCount(type);
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],27:[function(require,module,exports){
module.exports = geoArc;

function geoArc(options) {

  var geo = {
    positions: [],
    cells: [],
    uvs: []
  };

  options = options || {};
  options.cellSize = options.cellSize || 3;
  options.x = options.x || 0;
  options.y = options.y || 0;
  options.z = options.z || 0;
  options.startRadian = options.startRadian || 0;
  options.endRadian = options.endRadian || Math.PI * 1.5;
  options.innerRadius = typeof options.innerRadius == 'number' ? options.innerRadius : 40;
  options.outerRadius = options.outerRadius || 200;
  options.numBands = options.numBands || 2;
  options.numSlices = options.numSlices || 40;
  options.drawOutline = options.drawOutline !== undefined ? options.drawOutline : true;

  createGeometry(options, geo.positions, geo.cells, geo.uvs);

  return geo;
}

function createGeometry(options, positions, cells, uvs) {

    var o = options;
    var idxSize = o.cellSize;
    var radDist = o.endRadian - o.startRadian;
    var numSlices = Math.floor(Math.abs(radDist) / (Math.PI * 2) * o.numSlices);
    var radInc = radDist / numSlices;
    var numBandIncs = (o.numBands == 1) ? 1 : o.numBands - 1;
    var bandInc = (o.outerRadius - o.innerRadius) / numBandIncs;
    var cRad, x, y, z, cRadius, curSlideIdx, prevSlideIdx;

  for(var i = 0, len = numSlices; i <= len; i++) {

    cRad = i * radInc + o.startRadian;
    prevSlideIdx = (i - 1) * o.numBands;
    curSlideIdx = i * o.numBands;

    for(var j = 0, lenJ = o.numBands; j < lenJ; j++) {

      cRadius = o.innerRadius + bandInc * j;

      x = Math.cos(cRad) * cRadius + o.x;
      y = o.y;
      z = Math.sin(cRad) * cRadius + o.z;

      positions.push([ x, y, z ]);
      uvs.push([i/numSlices, j/numBandIncs])

      //if we've added in positions then we'll add cells
      if(idxSize == 1) {

        cells.push([ curSlideIdx + j ]);
      } else if(idxSize == 2) {

        if(i > 0 && j + 1 < lenJ) {

          cells.push( [ 
                        prevSlideIdx + j, 
                        curSlideIdx + j 
                      ]);

          cells.push( [ 
                        curSlideIdx + j + 1, 
                        prevSlideIdx + j + 1 
                      ]);

          if( !o.drawOutline ) {
            
            cells.push( [ 
                          curSlideIdx + j, 
                          curSlideIdx + j + 1 
                        ]);
          }
        }
      } else if(idxSize == 3) {

        if(i > 0 && j + 1 < lenJ) {

          cells.push( [ 
                        curSlideIdx + j,
                        prevSlideIdx + j + 1, 
                        prevSlideIdx + j
                      ]);

          cells.push( [ 
                        curSlideIdx + j, 
                        curSlideIdx + j + 1, 
                        prevSlideIdx + j + 1 
                      ]);
        }
      }
    }
  }

  //cap it off
  if(idxSize == 2) {
    
    // if it's going all the way around then we wont put the connecting line
    if( radDist % Math.PI * 2 != 0 ) {

      for(var j = 0, lenJ = o.numBands - 1; j < lenJ; j++) {

        cells.push([ 
                      curSlideIdx + j, 
                      curSlideIdx + j + 1 ]);
      }

      curSlideIdx = 0;

      for(var j = 0, lenJ = o.numBands - 1; j < lenJ; j++) {

        cells.push([ 
                      curSlideIdx + j, 
                      curSlideIdx + j + 1 ]);
      }
    }
  }
}
},{}],28:[function(require,module,exports){
module.exports = geoPieceRing;

function geoPieceRing(options) {

  var geo = {
    positions: [],
    cells: []
  };

  options = options || {};
  options.cellSize = options.cellSize || 3;
  options.x = options.x || 0;
  options.y = options.y || 0;
  options.z = options.z || 0;
  options.radius = options.radius || 200;
  options.pieceSize = options.pieceSize || Math.PI * 0.15;
  options.startRadian = options.startRadian || 0;
  options.numPieces = options.numPieces || 8;
  options.quadsPerPiece = options.quadsPerPiece || 5;
  options.height = options.height || 10;
  options.drawOutline = options.drawOutline === undefined ? true : options.drawOutline;
  
  createGeometry(options, geo.positions, geo.cells);

  return geo;
}

function createGeometry(options, positions, cells) {

  var o = options;
  var pos = positions;
  var y = o.y;
  var halfHeight = o.height * 0.5;
  var radius = o.radius;
  var pieceSize = o.pieceSize;
  var numPieces = o.numPieces;
  var quadsPP = o.quadsPerPiece;
  var startRadian = o.startRadian;
  var radInc = (2 * Math.PI - ( numPieces * pieceSize )) / numPieces;
  var quadRadInc = pieceSize / quadsPP;
  var curRad = 0; 
  var sIdx = 0;
  var x, z, x2, z2, r1, r2;

  for(var i = 0; i < numPieces; i++) {

    for(var j = 0; j < quadsPP; j++) {

      r1 = curRad + quadRadInc * j + startRadian;
      r2 = curRad + quadRadInc * (j + 1) + startRadian;

      x = Math.cos(r1) * radius + o.x;
      z = Math.sin(r1) * radius + o.z;
      x2 = Math.cos(r2) * radius + o.x;
      z2 = Math.sin(r2) * radius + o.z;

      pos.push([ x, y - halfHeight, z ]);
      pos.push([ x, y + halfHeight, z ]);
      pos.push([ x2, y + halfHeight, z2 ]);
      pos.push([ x2, y - halfHeight, z2 ]);
      
      //add in the cells
      if(o.cellSize == 1) {

        cells.push([ sIdx ]);
        cells.push([ sIdx + 1 ]);
        cells.push([ sIdx + 2 ]);
        cells.push([ sIdx + 3 ]);
      } else if(o.cellSize == 2) {

        // vertical lines
        if( !o.drawOutline ) {

          cells.push([ sIdx, sIdx + 1 ]);
          cells.push([ sIdx + 2, sIdx + 3 ]);
        } else if( j === 0 ) {

          cells.push([ sIdx, sIdx + 1 ]);
        } else if( j == quadsPP - 1 ) {

          cells.push([ sIdx + 2, sIdx + 3 ]);
        }
        
        // horizontal lines
        cells.push([ sIdx + 1, sIdx + 2 ]);
        cells.push([ sIdx + 3, sIdx ]);
      } else if(o.cellSize == 3) {

        cells.push([ sIdx, sIdx + 1, sIdx + 2 ]);
        cells.push([ sIdx + 3, sIdx, sIdx + 2 ]);
      }

      sIdx += 4;
    }

    curRad += radInc + pieceSize;
  }
}
},{}],29:[function(require,module,exports){
var arrayEqual = require('array-equal')

module.exports = indexOfArray
function indexOfArray (array, searchElement, fromIndex) {
  // use uint32
  var len = array.length >>> 0
  if (len === 0) {
    return -1
  }

  var start = +fromIndex || 0
  if (Math.abs(start) === Infinity) {
    start = 0
  }

  if (start >= len) {
    return -1
  }

  // allow negative fromIndex
  start = Math.max(start >= 0 ? start : len - Math.abs(start), 0)

  // search
  while (start < len) {
    if (arrayEqual(array[start], searchElement)) {
      return start
    }
    start++
  }
  return -1
}

},{"array-equal":30}],30:[function(require,module,exports){

module.exports = function equal(arr1, arr2) {
  var length = arr1.length
  if (length !== arr2.length) return false
  for (var i = 0; i < length; i++)
    if (arr1[i] !== arr2[i])
      return false
  return true
}

},{}],31:[function(require,module,exports){
module.exports = createAudioContext
function createAudioContext (desiredSampleRate) {
  var AudioCtor = window.AudioContext || window.webkitAudioContext

  desiredSampleRate = typeof desiredSampleRate === 'number'
    ? desiredSampleRate
    : 44100
  var context = new AudioCtor()

  // Check if hack is necessary. Only occurs in iOS6+ devices
  // and only when you first boot the iPhone, or play a audio/video
  // with a different sample rate
  if (/(iPhone|iPad)/i.test(navigator.userAgent) &&
      context.sampleRate !== desiredSampleRate) {
    var buffer = context.createBuffer(1, 1, desiredSampleRate)
    var dummy = context.createBufferSource()
    dummy.buffer = buffer
    dummy.connect(context.destination)
    dummy.start(0)
    dummy.disconnect()
    
    context.close() // dispose old context
    context = new AudioCtor()
  }

  return context
}

},{}],32:[function(require,module,exports){
module.exports = newArray

function newArray (n, value) {
  n = n || 0
  var array = new Array(n)
  for (var i = 0; i < n; i++) {
    array[i] = value
  }
  return array
}

},{}],33:[function(require,module,exports){
/* eslint-disable no-unused-vars */
'use strict';
var hasOwnProperty = Object.prototype.hasOwnProperty;
var propIsEnumerable = Object.prototype.propertyIsEnumerable;

function toObject(val) {
	if (val === null || val === undefined) {
		throw new TypeError('Object.assign cannot be called with null or undefined');
	}

	return Object(val);
}

module.exports = Object.assign || function (target, source) {
	var from;
	var to = toObject(target);
	var symbols;

	for (var s = 1; s < arguments.length; s++) {
		from = Object(arguments[s]);

		for (var key in from) {
			if (hasOwnProperty.call(from, key)) {
				to[key] = from[key];
			}
		}

		if (Object.getOwnPropertySymbols) {
			symbols = Object.getOwnPropertySymbols(from);
			for (var i = 0; i < symbols.length; i++) {
				if (propIsEnumerable.call(from, symbols[i])) {
					to[symbols[i]] = from[symbols[i]];
				}
			}
		}
	}

	return to;
};

},{}],34:[function(require,module,exports){
var defined = require('defined')
var clamp = require('clamp')

var inputEvents = require('./lib/input')
var quatFromVec3 = require('quat-from-unit-vec3')
var quatInvert = require('gl-quat/invert')

var glVec3 = {
  length: require('gl-vec3/length'),
  add: require('gl-vec3/add'),
  subtract: require('gl-vec3/subtract'),
  transformQuat: require('gl-vec3/transformQuat'),
  copy: require('gl-vec3/copy'),
  normalize: require('gl-vec3/normalize'),
  cross: require('gl-vec3/cross')
}

var Y_UP = [0, 1, 0]
var EPSILON = Math.pow(2, -23)
var tmpVec3 = [0, 0, 0]

module.exports = createOrbitControls
function createOrbitControls (opt) {
  opt = opt || {}

  var inputDelta = [0, 0, 0] // x, y, zoom
  var offset = [0, 0, 0]

  var upQuat = [0, 0, 0, 1]
  var upQuatInverse = upQuat.slice()

  var controls = {
    update: update,
    copyInto: copyInto,

    position: opt.position ? opt.position.slice() : [0, 0, 1],
    direction: [0, 0, -1],
    up: opt.up ? opt.up.slice() : [0, 1, 0],

    target: opt.target ? opt.target.slice() : [0, 0, 0],
    phi: defined(opt.phi, Math.PI / 2),
    theta: opt.theta || 0,
    distance: defined(opt.distance, 1),
    damping: defined(opt.damping, 0.25),
    rotateSpeed: defined(opt.rotateSpeed, 0.28),
    zoomSpeed: defined(opt.zoomSpeed, 0.0075),
    pinchSpeed: defined(opt.pinchSpeed, 0.0075),

    pinch: opt.pinching !== false,
    zoom: opt.zoom !== false,
    rotate: opt.rotate !== false,

    phiBounds: opt.phiBounds || [0, Math.PI],
    thetaBounds: opt.thetaBounds || [-Infinity, Infinity],
    distanceBounds: opt.distanceBounds || [0, Infinity]
  }

  // Compute distance if not defined in user options
  if (typeof opt.distance !== 'number') {
    glVec3.subtract(tmpVec3, controls.position, controls.target)
    controls.distance = glVec3.length(tmpVec3)
  }

  // Apply an initial phi and theta
  applyPhiTheta()

  inputEvents({
    parent: opt.parent || window,
    element: opt.element,
    rotate: opt.rotate !== false ? inputRotate : null,
    zoom: opt.zoom !== false ? inputZoom : null,
    pinch: opt.pinch !== false ? inputPinch : null
  })

  return controls

  function inputRotate (dx, dy) {
    var PI2 = Math.PI * 2
    inputDelta[0] -= PI2 * dx * controls.rotateSpeed
    inputDelta[1] -= PI2 * dy * controls.rotateSpeed
  }

  function inputZoom (delta) {
    inputDelta[2] += delta * controls.zoomSpeed
  }

  function inputPinch (delta) {
    inputDelta[2] -= delta * controls.pinchSpeed
  }

  function update () {
    var cameraUp = controls.up || Y_UP
    quatFromVec3(upQuat, cameraUp, Y_UP)
    quatInvert(upQuatInverse, upQuat)

    var distance = controls.distance

    glVec3.subtract(offset, controls.position, controls.target)
    glVec3.transformQuat(offset, offset, upQuat)

    var theta = Math.atan2(offset[0], offset[2])
    var phi = Math.atan2(Math.sqrt(offset[0] * offset[0] + offset[2] * offset[2]), offset[1])

    theta += inputDelta[0]
    phi += inputDelta[1]

    theta = clamp(theta, controls.thetaBounds[0], controls.thetaBounds[1])
    phi = clamp(phi, controls.phiBounds[0], controls.phiBounds[1])
    phi = clamp(phi, EPSILON, Math.PI - EPSILON)

    distance += inputDelta[2]
    distance = clamp(distance, controls.distanceBounds[0], controls.distanceBounds[1])

    var radius = Math.abs(distance) <= EPSILON ? EPSILON : distance
    offset[0] = radius * Math.sin(phi) * Math.sin(theta)
    offset[1] = radius * Math.cos(phi)
    offset[2] = radius * Math.sin(phi) * Math.cos(theta)

    controls.phi = phi
    controls.theta = theta
    controls.distance = distance

    glVec3.transformQuat(offset, offset, upQuatInverse)
    glVec3.add(controls.position, controls.target, offset)
    camLookAt(controls.direction, cameraUp, controls.position, controls.target)

    var damp = typeof controls.damping === 'number' ? controls.damping : 1
    for (var i = 0; i < inputDelta.length; i++) {
      inputDelta[i] *= 1 - damp
    }
  }

  function copyInto (position, direction, up) {
    if (position) glVec3.copy(position, controls.position)
    if (direction) glVec3.copy(direction, controls.direction)
    if (up) glVec3.copy(up, controls.up)
  }

  function applyPhiTheta () {
    var dist = Math.max(EPSILON, controls.distance)
    controls.position[0] = dist * Math.sin(controls.phi) * Math.sin(controls.theta)
    controls.position[1] = dist * Math.cos(controls.phi)
    controls.position[2] = dist * Math.sin(controls.phi) * Math.cos(controls.theta)
    glVec3.add(controls.position, controls.position, controls.target)
  }
}

function camLookAt (direction, up, position, target) {
  glVec3.copy(direction, target)
  glVec3.subtract(direction, direction, position)
  glVec3.normalize(direction, direction)
}

},{"./lib/input":35,"clamp":36,"defined":37,"gl-quat/invert":38,"gl-vec3/add":41,"gl-vec3/copy":42,"gl-vec3/cross":43,"gl-vec3/length":45,"gl-vec3/normalize":46,"gl-vec3/subtract":48,"gl-vec3/transformQuat":49,"quat-from-unit-vec3":54}],35:[function(require,module,exports){
var mouseWheel = require('mouse-wheel')
var eventOffset = require('mouse-event-offset')
var createPinch = require('touch-pinch')

module.exports = inputEvents
function inputEvents (opt) {
  var element = opt.element || window
  var parent = opt.parent || element
  var mouseStart = [0, 0]
  var dragging = false
  var tmp = [0, 0]
  var tmp2 = [0, 0]
  var pinch
  
  var zoomFn = opt.zoom
  var rotateFn = opt.rotate
  var pinchFn = opt.pinch
  
  if (zoomFn) {
    mouseWheel(element, function (dx, dy) {
      zoomFn(dy)
    }, true)
  }
  
  if (rotateFn) {
    // for dragging to work outside canvas bounds,
    // mouse events have to be added to parent
    parent.addEventListener('mousedown', onInputDown)
    parent.addEventListener('mousemove', onInputMove)
    parent.addEventListener('mouseup', onInputUp)
  }
  
  if (rotateFn || pinchFn) {
    pinch = createPinch(element)
    
    // don't allow simulated mouse events
    element.addEventListener('touchstart', preventDefault)
    
    if (rotateFn) touchRotate()
    if (pinchFn) touchPinch()
  }

  function preventDefault (ev) {
    ev.preventDefault()
  }
  
  function touchRotate () {
    element.addEventListener('touchmove', function (ev) {
      if (!dragging || isPinching()) return
        
      // find currently active finger
      for (var i=0; i<ev.changedTouches.length; i++) {
        var changed = ev.changedTouches[i]
        var idx = pinch.indexOfTouch(changed)
        // if pinch is disabled but rotate enabled,
        // only allow first finger to affect rotation
        var allow = pinchFn ? idx !== -1 : idx === 0
        if (allow) {
          onInputMove(changed)
          break
        }
      }
    })
    
    pinch.on('place', function (newFinger, lastFinger) {
      dragging = !isPinching()
      if (dragging) {
        var firstFinger = lastFinger || newFinger
        onInputDown(firstFinger)
      }
    })
    
    pinch.on('lift', function (lifted, remaining) {
      dragging = !isPinching()
      if (dragging && remaining) {
        eventOffset(remaining, element, mouseStart)
      }
    })
  }
  
  function isPinching () {
    return pinch.pinching && pinchFn
  }
  
  function touchPinch () {
    pinch.on('change', function (current, prev) {
      pinchFn(current - prev)
    })
  }
  
  function onInputDown (ev) {
    eventOffset(ev, element, mouseStart)    
    if (insideBounds(mouseStart)) {
      dragging = true
    }
  }
  
  function onInputUp () {
    dragging = false
  }
  
  function onInputMove (ev) {
    var end = eventOffset(ev, element, tmp)
    if (pinch && isPinching()) {
      mouseStart = end
      return
    }
    if (!dragging) return
    var rect = getClientSize(tmp2)
    var dx = (end[0] - mouseStart[0]) / rect[0]
    var dy = (end[1] - mouseStart[1]) / rect[1]
    rotateFn(dx, dy)
    mouseStart[0] = end[0]
    mouseStart[1] = end[1]
  }
  
  function insideBounds (pos) {
    if (element === window || 
        element === document ||
        element === document.body) {
      return true
    } else {
      var rect = element.getBoundingClientRect()
      return pos[0] >= 0 && pos[1] >= 0 &&
        pos[0] < rect.width && pos[1] < rect.height
    }
  }
  
  function getClientSize (out) {
    var source = element
    if (source === window ||
        source === document ||
        source === document.body) {
      source = document.documentElement
    }
    out[0] = source.clientWidth
    out[1] = source.clientHeight
    return out
  }
}

},{"mouse-event-offset":50,"mouse-wheel":53,"touch-pinch":55}],36:[function(require,module,exports){
arguments[4][19][0].apply(exports,arguments)
},{"dup":19}],37:[function(require,module,exports){
module.exports = function () {
    for (var i = 0; i < arguments.length; i++) {
        if (arguments[i] !== undefined) return arguments[i];
    }
};

},{}],38:[function(require,module,exports){
module.exports = invert

/**
 * Calculates the inverse of a quat
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quat to calculate inverse of
 * @returns {quat} out
 */
function invert (out, a) {
  var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3],
    dot = a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3,
    invDot = dot ? 1.0 / dot : 0

  out[0] = -a0 * invDot
  out[1] = -a1 * invDot
  out[2] = -a2 * invDot
  out[3] = a3 * invDot
  return out
}

},{}],39:[function(require,module,exports){
module.exports = normalize

/**
 * Normalize a vec4
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a vector to normalize
 * @returns {vec4} out
 */
function normalize (out, a) {
  var x = a[0],
    y = a[1],
    z = a[2],
    w = a[3]
  var len = x * x + y * y + z * z + w * w
  if (len > 0) {
    len = 1 / Math.sqrt(len)
    out[0] = x * len
    out[1] = y * len
    out[2] = z * len
    out[3] = w * len
  }
  return out
}

},{}],40:[function(require,module,exports){
/**
 * Normalize a quat
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quaternion to normalize
 * @returns {quat} out
 * @function
 */
module.exports = require('gl-vec4/normalize')

},{"gl-vec4/normalize":39}],41:[function(require,module,exports){
module.exports = add;

/**
 * Adds two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function add(out, a, b) {
    out[0] = a[0] + b[0]
    out[1] = a[1] + b[1]
    out[2] = a[2] + b[2]
    return out
}
},{}],42:[function(require,module,exports){
module.exports = copy;

/**
 * Copy the values from one vec3 to another
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the source vector
 * @returns {vec3} out
 */
function copy(out, a) {
    out[0] = a[0]
    out[1] = a[1]
    out[2] = a[2]
    return out
}
},{}],43:[function(require,module,exports){
module.exports = cross;

/**
 * Computes the cross product of two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function cross(out, a, b) {
    var ax = a[0], ay = a[1], az = a[2],
        bx = b[0], by = b[1], bz = b[2]

    out[0] = ay * bz - az * by
    out[1] = az * bx - ax * bz
    out[2] = ax * by - ay * bx
    return out
}
},{}],44:[function(require,module,exports){
module.exports = dot;

/**
 * Calculates the dot product of two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} dot product of a and b
 */
function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
},{}],45:[function(require,module,exports){
module.exports = length;

/**
 * Calculates the length of a vec3
 *
 * @param {vec3} a vector to calculate length of
 * @returns {Number} length of a
 */
function length(a) {
    var x = a[0],
        y = a[1],
        z = a[2]
    return Math.sqrt(x*x + y*y + z*z)
}
},{}],46:[function(require,module,exports){
module.exports = normalize;

/**
 * Normalize a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to normalize
 * @returns {vec3} out
 */
function normalize(out, a) {
    var x = a[0],
        y = a[1],
        z = a[2]
    var len = x*x + y*y + z*z
    if (len > 0) {
        len = 1 / Math.sqrt(len)
        out[0] = a[0] * len
        out[1] = a[1] * len
        out[2] = a[2] * len
    }
    return out
}
},{}],47:[function(require,module,exports){
module.exports = set;

/**
 * Set the components of a vec3 to the given values
 *
 * @param {vec3} out the receiving vector
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @returns {vec3} out
 */
function set(out, x, y, z) {
    out[0] = x
    out[1] = y
    out[2] = z
    return out
}
},{}],48:[function(require,module,exports){
module.exports = subtract;

/**
 * Subtracts vector b from vector a
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function subtract(out, a, b) {
    out[0] = a[0] - b[0]
    out[1] = a[1] - b[1]
    out[2] = a[2] - b[2]
    return out
}
},{}],49:[function(require,module,exports){
module.exports = transformQuat;

/**
 * Transforms the vec3 with a quat
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to transform
 * @param {quat} q quaternion to transform with
 * @returns {vec3} out
 */
function transformQuat(out, a, q) {
    // benchmarks: http://jsperf.com/quaternion-transform-vec3-implementations

    var x = a[0], y = a[1], z = a[2],
        qx = q[0], qy = q[1], qz = q[2], qw = q[3],

        // calculate quat * vec
        ix = qw * x + qy * z - qz * y,
        iy = qw * y + qz * x - qx * z,
        iz = qw * z + qx * y - qy * x,
        iw = -qx * x - qy * y - qz * z

    // calculate result * inverse quat
    out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy
    out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz
    out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx
    return out
}
},{}],50:[function(require,module,exports){
var rootPosition = { left: 0, top: 0 }

module.exports = mouseEventOffset
function mouseEventOffset (ev, target, out) {
  target = target || ev.currentTarget || ev.srcElement
  if (!Array.isArray(out)) {
    out = [ 0, 0 ]
  }
  var cx = ev.clientX || 0
  var cy = ev.clientY || 0
  var rect = getBoundingClientOffset(target)
  out[0] = cx - rect.left
  out[1] = cy - rect.top
  return out
}

function getBoundingClientOffset (element) {
  if (element === window ||
      element === document ||
      element === document.body) {
    return rootPosition
  } else {
    return element.getBoundingClientRect()
  }
}

},{}],51:[function(require,module,exports){
module.exports = function parseUnit(str, out) {
    if (!out)
        out = [ 0, '' ]

    str = String(str)
    var num = parseFloat(str, 10)
    out[0] = num
    out[1] = str.match(/[\d.\-\+]*\s*(.*)/)[1] || ''
    return out
}
},{}],52:[function(require,module,exports){
'use strict'

var parseUnit = require('parse-unit')

module.exports = toPX

var PIXELS_PER_INCH = 96

function getPropertyInPX(element, prop) {
  var parts = parseUnit(getComputedStyle(element).getPropertyValue(prop))
  return parts[0] * toPX(parts[1], element)
}

//This brutal hack is needed
function getSizeBrutal(unit, element) {
  var testDIV = document.createElement('div')
  testDIV.style['font-size'] = '128' + unit
  element.appendChild(testDIV)
  var size = getPropertyInPX(testDIV, 'font-size') / 128
  element.removeChild(testDIV)
  return size
}

function toPX(str, element) {
  element = element || document.body
  str = (str || 'px').trim().toLowerCase()
  if(element === window || element === document) {
    element = document.body 
  }
  switch(str) {
    case '%':  //Ambiguous, not sure if we should use width or height
      return element.clientHeight / 100.0
    case 'ch':
    case 'ex':
      return getSizeBrutal(str, element)
    case 'em':
      return getPropertyInPX(element, 'font-size')
    case 'rem':
      return getPropertyInPX(document.body, 'font-size')
    case 'vw':
      return window.innerWidth/100
    case 'vh':
      return window.innerHeight/100
    case 'vmin':
      return Math.min(window.innerWidth, window.innerHeight) / 100
    case 'vmax':
      return Math.max(window.innerWidth, window.innerHeight) / 100
    case 'in':
      return PIXELS_PER_INCH
    case 'cm':
      return PIXELS_PER_INCH / 2.54
    case 'mm':
      return PIXELS_PER_INCH / 25.4
    case 'pt':
      return PIXELS_PER_INCH / 72
    case 'pc':
      return PIXELS_PER_INCH / 6
  }
  return 1
}
},{"parse-unit":51}],53:[function(require,module,exports){
'use strict'

var toPX = require('to-px')

module.exports = mouseWheelListen

function mouseWheelListen(element, callback, noScroll) {
  if(typeof element === 'function') {
    noScroll = !!callback
    callback = element
    element = window
  }
  var lineHeight = toPX('ex', element)
  var listener = function(ev) {
    if(noScroll) {
      ev.preventDefault()
    }
    var dx = ev.deltaX || 0
    var dy = ev.deltaY || 0
    var dz = ev.deltaZ || 0
    var mode = ev.deltaMode
    var scale = 1
    switch(mode) {
      case 1:
        scale = lineHeight
      break
      case 2:
        scale = window.innerHeight
      break
    }
    dx *= scale
    dy *= scale
    dz *= scale
    if(dx || dy || dz) {
      return callback(dx, dy, dz)
    }
  }
  element.addEventListener('wheel', listener)
  return listener
}

},{"to-px":52}],54:[function(require,module,exports){
// Original implementation:
// http://lolengine.net/blog/2014/02/24/quaternion-from-two-vectors-final

var dot = require('gl-vec3/dot')
var set = require('gl-vec3/set')
var normalize = require('gl-quat/normalize')
var cross = require('gl-vec3/cross')

var tmp = [0, 0, 0]
var EPS = 1e-6

module.exports = quatFromUnitVec3
function quatFromUnitVec3 (out, a, b) {
  // assumes a and b are normalized
  var r = dot(a, b) + 1
  if (r < EPS) {
    /* If u and v are exactly opposite, rotate 180 degrees
     * around an arbitrary orthogonal axis. Axis normalisation
     * can happen later, when we normalise the quaternion. */
    r = 0
    if (Math.abs(a[0]) > Math.abs(a[2])) {
      set(tmp, -a[1], a[0], 0)
    } else {
      set(tmp, 0, -a[2], a[1])
    }
  } else {
    /* Otherwise, build quaternion the standard way. */
    cross(tmp, a, b)
  }

  out[0] = tmp[0]
  out[1] = tmp[1]
  out[2] = tmp[2]
  out[3] = r
  normalize(out, out)
  return out
}

},{"gl-quat/normalize":40,"gl-vec3/cross":43,"gl-vec3/dot":44,"gl-vec3/set":47}],55:[function(require,module,exports){
var getDistance = require('gl-vec2/distance')
var EventEmitter = require('events').EventEmitter
var dprop = require('dprop')
var eventOffset = require('mouse-event-offset')

module.exports = touchPinch
function touchPinch (target) {
  target = target || window

  var emitter = new EventEmitter()
  var fingers = [ null, null ]
  var activeCount = 0

  var lastDistance = 0
  var ended = false
  var enabled = false

  // some read-only values
  Object.defineProperties(emitter, {
    pinching: dprop(function () {
      return activeCount === 2
    }),

    fingers: dprop(function () {
      return fingers
    })
  })

  enable()
  emitter.enable = enable
  emitter.disable = disable
  emitter.indexOfTouch = indexOfTouch
  return emitter

  function indexOfTouch (touch) {
    var id = touch.identifier
    for (var i = 0; i < fingers.length; i++) {
      if (fingers[i] &&
        fingers[i].touch &&
        fingers[i].touch.identifier === id) {
        return i
      }
    }
    return -1
  }

  function enable () {
    if (enabled) return
    enabled = true
    target.addEventListener('touchstart', onTouchStart, false)
    target.addEventListener('touchmove', onTouchMove, false)
    target.addEventListener('touchend', onTouchRemoved, false)
    target.addEventListener('touchcancel', onTouchRemoved, false)
  }

  function disable () {
    if (!enabled) return
    enabled = false
    target.removeEventListener('touchstart', onTouchStart, false)
    target.removeEventListener('touchmove', onTouchMove, false)
    target.removeEventListener('touchend', onTouchRemoved, false)
    target.removeEventListener('touchcancel', onTouchRemoved, false)
  }

  function onTouchStart (ev) {
    for (var i = 0; i < ev.changedTouches.length; i++) {
      var newTouch = ev.changedTouches[i]
      var id = newTouch.identifier
      var idx = indexOfTouch(id)

      if (idx === -1 && activeCount < 2) {
        var first = activeCount === 0

        // newest and previous finger (previous may be undefined)
        var newIndex = fingers[0] ? 1 : 0
        var oldIndex = fingers[0] ? 0 : 1
        var newFinger = new Finger()

        // add to stack
        fingers[newIndex] = newFinger
        activeCount++

        // update touch event & position
        newFinger.touch = newTouch
        eventOffset(newTouch, target, newFinger.position)

        var oldTouch = fingers[oldIndex] ? fingers[oldIndex].touch : undefined
        emitter.emit('place', newTouch, oldTouch)

        if (!first) {
          var initialDistance = computeDistance()
          ended = false
          emitter.emit('start', initialDistance)
          lastDistance = initialDistance
        }
      }
    }
  }

  function onTouchMove (ev) {
    var changed = false
    for (var i = 0; i < ev.changedTouches.length; i++) {
      var movedTouch = ev.changedTouches[i]
      var idx = indexOfTouch(movedTouch)
      if (idx !== -1) {
        changed = true
        fingers[idx].touch = movedTouch // avoid caching touches
        eventOffset(movedTouch, target, fingers[idx].position)
      }
    }

    if (activeCount === 2 && changed) {
      var currentDistance = computeDistance()
      emitter.emit('change', currentDistance, lastDistance)
      lastDistance = currentDistance
    }
  }

  function onTouchRemoved (ev) {
    for (var i = 0; i < ev.changedTouches.length; i++) {
      var removed = ev.changedTouches[i]
      var idx = indexOfTouch(removed)

      if (idx !== -1) {
        fingers[idx] = null
        activeCount--
        var otherIdx = idx === 0 ? 1 : 0
        var otherTouch = fingers[otherIdx] ? fingers[otherIdx].touch : undefined
        emitter.emit('lift', removed, otherTouch)
      }
    }

    if (!ended && activeCount !== 2) {
      ended = true
      emitter.emit('end')
    }
  }

  function computeDistance () {
    if (activeCount < 2) return 0
    return getDistance(fingers[0].position, fingers[1].position)
  }
}

function Finger () {
  this.position = [0, 0]
  this.touch = null
}

},{"dprop":56,"events":26,"gl-vec2/distance":57,"mouse-event-offset":50}],56:[function(require,module,exports){
module.exports = defaultProperty

function defaultProperty (get, set) {
  return {
    configurable: true,
    enumerable: true,
    get: get,
    set: set
  }
}

},{}],57:[function(require,module,exports){
module.exports = distance

/**
 * Calculates the euclidian distance between two vec2's
 *
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {Number} distance between a and b
 */
function distance(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1]
    return Math.sqrt(x*x + y*y)
}
},{}],58:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))

},{"_process":59}],59:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],60:[function(require,module,exports){
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var now = require('right-now')
var raf = require('raf')

module.exports = Engine
function Engine(fn) {
    if (!(this instanceof Engine)) 
        return new Engine(fn)
    this.running = false
    this.last = now()
    this._frame = 0
    this._tick = this.tick.bind(this)

    if (fn)
        this.on('tick', fn)
}

inherits(Engine, EventEmitter)

Engine.prototype.start = function() {
    if (this.running) 
        return
    this.running = true
    this.last = now()
    this._frame = raf(this._tick)
    return this
}

Engine.prototype.stop = function() {
    this.running = false
    if (this._frame !== 0)
        raf.cancel(this._frame)
    this._frame = 0
    return this
}

Engine.prototype.tick = function() {
    this._frame = raf(this._tick)
    var time = now()
    var dt = time - this.last
    this.emit('tick', dt)
    this.last = time
}
},{"events":26,"inherits":61,"raf":62,"right-now":64}],61:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],62:[function(require,module,exports){
(function (global){
var now = require('performance-now')
  , root = typeof window === 'undefined' ? global : window
  , vendors = ['moz', 'webkit']
  , suffix = 'AnimationFrame'
  , raf = root['request' + suffix]
  , caf = root['cancel' + suffix] || root['cancelRequest' + suffix]

for(var i = 0; !raf && i < vendors.length; i++) {
  raf = root[vendors[i] + 'Request' + suffix]
  caf = root[vendors[i] + 'Cancel' + suffix]
      || root[vendors[i] + 'CancelRequest' + suffix]
}

// Some versions of FF have rAF but not cAF
if(!raf || !caf) {
  var last = 0
    , id = 0
    , queue = []
    , frameDuration = 1000 / 60

  raf = function(callback) {
    if(queue.length === 0) {
      var _now = now()
        , next = Math.max(0, frameDuration - (_now - last))
      last = next + _now
      setTimeout(function() {
        var cp = queue.slice(0)
        // Clear queue here to prevent
        // callbacks from appending listeners
        // to the current frame's queue
        queue.length = 0
        for(var i = 0; i < cp.length; i++) {
          if(!cp[i].cancelled) {
            try{
              cp[i].callback(last)
            } catch(e) {
              setTimeout(function() { throw e }, 0)
            }
          }
        }
      }, Math.round(next))
    }
    queue.push({
      handle: ++id,
      callback: callback,
      cancelled: false
    })
    return id
  }

  caf = function(handle) {
    for(var i = 0; i < queue.length; i++) {
      if(queue[i].handle === handle) {
        queue[i].cancelled = true
      }
    }
  }
}

module.exports = function(fn) {
  // Wrap in a new function to prevent
  // `cancel` potentially being assigned
  // to the native rAF function
  return raf.call(root, fn)
}
module.exports.cancel = function() {
  caf.apply(root, arguments)
}
module.exports.polyfill = function() {
  root.requestAnimationFrame = raf
  root.cancelAnimationFrame = caf
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"performance-now":63}],63:[function(require,module,exports){
(function (process){
// Generated by CoffeeScript 1.7.1
(function() {
  var getNanoSeconds, hrtime, loadTime;

  if ((typeof performance !== "undefined" && performance !== null) && performance.now) {
    module.exports = function() {
      return performance.now();
    };
  } else if ((typeof process !== "undefined" && process !== null) && process.hrtime) {
    module.exports = function() {
      return (getNanoSeconds() - loadTime) / 1e6;
    };
    hrtime = process.hrtime;
    getNanoSeconds = function() {
      var hr;
      hr = hrtime();
      return hr[0] * 1e9 + hr[1];
    };
    loadTime = getNanoSeconds();
  } else if (Date.now) {
    module.exports = function() {
      return Date.now() - loadTime;
    };
    loadTime = Date.now();
  } else {
    module.exports = function() {
      return new Date().getTime() - loadTime;
    };
    loadTime = new Date().getTime();
  }

}).call(this);

}).call(this,require('_process'))

},{"_process":59}],64:[function(require,module,exports){
(function (global){
module.exports =
  global.performance &&
  global.performance.now ? function now() {
    return performance.now()
  } : Date.now || function now() {
    return +new Date
  }

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],65:[function(require,module,exports){
'use strict';
module.exports = function (min, max) {
	if (max === undefined) {
		max = min;
		min = 0;
	}

	if (typeof min !== 'number' || typeof max !== 'number') {
		throw new TypeError('Expected all arguments to be numbers');
	}

	return Math.random() * (max - min) + min;
};

},{}],66:[function(require,module,exports){
(function (global){
module.exports =
  global.performance &&
  global.performance.now ? function now() {
    return performance.now()
  } : Date.now || function now() {
    return +new Date
  }

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],67:[function(require,module,exports){
module.exports = buildImpulse

var chunkSize = 2048

var queue = []
var targets = {}

var lastImpulseId = 0
function buildImpulse(length, decay, reverse, cb){
  
  lastImpulseId += 1
  var target = targets[lastImpulseId] = {
    id: lastImpulseId,
    cb: cb,
    length: length,
    decay: decay,
    reverse: reverse,
    impulseL: new Float32Array(length),
    impulseR: new Float32Array(length)
  }

  queue.push([ target.id, 0, Math.min(chunkSize, length) ])

  setTimeout(next, 1)
  return lastImpulseId
}

buildImpulse.cancel = function(id){
  if (targets[id]){
    ;delete targets[id]
    return true
  } else {
    return false
  }
}

function next(){
  var item = queue.shift()
  if (item){
    var target = targets[item[0]]
    if (target){
      var length = target.length
      var decay = target.decay
      var reverse = target.reverse
      var from = item[1]
      var to = item[2]

      var impulseL = target.impulseL
      var impulseR = target.impulseR

      for (var i=from;i<to;i++) {
        var n = reverse ? length - i : i;
        impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
        impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
      }

      if (to >= length-1){
        ;delete targets[item[0]]
        target.cb([target.impulseL, target.impulseR])
      } else {
        queue.push([ target.id, to, Math.min(to + chunkSize, length) ])
      }
    }
  }
  
  if (queue.length){
    setTimeout(next, 5)
  }
}
},{}],68:[function(require,module,exports){
// based on https://github.com/web-audio-components/simple-reverb by Nick Thompson

var buildImpulse = require('./build-impulse')

module.exports = SimpleReverb

function SimpleReverb(context){
  var node = context.createGain()
  var dry = node._dry = context.createGain()
  var wet = node._wet = context.createGain()

  var output = node.output = context.createGain()

  var convolver = node._convolver = context.createConvolver();
  var filter = node._filter = context.createBiquadFilter()
  
  node.connect(dry)
  node.connect(wet)

  convolver.connect(filter)
  dry.connect(output)
  wet.connect(convolver)
  filter.connect(output)


  Object.defineProperties(node, properties)

  node._time = 3
  node._decay = 2
  node._reverse = false

  node.cutoff.value = 20000
  node.filterType = 'lowpass'

  node._building = false
  node._buildImpulse()


  return node
}

var properties = {

  connect: {
    value: function(){
      this.output.connect.apply(this.output, arguments)
    }
  },

  disconnect: {
    value: function(){
      this.output.disconnect.apply(this.output, arguments)
    }
  },

  wet: {
    get: function(){
      return this._wet.gain
    }
  },

  dry: {
    get: function(){
      return this._dry.gain
    }
  },

  cutoff: {
    get: function(){
      return this._filter.frequency
    }
  },

  filterType: {
    get: function(){
      return this._filter.type
    },
    set: function(value){
      this._filter.type = value
    }
  },

  _buildImpulse: {
    value: function () {
      var self = this
      var rate = self.context.sampleRate
      var length = Math.max(rate * self.time, 1)

      if (self._building){
        buildImpulse.cancel(self._building)
      }

      self._building = buildImpulse(length, self.decay, self.reverse, function(channels){
        var impulse = self.context.createBuffer(2, length, rate)
        impulse.getChannelData(0).set(channels[0])
        impulse.getChannelData(1).set(channels[1])
        self._convolver.buffer = impulse
        self._building = false
      })
    }
  },

  /**
   * Public parameters.
   */

  time: {
    enumerable: true,
    get: function () { return this._time; },
    set: function (value) {
      this._time = value;
      this._buildImpulse();
    }
  },

  decay: {
    enumerable: true,
    get: function () { return this._decay; },
    set: function (value) {
      this._decay = value;
      this._buildImpulse();
    }
  },

  reverse: {
    enumerable: true,
    get: function () { return this._reverse; },
    set: function (value) {
      this._reverse = value;
      this._buildImpulse();
    }
  }

}


},{"./build-impulse":67}],69:[function(require,module,exports){
/**
 * @author alteredq / http://alteredqualia.com/
 *
 * Full-screen textured quad shader
 */

module.exports = {
  uniforms: {
    "tDiffuse": { type: "t", value: null },
    "opacity":  { type: "f", value: 1.0 }
  },
  vertexShader: [
    "varying vec2 vUv;",

    "void main() {",

      "vUv = uv;",
      "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

    "}"
  ].join("\n"),
  fragmentShader: [
    "uniform float opacity;",

    "uniform sampler2D tDiffuse;",

    "varying vec2 vUv;",

    "void main() {",

      "vec4 texel = texture2D( tDiffuse, vUv );",
      "gl_FragColor = opacity * texel;",

    "}"
  ].join("\n")
};

},{}],70:[function(require,module,exports){
/**
 * @author alteredq / http://alteredqualia.com/
 */

module.exports = function(THREE) {
  function ClearMaskPass() {
    if (!(this instanceof ClearMaskPass)) return new ClearMaskPass(scene, camera);
    this.enabled = true;
  };

  ClearMaskPass.prototype = {
    render: function ( renderer, writeBuffer, readBuffer, delta ) {
      var context = renderer.context;
      context.disable( context.STENCIL_TEST );
    }
  };

  return ClearMaskPass
};
},{}],71:[function(require,module,exports){
/**
 * @author alteredq / http://alteredqualia.com/
 */

module.exports = function(THREE) {
  function MaskPass( scene, camera ) {
    if (!(this instanceof MaskPass)) return new MaskPass(scene, camera);

    this.scene = scene;
    this.camera = camera;

    this.enabled = true;
    this.clear = true;
    this.needsSwap = false;

    this.inverse = false;
  };

  MaskPass.prototype = {

    render: function ( renderer, writeBuffer, readBuffer, delta ) {

      var context = renderer.context;

      // don't update color or depth

      context.colorMask( false, false, false, false );
      context.depthMask( false );

      // set up stencil

      var writeValue, clearValue;

      if ( this.inverse ) {

        writeValue = 0;
        clearValue = 1;

      } else {

        writeValue = 1;
        clearValue = 0;

      }

      context.enable( context.STENCIL_TEST );
      context.stencilOp( context.REPLACE, context.REPLACE, context.REPLACE );
      context.stencilFunc( context.ALWAYS, writeValue, 0xffffffff );
      context.clearStencil( clearValue );

      // draw into the stencil buffer

      renderer.render( this.scene, this.camera, readBuffer, this.clear );
      renderer.render( this.scene, this.camera, writeBuffer, this.clear );

      // re-enable update of color and depth

      context.colorMask( true, true, true, true );
      context.depthMask( true );

      // only render where stencil is set to 1

      context.stencilFunc( context.EQUAL, 1, 0xffffffff );  // draw if == 1
      context.stencilOp( context.KEEP, context.KEEP, context.KEEP );

    }

  };

  return MaskPass
};

},{}],72:[function(require,module,exports){
/**
 * @author alteredq / http://alteredqualia.com/
 */

module.exports = function(THREE) {
  function RenderPass( scene, camera, overrideMaterial, clearColor, clearAlpha ) {
    if (!(this instanceof RenderPass)) return new RenderPass(scene, camera, overrideMaterial, clearColor, clearAlpha);

    this.scene = scene;
    this.camera = camera;

    this.overrideMaterial = overrideMaterial;

    this.clearColor = clearColor;
    this.clearAlpha = ( clearAlpha !== undefined ) ? clearAlpha : 1;

    this.oldClearColor = new THREE.Color();
    this.oldClearAlpha = 1;

    this.enabled = true;
    this.clear = true;
    this.needsSwap = false;

  };

  RenderPass.prototype = {

    render: function ( renderer, writeBuffer, readBuffer, delta ) {

      this.scene.overrideMaterial = this.overrideMaterial;

      if ( this.clearColor ) {

        this.oldClearColor.copy( renderer.getClearColor() );
        this.oldClearAlpha = renderer.getClearAlpha();

        renderer.setClearColor( this.clearColor, this.clearAlpha );

      }

      renderer.render( this.scene, this.camera, readBuffer, this.clear );

      if ( this.clearColor ) {

        renderer.setClearColor( this.oldClearColor, this.oldClearAlpha );

      }

      this.scene.overrideMaterial = null;

    }

  };

  return RenderPass;

};

},{}],73:[function(require,module,exports){
/**
 * @author alteredq / http://alteredqualia.com/
 */

module.exports = function(THREE, EffectComposer) {
  function ShaderPass( shader, textureID ) {
    if (!(this instanceof ShaderPass)) return new ShaderPass(shader, textureID);

    this.textureID = ( textureID !== undefined ) ? textureID : "tDiffuse";

    this.uniforms = THREE.UniformsUtils.clone( shader.uniforms );

    this.material = new THREE.ShaderMaterial( {

      uniforms: this.uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader

    } );

    this.renderToScreen = false;

    this.enabled = true;
    this.needsSwap = true;
    this.clear = false;

  };

  ShaderPass.prototype = {

    render: function ( renderer, writeBuffer, readBuffer, delta ) {

      if ( this.uniforms[ this.textureID ] ) {

        this.uniforms[ this.textureID ].value = readBuffer;

      }

      EffectComposer.quad.material = this.material;

      if ( this.renderToScreen ) {

        renderer.render( EffectComposer.scene, EffectComposer.camera );

      } else {

        renderer.render( EffectComposer.scene, EffectComposer.camera, writeBuffer, this.clear );

      }

    }

  };

  return ShaderPass;

};
},{}],74:[function(require,module,exports){
var inherits = require('inherits')

module.exports = function(THREE) {

    function Complex(mesh) {
        if (!(this instanceof Complex))
            return new Complex(mesh)
        THREE.Geometry.call(this)
        this.dynamic = true

        if (mesh)
            this.update(mesh)
    }

    inherits(Complex, THREE.Geometry)

    //may expose these in next version
    Complex.prototype._updatePositions = function(positions) {
        for (var i=0; i<positions.length; i++) {
            var pos = positions[i]
            if (i > this.vertices.length-1)
                this.vertices.push(new THREE.Vector3().fromArray(pos))
            else 
                this.vertices[i].fromArray(pos)
        }
        this.vertices.length = positions.length
        this.verticesNeedUpdate = true
    }

    Complex.prototype._updateCells = function(cells) {
        for (var i=0; i<cells.length; i++) {
            var face = cells[i]
            if (i > this.faces.length-1)
                this.faces.push(new THREE.Face3(face[0], face[1], face[2]))
            else {
                var tf = this.faces[i]
                tf.a = face[0]
                tf.b = face[1]
                tf.c = face[2]
            }
        }

        this.faces.length = cells.length
        this.elementsNeedUpdate = true
    }

    Complex.prototype.update = function(mesh) {
        this._updatePositions(mesh.positions)
        this._updateCells(mesh.cells)
    }

    return Complex
}
},{"inherits":75}],75:[function(require,module,exports){
arguments[4][61][0].apply(exports,arguments)
},{"dup":61}],76:[function(require,module,exports){
var xtend = require('xtend')
var eases = require('eases')
var Ticker = require('tween-ticker')
var EventEmitter = require('events').EventEmitter;
var inherits = require('inherits')
var mixin = require('mixes')
var loop = require('./loop')

var defaultOpt = { eases: eases }

module.exports = Tweenr
function Tweenr(opt) {
    if (!(this instanceof Tweenr))
        return new Tweenr(opt)

    Ticker.call(this, xtend(defaultOpt, opt))
    EventEmitter.call(this)

    this._handleTick = function(dt) {
        dt = Math.min(30, dt) //cap delta at 30 ms
        dt /= 1000
        this.emit('tick', dt)
        this.tick(dt)
    }.bind(this)

    loop.on('tick', this._handleTick)
}

inherits(Tweenr, Ticker)
mixin(Tweenr, EventEmitter.prototype)

Tweenr.prototype.dispose = function() {
    loop.removeListener('tick', this._handleTick)
}

},{"./loop":77,"eases":96,"events":26,"inherits":110,"mixes":111,"tween-ticker":112,"xtend":122}],77:[function(require,module,exports){
var engine = require('raf-loop')()
engine.start()

module.exports = engine
},{"raf-loop":60}],78:[function(require,module,exports){
function backInOut(t) {
  var s = 1.70158 * 1.525
  if ((t *= 2) < 1)
    return 0.5 * (t * t * ((s + 1) * t - s))
  return 0.5 * ((t -= 2) * t * ((s + 1) * t + s) + 2)
}

module.exports = backInOut
},{}],79:[function(require,module,exports){
function backIn(t) {
  var s = 1.70158
  return t * t * ((s + 1) * t - s)
}

module.exports = backIn
},{}],80:[function(require,module,exports){
function backOut(t) {
  var s = 1.70158
  return --t * t * ((s + 1) * t + s) + 1
}

module.exports = backOut
},{}],81:[function(require,module,exports){
var bounceOut = require('./bounce-out')

function bounceInOut(t) {
  return t < 0.5
    ? 0.5 * (1.0 - bounceOut(1.0 - t * 2.0))
    : 0.5 * bounceOut(t * 2.0 - 1.0) + 0.5
}

module.exports = bounceInOut
},{"./bounce-out":83}],82:[function(require,module,exports){
var bounceOut = require('./bounce-out')

function bounceIn(t) {
  return 1.0 - bounceOut(1.0 - t)
}

module.exports = bounceIn
},{"./bounce-out":83}],83:[function(require,module,exports){
function bounceOut(t) {
  var a = 4.0 / 11.0
  var b = 8.0 / 11.0
  var c = 9.0 / 10.0

  var ca = 4356.0 / 361.0
  var cb = 35442.0 / 1805.0
  var cc = 16061.0 / 1805.0

  var t2 = t * t

  return t < a
    ? 7.5625 * t2
    : t < b
      ? 9.075 * t2 - 9.9 * t + 3.4
      : t < c
        ? ca * t2 - cb * t + cc
        : 10.8 * t * t - 20.52 * t + 10.72
}

module.exports = bounceOut
},{}],84:[function(require,module,exports){
function circInOut(t) {
  if ((t *= 2) < 1) return -0.5 * (Math.sqrt(1 - t * t) - 1)
  return 0.5 * (Math.sqrt(1 - (t -= 2) * t) + 1)
}

module.exports = circInOut
},{}],85:[function(require,module,exports){
function circIn(t) {
  return 1.0 - Math.sqrt(1.0 - t * t)
}

module.exports = circIn
},{}],86:[function(require,module,exports){
function circOut(t) {
  return Math.sqrt(1 - ( --t * t ))
}

module.exports = circOut
},{}],87:[function(require,module,exports){
function cubicInOut(t) {
  return t < 0.5
    ? 4.0 * t * t * t
    : 0.5 * Math.pow(2.0 * t - 2.0, 3.0) + 1.0
}

module.exports = cubicInOut
},{}],88:[function(require,module,exports){
function cubicIn(t) {
  return t * t * t
}

module.exports = cubicIn
},{}],89:[function(require,module,exports){
function cubicOut(t) {
  var f = t - 1.0
  return f * f * f + 1.0
}

module.exports = cubicOut
},{}],90:[function(require,module,exports){
function elasticInOut(t) {
  return t < 0.5
    ? 0.5 * Math.sin(+13.0 * Math.PI/2 * 2.0 * t) * Math.pow(2.0, 10.0 * (2.0 * t - 1.0))
    : 0.5 * Math.sin(-13.0 * Math.PI/2 * ((2.0 * t - 1.0) + 1.0)) * Math.pow(2.0, -10.0 * (2.0 * t - 1.0)) + 1.0
}

module.exports = elasticInOut
},{}],91:[function(require,module,exports){
function elasticIn(t) {
  return Math.sin(13.0 * t * Math.PI/2) * Math.pow(2.0, 10.0 * (t - 1.0))
}

module.exports = elasticIn
},{}],92:[function(require,module,exports){
function elasticOut(t) {
  return Math.sin(-13.0 * (t + 1.0) * Math.PI/2) * Math.pow(2.0, -10.0 * t) + 1.0
}

module.exports = elasticOut
},{}],93:[function(require,module,exports){
function expoInOut(t) {
  return (t === 0.0 || t === 1.0)
    ? t
    : t < 0.5
      ? +0.5 * Math.pow(2.0, (20.0 * t) - 10.0)
      : -0.5 * Math.pow(2.0, 10.0 - (t * 20.0)) + 1.0
}

module.exports = expoInOut
},{}],94:[function(require,module,exports){
function expoIn(t) {
  return t === 0.0 ? t : Math.pow(2.0, 10.0 * (t - 1.0))
}

module.exports = expoIn
},{}],95:[function(require,module,exports){
function expoOut(t) {
  return t === 1.0 ? t : 1.0 - Math.pow(2.0, -10.0 * t)
}

module.exports = expoOut
},{}],96:[function(require,module,exports){
module.exports = {
	'backInOut': require('./back-in-out'),
	'backIn': require('./back-in'),
	'backOut': require('./back-out'),
	'bounceInOut': require('./bounce-in-out'),
	'bounceIn': require('./bounce-in'),
	'bounceOut': require('./bounce-out'),
	'circInOut': require('./circ-in-out'),
	'circIn': require('./circ-in'),
	'circOut': require('./circ-out'),
	'cubicInOut': require('./cubic-in-out'),
	'cubicIn': require('./cubic-in'),
	'cubicOut': require('./cubic-out'),
	'elasticInOut': require('./elastic-in-out'),
	'elasticIn': require('./elastic-in'),
	'elasticOut': require('./elastic-out'),
	'expoInOut': require('./expo-in-out'),
	'expoIn': require('./expo-in'),
	'expoOut': require('./expo-out'),
	'linear': require('./linear'),
	'quadInOut': require('./quad-in-out'),
	'quadIn': require('./quad-in'),
	'quadOut': require('./quad-out'),
	'quartInOut': require('./quart-in-out'),
	'quartIn': require('./quart-in'),
	'quartOut': require('./quart-out'),
	'quintInOut': require('./quint-in-out'),
	'quintIn': require('./quint-in'),
	'quintOut': require('./quint-out'),
	'sineInOut': require('./sine-in-out'),
	'sineIn': require('./sine-in'),
	'sineOut': require('./sine-out')
}
},{"./back-in":79,"./back-in-out":78,"./back-out":80,"./bounce-in":82,"./bounce-in-out":81,"./bounce-out":83,"./circ-in":85,"./circ-in-out":84,"./circ-out":86,"./cubic-in":88,"./cubic-in-out":87,"./cubic-out":89,"./elastic-in":91,"./elastic-in-out":90,"./elastic-out":92,"./expo-in":94,"./expo-in-out":93,"./expo-out":95,"./linear":97,"./quad-in":99,"./quad-in-out":98,"./quad-out":100,"./quart-in":102,"./quart-in-out":101,"./quart-out":103,"./quint-in":105,"./quint-in-out":104,"./quint-out":106,"./sine-in":108,"./sine-in-out":107,"./sine-out":109}],97:[function(require,module,exports){
function linear(t) {
  return t
}

module.exports = linear
},{}],98:[function(require,module,exports){
function quadInOut(t) {
    t /= 0.5
    if (t < 1) return 0.5*t*t
    t--
    return -0.5 * (t*(t-2) - 1)
}

module.exports = quadInOut
},{}],99:[function(require,module,exports){
function quadIn(t) {
  return t * t
}

module.exports = quadIn
},{}],100:[function(require,module,exports){
function quadOut(t) {
  return -t * (t - 2.0)
}

module.exports = quadOut
},{}],101:[function(require,module,exports){
function quarticInOut(t) {
  return t < 0.5
    ? +8.0 * Math.pow(t, 4.0)
    : -8.0 * Math.pow(t - 1.0, 4.0) + 1.0
}

module.exports = quarticInOut
},{}],102:[function(require,module,exports){
function quarticIn(t) {
  return Math.pow(t, 4.0)
}

module.exports = quarticIn
},{}],103:[function(require,module,exports){
function quarticOut(t) {
  return Math.pow(t - 1.0, 3.0) * (1.0 - t) + 1.0
}

module.exports = quarticOut
},{}],104:[function(require,module,exports){
function qinticInOut(t) {
    if ( ( t *= 2 ) < 1 ) return 0.5 * t * t * t * t * t
    return 0.5 * ( ( t -= 2 ) * t * t * t * t + 2 )
}

module.exports = qinticInOut
},{}],105:[function(require,module,exports){
function qinticIn(t) {
  return t * t * t * t * t
}

module.exports = qinticIn
},{}],106:[function(require,module,exports){
function qinticOut(t) {
  return --t * t * t * t * t + 1
}

module.exports = qinticOut
},{}],107:[function(require,module,exports){
function sineInOut(t) {
  return -0.5 * (Math.cos(Math.PI*t) - 1)
}

module.exports = sineInOut
},{}],108:[function(require,module,exports){
function sineIn (t) {
  var v = Math.cos(t * Math.PI * 0.5)
  if (Math.abs(v) < 1e-14) return 1
  else return 1 - v
}

module.exports = sineIn

},{}],109:[function(require,module,exports){
function sineOut(t) {
  return Math.sin(t * Math.PI/2)
}

module.exports = sineOut
},{}],110:[function(require,module,exports){
arguments[4][61][0].apply(exports,arguments)
},{"dup":61}],111:[function(require,module,exports){
var xtend = require('xtend')

var defaults = {
	enumerable: true,
	configurable: true
}

function mix(obj, entries) {
	for (var k in entries) {
		if (!entries.hasOwnProperty(k))
			continue
		var f = entries[k]
		if (typeof f === 'function') {
			obj[k] = f
		} else if (f && typeof f === 'object') {
			var def = xtend(defaults, f)
			Object.defineProperty(obj, k, def);
		}
	}
}

module.exports = function mixes(ctor, entries) {
	mix(ctor.prototype, entries)
}

module.exports.mix = mix
},{"xtend":122}],112:[function(require,module,exports){
var linear = require('eases/linear')
var createTween = require('tween-objects')
var BaseTween = require('tween-base')

function TweenTicker (opt) {
  if (!(this instanceof TweenTicker)) {
    return new TweenTicker(opt)
  }
  opt = opt || {}
  this.stack = []
  this.defaultEase = opt.defaultEase || linear
  this.eases = opt.eases || {}
  this._applyEase = this.ease.bind(this)
}

TweenTicker.prototype.cancel = function () {
  for (var i = 0; i < this.stack.length; i++) {
    var t = this.stack[i]
    // cancel each and force it to complete
    t.cancel()
    t.tick(0)
  }
  this.stack.length = 0
  return this
}

// no longer used, backward-compatible
TweenTicker.prototype.clear = TweenTicker.prototype.cancel

TweenTicker.prototype.to = function (element, opt) {
  var tween = element
  if (opt && typeof opt === 'object') {
    tween = createTween(element, opt)
  } else if (!element && !opt) {
    tween = new BaseTween()
  } else if (!isTween(tween)) { // to avoid programmer error
    throw new Error('must provide options or a tween object')
  }
  return this.push(tween)
}

TweenTicker.prototype.push = function (tween) {
  this.stack.push(tween)
  return tween
}

TweenTicker.prototype.tick = function (dt, ease) {
  ease = typeof ease === 'function' ? ease : this._applyEase
  dt = typeof dt === 'number' ? dt : 1 / 60

  // for all queued tweens, tick them forward (i.e. DOM read)
  for (var i = 0; i < this.stack.length; i++) {
    this.stack[i].tick(dt, ease)
  }

  // now sync their states (i.e. DOM write)
  sync(this.stack)

  // now kill any inactive tweens
  for (i = this.stack.length - 1; i >= 0; i--) {
    if (!this.stack[i].active) {
      this.stack.splice(i, 1)
    }
  }
}

// determines which easing function to use based on user options
TweenTicker.prototype.ease = function (tween, alpha) {
  var ease = tween.ease || this.defaultEase
  if (typeof ease === 'string') {
    ease = this.eases[ease]
  }
  if (typeof ease !== 'function') {
    ease = linear
  }
  return ease(alpha)
}

// mainly intended as a safeguard against potential user error
function isTween (tween) {
  return (typeof tween.tick === 'function' &&
  typeof tween.cancel === 'function')
}

function sync (tweens) {
  for (var i = 0; i < tweens.length; i++) {
    var tween = tweens[i]
    if (typeof tween.sync === 'function') {
      tween.sync()
    }
  }
}

module.exports = TweenTicker

},{"eases/linear":97,"tween-base":116,"tween-objects":117}],113:[function(require,module,exports){
var str = Object.prototype.toString

module.exports = anArray

function anArray(arr) {
  return (
       arr.BYTES_PER_ELEMENT
    && str.call(arr.buffer) === '[object ArrayBuffer]'
    || Array.isArray(arr)
  )
}

},{}],114:[function(require,module,exports){
var lerp = require('lerp')

module.exports = function lerpValues(value1, value2, t, out) {
    if (typeof value1 === 'number'
            && typeof value2 === 'number')
        return lerp(value1, value2, t)
    else { //assume array
        var len = Math.min(value1.length, value2.length)
        out = out||new Array(len)
        for (var i=0; i<len; i++) 
            out[i] = lerp(value1[i], value2[i], t)
        return out
    }
}
},{"lerp":115}],115:[function(require,module,exports){
function lerp(v0, v1, t) {
    return v0*(1-t)+v1*t
}
module.exports = lerp
},{}],116:[function(require,module,exports){
var noop = function(){}
var linear = require('eases/linear')
var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')

function BaseTween(opt) {
    EventEmitter.call(this)

    //users generally don't need to change these
    this.duration = (opt && opt.duration)||0
    this.delay = (opt && opt.delay)||0
    this.time = 0
    this.ease = opt && opt.ease
    this.active = true
    this.enabled = true
    this.cancelling = false
    this._started = false
}

inherits(BaseTween, EventEmitter)

BaseTween.prototype.lerp = noop
BaseTween.prototype.ready = noop

BaseTween.prototype.cancel = function() {
    this.cancelling = true
    return this
}

BaseTween.prototype.tick = function(dt, ease) {
    ease = typeof ease === 'function' ? ease : defaultEase

    if (this.cancelling && this.active) {
        this.active = false
        this.emit('cancelling', this)
        this.emit('complete', this)
    }

    if (!this.active || !this.enabled)
        return

    var last = this.time
    this.time += dt
            
    var alpha = (this.time-this.delay) / this.duration
    if (this.time-this.delay > 0) {
        if (!this._started) {
            this._started = true
            this.ready()
            this.emit('start', this)
        }

        if (alpha < 0)
            alpha = 0
        else if (alpha > 1)
            alpha = 1
        alpha = ease(this, alpha)
        this.lerp(alpha)
        this.emit('update', this)
    }

    if (this.time >= (this.duration+this.delay)) {
        this.active = false
        this.emit('complete', this)
    }
}

function defaultEase(tween, alpha) {
    if (typeof tween.ease === 'function')
        return tween.ease(alpha)
    return linear(alpha)
}

module.exports = BaseTween
},{"eases/linear":97,"events":26,"inherits":110}],117:[function(require,module,exports){
var ObjectTween = require('./lib/object')
var GroupTween = require('./lib/group')

module.exports = function(element, opt) {
    var tween = Array.isArray(element) 
            ? new GroupTween(element, opt)
            : new ObjectTween(element, opt)
    return tween
}
},{"./lib/group":119,"./lib/object":120}],118:[function(require,module,exports){
var BaseTween = require('tween-base')
var isArray = require('an-array')
var ownKeys = require('own-enumerable-keys')
var ignores = ownKeys(new BaseTween())

module.exports = function getTargets(element, opt) {
    var targets = []
    var optKeys = ownKeys(opt)

    for (var k in opt) { 
        //copy properties as needed
        if (optKeys.indexOf(k) >= 0 &&
                k in element &&
                ignores.indexOf(k) === -1) {
            var startVal = element[k]
            var endVal = opt[k]
            if (typeof startVal === 'number'
                 && typeof endVal === 'number') {
                targets.push({ 
                    key: k, 
                    start: startVal, 
                    end: endVal 
                })
            }
            else if (isArray(startVal) && isArray(endVal)) {
                targets.push({ 
                    key: k, 
                    start: startVal.slice(), 
                    end: endVal.slice() 
                })
            }
        }
    }
    return targets
}
},{"an-array":113,"own-enumerable-keys":121,"tween-base":116}],119:[function(require,module,exports){
var inherits = require('inherits')
var lerp = require('lerp-array')
var BaseTween = require('tween-base')
var endTarget = require('./end-target')

function GroupTween(target, opt) {
    BaseTween.call(this, opt)
    this.target = target
    this.end = []
    this._options = opt
}

inherits(GroupTween, BaseTween)

GroupTween.prototype.ready = function() {
    this.end = this.target.map(function(t) {
        return endTarget(t, this._options)
    }, this)
}

GroupTween.prototype.lerp = function(alpha) {
    for (var j=0; j<this.end.length; j++)  {
        var endings = this.end[j]
        var target = this.target[j]
        for (var i=0; i<endings.length; i++) {
            var t = endings[i]
            var k = t.key
            target[k] = lerp(t.start, t.end, alpha, target[k])    
        }
    }
}

module.exports = GroupTween
},{"./end-target":118,"inherits":110,"lerp-array":114,"tween-base":116}],120:[function(require,module,exports){
var inherits = require('inherits')
var lerp = require('lerp-array')
var BaseTween = require('tween-base')
var endTarget = require('./end-target')

function ObjectTween(target, opt) {
    BaseTween.call(this, opt)
    this.target = target
    this.endings = undefined
    this._options = opt
}

inherits(ObjectTween, BaseTween)

ObjectTween.prototype.ready = function() {
    this.endings = endTarget(this.target, this._options)
}

ObjectTween.prototype.lerp = function(alpha) {
    for (var i=0; i<this.endings.length; i++) {
        var t = this.endings[i]
        var k = t.key
        this.target[k] = lerp(t.start, t.end, alpha, this.target[k])
    }
}

module.exports = ObjectTween
},{"./end-target":118,"inherits":110,"lerp-array":114,"tween-base":116}],121:[function(require,module,exports){
var propIsEnumerable = Object.prototype.propertyIsEnumerable

module.exports = ownEnumerableKeys
function ownEnumerableKeys (obj) {
  var keys = Object.getOwnPropertyNames(obj)

  if (Object.getOwnPropertySymbols) {
    keys = keys.concat(Object.getOwnPropertySymbols(obj))
  }

  return keys.filter(function (key) {
    return propIsEnumerable.call(obj, key)
  })
}

},{}],122:[function(require,module,exports){
module.exports = extend

var hasOwnProperty = Object.prototype.hasOwnProperty;

function extend() {
    var target = {}

    for (var i = 0; i < arguments.length; i++) {
        var source = arguments[i]

        for (var key in source) {
            if (hasOwnProperty.call(source, key)) {
                target[key] = source[key]
            }
        }
    }

    return target
}

},{}],123:[function(require,module,exports){
module.exports = function range(min, max, value) {
  return (value - min) / (max - min)
}
},{}],124:[function(require,module,exports){
var buffer = require('./lib/buffer-source')
var media = require('./lib/media-source')

module.exports = webAudioPlayer
function webAudioPlayer (src, opt) {
  if (!src) throw new TypeError('must specify a src parameter')
  opt = opt || {}
  if (opt.buffer) return buffer(src, opt)
  else return media(src, opt)
}

},{"./lib/buffer-source":126,"./lib/media-source":129}],125:[function(require,module,exports){
module.exports = createAudioContext
function createAudioContext () {
  var AudioCtor = window.AudioContext || window.webkitAudioContext
  return new AudioCtor()
}

},{}],126:[function(require,module,exports){
(function (process){
var canPlaySrc = require('./can-play-src')
var createAudioContext = require('./audio-context')
var xhrAudio = require('./xhr-audio')
var EventEmitter = require('events').EventEmitter
var rightNow = require('right-now')

module.exports = createBufferSource
function createBufferSource (src, opt) {
  opt = opt || {}
  var emitter = new EventEmitter()
  var audioContext = opt.context || createAudioContext()

  // a pass-through node so user just needs to
  // connect() once
  var bufferNode, buffer, duration
  var node = audioContext.createGain()
  var audioStartTime = null
  var audioPauseTime = null
  var audioCurrentTime = 0
  var playing = false
  var loop = opt.loop

  emitter.play = function () {
    if (playing) return
    playing = true

    bufferNode = audioContext.createBufferSource()
    bufferNode.connect(emitter.node)
    bufferNode.onended = ended
    if (buffer) {
      // Might be null undefined if we are still loading
      bufferNode.buffer = buffer
    }
    if (loop) {
      bufferNode.loop = true
    }

    if (duration && audioCurrentTime > duration) {
      // for when it loops...
      audioCurrentTime = audioCurrentTime % duration
    }
    var nextTime = audioCurrentTime

    bufferNode.start(0, nextTime)
    audioStartTime = rightNow()
  }

  emitter.pause = function () {
    if (!playing) return
    playing = false
    // Don't let the "end" event
    // get triggered on manual pause.
    bufferNode.onended = null
    bufferNode.stop(0)
    audioPauseTime = rightNow()
    audioCurrentTime += (audioPauseTime - audioStartTime) / 1000
  }

  emitter.stop = function () {
    emitter.pause()
    ended()
  }

  emitter.dispose = function () {
    buffer = null
  }

  emitter.node = node
  emitter.context = audioContext

  Object.defineProperties(emitter, {
    duration: {
      enumerable: true, configurable: true,
      get: function () {
        return duration
      }
    },
    playing: {
      enumerable: true, configurable: true,
      get: function () {
        return playing
      }
    },
    buffer: {
      enumerable: true, configurable: true,
      get: function () {
        return buffer
      }
    },
    volume: {
      enumerable: true, configurable: true,
      get: function () {
        return node.gain.value
      },
      set: function (n) {
        node.gain.value = n
      }
    }
  })

  // set initial volume
  if (typeof opt.volume === 'number') {
    emitter.volume = opt.volume
  }

  // filter down to a list of playable sources
  var sources = Array.isArray(src) ? src : [ src ]
  sources = sources.filter(Boolean)
  var playable = sources.some(canPlaySrc)
  if (playable) {
    var source = sources.filter(canPlaySrc)[0]
    // Support the same source types as in
    // MediaElement mode...
    if (typeof source.getAttribute === 'function') {
      source = source.getAttribuet('src')
    } else if (typeof source.src === 'string') {
      source = source.src
    }
    // We have at least one playable source.
    // For now just play the first,
    // ideally this module could attempt each one.
    startLoad(source)
  } else {
    // no sources can be played...
    process.nextTick(function () {
      emitter.emit('error', canPlaySrc.createError(sources))
    })
  }
  return emitter

  function startLoad (src) {
    xhrAudio(audioContext, src, function audioDecoded (err, decoded) {
      if (err) return emitter.emit('error', err)
      buffer = decoded // store for later use
      if (bufferNode) {
        // if play() was called early
        bufferNode.buffer = buffer
      }
      duration = buffer.duration
      node.buffer = buffer
      emitter.emit('load')
    }, function audioProgress (amount, total) {
      emitter.emit('progress', amount, total)
    }, function audioDecoding () {
      emitter.emit('decoding')
    })
  }

  function ended () {
    emitter.emit('end')
    playing = false
    audioCurrentTime = 0
  }
}

}).call(this,require('_process'))

},{"./audio-context":125,"./can-play-src":127,"./xhr-audio":130,"_process":59,"events":26,"right-now":133}],127:[function(require,module,exports){
var lookup = require('browser-media-mime-type')
var audio

module.exports = isSrcPlayable
function isSrcPlayable (src) {
  if (!src) throw new TypeError('src cannot be empty')
  var type
  if (typeof src.getAttribute === 'function') {
    // <source> element
    type = src.getAttribute('type')
  } else if (typeof src === 'string') {
    // 'foo.mp3' string
    var ext = extension(src)
    if (ext) type = lookup(ext)
  } else {
    // { src: 'foo.mp3', type: 'audio/mpeg; codecs..'}
    type = src.type
  }

  // We have an unknown file extension or
  // a <source> tag without an explicit type,
  // just let the browser handle it!
  if (!type) return true

  // handle "no" edge case with super legacy browsers...
  // https://groups.google.com/forum/#!topic/google-web-toolkit-contributors/a8Uy0bXq1Ho
  if (!audio) audio = new window.Audio()
  var canplay = audio.canPlayType(type).replace(/no/, '')
  return Boolean(canplay)
}

module.exports.createError = createError
function createError (sources) {
  // All sources are unplayable
  var err = new Error('This browser does not support any of the following sources:\n    ' +
      sources.join(', ') + '\n' +
      'Try using an array of OGG, MP3 and WAV.')
  err.type = 'AUDIO_FORMAT'
  return err
}

function extension (data) {
  var extIdx = data.lastIndexOf('.')
  if (extIdx <= 0 || extIdx === data.length - 1) {
    return undefined
  }
  return data.substring(extIdx + 1)
}

},{"browser-media-mime-type":131}],128:[function(require,module,exports){
module.exports = addOnce
function addOnce (element, event, fn) {
  function tmp (ev) {
    element.removeEventListener(event, tmp, false)
    fn()
  }
  element.addEventListener(event, tmp, false)
}
},{}],129:[function(require,module,exports){
(function (process){
var EventEmitter = require('events').EventEmitter
var createAudio = require('simple-media-element').audio
var assign = require('object-assign')

var createAudioContext = require('./audio-context')
var canPlaySrc = require('./can-play-src')
var addOnce = require('./event-add-once')

module.exports = createMediaSource
function createMediaSource (src, opt) {
  opt = assign({}, opt)
  var emitter = new EventEmitter()

  // Default to Audio instead of HTMLAudioElement
  // There is not much difference except in the following:
  //    x instanceof Audio
  //    x instanceof HTMLAudioElement
  // And in my experience Audio has better support on various
  // platforms like CocoonJS.
  // Please open an issue if there is a concern with this.
  if (!opt.element) opt.element = new window.Audio()

  var desiredVolume = opt.volume
  delete opt.volume // make sure <audio> tag receives full volume
  var audio = createAudio(src, opt)
  var audioContext = opt.context || createAudioContext()
  var node = audioContext.createGain()
  var mediaNode = audioContext.createMediaElementSource(audio)
  mediaNode.connect(node)

  audio.addEventListener('ended', function () {
    emitter.emit('end')
  })

  emitter.element = audio
  emitter.context = audioContext
  emitter.node = node
  emitter.play = audio.play.bind(audio)
  emitter.pause = audio.pause.bind(audio)

  // This exists currently for parity with Buffer source
  // Open to suggestions for what this should dispose...
  emitter.dispose = function () {}

  emitter.stop = function () {
    var wasPlaying = emitter.playing
    audio.pause()
    audio.currentTime = 0
    if (wasPlaying) {
      emitter.emit('end')
    }
  }

  Object.defineProperties(emitter, {
    duration: {
      enumerable: true, configurable: true,
      get: function () {
        return audio.duration
      }
    },
    currentTime: {
      enumerable: true, configurable: true,
      get: function () {
        return audio.currentTime
      }
    },
    playing: {
      enumerable: true, configurable: true,
      get: function () {
        return !audio.paused
      }
    },
    volume: {
      enumerable: true, configurable: true,
      get: function () {
        return node.gain.value
      },
      set: function (n) {
        node.gain.value = n
      }
    }
  })

  // Set initial volume
  if (typeof desiredVolume === 'number') {
    emitter.volume = desiredVolume
  }

  // Check if all sources are unplayable,
  // if so we emit an error since the browser
  // might not.
  var sources = Array.isArray(src) ? src : [ src ]
  sources = sources.filter(Boolean)
  var playable = sources.some(canPlaySrc)
  if (playable) {
    // At least one source is probably/maybe playable
    startLoad()
  } else {
    // emit error on next tick so user can catch it
    process.nextTick(function () {
      emitter.emit('error', canPlaySrc.createError(sources))
    })
  }

  return emitter

  function startLoad () {
    var done = function () {
      emitter.emit('load')
    }

    // On most browsers the loading begins
    // immediately. However, on iOS 9.2 Safari,
    // you need to call load() for events
    // to be triggered.
    audio.load()

    if (audio.readyState >= audio.HAVE_ENOUGH_DATA) {
      process.nextTick(done)
    } else {
      addOnce(audio, 'canplay', done)
      addOnce(audio, 'error', function (err) {
        emitter.emit('error', err)
      })
    }
  }
}

}).call(this,require('_process'))

},{"./audio-context":125,"./can-play-src":127,"./event-add-once":128,"_process":59,"events":26,"object-assign":33,"simple-media-element":134}],130:[function(require,module,exports){
var xhr = require('xhr')
var xhrProgress = require('xhr-progress')

module.exports = xhrAudio
function xhrAudio (audioContext, src, cb, progress, decoding) {
  var xhrObject = xhr({
    uri: src,
    responseType: 'arraybuffer'
  }, function (err, resp, arrayBuf) {
    if (!/^2/.test(resp.statusCode)) {
      err = new Error('status code ' + resp.statusCode + ' requesting ' + src)
    }
    if (err) return cb(err)
    decode(arrayBuf)
  })

  xhrProgress(xhrObject)
    .on('data', function (amount, total) {
      progress(amount, total)
    })

  function decode (arrayBuf) {
    decoding()
    audioContext.decodeAudioData(arrayBuf, function (decoded) {
      cb(null, decoded)
    }, function () {
      var err = new Error('Error decoding audio data')
      err.type = 'DECODE_AUDIO_DATA'
      cb(err)
    })
  }
}

},{"xhr":137,"xhr-progress":136}],131:[function(require,module,exports){
// sourced from:
// http://www.leanbackplayer.com/test/h5mt.html
// https://github.com/broofa/node-mime/blob/master/types.json
var mimeTypes = require('./mime-types.json')

var mimeLookup = {}
Object.keys(mimeTypes).forEach(function (key) {
  var extensions = mimeTypes[key]
  extensions.forEach(function (ext) {
    mimeLookup[ext] = key
  })
})

module.exports = function lookup (ext) {
  if (!ext) throw new TypeError('must specify extension string')
  if (ext.indexOf('.') === 0) {
    ext = ext.substring(1)
  }
  return mimeLookup[ext.toLowerCase()]
}

},{"./mime-types.json":132}],132:[function(require,module,exports){
module.exports={
  "audio/midi": ["mid", "midi", "kar", "rmi"],
  "audio/mp4": ["mp4a", "m4a"],
  "audio/mpeg": ["mpga", "mp2", "mp2a", "mp3", "m2a", "m3a"],
  "audio/ogg": ["oga", "ogg", "spx"],
  "audio/webm": ["weba"],
  "audio/x-matroska": ["mka"],
  "audio/x-mpegurl": ["m3u"],
  "audio/wav": ["wav"],
  "video/3gpp": ["3gp"],
  "video/3gpp2": ["3g2"],
  "video/mp4": ["mp4", "mp4v", "mpg4"],
  "video/mpeg": ["mpeg", "mpg", "mpe", "m1v", "m2v"],
  "video/ogg": ["ogv"],
  "video/quicktime": ["qt", "mov"],
  "video/webm": ["webm"],
  "video/x-f4v": ["f4v"],
  "video/x-fli": ["fli"],
  "video/x-flv": ["flv"],
  "video/x-m4v": ["m4v"],
  "video/x-matroska": ["mkv", "mk3d", "mks"]
}
},{}],133:[function(require,module,exports){
(function (global){
module.exports =
  global.performance &&
  global.performance.now ? function now() {
    return performance.now()
  } : Date.now || function now() {
    return +new Date
  }

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],134:[function(require,module,exports){
var isDom = require('is-dom')
var lookup = require('browser-media-mime-type')

module.exports.video = simpleMediaElement.bind(null, 'video')
module.exports.audio = simpleMediaElement.bind(null, 'audio')

function simpleMediaElement (elementName, sources, opt) {
  opt = opt || {}

  if (!Array.isArray(sources)) {
    sources = [ sources ]
  }

  var media = opt.element || document.createElement(elementName)

  if (opt.loop) media.setAttribute('loop', 'loop')
  if (opt.muted) media.setAttribute('muted', 'muted')
  if (opt.autoplay) media.setAttribute('autoplay', 'autoplay')
  if (opt.controls) media.setAttribute('controls', 'controls')
  if (opt.crossOrigin) media.setAttribute('crossorigin', opt.crossOrigin)
  if (opt.preload) media.setAttribute('preload', opt.preload)
  if (opt.poster) media.setAttribute('poster', opt.poster)
  if (typeof opt.volume !== 'undefined') media.setAttribute('volume', opt.volume)

  sources = sources.filter(Boolean)
  sources.forEach(function (source) {
    media.appendChild(createSourceElement(source))
  })

  return media
}

function createSourceElement (data) {
  if (isDom(data)) return data
  if (typeof data === 'string') {
    data = { src: data }
    if (data.src) {
      var ext = extension(data.src)
      if (ext) data.type = lookup(ext)
    }
  }

  var source = document.createElement('source')
  if (data.src) source.setAttribute('src', data.src)
  if (data.type) source.setAttribute('type', data.type)
  return source
}

function extension (data) {
  var extIdx = data.lastIndexOf('.')
  if (extIdx <= 0 || extIdx === data.length - 1) {
    return null
  }
  return data.substring(extIdx + 1)
}

},{"browser-media-mime-type":131,"is-dom":135}],135:[function(require,module,exports){
/*global window*/

/**
 * Check if object is dom node.
 *
 * @param {Object} val
 * @return {Boolean}
 * @api public
 */

module.exports = function isNode(val){
  if (!val || typeof val !== 'object') return false;
  if (window && 'object' == typeof window.Node) return val instanceof window.Node;
  return 'number' == typeof val.nodeType && 'string' == typeof val.nodeName;
}

},{}],136:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter

module.exports = progress

function progress(xhr) {
  var emitter = new EventEmitter
  var finished = false

  if (xhr.attachEvent) {
    xhr.attachEvent('onreadystatechange', done)
    return emitter
  }

  xhr.addEventListener('load', done, false)
  xhr.addEventListener('progress', progress, false)
  function progress(event) {
    var value = event.lengthComputable
      ? event.loaded / event.total
      : 0

    if (!finished) emitter.emit('data'
      , value
      , event.total || null
    )

    finished = value === 1
  }

  function done(event) {
    if (event.type !== 'load' && !/^(ready|complete)$/g.test(
      (event.currentTarget || event.srcElement).readyState
    )) return

    if (finished) return
    if (xhr.removeEventListener) {
      xhr.removeEventListener('load', done, false)
      xhr.removeEventListener('progress', progress, false)
    } else
    if (xhr.detatchEvent) {
      xhr.detatchEvent('onreadystatechange', done)
    }

    emitter.emit('data', 1, event.total || null)
    emitter.emit('done')
    finished = true
  }

  return emitter
}

},{"events":26}],137:[function(require,module,exports){
"use strict";
var window = require("global/window")
var once = require("once")
var isFunction = require("is-function")
var parseHeaders = require("parse-headers")
var xtend = require("xtend")

module.exports = createXHR
createXHR.XMLHttpRequest = window.XMLHttpRequest || noop
createXHR.XDomainRequest = "withCredentials" in (new createXHR.XMLHttpRequest()) ? createXHR.XMLHttpRequest : window.XDomainRequest

forEachArray(["get", "put", "post", "patch", "head", "delete"], function(method) {
    createXHR[method === "delete" ? "del" : method] = function(uri, options, callback) {
        options = initParams(uri, options, callback)
        options.method = method.toUpperCase()
        return _createXHR(options)
    }
})

function forEachArray(array, iterator) {
    for (var i = 0; i < array.length; i++) {
        iterator(array[i])
    }
}

function isEmpty(obj){
    for(var i in obj){
        if(obj.hasOwnProperty(i)) return false
    }
    return true
}

function initParams(uri, options, callback) {
    var params = uri

    if (isFunction(options)) {
        callback = options
        if (typeof uri === "string") {
            params = {uri:uri}
        }
    } else {
        params = xtend(options, {uri: uri})
    }

    params.callback = callback
    return params
}

function createXHR(uri, options, callback) {
    options = initParams(uri, options, callback)
    return _createXHR(options)
}

function _createXHR(options) {
    var callback = options.callback
    if(typeof callback === "undefined"){
        throw new Error("callback argument missing")
    }
    callback = once(callback)

    function readystatechange() {
        if (xhr.readyState === 4) {
            loadFunc()
        }
    }

    function getBody() {
        // Chrome with requestType=blob throws errors arround when even testing access to responseText
        var body = undefined

        if (xhr.response) {
            body = xhr.response
        } else if (xhr.responseType === "text" || !xhr.responseType) {
            body = xhr.responseText || xhr.responseXML
        }

        if (isJson) {
            try {
                body = JSON.parse(body)
            } catch (e) {}
        }

        return body
    }

    var failureResponse = {
                body: undefined,
                headers: {},
                statusCode: 0,
                method: method,
                url: uri,
                rawRequest: xhr
            }

    function errorFunc(evt) {
        clearTimeout(timeoutTimer)
        if(!(evt instanceof Error)){
            evt = new Error("" + (evt || "Unknown XMLHttpRequest Error") )
        }
        evt.statusCode = 0
        callback(evt, failureResponse)
    }

    // will load the data & process the response in a special response object
    function loadFunc() {
        if (aborted) return
        var status
        clearTimeout(timeoutTimer)
        if(options.useXDR && xhr.status===undefined) {
            //IE8 CORS GET successful response doesn't have a status field, but body is fine
            status = 200
        } else {
            status = (xhr.status === 1223 ? 204 : xhr.status)
        }
        var response = failureResponse
        var err = null

        if (status !== 0){
            response = {
                body: getBody(),
                statusCode: status,
                method: method,
                headers: {},
                url: uri,
                rawRequest: xhr
            }
            if(xhr.getAllResponseHeaders){ //remember xhr can in fact be XDR for CORS in IE
                response.headers = parseHeaders(xhr.getAllResponseHeaders())
            }
        } else {
            err = new Error("Internal XMLHttpRequest Error")
        }
        callback(err, response, response.body)

    }

    var xhr = options.xhr || null

    if (!xhr) {
        if (options.cors || options.useXDR) {
            xhr = new createXHR.XDomainRequest()
        }else{
            xhr = new createXHR.XMLHttpRequest()
        }
    }

    var key
    var aborted
    var uri = xhr.url = options.uri || options.url
    var method = xhr.method = options.method || "GET"
    var body = options.body || options.data || null
    var headers = xhr.headers = options.headers || {}
    var sync = !!options.sync
    var isJson = false
    var timeoutTimer

    if ("json" in options) {
        isJson = true
        headers["accept"] || headers["Accept"] || (headers["Accept"] = "application/json") //Don't override existing accept header declared by user
        if (method !== "GET" && method !== "HEAD") {
            headers["content-type"] || headers["Content-Type"] || (headers["Content-Type"] = "application/json") //Don't override existing accept header declared by user
            body = JSON.stringify(options.json)
        }
    }

    xhr.onreadystatechange = readystatechange
    xhr.onload = loadFunc
    xhr.onerror = errorFunc
    // IE9 must have onprogress be set to a unique function.
    xhr.onprogress = function () {
        // IE must die
    }
    xhr.ontimeout = errorFunc
    xhr.open(method, uri, !sync, options.username, options.password)
    //has to be after open
    if(!sync) {
        xhr.withCredentials = !!options.withCredentials
    }
    // Cannot set timeout with sync request
    // not setting timeout on the xhr object, because of old webkits etc. not handling that correctly
    // both npm's request and jquery 1.x use this kind of timeout, so this is being consistent
    if (!sync && options.timeout > 0 ) {
        timeoutTimer = setTimeout(function(){
            aborted=true//IE9 may still call readystatechange
            xhr.abort("timeout")
            var e = new Error("XMLHttpRequest timeout")
            e.code = "ETIMEDOUT"
            errorFunc(e)
        }, options.timeout )
    }

    if (xhr.setRequestHeader) {
        for(key in headers){
            if(headers.hasOwnProperty(key)){
                xhr.setRequestHeader(key, headers[key])
            }
        }
    } else if (options.headers && !isEmpty(options.headers)) {
        throw new Error("Headers cannot be set on an XDomainRequest object")
    }

    if ("responseType" in options) {
        xhr.responseType = options.responseType
    }

    if ("beforeSend" in options &&
        typeof options.beforeSend === "function"
    ) {
        options.beforeSend(xhr)
    }

    xhr.send(body)

    return xhr


}

function noop() {}

},{"global/window":138,"is-function":139,"once":140,"parse-headers":143,"xtend":144}],138:[function(require,module,exports){
(function (global){
if (typeof window !== "undefined") {
    module.exports = window;
} else if (typeof global !== "undefined") {
    module.exports = global;
} else if (typeof self !== "undefined"){
    module.exports = self;
} else {
    module.exports = {};
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],139:[function(require,module,exports){
module.exports = isFunction

var toString = Object.prototype.toString

function isFunction (fn) {
  var string = toString.call(fn)
  return string === '[object Function]' ||
    (typeof fn === 'function' && string !== '[object RegExp]') ||
    (typeof window !== 'undefined' &&
     // IE8 and below
     (fn === window.setTimeout ||
      fn === window.alert ||
      fn === window.confirm ||
      fn === window.prompt))
};

},{}],140:[function(require,module,exports){
module.exports = once

once.proto = once(function () {
  Object.defineProperty(Function.prototype, 'once', {
    value: function () {
      return once(this)
    },
    configurable: true
  })
})

function once (fn) {
  var called = false
  return function () {
    if (called) return
    called = true
    return fn.apply(this, arguments)
  }
}

},{}],141:[function(require,module,exports){
var isFunction = require('is-function')

module.exports = forEach

var toString = Object.prototype.toString
var hasOwnProperty = Object.prototype.hasOwnProperty

function forEach(list, iterator, context) {
    if (!isFunction(iterator)) {
        throw new TypeError('iterator must be a function')
    }

    if (arguments.length < 3) {
        context = this
    }
    
    if (toString.call(list) === '[object Array]')
        forEachArray(list, iterator, context)
    else if (typeof list === 'string')
        forEachString(list, iterator, context)
    else
        forEachObject(list, iterator, context)
}

function forEachArray(array, iterator, context) {
    for (var i = 0, len = array.length; i < len; i++) {
        if (hasOwnProperty.call(array, i)) {
            iterator.call(context, array[i], i, array)
        }
    }
}

function forEachString(string, iterator, context) {
    for (var i = 0, len = string.length; i < len; i++) {
        // no such thing as a sparse string.
        iterator.call(context, string.charAt(i), i, string)
    }
}

function forEachObject(object, iterator, context) {
    for (var k in object) {
        if (hasOwnProperty.call(object, k)) {
            iterator.call(context, object[k], k, object)
        }
    }
}

},{"is-function":139}],142:[function(require,module,exports){

exports = module.exports = trim;

function trim(str){
  return str.replace(/^\s*|\s*$/g, '');
}

exports.left = function(str){
  return str.replace(/^\s*/, '');
};

exports.right = function(str){
  return str.replace(/\s*$/, '');
};

},{}],143:[function(require,module,exports){
var trim = require('trim')
  , forEach = require('for-each')
  , isArray = function(arg) {
      return Object.prototype.toString.call(arg) === '[object Array]';
    }

module.exports = function (headers) {
  if (!headers)
    return {}

  var result = {}

  forEach(
      trim(headers).split('\n')
    , function (row) {
        var index = row.indexOf(':')
          , key = trim(row.slice(0, index)).toLowerCase()
          , value = trim(row.slice(index + 1))

        if (typeof(result[key]) === 'undefined') {
          result[key] = value
        } else if (isArray(result[key])) {
          result[key].push(value)
        } else {
          result[key] = [ result[key], value ]
        }
      }
  )

  return result
}
},{"for-each":141,"trim":142}],144:[function(require,module,exports){
arguments[4][122][0].apply(exports,arguments)
},{"dup":122}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJpbmRleC5qcyIsImxpYi9CbG9vbVBhc3MuanMiLCJsaWIvRWZmZWN0Q29tcG9zZXIuanMiLCJsaWIvYXBwLmpzIiwibGliL2F1ZGlvLmpzIiwibGliL2NvbG9yLXBhbGV0dGVzLmpzb24iLCJsaWIvY3JlYXRlQ29tcGxleC5qcyIsImxpYi9nZW9TY2VuZS5qcyIsImxpYi9pbnRyby1wYWxldHRlcy5qc29uIiwibGliL2ludHJvLmpzIiwibGliL2lzTW9iaWxlLmpzIiwibGliL2xvZy5qcyIsImxpYi9wYWxldHRlLmpzIiwibGliL3NldHVwSW50ZXJhY3Rpb25zLmpzIiwibGliL3NoYWRlci9TU0FPU2hhZGVyLmpzIiwibm9kZV9tb2R1bGVzL2FycmF5LXNodWZmbGUvaW5kZXguanMiLCJub2RlX21vZHVsZXMvYXVkaW8tZnJlcXVlbmN5LXRvLWluZGV4L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2JlYXRzL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2NsYW1wL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2RvbS1jc3MvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZG9tLWNzcy9ub2RlX21vZHVsZXMvYWRkLXB4LXRvLXN0eWxlL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2RvbS1jc3Mvbm9kZV9tb2R1bGVzL3ByZWZpeC1zdHlsZS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kb20tY3NzL25vZGVfbW9kdWxlcy90by1jYW1lbC1jYXNlL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2RvbS1jc3Mvbm9kZV9tb2R1bGVzL3RvLWNhbWVsLWNhc2Uvbm9kZV9tb2R1bGVzL3RvLXNwYWNlLWNhc2UvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZG9tLWNzcy9ub2RlX21vZHVsZXMvdG8tY2FtZWwtY2FzZS9ub2RlX21vZHVsZXMvdG8tc3BhY2UtY2FzZS9ub2RlX21vZHVsZXMvdG8tbm8tY2FzZS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9ldmVudHMvZXZlbnRzLmpzIiwibm9kZV9tb2R1bGVzL2dlby1hcmMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZ2VvLXBpZWNlcmluZy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9pbmRleC1vZi1hcnJheS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9pbmRleC1vZi1hcnJheS9ub2RlX21vZHVsZXMvYXJyYXktZXF1YWwvaW5kZXguanMiLCJub2RlX21vZHVsZXMvaW9zLXNhZmUtYXVkaW8tY29udGV4dC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9uZXctYXJyYXkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvb2JqZWN0LWFzc2lnbi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9vcmJpdC1jb250cm9scy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9vcmJpdC1jb250cm9scy9saWIvaW5wdXQuanMiLCJub2RlX21vZHVsZXMvb3JiaXQtY29udHJvbHMvbm9kZV9tb2R1bGVzL2RlZmluZWQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvb3JiaXQtY29udHJvbHMvbm9kZV9tb2R1bGVzL2dsLXF1YXQvaW52ZXJ0LmpzIiwibm9kZV9tb2R1bGVzL29yYml0LWNvbnRyb2xzL25vZGVfbW9kdWxlcy9nbC1xdWF0L25vZGVfbW9kdWxlcy9nbC12ZWM0L25vcm1hbGl6ZS5qcyIsIm5vZGVfbW9kdWxlcy9vcmJpdC1jb250cm9scy9ub2RlX21vZHVsZXMvZ2wtcXVhdC9ub3JtYWxpemUuanMiLCJub2RlX21vZHVsZXMvb3JiaXQtY29udHJvbHMvbm9kZV9tb2R1bGVzL2dsLXZlYzMvYWRkLmpzIiwibm9kZV9tb2R1bGVzL29yYml0LWNvbnRyb2xzL25vZGVfbW9kdWxlcy9nbC12ZWMzL2NvcHkuanMiLCJub2RlX21vZHVsZXMvb3JiaXQtY29udHJvbHMvbm9kZV9tb2R1bGVzL2dsLXZlYzMvY3Jvc3MuanMiLCJub2RlX21vZHVsZXMvb3JiaXQtY29udHJvbHMvbm9kZV9tb2R1bGVzL2dsLXZlYzMvZG90LmpzIiwibm9kZV9tb2R1bGVzL29yYml0LWNvbnRyb2xzL25vZGVfbW9kdWxlcy9nbC12ZWMzL2xlbmd0aC5qcyIsIm5vZGVfbW9kdWxlcy9vcmJpdC1jb250cm9scy9ub2RlX21vZHVsZXMvZ2wtdmVjMy9ub3JtYWxpemUuanMiLCJub2RlX21vZHVsZXMvb3JiaXQtY29udHJvbHMvbm9kZV9tb2R1bGVzL2dsLXZlYzMvc2V0LmpzIiwibm9kZV9tb2R1bGVzL29yYml0LWNvbnRyb2xzL25vZGVfbW9kdWxlcy9nbC12ZWMzL3N1YnRyYWN0LmpzIiwibm9kZV9tb2R1bGVzL29yYml0LWNvbnRyb2xzL25vZGVfbW9kdWxlcy9nbC12ZWMzL3RyYW5zZm9ybVF1YXQuanMiLCJub2RlX21vZHVsZXMvb3JiaXQtY29udHJvbHMvbm9kZV9tb2R1bGVzL21vdXNlLWV2ZW50LW9mZnNldC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9vcmJpdC1jb250cm9scy9ub2RlX21vZHVsZXMvbW91c2Utd2hlZWwvbm9kZV9tb2R1bGVzL3RvLXB4L25vZGVfbW9kdWxlcy9wYXJzZS11bml0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL29yYml0LWNvbnRyb2xzL25vZGVfbW9kdWxlcy9tb3VzZS13aGVlbC9ub2RlX21vZHVsZXMvdG8tcHgvdG9weC5qcyIsIm5vZGVfbW9kdWxlcy9vcmJpdC1jb250cm9scy9ub2RlX21vZHVsZXMvbW91c2Utd2hlZWwvd2hlZWwuanMiLCJub2RlX21vZHVsZXMvb3JiaXQtY29udHJvbHMvbm9kZV9tb2R1bGVzL3F1YXQtZnJvbS11bml0LXZlYzMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvb3JiaXQtY29udHJvbHMvbm9kZV9tb2R1bGVzL3RvdWNoLXBpbmNoL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL29yYml0LWNvbnRyb2xzL25vZGVfbW9kdWxlcy90b3VjaC1waW5jaC9ub2RlX21vZHVsZXMvZHByb3AvaW5kZXguanMiLCJub2RlX21vZHVsZXMvb3JiaXQtY29udHJvbHMvbm9kZV9tb2R1bGVzL3RvdWNoLXBpbmNoL25vZGVfbW9kdWxlcy9nbC12ZWMyL2Rpc3RhbmNlLmpzIiwibm9kZV9tb2R1bGVzL3BhdGgtYnJvd3NlcmlmeS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvcmFmLWxvb3AvaW5kZXguanMiLCJub2RlX21vZHVsZXMvcmFmLWxvb3Avbm9kZV9tb2R1bGVzL2luaGVyaXRzL2luaGVyaXRzX2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvcmFmLWxvb3Avbm9kZV9tb2R1bGVzL3JhZi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9yYWYtbG9vcC9ub2RlX21vZHVsZXMvcmFmL25vZGVfbW9kdWxlcy9wZXJmb3JtYW5jZS1ub3cvbGliL3BlcmZvcm1hbmNlLW5vdy5qcyIsIm5vZGVfbW9kdWxlcy9yYWYtbG9vcC9ub2RlX21vZHVsZXMvcmlnaHQtbm93L2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvcmFuZG9tLWZsb2F0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3JpZ2h0LW5vdy9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL3NvdW5kYmFuay1yZXZlcmIvYnVpbGQtaW1wdWxzZS5qcyIsIm5vZGVfbW9kdWxlcy9zb3VuZGJhbmstcmV2ZXJiL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RocmVlLWNvcHlzaGFkZXIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvdGhyZWUtZWZmZWN0Y29tcG9zZXIvbGliL2NsZWFybWFza3Bhc3MuanMiLCJub2RlX21vZHVsZXMvdGhyZWUtZWZmZWN0Y29tcG9zZXIvbGliL21hc2twYXNzLmpzIiwibm9kZV9tb2R1bGVzL3RocmVlLWVmZmVjdGNvbXBvc2VyL2xpYi9yZW5kZXJwYXNzLmpzIiwibm9kZV9tb2R1bGVzL3RocmVlLWVmZmVjdGNvbXBvc2VyL2xpYi9zaGFkZXJwYXNzLmpzIiwibm9kZV9tb2R1bGVzL3RocmVlLXNpbXBsaWNpYWwtY29tcGxleC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy90d2VlbnIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL2xvb3AuanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL25vZGVfbW9kdWxlcy9lYXNlcy9iYWNrLWluLW91dC5qcyIsIm5vZGVfbW9kdWxlcy90d2VlbnIvbm9kZV9tb2R1bGVzL2Vhc2VzL2JhY2staW4uanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL25vZGVfbW9kdWxlcy9lYXNlcy9iYWNrLW91dC5qcyIsIm5vZGVfbW9kdWxlcy90d2VlbnIvbm9kZV9tb2R1bGVzL2Vhc2VzL2JvdW5jZS1pbi1vdXQuanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL25vZGVfbW9kdWxlcy9lYXNlcy9ib3VuY2UtaW4uanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL25vZGVfbW9kdWxlcy9lYXNlcy9ib3VuY2Utb3V0LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvZWFzZXMvY2lyYy1pbi1vdXQuanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL25vZGVfbW9kdWxlcy9lYXNlcy9jaXJjLWluLmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvZWFzZXMvY2lyYy1vdXQuanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL25vZGVfbW9kdWxlcy9lYXNlcy9jdWJpYy1pbi1vdXQuanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL25vZGVfbW9kdWxlcy9lYXNlcy9jdWJpYy1pbi5qcyIsIm5vZGVfbW9kdWxlcy90d2VlbnIvbm9kZV9tb2R1bGVzL2Vhc2VzL2N1YmljLW91dC5qcyIsIm5vZGVfbW9kdWxlcy90d2VlbnIvbm9kZV9tb2R1bGVzL2Vhc2VzL2VsYXN0aWMtaW4tb3V0LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvZWFzZXMvZWxhc3RpYy1pbi5qcyIsIm5vZGVfbW9kdWxlcy90d2VlbnIvbm9kZV9tb2R1bGVzL2Vhc2VzL2VsYXN0aWMtb3V0LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvZWFzZXMvZXhwby1pbi1vdXQuanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL25vZGVfbW9kdWxlcy9lYXNlcy9leHBvLWluLmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvZWFzZXMvZXhwby1vdXQuanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL25vZGVfbW9kdWxlcy9lYXNlcy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy90d2VlbnIvbm9kZV9tb2R1bGVzL2Vhc2VzL2xpbmVhci5qcyIsIm5vZGVfbW9kdWxlcy90d2VlbnIvbm9kZV9tb2R1bGVzL2Vhc2VzL3F1YWQtaW4tb3V0LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvZWFzZXMvcXVhZC1pbi5qcyIsIm5vZGVfbW9kdWxlcy90d2VlbnIvbm9kZV9tb2R1bGVzL2Vhc2VzL3F1YWQtb3V0LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvZWFzZXMvcXVhcnQtaW4tb3V0LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvZWFzZXMvcXVhcnQtaW4uanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL25vZGVfbW9kdWxlcy9lYXNlcy9xdWFydC1vdXQuanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL25vZGVfbW9kdWxlcy9lYXNlcy9xdWludC1pbi1vdXQuanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL25vZGVfbW9kdWxlcy9lYXNlcy9xdWludC1pbi5qcyIsIm5vZGVfbW9kdWxlcy90d2VlbnIvbm9kZV9tb2R1bGVzL2Vhc2VzL3F1aW50LW91dC5qcyIsIm5vZGVfbW9kdWxlcy90d2VlbnIvbm9kZV9tb2R1bGVzL2Vhc2VzL3NpbmUtaW4tb3V0LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvZWFzZXMvc2luZS1pbi5qcyIsIm5vZGVfbW9kdWxlcy90d2VlbnIvbm9kZV9tb2R1bGVzL2Vhc2VzL3NpbmUtb3V0LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvbWl4ZXMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL25vZGVfbW9kdWxlcy90d2Vlbi10aWNrZXIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvdHdlZW5yL25vZGVfbW9kdWxlcy90d2Vlbi10aWNrZXIvbm9kZV9tb2R1bGVzL2FuLWFycmF5L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvdHdlZW4tdGlja2VyL25vZGVfbW9kdWxlcy9sZXJwLWFycmF5L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvdHdlZW4tdGlja2VyL25vZGVfbW9kdWxlcy9sZXJwLWFycmF5L25vZGVfbW9kdWxlcy9sZXJwL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvdHdlZW4tdGlja2VyL25vZGVfbW9kdWxlcy90d2Vlbi1iYXNlL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvdHdlZW4tdGlja2VyL25vZGVfbW9kdWxlcy90d2Vlbi1vYmplY3RzL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvdHdlZW4tdGlja2VyL25vZGVfbW9kdWxlcy90d2Vlbi1vYmplY3RzL2xpYi9lbmQtdGFyZ2V0LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvdHdlZW4tdGlja2VyL25vZGVfbW9kdWxlcy90d2Vlbi1vYmplY3RzL2xpYi9ncm91cC5qcyIsIm5vZGVfbW9kdWxlcy90d2VlbnIvbm9kZV9tb2R1bGVzL3R3ZWVuLXRpY2tlci9ub2RlX21vZHVsZXMvdHdlZW4tb2JqZWN0cy9saWIvb2JqZWN0LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMvdHdlZW4tdGlja2VyL25vZGVfbW9kdWxlcy90d2Vlbi1vYmplY3RzL25vZGVfbW9kdWxlcy9vd24tZW51bWVyYWJsZS1rZXlzL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuci9ub2RlX21vZHVsZXMveHRlbmQvaW1tdXRhYmxlLmpzIiwibm9kZV9tb2R1bGVzL3VubGVycC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93ZWItYXVkaW8tcGxheWVyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3dlYi1hdWRpby1wbGF5ZXIvbGliL2F1ZGlvLWNvbnRleHQuanMiLCJub2RlX21vZHVsZXMvd2ViLWF1ZGlvLXBsYXllci9saWIvYnVmZmVyLXNvdXJjZS5qcyIsIm5vZGVfbW9kdWxlcy93ZWItYXVkaW8tcGxheWVyL2xpYi9jYW4tcGxheS1zcmMuanMiLCJub2RlX21vZHVsZXMvd2ViLWF1ZGlvLXBsYXllci9saWIvZXZlbnQtYWRkLW9uY2UuanMiLCJub2RlX21vZHVsZXMvd2ViLWF1ZGlvLXBsYXllci9saWIvbWVkaWEtc291cmNlLmpzIiwibm9kZV9tb2R1bGVzL3dlYi1hdWRpby1wbGF5ZXIvbGliL3hoci1hdWRpby5qcyIsIm5vZGVfbW9kdWxlcy93ZWItYXVkaW8tcGxheWVyL25vZGVfbW9kdWxlcy9icm93c2VyLW1lZGlhLW1pbWUtdHlwZS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93ZWItYXVkaW8tcGxheWVyL25vZGVfbW9kdWxlcy9icm93c2VyLW1lZGlhLW1pbWUtdHlwZS9taW1lLXR5cGVzLmpzb24iLCJub2RlX21vZHVsZXMvd2ViLWF1ZGlvLXBsYXllci9ub2RlX21vZHVsZXMvcmlnaHQtbm93L2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvd2ViLWF1ZGlvLXBsYXllci9ub2RlX21vZHVsZXMvc2ltcGxlLW1lZGlhLWVsZW1lbnQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvd2ViLWF1ZGlvLXBsYXllci9ub2RlX21vZHVsZXMvc2ltcGxlLW1lZGlhLWVsZW1lbnQvbm9kZV9tb2R1bGVzL2lzLWRvbS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93ZWItYXVkaW8tcGxheWVyL25vZGVfbW9kdWxlcy94aHItcHJvZ3Jlc3MvaW5kZXguanMiLCJub2RlX21vZHVsZXMvd2ViLWF1ZGlvLXBsYXllci9ub2RlX21vZHVsZXMveGhyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3dlYi1hdWRpby1wbGF5ZXIvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvZ2xvYmFsL3dpbmRvdy5qcyIsIm5vZGVfbW9kdWxlcy93ZWItYXVkaW8tcGxheWVyL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL2lzLWZ1bmN0aW9uL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3dlYi1hdWRpby1wbGF5ZXIvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvb25jZS9vbmNlLmpzIiwibm9kZV9tb2R1bGVzL3dlYi1hdWRpby1wbGF5ZXIvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9ub2RlX21vZHVsZXMvZm9yLWVhY2gvaW5kZXguanMiLCJub2RlX21vZHVsZXMvd2ViLWF1ZGlvLXBsYXllci9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9wYXJzZS1oZWFkZXJzL25vZGVfbW9kdWxlcy90cmltL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3dlYi1hdWRpby1wbGF5ZXIvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvcGFyc2UtaGVhZGVycy9wYXJzZS1oZWFkZXJzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7QUNBQSxJQUFNLGFBQWEsUUFBUSxVQUFSLENBQW5CO0FBQ0EsSUFBTSxZQUFZLFFBQVEsV0FBUixDQUFsQjtBQUNBLElBQU0sV0FBVyxRQUFRLFdBQVIsQ0FBakI7QUFDQSxJQUFNLFdBQVcsUUFBUSxnQkFBUixDQUFqQjtBQUNBLElBQU0sYUFBYSxRQUFRLGVBQVIsQ0FBbkI7QUFDQSxJQUFNLFdBQVcsUUFBUSxXQUFSLENBQWpCO0FBQ0EsSUFBTSxvQkFBb0IsUUFBUSx5QkFBUixDQUExQjtBQUNBLElBQU0sTUFBTSxRQUFRLFdBQVIsQ0FBWjs7QUFFQSxJQUFNLFdBQVcsUUFBUSxnQkFBUixDQUFqQjtBQUNBLElBQU0sWUFBWSxRQUFRLGFBQVIsQ0FBbEI7QUFDQSxJQUFNLGlCQUFpQixRQUFRLHNCQUFSLENBQXZCO0FBQ0EsSUFBTSxZQUFZLFFBQVEsaUJBQVIsQ0FBbEI7QUFDQSxJQUFNLGFBQWEsUUFBUSx5QkFBUixDQUFuQjtBQUNBLElBQU0sY0FBYyxRQUFRLGFBQVIsQ0FBcEI7O0FBRUEsSUFBTSxRQUFRLElBQUksTUFBTSxLQUFWLENBQWdCLE9BQWhCLENBQWQ7QUFDQSxJQUFNLE1BQU0sRUFBRSxXQUFXLEtBQWIsRUFBb0IsT0FBTyxLQUEzQixFQUFrQyxTQUFTLEtBQTNDLEVBQVo7O2lCQUM4RSxVQUFVLEdBQVYsQzs7SUFBdEUsc0IsY0FBQSxzQjtJQUF3QixNLGNBQUEsTTtJQUFRLEssY0FBQSxLO0lBQU8sUSxjQUFBLFE7SUFBVSxRLGNBQUEsUTtJQUFVLE0sY0FBQSxNOzs7QUFFbkUsSUFBSSxnQkFBZ0IsSUFBcEI7QUFDQSxJQUFJLENBQUMsU0FBUyxVQUFULENBQW9CLEdBQXBCLENBQXdCLHFCQUF4QixDQUFMLEVBQXFEO0FBQ25ELE1BQUksT0FBTyxFQUFYLEVBQWUsT0FBTyxFQUFQLENBQVUsTUFBVixFQUFrQixPQUFsQixFQUEyQixPQUEzQixFQUFvQyxxQkFBcEMsRUFBMkQsQ0FBM0Q7QUFDZixVQUFRLElBQVIsQ0FBYSxtRUFBYjtBQUNBLGtCQUFnQixLQUFoQjtBQUNEOztBQUVELElBQUksYUFBYSxLQUFqQjtBQUNBLFNBQVMsVUFBVCxHQUFzQixJQUF0QjtBQUNBLFNBQVMsV0FBVCxHQUF1QixJQUF2QjtBQUNBLFNBQVMsV0FBVCxHQUF1QixHQUF2Qjs7QUFFQSxJQUFNLE1BQU0sb0JBQVo7QUFDQSxJQUFNLE1BQU0sb0JBQVo7QUFDQSxJQUFNLFVBQVUsYUFBYSxJQUFJLEtBQUosRUFBYixHQUEyQixJQUEzQztBQUNBLElBQU0sWUFBWSxvQkFBbEI7QUFDQSxJQUFNLFdBQVcsSUFBSSxjQUFKLENBQW1CLFFBQW5CLEVBQTZCLEdBQTdCLEVBQWtDLEdBQWxDLEVBQXVDLFNBQXZDLENBQWpCO0FBQ0EsSUFBTSxVQUFVLENBQUUsR0FBRixFQUFPLEdBQVAsRUFBWSxTQUFaLEVBQXVCLE9BQXZCLEVBQWlDLE1BQWpDLENBQXdDLE9BQXhDLENBQWhCOztBQUVBLElBQUksVUFBSixFQUFnQjtBQUNkLFdBQVMsWUFBVCxHQUF3QixPQUF4QjtBQUNBLFVBQVEsT0FBUixDQUFnQixJQUFoQixHQUF1QixNQUFNLFNBQTdCO0FBQ0QsQ0FIRCxNQUdPLElBQUksYUFBSixFQUFtQjtBQUN4QixZQUFVLFlBQVYsR0FBeUIsSUFBSSxNQUFNLFlBQVYsRUFBekI7QUFDRDs7QUFFRCxJQUFNLGNBQWMsYUFBYSxPQUFiLEdBQXVCLFVBQVUsWUFBckQ7O0FBRUEsSUFBTSxnQkFBZ0IsSUFBSSxNQUFNLGlCQUFWLEVBQXRCO0FBQ0EsY0FBYyxZQUFkLEdBQTZCLE1BQU0saUJBQW5DO0FBQ0EsY0FBYyxRQUFkLEdBQXlCLE1BQU0sVUFBL0I7O0FBRUEsSUFBSSxPQUFPLENBQVg7QUFDQSxJQUFJLE9BQU8sSUFBWDs7QUFFQSxJQUFNLE9BQU8sV0FBVyxNQUFYLEVBQW1CLEtBQW5CLEVBQWI7QUFDQTtBQUNBLE9BQU8sZ0JBQVAsQ0FBd0IsUUFBeEIsRUFBa0MsTUFBbEM7QUFDQSxPQUFPLGdCQUFQLENBQXdCLFlBQXhCLEVBQXNDO0FBQUEsU0FBTSxHQUFHLGNBQUgsRUFBTjtBQUFBLENBQXRDO0FBQ0E7OztBQUdBLElBQU0sUUFBUSxpQkFBaUIsSUFBakIsQ0FBc0IsVUFBVSxTQUFoQyxDQUFkO0FBQ0EsSUFBSSxLQUFKLEVBQVc7QUFBQTtBQUNULFFBQU0sWUFBWSxTQUFaLFNBQVksR0FBTTtBQUN0QixpQkFBVyxZQUFNO0FBQ2YsZUFBTyxRQUFQLENBQWdCLENBQWhCLEVBQW1CLENBQW5CO0FBQ0QsT0FGRCxFQUVHLEdBRkg7QUFHRCxLQUpEOztBQU1BO0FBQ0EsV0FBTyxnQkFBUCxDQUF3QixtQkFBeEIsRUFBNkMsWUFBTTtBQUNqRDtBQUNELEtBRkQsRUFFRyxLQUZIO0FBUlM7QUFXVjs7QUFFRCxPQUFPLFNBQVAsR0FBbUIsVUFBVSxDQUFWLEVBQWE7QUFDOUIsTUFBSSxFQUFFLE9BQUYsS0FBYyxFQUFsQixFQUFzQixPQUFPLEtBQVA7QUFDdkIsQ0FGRDtBQUdBOztBQUVBLElBQU0sZ0JBQWdCLENBQUMsS0FBdkI7QUFDQSxXQUFXLEVBQUUsVUFBVSxZQUFaLEVBQTBCLDRCQUExQixFQUFYOztBQUVBLFNBQVMsU0FBVCxHQUFzQjtBQUNwQixXQUFTLE9BQVQsQ0FBaUIsSUFBSSxlQUFlLFVBQW5CLENBQThCLEtBQTlCLEVBQXFDLE1BQXJDLENBQWpCOztBQUVBLE1BQUksYUFBSixFQUFtQjtBQUNqQixRQUFJLE9BQU8sSUFBSSxlQUFlLFVBQW5CLENBQThCLFVBQTlCLENBQVg7QUFDQSxTQUFLLFFBQUwsQ0FBYyxTQUFkLEdBQTBCLE9BQTFCO0FBQ0EsYUFBUyxPQUFULENBQWlCLElBQWpCO0FBQ0EsU0FBSyxRQUFMLENBQWMsTUFBZCxDQUFxQixLQUFyQixHQUE2QixXQUE3QjtBQUNBLFNBQUssUUFBTCxDQUFjLFVBQWQsQ0FBeUIsS0FBekIsR0FBaUMsT0FBTyxJQUF4QztBQUNBLFNBQUssUUFBTCxDQUFjLFNBQWQsQ0FBd0IsS0FBeEIsR0FBZ0MsT0FBTyxHQUF2QztBQUNEOztBQUVELFdBQVMsT0FBVCxDQUFpQixJQUFJLFNBQUosQ0FBYyxLQUFkLEVBQXFCLE1BQXJCLENBQWpCO0FBQ0EsV0FBUyxNQUFULENBQWdCLFNBQVMsTUFBVCxDQUFnQixNQUFoQixHQUF5QixDQUF6QyxFQUE0QyxjQUE1QyxHQUE2RCxJQUE3RDtBQUNEOztBQUVELFNBQVMsa0JBQVQsQ0FBNkIsY0FBN0IsRUFBNkM7QUFDM0MsbUJBQWlCLGtCQUFrQixDQUFuQztBQUNBLE1BQU0sU0FBUyxpQkFBaUIsQ0FBakIsR0FDWCxJQUFJLE1BQU0sc0JBQVYsQ0FBaUMsT0FBTyxVQUF4QyxFQUFvRCxPQUFPLFdBQTNELENBRFcsR0FFWCxJQUFJLE1BQU0saUJBQVYsQ0FBNEIsT0FBTyxVQUFuQyxFQUErQyxPQUFPLFdBQXRELENBRko7QUFHQSxTQUFPLE9BQVAsQ0FBZSxNQUFmLEdBQXdCLE1BQU0sU0FBOUI7QUFDQSxTQUFPLE9BQVAsQ0FBZSxTQUFmLEdBQTJCLE1BQU0sYUFBakM7QUFDQSxTQUFPLE9BQVAsQ0FBZSxTQUFmLEdBQTJCLE1BQU0sYUFBakM7QUFDQSxTQUFPLE9BQVAsQ0FBZSxlQUFmLEdBQWlDLEtBQWpDO0FBQ0EsU0FBTyxhQUFQLEdBQXVCLEtBQXZCO0FBQ0EsU0FBTyxXQUFQLEdBQXFCLElBQXJCO0FBQ0EsTUFBSSxpQkFBaUIsQ0FBckIsRUFBd0I7QUFDdEIsUUFBSSx5QkFBeUIsT0FBTyxPQUFQLENBQWUsS0FBZixFQUE3QjtBQUNBLDJCQUF1QixNQUF2QixHQUFnQyxNQUFNLFVBQXRDO0FBQ0EsMkJBQXVCLElBQXZCLEdBQThCLE1BQU0sU0FBcEM7QUFDQSxXQUFPLFdBQVAsQ0FBbUIsSUFBbkIsQ0FBd0Isc0JBQXhCO0FBQ0Q7QUFDRCxTQUFPLE1BQVA7QUFDRDs7QUFFRCxTQUFTLE1BQVQsR0FBbUI7QUFDakIsTUFBTSxNQUFNLFNBQVMsYUFBVCxFQUFaO0FBQ0EsTUFBTSxPQUFPLFNBQVMsT0FBVCxFQUFiO0FBQ0EsTUFBTSxRQUFRLEtBQUssS0FBTCxHQUFhLEdBQTNCO0FBQ0EsTUFBTSxTQUFTLEtBQUssTUFBTCxHQUFjLEdBQTdCO0FBQ0EsVUFBUSxPQUFSLENBQWdCLGFBQUs7QUFDbkIsTUFBRSxPQUFGLENBQVUsS0FBVixFQUFpQixNQUFqQjtBQUNELEdBRkQ7QUFHRDs7QUFFRCxTQUFTLE1BQVQsQ0FBaUIsRUFBakIsRUFBcUI7QUFDbkIsVUFBUSxLQUFLLEdBQUwsQ0FBUyxFQUFULEVBQWEsRUFBYixJQUFtQixJQUEzQjtBQUNBLE1BQUksSUFBSixFQUFVO0FBQ1IsU0FBSyxRQUFMLENBQWMsQ0FBZCxHQUFrQixLQUFLLEdBQUwsQ0FBUyxJQUFULElBQWlCLElBQWpCLEdBQXdCLENBQTFDO0FBQ0EsU0FBSyxRQUFMLENBQWMsQ0FBZCxJQUFtQixLQUFLLE9BQXhCO0FBQ0Q7O0FBRUQ7O0FBRUEsTUFBTSxXQUFXLFNBQVMsYUFBVCxFQUFqQjtBQUNBLE1BQUksVUFBSixFQUFnQjtBQUNkLFVBQU0sZ0JBQU4sR0FBeUIsYUFBekI7QUFDQSxhQUFTLGVBQVQsQ0FBeUIsT0FBekI7QUFDQSxhQUFTLGFBQVQsQ0FBdUIsS0FBdkIsRUFBOEIsQ0FBOUI7QUFDQSxhQUFTLEtBQVQsQ0FBZSxJQUFmLEVBQXFCLElBQXJCLEVBQTJCLElBQTNCO0FBQ0EsYUFBUyxNQUFULENBQWdCLEtBQWhCLEVBQXVCLE1BQXZCLEVBQStCLE9BQS9CO0FBQ0Q7O0FBRUQsV0FBUyxNQUFULENBQWdCLE9BQWhCLENBQXdCLGdCQUFRO0FBQzlCLFFBQUksS0FBSyxRQUFMLElBQWlCLEtBQUssUUFBTCxDQUFjLFVBQW5DLEVBQStDO0FBQzdDLFdBQUssUUFBTCxDQUFjLFVBQWQsQ0FBeUIsS0FBekIsQ0FBK0IsR0FBL0IsQ0FBbUMsVUFBVSxLQUE3QyxFQUFvRCxVQUFVLE1BQTlEO0FBQ0Q7QUFDRixHQUpEOztBQU1BLFdBQVMsZUFBVCxDQUF5QixJQUF6QjtBQUNBLFdBQVMsYUFBVCxDQUF1QixRQUF2QixFQUFpQyxDQUFqQztBQUNBLFFBQU0sZ0JBQU4sR0FBeUIsSUFBekI7QUFDQSxNQUFJLFNBQVMsTUFBVCxDQUFnQixNQUFoQixHQUF5QixDQUE3QixFQUFnQyxTQUFTLE1BQVQsR0FBaEMsS0FDSyxTQUFTLE1BQVQsQ0FBZ0IsS0FBaEIsRUFBdUIsTUFBdkI7QUFDTjs7QUFFRCxTQUFTLFVBQVQsT0FBMkM7QUFBQSxNQUFwQixRQUFvQixRQUFwQixRQUFvQjtBQUFBLE1BQVYsTUFBVSxRQUFWLE1BQVU7O0FBQ3pDLFdBQVMsYUFBVCxDQUF1QixTQUF2QixFQUFrQyxLQUFsQyxDQUF3QyxPQUF4QyxHQUFrRCxPQUFsRDs7O0FBR0EsTUFBTSxNQUFNLFNBQVMsRUFBRSxrQkFBRixFQUFZLFlBQVosRUFBbUIsY0FBbkIsRUFBMkIsVUFBM0IsRUFBaUMsY0FBakMsRUFBeUMsa0JBQXpDLEVBQVQsQ0FBWjs7QUFFQSxNQUFNLGlCQUFpQixDQUFFLE1BQUYsRUFBVSxTQUFWLENBQXZCO0FBQ0EsTUFBSSxVQUFKLENBQWUsY0FBZjtBQUNBLFdBQVMsSUFBVCxDQUFjLEtBQWQsQ0FBb0IsVUFBcEIsR0FBaUMsU0FBakM7O0FBRUEsTUFBTSxRQUFRLGFBQWQ7QUFDQSxNQUFJLFVBQVUsS0FBZDtBQUNBLE1BQUksT0FBTyxDQUFYO0FBQ0EsTUFBSSxpQkFBaUIsS0FBckI7QUFDQSxNQUFJLG1CQUFtQixTQUFTLE1BQU0sUUFBZixFQUF5QixJQUF6QixDQUF2QjtBQUNBLE1BQUksd0JBQXdCLEtBQTVCO0FBQ0EsTUFBSSx3QkFBSjs7QUFFQSxNQUFNLGVBQWUsQ0FBRSxNQUFGLEVBQVUsU0FBVixFQUFxQixTQUFyQixDQUFyQjtBQUNBLE1BQU0sZUFBZSxrQkFBa0IsRUFBRSwwQkFBRixFQUFnQixZQUFoQixFQUF1QixrQkFBdkIsRUFBaUMsWUFBakMsRUFBd0MsY0FBeEMsRUFBZ0QsUUFBaEQsRUFBbEIsQ0FBckI7O0FBRUEsTUFBTSxlQUFlLFlBQVksWUFBTTtBQUNyQyxRQUFJLFlBQUo7QUFDRCxHQUZvQixFQUVsQixHQUZrQixDQUFyQjs7QUFJQSxNQUFJLFFBQUosRUFBYztBQUNaLFVBQU0sSUFBTjtBQUNELEdBRkQsTUFFTztBQUNMLFVBQU0sS0FBTjtBQUNBLFVBQU0sSUFBTixDQUFXLE9BQVgsRUFBb0IsWUFBTTtBQUN4QixZQUFNLFVBQU47QUFDRCxLQUZEO0FBR0Q7OztBQUdELGVBQWEsRUFBYixDQUFnQixNQUFoQixFQUF3QixZQUFNO0FBQzVCO0FBQ0EsNEJBQXdCLEtBQXhCO0FBQ0QsR0FIRDs7O0FBTUEsZUFBYSxJQUFiLENBQWtCLE1BQWxCLEVBQTBCLFVBQUMsUUFBRCxFQUFjO0FBQ3RDLFFBQUksbUJBQW1CLElBQXZCO0FBQ0EsUUFBTSxpQkFBaUIsU0FBakIsY0FBaUIsR0FBTTtBQUMzQixVQUFNLGlCQUFpQixJQUF2QjtBQUNBLHlCQUFtQixXQUFXLFlBQU07QUFDbEM7QUFDRCxPQUZrQixFQUVoQixjQUZnQixDQUFuQjtBQUdELEtBTEQ7QUFNQSxRQUFJLENBQUMsUUFBTCxFQUFlLE1BQU0sSUFBTixDQUFXLE9BQVgsRUFBb0IsY0FBcEIsRUFBZixLQUNLO0FBQ0wsaUJBQWEsSUFBYixDQUFrQixPQUFsQixFQUEyQixZQUFNO0FBQy9CLFVBQUksZ0JBQUosRUFBc0IsYUFBYSxnQkFBYjtBQUN2QixLQUZEO0FBR0QsR0FiRDs7QUFlQSxZQUFVLEVBQUUsMEJBQUYsRUFBVixFQUE0QixZQUFNO0FBQ2hDLGNBQVUsSUFBVjtBQUNBLGtCQUFjLFlBQWQ7QUFDRCxHQUhEOztBQUtBLGNBQVksWUFBTTtBQUNoQixTQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksaUJBQWlCLE1BQXJDLEVBQTZDLEdBQTdDLEVBQWtEO0FBQ2hELHVCQUFpQixDQUFqQixJQUFzQixJQUF0QjtBQUNEO0FBQ0YsR0FKRCxFQUlHLEdBSkg7O0FBTUEsT0FBSyxFQUFMLENBQVEsTUFBUixFQUFnQixjQUFNO0FBQ3BCLFlBQVEsRUFBUjtBQUNBLFFBQUksQ0FBQyxPQUFMLEVBQWM7O0FBRWQsVUFBTSxNQUFOLENBQWEsRUFBYjs7QUFFQSxTQUFLLElBQUksSUFBSSxDQUFiLEVBQWdCLElBQUksTUFBTSxLQUFOLENBQVksTUFBaEMsRUFBd0MsR0FBeEMsRUFBNkM7QUFDM0MsVUFBSSxpQkFBaUIsQ0FBakIsS0FBdUIsTUFBTSxLQUFOLENBQVksQ0FBWixDQUEzQixFQUEyQztBQUN6QyxZQUFJLFlBQUosQ0FBaUIsRUFBRSxNQUFNLENBQVIsRUFBakI7QUFDQSx5QkFBaUIsQ0FBakIsSUFBc0IsS0FBdEI7QUFDRDtBQUNGO0FBQ0QsUUFBSSxDQUFDLGFBQWEsT0FBZCxJQUF5QixxQkFBekIsSUFBa0QsTUFBTSxLQUFOLENBQVksQ0FBWixDQUFsRCxJQUFvRSxjQUF4RSxFQUF3RjtBQUN0RixVQUFJLFdBQUo7QUFDQSw4QkFBd0IsS0FBeEI7QUFDRDtBQUNGLEdBaEJEOztBQWtCQSxXQUFTLFNBQVQsR0FBc0I7QUFDcEIscUJBQWlCLElBQWpCO0FBQ0EsUUFBSSxXQUFKO0FBQ0E7QUFDRDs7QUFFRCxXQUFTLG9CQUFULEdBQWlDO0FBQy9CLDRCQUF3QixLQUF4QjtBQUNBLFFBQUksZUFBSixFQUFxQixjQUFjLGVBQWQ7QUFDckIsc0JBQWtCLFlBQVksWUFBTTtBQUNsQyw4QkFBd0IsSUFBeEI7QUFDRCxLQUZpQixFQUVmLElBRmUsQ0FBbEI7QUFHRDtBQUNGOztBQUVELFNBQVMsVUFBVCxHQUF1QjtBQUNyQixNQUFJLEtBQUo7QUFDRDs7Ozs7QUN2UUQsSUFBTSxVQUFVLFFBQVEsU0FBUixDQUFoQjtBQUNBLElBQU0sUUFBUSxRQUFRLE9BQVIsQ0FBZDtBQUNBLElBQU0sYUFBYSxRQUFRLGtCQUFSLENBQW5CO0FBQ0EsSUFBTSxXQUFXLFFBQVEsWUFBUixDQUFqQjtBQUNBLElBQU0sYUFBYSxDQUFuQjtBQUNBLElBQU0sVUFBVSxJQUFoQjs7QUFFQSxPQUFPLE9BQVAsR0FBaUIsU0FBakI7QUFDQSxTQUFTLFNBQVQsQ0FBb0IsS0FBcEIsRUFBMkIsTUFBM0IsRUFBNkM7QUFBQSxNQUFWLEdBQVUseURBQUosRUFBSTs7QUFDM0MsT0FBSyxLQUFMLEdBQWEsS0FBYjtBQUNBLE9BQUssTUFBTCxHQUFjLE1BQWQ7O0FBRUEsT0FBSyxlQUFMLEdBQXVCLElBQUksTUFBTSxjQUFWLENBQXlCLFVBQXpCLENBQXZCOztBQUVBLE9BQUssVUFBTCxHQUFrQixJQUFsQjtBQUNBLE9BQUssV0FBTCxHQUFtQixJQUFuQjtBQUNBLE9BQUssV0FBTCxHQUFtQixJQUFuQixDO0FBQ0EsT0FBSyxnQkFBTCxHQUF3QixJQUF4Qjs7QUFFQSxPQUFLLE9BQUwsR0FBZSxJQUFmO0FBQ0EsT0FBSyxTQUFMLEdBQWlCLElBQWpCO0FBQ0EsT0FBSyxRQUFMLEdBQWdCLElBQUksTUFBTSxLQUFWLEVBQWhCO0FBQ0EsT0FBSyxRQUFMLEdBQWdCLENBQWhCO0FBQ0EsT0FBSyxVQUFMLEdBQWtCLElBQUksTUFBTSxLQUFWLENBQWdCLE1BQWhCLENBQWxCO0FBQ0EsT0FBSyxVQUFMLEdBQWtCLENBQWxCOztBQUVBLE9BQUssVUFBTCxHQUFrQixJQUFJLE1BQU0saUJBQVYsQ0FBNEI7QUFDNUMsa0JBQWMsUUFBUSxZQUFZLG1CQUFwQixDQUQ4QjtBQUU1QyxvQkFBZ0IsUUFBUSxZQUFZLHlCQUFwQixDQUY0QjtBQUc1QyxjQUFVO0FBQ1IsZ0JBQVUsRUFBRSxNQUFNLEdBQVIsRUFBYSxPQUFPLElBQXBCLEVBREY7QUFFUixrQkFBWSxFQUFFLE1BQU0sSUFBUixFQUFjLE9BQU8sSUFBSSxNQUFNLE9BQVYsQ0FBa0IsQ0FBbEIsRUFBcUIsQ0FBckIsQ0FBckI7QUFGSjtBQUhrQyxHQUE1QixDQUFsQjtBQVFBLE9BQUssVUFBTCxDQUFnQixJQUFoQixHQUF1QixxQkFBdkI7O0FBRUEsT0FBSyxhQUFMLEdBQXFCLElBQUksTUFBTSxpQkFBVixDQUE0QjtBQUMvQyxrQkFBYyxRQUFRLFlBQVksbUJBQXBCLENBRGlDO0FBRS9DLG9CQUFnQixRQUFRLFlBQVksNEJBQXBCLENBRitCO0FBRy9DLGNBQVU7QUFDUixrQkFBWSxFQUFFLE1BQU0sSUFBUixFQUFjLE9BQU8sSUFBSSxNQUFNLE9BQVYsRUFBckIsRUFESjtBQUVSLGdCQUFVLEVBQUUsTUFBTSxHQUFSLEVBQWEsT0FBTyxJQUFwQixFQUZGO0FBR1IscUJBQWUsRUFBRSxNQUFNLEdBQVIsRUFBYSxPQUFPLElBQXBCO0FBSFA7QUFIcUMsR0FBNUIsQ0FBckI7QUFTQSxPQUFLLGFBQUwsQ0FBbUIsSUFBbkIsR0FBMEIsd0JBQTFCOztBQUVBLE9BQUssVUFBTCxHQUFrQixJQUFJLE1BQU0sa0JBQVYsQ0FBNkIsQ0FBQyxDQUE5QixFQUFpQyxDQUFqQyxFQUFvQyxDQUFwQyxFQUF1QyxDQUFDLENBQXhDLEVBQTJDLENBQTNDLEVBQThDLENBQTlDLENBQWxCO0FBQ0EsT0FBSyxTQUFMLEdBQWlCLElBQUksTUFBTSxLQUFWLEVBQWpCOztBQUVBLE9BQUssUUFBTCxHQUFnQixJQUFJLE1BQU0sSUFBVixDQUFlLElBQUksTUFBTSxtQkFBVixDQUE4QixDQUE5QixFQUFpQyxDQUFqQyxDQUFmLENBQWhCO0FBQ0EsT0FBSyxRQUFMLENBQWMsSUFBZCxHQUFxQixrQkFBckI7QUFDQSxPQUFLLFNBQUwsQ0FBZSxHQUFmLENBQW1CLEtBQUssUUFBeEI7O0FBRUEsT0FBSyxjQUFMLEdBQXNCLEtBQXRCO0FBQ0Q7O0FBRUQsVUFBVSxTQUFWLEdBQXNCOztBQUVwQixrQkFBZ0Isd0JBQVUsWUFBVixFQUF3QjtBQUN0QyxRQUFJLFFBQVEsYUFBYSxLQUF6QjtBQUNBLFFBQUksU0FBUyxhQUFhLE1BQTFCO0FBQ0EsUUFBSSxZQUFZLE1BQU0sS0FBSyxLQUFMLENBQVcsUUFBUSxVQUFuQixDQUFOLEVBQXNDLENBQXRDLEVBQXlDLE9BQXpDLENBQWhCO0FBQ0EsUUFBSSxhQUFhLE1BQU0sS0FBSyxLQUFMLENBQVcsU0FBUyxVQUFwQixDQUFOLEVBQXVDLENBQXZDLEVBQTBDLE9BQTFDLENBQWpCO0FBQ0EsUUFBSSxDQUFDLEtBQUssZ0JBQU4sSUFBMEIsQ0FBQyxLQUFLLFdBQXBDLEVBQWlEO0FBQy9DLFdBQUssV0FBTCxHQUFtQixJQUFJLE1BQU0saUJBQVYsQ0FBNEIsU0FBNUIsRUFBdUMsVUFBdkMsQ0FBbkI7QUFDQSxXQUFLLFdBQUwsQ0FBaUIsT0FBakIsQ0FBeUIsU0FBekIsR0FBcUMsTUFBTSxZQUEzQztBQUNBLFdBQUssV0FBTCxDQUFpQixPQUFqQixDQUF5QixTQUF6QixHQUFxQyxNQUFNLFlBQTNDO0FBQ0EsV0FBSyxXQUFMLENBQWlCLE9BQWpCLENBQXlCLGVBQXpCLEdBQTJDLEtBQTNDO0FBQ0EsV0FBSyxXQUFMLENBQWlCLFdBQWpCLEdBQStCLElBQS9CO0FBQ0EsV0FBSyxXQUFMLENBQWlCLGFBQWpCLEdBQWlDLEtBQWpDO0FBQ0EsV0FBSyxnQkFBTCxHQUF3QixLQUFLLFdBQUwsQ0FBaUIsS0FBakIsRUFBeEI7QUFDRCxLQVJELE1BUU8sSUFBSSxLQUFLLGdCQUFMLENBQXNCLEtBQXRCLEtBQWdDLEtBQWhDLElBQXlDLEtBQUssZ0JBQUwsQ0FBc0IsTUFBdEIsS0FBaUMsTUFBOUUsRUFBc0Y7QUFDM0YsV0FBSyxnQkFBTCxDQUFzQixPQUF0QixDQUE4QixTQUE5QixFQUF5QyxVQUF6QztBQUNBLFdBQUssV0FBTCxDQUFpQixPQUFqQixDQUF5QixTQUF6QixFQUFvQyxVQUFwQztBQUNEO0FBQ0YsR0FuQm1COztBQXFCcEIsVUFBUSxnQkFBVSxRQUFWLEVBQW9CLFdBQXBCLEVBQWlDLFVBQWpDLEVBQTZDLEtBQTdDLEVBQW9EO0FBQzFELFNBQUssY0FBTCxDQUFvQixVQUFwQjtBQUNBLFFBQUksY0FBYyxLQUFLLGNBQUwsR0FBc0IsU0FBdEIsR0FBa0MsV0FBcEQ7OztBQUdBLFNBQUssUUFBTCxDQUFjLElBQWQsQ0FBbUIsU0FBUyxhQUFULEVBQW5CO0FBQ0EsU0FBSyxRQUFMLEdBQWdCLFNBQVMsYUFBVCxFQUFoQjtBQUNBLFFBQUksZUFBZSxTQUFTLFNBQTVCOzs7QUFHQSxhQUFTLGFBQVQsQ0FBdUIsS0FBSyxVQUE1QixFQUF3QyxLQUFLLFVBQTdDO0FBQ0EsYUFBUyxTQUFULEdBQXFCLEtBQXJCO0FBQ0EsYUFBUyxXQUFULENBQXFCLEtBQUssZ0JBQTFCLEVBQTRDLElBQTVDLEVBQWtELElBQWxELEVBQXdELEtBQXhEOzs7QUFHQSxhQUFTLE1BQVQsQ0FBZ0IsS0FBSyxLQUFyQixFQUE0QixLQUFLLE1BQWpDLEVBQXlDLEtBQUssZ0JBQTlDLEVBQWdFLEtBQWhFOzs7QUFHQSxTQUFLLFNBQUwsQ0FBZSxnQkFBZixHQUFrQyxLQUFLLFVBQXZDOztBQUVBLFNBQUssVUFBTCxDQUFnQixRQUFoQixDQUF5QixVQUF6QixDQUFvQyxLQUFwQyxDQUEwQyxHQUExQyxDQUE4QyxLQUFLLGdCQUFMLENBQXNCLEtBQXBFLEVBQTJFLEtBQUssZ0JBQUwsQ0FBc0IsTUFBakc7QUFDQSxTQUFLLFVBQUwsQ0FBZ0IsUUFBaEIsQ0FBeUIsUUFBekIsQ0FBa0MsS0FBbEMsR0FBMEMsS0FBSyxnQkFBL0M7QUFDQSxhQUFTLE1BQVQsQ0FBZ0IsS0FBSyxTQUFyQixFQUFnQyxLQUFLLFVBQXJDLEVBQWlELEtBQUssV0FBdEQsRUFBbUUsSUFBbkU7OztBQUdBLFNBQUssU0FBTCxDQUFlLGdCQUFmLEdBQWtDLEtBQUssYUFBdkM7QUFDQSxTQUFLLGFBQUwsQ0FBbUIsUUFBbkIsQ0FBNEIsUUFBNUIsQ0FBcUMsS0FBckMsR0FBNkMsVUFBN0M7QUFDQSxTQUFLLGFBQUwsQ0FBbUIsUUFBbkIsQ0FBNEIsYUFBNUIsQ0FBMEMsS0FBMUMsR0FBa0QsS0FBSyxXQUF2RDs7QUFFQSxRQUFJLE1BQU0sU0FBUyxhQUFULEVBQVY7QUFDQSxTQUFLLGFBQUwsQ0FBbUIsUUFBbkIsQ0FBNEIsVUFBNUIsQ0FBdUMsS0FBdkMsQ0FBNkMsR0FBN0MsQ0FDRSxjQUFjLFlBQVksS0FBMUIsR0FBbUMsT0FBTyxVQUFQLEdBQW9CLEdBRHpELEVBRUUsY0FBYyxZQUFZLE1BQTFCLEdBQW9DLE9BQU8sV0FBUCxHQUFxQixHQUYzRDtBQUlBLGFBQVMsTUFBVCxDQUFnQixLQUFLLFNBQXJCLEVBQWdDLEtBQUssVUFBckMsRUFBaUQsV0FBakQsRUFBOEQsSUFBOUQ7O0FBRUEsYUFBUyxhQUFULENBQXVCLEtBQUssUUFBNUIsRUFBc0MsS0FBSyxRQUEzQztBQUNBLGFBQVMsU0FBVCxHQUFxQixZQUFyQjtBQUNEOztBQTNEbUIsQ0FBdEI7Ozs7Ozs7OztBQ3JEQSxPQUFPLE9BQVAsR0FBaUIsY0FBakI7O0FBRUEsSUFBSSxhQUFhLGVBQWUsVUFBZixHQUE0QixRQUFRLGtCQUFSLENBQTdDO0lBQ0ksYUFBYSxlQUFlLFVBQWYsR0FBNEIsUUFBUSxxQ0FBUixFQUErQyxLQUEvQyxDQUQ3QztJQUVJLGFBQWEsZUFBZSxVQUFmLEdBQTRCLFFBQVEscUNBQVIsRUFBK0MsS0FBL0MsRUFBc0QsY0FBdEQsQ0FGN0M7SUFHSSxXQUFXLGVBQWUsUUFBZixHQUEwQixRQUFRLG1DQUFSLEVBQTZDLEtBQTdDLENBSHpDO0lBSUksZ0JBQWdCLGVBQWUsYUFBZixHQUErQixRQUFRLHdDQUFSLEVBQWtELEtBQWxELENBSm5EOztBQU1BLFNBQVMsY0FBVCxDQUF5QixRQUF6QixFQUFtQyxhQUFuQyxFQUFrRCxhQUFsRCxFQUFpRSxtQkFBakUsRUFBdUY7QUFDckYsT0FBSyxRQUFMLEdBQWdCLFFBQWhCOztBQUVBLE1BQUssa0JBQWtCLFNBQXZCLEVBQW1DO0FBQ2pDLFVBQU0sSUFBSSxLQUFKLENBQVUsc0JBQVYsQ0FBTjtBQUNEOztBQUVELE9BQUssYUFBTCxHQUFxQixhQUFyQjtBQUNBLE9BQUssYUFBTCxHQUFxQixhQUFyQjtBQUNBLE9BQUssbUJBQUwsR0FBMkIsbUJBQTNCOztBQUVBLE9BQUssV0FBTCxHQUFtQixLQUFLLGFBQXhCO0FBQ0EsT0FBSyxVQUFMLEdBQWtCLEtBQUssYUFBdkI7O0FBRUEsT0FBSyxNQUFMLEdBQWMsRUFBZDs7QUFFQSxPQUFLLFFBQUwsR0FBZ0IsSUFBSSxVQUFKLENBQWdCLFVBQWhCLENBQWhCO0FBQ0Q7O0FBRUQsZUFBZSxTQUFmLEdBQTJCO0FBQ3pCLGVBQWEsdUJBQVc7O0FBRXRCLFFBQUksTUFBTSxLQUFLLFVBQWY7QUFDQSxTQUFLLFVBQUwsR0FBa0IsS0FBSyxXQUF2QjtBQUNBLFNBQUssV0FBTCxHQUFtQixHQUFuQjtBQUVELEdBUHdCOztBQVN6QixXQUFTLGlCQUFXLElBQVgsRUFBa0I7O0FBRXpCLFNBQUssTUFBTCxDQUFZLElBQVosQ0FBa0IsSUFBbEI7QUFFRCxHQWJ3Qjs7QUFlekIsZUFBYSx1QkFBWTtBQUN2QixTQUFLLE1BQUwsQ0FBWSxNQUFaLEdBQXFCLENBQXJCO0FBQ0QsR0FqQndCOztBQW1CekIsY0FBWSxvQkFBVyxJQUFYLEVBQWlCLEtBQWpCLEVBQXlCOztBQUVuQyxTQUFLLE1BQUwsQ0FBWSxNQUFaLENBQW9CLEtBQXBCLEVBQTJCLENBQTNCLEVBQThCLElBQTlCO0FBQ0EsU0FBSyxpQkFBTCxHQUF5QixJQUFJLE1BQU0sS0FBVixDQUFnQixDQUFoQixFQUFtQixDQUFuQixFQUFzQixDQUF0QixDQUF6QjtBQUNELEdBdkJ3Qjs7QUF5QnpCLFVBQVEsZ0JBQVcsS0FBWCxFQUFtQjs7QUFFekIsU0FBSyxXQUFMLEdBQW1CLEtBQUssYUFBeEI7QUFDQSxTQUFLLFVBQUwsR0FBa0IsS0FBSyxhQUF2Qjs7QUFFQSxRQUFJLGFBQWEsS0FBakI7O0FBRUEsUUFBSSxJQUFKO1FBQVUsQ0FBVjtRQUFhLFNBQWI7UUFBd0IsS0FBSyxLQUFLLE1BQUwsQ0FBWSxNQUF6Qzs7QUFFQSxTQUFNLElBQUksQ0FBSixFQUFPLFlBQVksQ0FBekIsRUFBNEIsSUFBSSxFQUFoQyxFQUFvQyxHQUFwQyxFQUEyQzs7QUFFekMsYUFBTyxLQUFLLE1BQUwsQ0FBYSxDQUFiLENBQVA7O0FBRUEsVUFBSyxDQUFDLEtBQUssT0FBWCxFQUFxQjtBQUNuQjtBQUNEOztBQUVELFVBQUksVUFBSjtBQUNBLFVBQUksV0FBSjtBQUNBLFVBQUksYUFBYSxDQUFqQixFQUFvQjs7QUFFbEIsc0JBQWMsS0FBSyxXQUFuQjtBQUNBLHFCQUFhLEtBQUssbUJBQWxCO0FBQ0QsT0FKRCxNQUlPOztBQUVMLHNCQUFjLEtBQUssV0FBbkI7QUFDQSxxQkFBYSxLQUFLLFVBQWxCO0FBQ0Q7O0FBRUQsVUFBSSxZQUFKO0FBQ0EsVUFBSSxLQUFLLFlBQVQsRUFBdUI7QUFDckIsdUJBQWUsS0FBSyxZQUFwQjtBQUNELE9BRkQsTUFFTztBQUNMLHVCQUFlLGNBQWMsQ0FBZCxHQUNiLFNBRGEsR0FFYixLQUFLLG1CQUFMLENBQXlCLFlBRjNCO0FBR0Q7QUFDRCxVQUFJLGNBQWMsS0FBSyxtQkFBTCxDQUF5QixXQUEzQztBQUNBLFdBQUssTUFBTCxDQUFhLEtBQUssUUFBbEIsRUFBNEIsV0FBNUIsRUFBeUMsVUFBekMsRUFBcUQsS0FBckQsRUFBNEQsVUFBNUQsRUFBd0UsWUFBeEUsRUFBc0YsV0FBdEY7O0FBRUEsVUFBSyxLQUFLLFNBQVYsRUFBc0I7O0FBRXBCLFlBQUssVUFBTCxFQUFrQjs7QUFFaEIsY0FBSSxVQUFVLEtBQUssUUFBTCxDQUFjLE9BQTVCOztBQUVBLGtCQUFRLFdBQVIsQ0FBcUIsUUFBUSxRQUE3QixFQUF1QyxDQUF2QyxFQUEwQyxVQUExQzs7QUFFQSxlQUFLLFFBQUwsQ0FBYyxNQUFkLENBQXNCLEtBQUssUUFBM0IsRUFBcUMsS0FBSyxXQUExQyxFQUF1RCxLQUFLLFVBQTVELEVBQXdFLEtBQXhFOztBQUVBLGtCQUFRLFdBQVIsQ0FBcUIsUUFBUSxLQUE3QixFQUFvQyxDQUFwQyxFQUF1QyxVQUF2QztBQUVEOztBQUVELGFBQUssV0FBTDtBQUVEOztBQUVELFVBQUssZ0JBQWdCLFFBQXJCLEVBQWdDOztBQUU5QixxQkFBYSxJQUFiO0FBRUQsT0FKRCxNQUlPLElBQUssZ0JBQWdCLGFBQXJCLEVBQXFDOztBQUUxQyxxQkFBYSxLQUFiO0FBRUQ7O0FBRUQ7QUFDRDtBQUVGLEdBaEd3Qjs7QUFrR3pCLFNBQU8sZUFBVyxZQUFYLEVBQTBCOztBQUUvQixRQUFLLGlCQUFpQixTQUF0QixFQUFrQzs7QUFFaEMscUJBQWUsS0FBSyxhQUFMLENBQW1CLEtBQW5CLEVBQWY7O0FBRUEsbUJBQWEsS0FBYixHQUFxQixPQUFPLFVBQTVCO0FBQ0EsbUJBQWEsTUFBYixHQUFzQixPQUFPLFdBQTdCO0FBRUQ7O0FBRUQsU0FBSyxhQUFMLEdBQXFCLFlBQXJCO0FBQ0EsU0FBSyxhQUFMLEdBQXFCLGFBQWEsS0FBYixFQUFyQjs7QUFFQSxTQUFLLFdBQUwsR0FBbUIsS0FBSyxhQUF4QjtBQUNBLFNBQUssVUFBTCxHQUFrQixLQUFLLGFBQXZCO0FBRUQsR0FuSHdCOztBQXFIekIsV0FBUyxpQkFBVyxLQUFYLEVBQWtCLE1BQWxCLEVBQTJCOztBQUVsQyxRQUFJLGVBQWUsS0FBSyxhQUFMLENBQW1CLEtBQW5CLEVBQW5COztBQUVBLGlCQUFhLEtBQWIsR0FBcUIsS0FBckI7QUFDQSxpQkFBYSxNQUFiLEdBQXNCLE1BQXRCOztBQUVBLFNBQUssS0FBTCxDQUFZLFlBQVo7QUFFRDs7QUE5SHdCLENBQTNCOzs7O0FBb0lBLGVBQWUsTUFBZixHQUF3QixJQUFJLE1BQU0sa0JBQVYsQ0FBOEIsQ0FBQyxDQUEvQixFQUFrQyxDQUFsQyxFQUFxQyxDQUFyQyxFQUF3QyxDQUFDLENBQXpDLEVBQTRDLENBQTVDLEVBQStDLENBQS9DLENBQXhCOztBQUVBLGVBQWUsSUFBZixHQUFzQixJQUFJLE1BQU0sSUFBVixDQUFnQixJQUFJLE1BQU0sbUJBQVYsQ0FBK0IsQ0FBL0IsRUFBa0MsQ0FBbEMsQ0FBaEIsRUFBdUQsSUFBdkQsQ0FBdEI7O0FBRUEsZUFBZSxLQUFmLEdBQXVCLElBQUksTUFBTSxLQUFWLEVBQXZCO0FBQ0EsZUFBZSxLQUFmLENBQXFCLEdBQXJCLENBQTBCLGVBQWUsSUFBekM7Ozs7Ozs7Ozs7O0FDaktBLElBQU0saUJBQWlCLFFBQVEsZ0JBQVIsQ0FBdkI7QUFDQSxJQUFNLFNBQVMsUUFBUSxlQUFSLENBQWY7O0FBRUEsT0FBTyxPQUFQLEdBQWlCLFNBQWpCO0FBQ0EsU0FBUyxTQUFULEdBQThCO0FBQUEsTUFBVixHQUFVLHlEQUFKLEVBQUk7OztBQUU1QixNQUFNLE1BQU0sS0FBSyxHQUFMLENBQVMsR0FBVCxFQUFjLE9BQU8sZ0JBQXJCLENBQVo7QUFDQSxNQUFNLFFBQVEsc0JBQXNCLElBQXRCLENBQTJCLFVBQVUsU0FBckMsQ0FBZDs7O0FBR0EsTUFBTSxXQUFXLElBQUksTUFBTSxhQUFWLENBQXdCLE9BQU87QUFDOUMsWUFBUSxTQUFTLGFBQVQsQ0FBdUIsU0FBdkIsQ0FEc0M7QUFFOUMsZUFBVyxJO0FBRm1DLEdBQVAsRUFHdEMsR0FIc0MsQ0FBeEIsQ0FBakI7QUFJQSxXQUFTLGFBQVQsQ0FBdUIsR0FBdkI7OztBQUdBLE1BQU0sU0FBUyxJQUFJLE1BQU0saUJBQVYsQ0FBNEIsRUFBNUIsRUFBZ0MsQ0FBaEMsRUFBbUMsSUFBbkMsRUFBeUMsR0FBekMsQ0FBZjtBQUNBLE1BQU0sU0FBUyxJQUFJLE1BQU0sT0FBVixFQUFmOzs7QUFHQSxNQUFNLFFBQVEsSUFBSSxNQUFNLEtBQVYsRUFBZDs7O0FBR0EsTUFBTSxXQUFXLGVBQWUsT0FBTztBQUNyQyxrQkFEcUM7QUFFckMsaUJBQWEsQ0FGd0I7QUFHckMsZUFBVyxDQUgwQjtBQUlyQyxnQkFBWSxDQUp5Qjs7QUFNckMsU0FBSyxDQU5nQztBQU9yQyxjQUFVLENBUDJCOzs7QUFVckMsb0JBQWdCLENBQUUsQ0FBRixFQUFLLEdBQUw7QUFWcUIsR0FBUCxFQVc3QixHQVg2QixDQUFmLENBQWpCOzs7QUFjQSxTQUFPLGdCQUFQLENBQXdCLFFBQXhCLEVBQWtDLE1BQWxDOzs7QUFHQTs7QUFFQSxTQUFPO0FBQ0wsa0RBREs7QUFFTCxrQkFGSztBQUdMLGdCQUhLO0FBSUwsc0JBSks7QUFLTCxzQkFMSztBQU1MO0FBTkssR0FBUDs7QUFTQSxXQUFTLHNCQUFULEdBQW1DO0FBQ2pDLFFBQU0sUUFBUSxPQUFPLFVBQXJCO0FBQ0EsUUFBTSxTQUFTLE9BQU8sV0FBdEI7QUFDQSxRQUFNLFNBQVMsUUFBUSxNQUF2Qjs7O0FBR0EsYUFBUyxNQUFUO0FBQ0EsV0FBTyxRQUFQLENBQWdCLFNBQWhCLENBQTBCLFNBQVMsUUFBbkM7QUFDQSxXQUFPLEVBQVAsQ0FBVSxTQUFWLENBQW9CLFNBQVMsRUFBN0I7QUFDQSxXQUFPLE1BQVAsQ0FBYyxPQUFPLFNBQVAsQ0FBaUIsU0FBUyxTQUExQixDQUFkOzs7QUFHQSxXQUFPLE1BQVAsR0FBZ0IsTUFBaEI7QUFDQSxXQUFPLHNCQUFQO0FBQ0Q7O0FBRUQsV0FBUyxNQUFULEdBQW1CO0FBQ2pCLFFBQUksUUFBUSxPQUFPLFVBQW5CO0FBQ0EsUUFBSSxTQUFTLE9BQU8sV0FBcEI7QUFDQSxRQUFJLEtBQUosRUFBVzs7QUFFVDtBQUNBO0FBQ0Q7QUFDRCxhQUFTLE9BQVQsQ0FBaUIsS0FBakIsRUFBd0IsTUFBeEI7QUFDQTtBQUNEO0FBQ0Y7Ozs7Ozs7QUN0RkQsSUFBTSxjQUFjLFFBQVEsa0JBQVIsQ0FBcEI7QUFDQSxJQUFNLG1CQUFtQixRQUFRLDBCQUFSLENBQXpCO0FBQ0EsSUFBTSxxQkFBcUIsUUFBUSx3QkFBUixDQUEzQjtBQUNBLElBQU0sc0JBQXNCLFFBQVEsT0FBUixDQUE1QjtBQUNBLElBQU0sZUFBZSxRQUFRLFFBQVIsRUFBa0IsWUFBdkM7QUFDQSxJQUFNLFdBQVcsUUFBUSxXQUFSLENBQWpCO0FBQ0EsSUFBTSxTQUFTLFFBQVEsa0JBQVIsQ0FBZjtBQUNBLElBQU0sT0FBTyxRQUFRLE1BQVIsQ0FBYjtBQUNBLElBQU0sTUFBTSxRQUFRLE9BQVIsQ0FBWjtBQUNBLElBQU0sV0FBVyxDQUFqQjs7QUFFQSxJQUFNLGFBQWEsbUJBQW5CO0FBQ0EsSUFBTSxZQUFZLENBQ2hCLGFBRGdCLEVBRWhCLHVCQUZnQixFQUdoQixlQUhnQixFQUloQixlQUpnQixFQUtoQixXQUxnQixFQU1oQixhQU5nQixFQU9oQixlQVBnQixFQVFoQixlQVJnQixFQVNoQiwyQkFUZ0IsQ0FBbEI7O0FBWUEsSUFBTSxjQUFjLENBQ2xCLENBQUUsQ0FBQyxFQUFELEVBQUssRUFBTCxDQUFGLEVBQVksQ0FBQyxFQUFELEVBQUssRUFBTCxDQUFaLENBRGtCLEU7QUFFbEIsQ0FBRSxDQUFDLEdBQUQsRUFBTSxJQUFOLENBQUYsRUFBZSxDQUFDLEdBQUQsRUFBTSxJQUFOLENBQWYsQ0FGa0IsRTtBQUdsQixDQUFFLENBQUMsR0FBRCxFQUFNLEdBQU4sQ0FBRixFQUFjLENBQUMsRUFBRCxFQUFLLEVBQUwsQ0FBZCxDQUhrQixFO0FBSWxCLENBQUUsQ0FBQyxFQUFELEVBQUssRUFBTCxDQUFGLEVBQVksQ0FBQyxFQUFELEVBQUssRUFBTCxDQUFaLENBSmtCLEU7QUFLbEIsQ0FBRSxDQUFDLEVBQUQsRUFBSyxFQUFMLENBQUYsRUFBWSxDQUFDLEVBQUQsRUFBSyxFQUFMLENBQVosQ0FMa0IsRTtBQU1sQixDQUFFLENBQUMsSUFBRCxFQUFPLElBQVAsQ0FBRixFQUFnQixDQUFDLEVBQUQsRUFBSyxFQUFMLENBQWhCLENBTmtCLEU7QUFPbEIsQ0FBRSxDQUFDLEVBQUQsRUFBSyxFQUFMLENBQUYsRUFBWSxDQUFDLEtBQUQsRUFBUSxLQUFSLENBQVosQ0FQa0IsRTtBQVFsQixDQUFFLENBQUMsRUFBRCxFQUFLLEdBQUwsQ0FBRixFQUFhLENBQUMsRUFBRCxFQUFLLEdBQUwsQ0FBYixDQVJrQixFO0FBU2xCLENBQUUsQ0FBQyxDQUFELEVBQUksQ0FBSixDQUFGLEVBQVUsQ0FBQyxHQUFELEVBQU0sSUFBTixDQUFWLEM7QUFUa0IsQ0FBcEI7O0FBWUEsSUFBTSxZQUFZLFVBQVUsR0FBVixDQUFjLGFBQUs7QUFDbkMsdUNBQW1DLENBQW5DO0FBQ0QsQ0FGaUIsRUFFZixHQUZlLENBRVgsZUFBTztBQUNaLE1BQU0sVUFBVSxDQUFFLE1BQU0sTUFBUixDQUFoQjtBQUNBLE1BQUksVUFBSixFQUFnQjtBQUNkLFlBQVEsT0FBUixDQUFnQjtBQUNkLFdBQUssTUFBTTtBQURHLEtBQWhCO0FBR0Q7QUFDRCxTQUFPLE9BQVA7QUFDRCxDQVZpQixDQUFsQjs7QUFZQSxPQUFPLE9BQVAsR0FBaUIsWUFBWTtBQUMzQixNQUFJLFVBQUosRUFBZ0IsSUFBSSwrQkFBSjs7QUFFaEIsTUFBTSxhQUFhLEVBQW5CO0FBQ0EsTUFBTSxpQkFBaUIsRUFBdkI7QUFDQSxNQUFJLGtCQUFrQixDQUF0Qjs7QUFFQSxNQUFNLGVBQWUsb0JBQXJCO0FBQ0EsYUFBVztBQUFBLFdBQU0sUUFBTjtBQUFBLEdBQVgsRUFBMkIsSUFBM0I7Ozs7QUFJQSxNQUFNLGVBQWUsYUFBYSxjQUFiLEVBQXJCO0FBQ0EsTUFBTSxZQUFZLElBQUksVUFBSixDQUFlLGFBQWEsaUJBQTVCLENBQWxCOzs7QUFHQSxNQUFNLGdCQUFnQixhQUFhLFVBQWIsS0FBNEIsS0FBbEQ7O0FBRUEsTUFBTSxhQUFhLGlCQUFpQixhQUFhLFdBQTlCLENBQW5CO0FBQ0EsZUFBYSxPQUFiLENBQXFCLFVBQXJCOztBQUVBLE1BQU0sYUFBYSxhQUFhLFVBQWhDO0FBQ0EsTUFBTSxlQUFlLGFBQWEsaUJBQWxDOztBQUVBLE1BQUksU0FBUyxDQUFiO0FBQ0EsTUFBTSxTQUFTLElBQUksWUFBSixFQUFmOztBQUVBLE1BQUksZUFBZSxLQUFuQjtBQUNBLE1BQUksV0FBVyxLQUFmO0FBQ0EsTUFBSSxpQkFBaUIsS0FBckI7QUFDQSxNQUFJLG9CQUFKO01BQWlCLHFCQUFqQjtBQUNBLE1BQUksZ0JBQWdCLEtBQXBCO0FBQ0EsTUFBSSx5QkFBeUIsSUFBN0I7QUFDQSxNQUFJLG1CQUFtQixLQUF2QjtBQUNBLE1BQUksc0JBQUo7QUFDQSxNQUFNLGtCQUFrQixJQUF4Qjs7QUFFQSxTQUFPLGNBQVAsQ0FBc0IsTUFBdEIsRUFBOEIsUUFBOUIsRUFBd0M7QUFDdEMsU0FBSyxlQUFZO0FBQ2YsYUFBTyxNQUFQO0FBQ0QsS0FIcUM7QUFJdEMsU0FBSyxhQUFVLEdBQVYsRUFBZTtBQUNsQixlQUFTLEdBQVQ7QUFDQSxpQkFBVyxHQUFYLENBQWUsS0FBZixHQUF1QixHQUF2QjtBQUNBLGlCQUFXLEdBQVgsQ0FBZSxLQUFmLEdBQXVCLElBQUksR0FBM0I7QUFDRDtBQVJxQyxHQUF4Qzs7QUFXQSxTQUFPLE1BQVAsR0FBZ0IsTUFBaEI7QUFDQSxTQUFPLFFBQVAsR0FBa0IsUUFBbEI7QUFDQSxTQUFPLEtBQVAsR0FBZSxTQUFTLFFBQVQsRUFBbUIsQ0FBbkIsQ0FBZjs7QUFFQSxTQUFPLEtBQVAsR0FBZSxLQUFmO0FBQ0EsU0FBTyxVQUFQLEdBQW9CLFVBQXBCO0FBQ0EsU0FBTyxJQUFQLEdBQWMsSUFBZDtBQUNBLFNBQU8sTUFBUDs7QUFFQSxXQUFTLElBQVQsR0FBaUI7QUFDZjtBQUNEOztBQUVELFdBQVMsTUFBVCxHQUFtQjtBQUNqQixRQUFJLGFBQWEsS0FBYixLQUF1QixXQUF2QixJQUNBLE9BQU8sYUFBYSxNQUFwQixLQUErQixVQURuQyxFQUMrQztBQUM3QyxtQkFBYSxNQUFiO0FBQ0Q7QUFDRjs7QUFFRCxXQUFTLGdCQUFULENBQTJCLE1BQTNCLEVBQW1DO0FBQ2pDLFFBQUksYUFBSixFQUFtQjtBQUNqQixVQUFNLFNBQVMsT0FBTyxZQUFQLENBQWY7QUFDQSxhQUFPLElBQVAsR0FBYyxHQUFkLEM7QUFDQSxhQUFPLEdBQVAsQ0FBVyxLQUFYLEdBQW1CLENBQW5CO0FBQ0EsYUFBTyxHQUFQLENBQVcsS0FBWCxHQUFtQixDQUFuQjtBQUNBLGFBQU8sVUFBUCxHQUFvQixVQUFwQjtBQUNBLGFBQU8sTUFBUCxDQUFjLEtBQWQsR0FBc0IsR0FBdEIsQztBQUNBLGFBQU8sT0FBUCxDQUFlLE1BQWY7QUFDQSxhQUFPLE1BQVA7QUFDRCxLQVRELE1BU087QUFBQTtBQUNMLFlBQU0sT0FBTyxhQUFhLFVBQWIsRUFBYjtBQUNBLFlBQU0sTUFBTSxhQUFhLFVBQWIsRUFBWjtBQUNBLFlBQU0sTUFBTSxhQUFhLFVBQWIsRUFBWjtBQUNBLFlBQU0sU0FBUyxhQUFhLGtCQUFiLEVBQWY7O0FBRUEsYUFBSyxPQUFMLENBQWEsR0FBYjtBQUNBLGFBQUssT0FBTCxDQUFhLEdBQWI7O0FBRUEsZUFBTyxJQUFQLEdBQWMsU0FBZDtBQUNBLGVBQU8sU0FBUCxDQUFpQixLQUFqQixHQUF5QixJQUF6Qjs7QUFFQSxZQUFJLE9BQUosQ0FBWSxNQUFaO0FBQ0EsWUFBSSxPQUFKLENBQVksTUFBWjtBQUNBLGVBQU8sT0FBUCxDQUFlLE1BQWY7O0FBRUEsZUFBTyxnQkFBUCxDQUF3QixJQUF4QixFQUE4QjtBQUM1QixlQUFLLEVBQUUsS0FBSztBQUFBLHFCQUFNLElBQUksSUFBVjtBQUFBLGFBQVAsRUFEdUI7QUFFNUIsZUFBSyxFQUFFLEtBQUs7QUFBQSxxQkFBTSxJQUFJLElBQVY7QUFBQSxhQUFQO0FBRnVCLFNBQTlCO0FBSUEsYUFBSyxHQUFMLENBQVMsS0FBVCxHQUFpQixDQUFqQjtBQUNBLGFBQUssR0FBTCxDQUFTLEtBQVQsR0FBaUIsQ0FBakI7QUFDQTtBQUFBLGFBQU87QUFBUDtBQXRCSzs7QUFBQTtBQXVCTjtBQUNGOztBQUVELFdBQVMsTUFBVCxDQUFpQixFQUFqQixFQUFxQjtBQUNuQixRQUFJLENBQUMsWUFBTCxFQUFtQjtBQUNuQixpQkFBYSxxQkFBYixDQUFtQyxTQUFuQztBQUNBLFdBQU8sS0FBUCxHQUFlLGFBQWEsV0FBYixDQUF5QixTQUF6QixDQUFmOztBQUVBLFFBQUksQ0FBQyxhQUFMLEVBQW9CO0FBQ2xCLHNCQUFnQixJQUFoQjtBQUNEOztBQUVELFFBQUksZ0JBQUosRUFBc0I7QUFDdkI7Ozs7Ozs7QUFPRCxXQUFTLFdBQVQsR0FBd0I7QUFDdEIsUUFBSSxPQUFPLFVBQVUsQ0FBVixDQUFYO0FBQ0EsU0FBSyxJQUFJLElBQUksQ0FBYixFQUFnQixJQUFJLFVBQVUsTUFBOUIsRUFBc0MsR0FBdEMsRUFBMkM7QUFDekMsVUFBSSxVQUFVLENBQVYsTUFBaUIsSUFBckIsRUFBMkIsT0FBTyxJQUFQO0FBQzVCO0FBQ0QsV0FBTyxLQUFQO0FBQ0Q7O0FBRUQsV0FBUyxjQUFULEdBQTJCO0FBQ3pCLFFBQUksYUFBSixFQUFtQjs7QUFFakIsc0JBQWdCLEtBQWhCO0FBQ0EseUJBQW1CLElBQW5CO0FBQ0Q7QUFDRjs7QUFFRCxXQUFTLFlBQVQsR0FBeUI7QUFDdkIsU0FBSyxJQUFJLElBQUksQ0FBYixFQUFnQixJQUFJLFVBQVUsTUFBOUIsRUFBc0MsR0FBdEMsRUFBMkM7QUFDekMsZ0JBQVUsQ0FBVixJQUFlLEdBQWY7QUFDRDtBQUNGOztBQUVELFdBQVMsS0FBVCxHQUFrQjtBQUNoQixRQUFJLFFBQUosRUFBYyxPQUFPLGFBQVA7QUFDZCxlQUFXLElBQVg7QUFDQSxRQUFNLFNBQVMsb0JBQW9CLFVBQVUsTUFBN0M7QUFDQSxRQUFNLFVBQVUsVUFBVSxNQUFWLENBQWhCO0FBQ0EsUUFBTSxnQkFBZ0IsWUFBWSxNQUFaLENBQXRCO0FBQ0EsUUFBTSxZQUFZLE9BQU8sUUFBUSxDQUFSLENBQVAsS0FBc0IsUUFBdEIsR0FBaUMsUUFBUSxDQUFSLENBQWpDLEdBQThDLFFBQVEsQ0FBUixFQUFXLEdBQTNFOztBQUVBLGNBQVUsT0FBVixFQUFtQixhQUFuQixFQUFrQyxVQUFDLEtBQUQsRUFBVztBQUMzQyxvQkFBYyxLQUFkO0FBQ0EsaUJBQVcsS0FBWDtBQUNBLGFBQU8sSUFBUCxDQUFZLE9BQVo7QUFDRCxLQUpEO0FBS0Esb0JBQWdCLEtBQUssUUFBTCxDQUFjLFNBQWQsRUFBeUIsS0FBSyxPQUFMLENBQWEsU0FBYixDQUF6QixDQUFoQjs7O0FBR0EsUUFBSSxPQUFPLEVBQVgsRUFBZTtBQUNiLGFBQU8sRUFBUCxDQUFVLE1BQVYsRUFBa0IsT0FBbEIsRUFBMkIsT0FBM0IsRUFBb0MsT0FBcEMsRUFBNkMsYUFBN0M7QUFDRDs7QUFFRCxvQkFBZ0IsY0FBYyxPQUFkLENBQXNCLFVBQXRCLEVBQWtDLEVBQWxDLENBQWhCO0FBQ0Esb0JBQWdCLGNBQWMsT0FBZCxDQUFzQixLQUF0QixFQUE2QixHQUE3QixDQUFoQjtBQUNBLG9CQUFnQixjQUFjLE9BQWQsQ0FBc0IsV0FBdEIsRUFBbUMsY0FBbkMsQ0FBaEI7QUFDQSxvQkFBZ0IsY0FBYyxPQUFkLENBQXNCLFdBQXRCLEVBQW1DLGFBQW5DLENBQWhCO0FBQ0EsV0FBTyxjQUFjLElBQWQsRUFBUDtBQUNEOztBQUVELFdBQVMsVUFBVCxHQUF1Qjs7QUFFckIsUUFBSSxjQUFKLEVBQW9CO0FBQ3BCLFFBQUksUUFBSixFQUFjO0FBQ1o7QUFDQSx1QkFBaUIsSUFBakI7QUFDQSxhQUFPLElBQVAsQ0FBWSxPQUFaLEVBQXFCLFlBQU07QUFDekIseUJBQWlCLEtBQWpCO0FBQ0E7QUFDRCxPQUhEOztBQUtBO0FBQ0Q7QUFDRDtBQUNBLG9CQUFnQixLQUFoQjtBQUNBLHVCQUFtQixLQUFuQjtBQUNBLGdCQUFZLElBQVo7QUFDQSxtQkFBZSxXQUFmO0FBQ0EsUUFBSSxzQkFBSixFQUE0QixhQUFhLHNCQUFiO0FBQzVCLDZCQUF5QixXQUFXLGNBQVgsRUFBMkIsZUFBM0IsQ0FBekI7O0FBRUQ7O0FBRUQsV0FBUyxRQUFULEdBQXFCO0FBQ25CLFFBQUksWUFBSixFQUFrQjtBQUNoQixxQkFBZSxhQUFhLE1BQTVCLElBQXNDLGFBQWEsT0FBYixDQUFxQixXQUEzRDtBQUNBLG1CQUFhLElBQWI7O0FBRUEsVUFBTSxjQUFjLEVBQXBCO0FBQ0EsVUFBTSxVQUFVLGFBQWEsT0FBN0I7QUFDQSxhQUFPLFFBQVEsVUFBZixFQUEyQjtBQUN6QixvQkFBWSxJQUFaLENBQWlCLFFBQVEsVUFBekI7QUFDQSxnQkFBUSxXQUFSLENBQW9CLFFBQVEsVUFBNUI7QUFDRDs7QUFFRCxtQkFBYSxXQUFiLEdBQTJCLFdBQTNCO0FBQ0EsbUJBQWEsT0FBYixDQUFxQixJQUFyQjtBQUNBLG1CQUFhLElBQWIsQ0FBa0IsVUFBbEI7QUFDRDtBQUNGOztBQUVELFdBQVMsU0FBVCxDQUFvQixPQUFwQixFQUE2QixNQUE3QixFQUFxQyxFQUFyQyxFQUF5QztBQUN2QyxRQUFJLFlBQUosRUFBa0I7QUFDbEIsUUFBSSxDQUFDLE1BQU0sT0FBTixDQUFjLE9BQWQsQ0FBTCxFQUE2QixVQUFVLENBQUUsT0FBRixDQUFWO0FBQzdCLFFBQU0sU0FBUyxPQUFPLFFBQVEsQ0FBUixDQUFQLEtBQXNCLFFBQXRCLEdBQWlDLFFBQVEsQ0FBUixDQUFqQyxHQUE4QyxRQUFRLENBQVIsRUFBVyxHQUF4RTtBQUNBLG1CQUFlLElBQWY7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWtCQTs7QUFFQSxRQUFNLFFBQVEsWUFBWSxPQUFaLEVBQXFCO0FBQ2pDLFlBQU0sSUFEMkI7QUFFakMsY0FBUSxLQUZ5QjtBQUdqQyxlQUFTO0FBSHdCLEtBQXJCLENBQWQ7QUFLQSxlQUFXLE1BQVgsSUFBcUIsS0FBckI7QUFDQSxVQUFNLE1BQU4sR0FBZSxNQUFmOztBQUVBLFVBQU0sRUFBTixDQUFTLE9BQVQsRUFBa0IsZUFBTztBQUN2QixjQUFRLEtBQVIsQ0FBYyxHQUFkO0FBQ0QsS0FGRDs7QUFJQSxRQUFNLE9BQU8sT0FBTyxHQUFQLENBQVcsaUJBQVM7QUFDL0IsYUFBTztBQUNMLFlBQUksaUJBQWlCLE1BQU0sQ0FBTixDQUFqQixFQUEyQixVQUEzQixFQUF1QyxZQUF2QyxDQURDO0FBRUwsWUFBSSxpQkFBaUIsTUFBTSxDQUFOLENBQWpCLEVBQTJCLFVBQTNCLEVBQXVDLFlBQXZDLENBRkM7QUFHTCxtQkFBVyxHQUhOO0FBSUwsZUFBTztBQUpGLE9BQVA7QUFNRCxLQVBZLENBQWI7QUFRQSxVQUFNLFdBQU4sR0FBb0Isb0JBQW9CLElBQXBCLENBQXBCOztBQUVBLFVBQU0sRUFBTixDQUFTLFVBQVQsRUFBcUIsWUFBTTs7QUFFMUIsS0FGRDtBQUdBLFVBQU0sRUFBTixDQUFTLE1BQVQsRUFBaUIsWUFBTTs7OztBQUlyQixVQUFJLFVBQVUsY0FBZCxFQUE4QjtBQUM1QixjQUFNLE9BQU4sQ0FBYyxXQUFkLEdBQTRCLGVBQWUsTUFBZixDQUE1QjtBQUNEOztBQUVELFNBQUcsS0FBSDtBQUNBLHFCQUFlLEtBQWY7QUFDRCxLQVZEO0FBV0EsVUFBTSxJQUFOLENBQVcsT0FBWCxDQUFtQixZQUFuQjtBQUNBLFdBQU8sS0FBUDtBQUNEO0FBQ0YsQ0FsUkQ7O0FBb1JBLFNBQVMsaUJBQVQsR0FBOEI7O0FBRTVCLE1BQUksUUFBUSxJQUFJLE9BQU8sS0FBWCxFQUFaOzs7QUFHQSxNQUFJLE1BQU0sV0FBTixDQUFrQix5QkFBbEIsTUFBaUQsRUFBckQsRUFBeUQ7QUFDdkQsUUFBSSxVQUFVLFNBQVYsQ0FBb0IsT0FBcEIsQ0FBNEIsUUFBNUIsTUFBMEMsQ0FBQyxDQUEzQyxJQUNBLFVBQVUsU0FBVixDQUFvQixPQUFwQixDQUE0QixnQkFBNUIsTUFBa0QsQ0FBQyxDQURuRCxJQUVBLFVBQVUsU0FBVixDQUFvQixPQUFwQixDQUE0QixXQUE1QixNQUE2QyxDQUFDLENBRmxELEVBRXFEOztBQUVuRCxhQUFPLElBQVA7QUFDRDtBQUNELFFBQUksVUFBVSxTQUFWLENBQW9CLE9BQXBCLENBQTRCLE1BQTVCLE1BQXdDLENBQUMsQ0FBN0MsRUFBZ0Q7QUFDOUMsYUFBTyxJQUFQO0FBQ0Q7QUFDRjtBQUNELFNBQU8sS0FBUDtBQUNEOzs7QUNyVkQ7Ozs7QUNBQSxJQUFNLDBCQUEwQixRQUFRLDBCQUFSLEVBQW9DLEtBQXBDLENBQWhDO0FBQ0EsSUFBTSxTQUFTLFFBQVEsUUFBUixDQUFmOztBQUVBLE9BQU8sT0FBUCxHQUFpQixVQUFVLE9BQVYsRUFBNkI7QUFBQSxNQUFWLEdBQVUseURBQUosRUFBSTs7QUFDNUMsTUFBTSxPQUFPLElBQUksSUFBSixJQUFZLENBQXpCO0FBQ0EsTUFBTSxXQUFXLHdCQUF3QixPQUF4QixDQUFqQjtBQUNBLFdBQVMsa0JBQVQ7QUFDQSxNQUFNLE9BQU8sU0FBUyxXQUF0Qjs7QUFFQSxNQUFNLGdCQUFnQixFQUF0QjtBQUNBLE1BQU0sV0FBVyxTQUFTLFFBQTFCO0FBQ0EsTUFBTSxRQUFRLFNBQVMsS0FBdkI7O0FBR0EsTUFBTSxJQUFJLEdBQVY7QUFDQSxNQUFNLElBQUksU0FBUyxDQUFULEdBQWEsR0FBYixHQUFtQixHQUE3QjtBQUNBLE1BQU0sU0FBUyxTQUFTLENBQXhCOztBQUVBLE1BQU0sT0FBTyxLQUFLLEdBQUwsQ0FBUyxDQUFULENBQWI7QUFDQSxNQUFNLE9BQU8sS0FBSyxHQUFMLENBQVMsQ0FBVCxDQUFiO0FBQ0EsTUFBTSxPQUFPLEtBQUssR0FBTCxDQUFTLENBQVQsQ0FBYjtBQUNBLE1BQU0sT0FBTyxLQUFLLEdBQUwsQ0FBUyxDQUFULENBQWI7QUFDQSxRQUFNLE9BQU4sQ0FBYyxVQUFDLElBQUQsRUFBTyxDQUFQLEVBQWE7QUFDekIsUUFBTSxJQUFJLEtBQUssQ0FBZjtBQUNBLFFBQU0sSUFBSSxLQUFLLENBQWY7QUFDQSxRQUFNLElBQUksS0FBSyxDQUFmO0FBQ0EsUUFBTSxLQUFLLFNBQVMsQ0FBVCxDQUFYO0FBQ0EsUUFBTSxLQUFLLFNBQVMsQ0FBVCxDQUFYO0FBQ0EsUUFBTSxLQUFLLFNBQVMsQ0FBVCxDQUFYOztBQUVBLGtCQUFjLElBQWQsQ0FBbUIsQ0FDakIsTUFBTSxFQUFOLENBRGlCLEVBRWpCLE1BQU0sRUFBTixDQUZpQixFQUdqQixNQUFNLEVBQU4sQ0FIaUIsQ0FBbkI7QUFLRCxHQWJEO0FBY0EsV0FBUyxhQUFULENBQXVCLENBQXZCLElBQTRCLGFBQTVCO0FBQ0EsV0FBUyxhQUFULEdBQXlCLElBQXpCO0FBQ0EsV0FBUyxPQUFULEdBQW1CLElBQW5CO0FBQ0EsU0FBTyxRQUFQOztBQUVBLFdBQVMsS0FBVCxDQUFnQixJQUFoQixFQUFzQjtBQUNwQixRQUFJLFVBQUo7O0FBRUEsUUFBSSxNQUFKLEVBQVk7QUFDVixVQUFJLFFBQVEsS0FBSyxLQUFMLENBQVcsS0FBSyxDQUFoQixFQUFtQixLQUFLLENBQXhCLENBQVo7QUFDQSxVQUFJLFFBQVEsQ0FBWixFQUFlLFNBQVMsSUFBSSxLQUFLLEVBQWxCO0FBQ2YsVUFBSSxTQUFTLEtBQUssRUFBTCxHQUFVLENBQW5CLENBQUo7QUFDRCxLQUpELE1BSU87QUFDTCxVQUFJLFNBQVMsSUFBVCxHQUFnQixDQUFoQixHQUFvQixPQUFPLElBQVAsRUFBYSxJQUFiLEVBQW1CLEtBQUssQ0FBTCxDQUFuQixDQUF4QjtBQUNEO0FBQ0QsUUFBTSxJQUFJLFNBQVMsSUFBVCxHQUFnQixDQUFoQixHQUFvQixPQUFPLElBQVAsRUFBYSxJQUFiLEVBQW1CLEtBQUssQ0FBTCxDQUFuQixDQUE5QjtBQUNBLFdBQU8sSUFBSSxNQUFNLE9BQVYsQ0FBa0IsQ0FBbEIsRUFBcUIsSUFBSSxDQUF6QixDQUFQO0FBQ0Q7QUFDRixDQW5ERDs7Ozs7QUNIQSxJQUFNLFNBQVMsUUFBUSxjQUFSLENBQWY7QUFDQSxJQUFNLGVBQWUsUUFBUSxlQUFSLENBQXJCO0FBQ0EsSUFBTSxTQUFTLFFBQVEsU0FBUixDQUFmO0FBQ0EsSUFBTSxVQUFVLFFBQVEsZUFBUixDQUFoQjtBQUNBLElBQU0sZ0JBQWdCLFFBQVEsaUJBQVIsQ0FBdEI7QUFDQSxJQUFNLEtBQUssS0FBSyxFQUFoQjtBQUNBLElBQU0sU0FBUyxRQUFRLFFBQVIsR0FBZjtBQUNBLElBQU0sVUFBVSxRQUFRLFNBQVIsQ0FBaEI7QUFDQSxJQUFNLFdBQVcsUUFBUSxZQUFSLENBQWpCOztBQUVBLElBQU0sVUFBVSxDQUFFLENBQUMsRUFBSCxFQUFPLENBQUMsQ0FBUixDQUFoQjtBQUNBLElBQU0sWUFBWSxDQUFFLENBQUMsRUFBSCxFQUFPLENBQVAsQ0FBbEI7QUFDQSxJQUFNLFdBQVcsUUFBUSxDQUFSLENBQWpCOztBQUVBLElBQU0sbUJBQW1CLENBQXpCO0FBQ0EsSUFBTSxjQUFjLFdBQVcsRUFBWCxHQUFnQixHQUFwQztBQUNBLElBQU0sZ0JBQWdCLEVBQXRCOztBQUVBLE9BQU8sT0FBUCxHQUFpQixnQkFBK0Q7QUFBQSxNQUFuRCxRQUFtRCxRQUFuRCxRQUFtRDtBQUFBLE1BQXpDLE1BQXlDLFFBQXpDLE1BQXlDO0FBQUEsTUFBakMsS0FBaUMsUUFBakMsS0FBaUM7QUFBQSxNQUExQixRQUEwQixRQUExQixRQUEwQjtBQUFBLE1BQWhCLE1BQWdCLFFBQWhCLE1BQWdCO0FBQUEsTUFBUixJQUFRLFFBQVIsSUFBUTs7QUFDOUUsTUFBTSxVQUFVLElBQUksTUFBTSxpQkFBVixDQUE0QjtBQUMxQyxlQUFXLElBRCtCO0FBRTFDLGlCQUFhLElBRjZCO0FBRzFDLGFBQVMsQ0FIaUM7QUFJMUMsVUFBTSxNQUFNO0FBSjhCLEdBQTVCLENBQWhCOztBQU9BLE1BQU0sV0FBVyxJQUFJLE1BQU0saUJBQVYsQ0FBNEI7QUFDM0MsYUFBUyxDQURrQztBQUUzQyxVQUFNLE1BQU07QUFGK0IsR0FBNUIsQ0FBakI7O0FBS0EsTUFBTSxZQUFZLElBQUksTUFBTSxpQkFBVixDQUE0QjtBQUM1QyxhQUFTLENBRG1DO0FBRTVDLGlCQUFhLElBRitCO0FBRzVDLGNBQVU7QUFDUixtQkFBYSxFQUFFLE1BQU0sR0FBUixFQUFhLE9BQU8sQ0FBcEIsRUFETDtBQUVSLGNBQVEsRUFBRSxNQUFNLElBQVIsRUFBYyxPQUFPLENBQXJCLEVBRkE7QUFHUixhQUFPLEVBQUUsTUFBTSxHQUFSLEVBQWEsT0FBTyxJQUFJLE1BQU0sS0FBVixFQUFwQixFQUhDO0FBSVIsYUFBTyxFQUFFLE1BQU0sR0FBUixFQUFhLE9BQU8sQ0FBcEI7QUFKQyxLQUhrQztBQVM1QyxrQkFBYyxRQUFRLHFCQUFSLENBVDhCO0FBVTVDLG9CQUFnQixRQUFRLHFCQUFSLENBVjRCO0FBVzVDLFVBQU0sTUFBTTtBQVhnQyxHQUE1QixDQUFsQjs7QUFjQSxNQUFNLGdCQUFnQixVQUFVLEtBQVYsRUFBdEI7QUFDQSxnQkFBYyxTQUFkLEdBQTBCLElBQTFCOztBQUVBLE1BQU0sWUFBWSxDQUNoQixPQURnQixFQUVoQixRQUZnQixFQUdoQixTQUhnQixFQUloQixhQUpnQixDQUFsQjs7QUFPQSxNQUFJLGVBQWUsQ0FBbkI7QUFDQSxNQUFJLFNBQVMsU0FBUyxZQUFULEVBQXVCLEtBQXZCLEVBQWI7OztBQUdBLE1BQU0sU0FBUyxFQUFmO0FBQ0EsZ0JBQWMsT0FBTyxLQUFQLEVBQWQ7O0FBRUEsTUFBSSxnQkFBZ0IsT0FBTyxLQUFQLEVBQXBCOzs7OztBQUtBLE9BQUssSUFBSSxJQUFJLENBQWIsRUFBZ0IsSUFBSSxXQUFwQixFQUFpQyxHQUFqQyxFQUFzQztBQUNwQyxRQUFNLE9BQU8sUUFBUSxFQUFFLFFBQVEsSUFBSSxhQUFkLEVBQTZCLE1BQU0sS0FBSyxNQUFMLEtBQWdCLEdBQWhCLEdBQXNCLENBQXRCLEdBQTBCLENBQTdELEVBQVIsQ0FBYjtBQUNBLFFBQUksUUFBUSxJQUFJLGFBQWhCLEVBQStCO0FBQzdCLGdCQUFVLElBQVYsRUFBZ0IsRUFBRSxTQUFTLElBQVgsRUFBaUIsU0FBUyxLQUExQixFQUFoQjtBQUNEO0FBQ0Y7O0FBRUQsTUFBSSxPQUFPLENBQVg7QUFDQSxNQUFNLFNBQVMsSUFBSSxNQUFNLE9BQVYsRUFBZjtBQUNBLE1BQU0sV0FBVyxJQUFJLE1BQU0sS0FBVixFQUFqQjtBQUNBLFNBQU8sSUFBUCxDQUFZLE9BQU8sUUFBbkI7QUFDQSxTQUFPLFlBQVAsQ0FBb0IsTUFBcEI7O0FBRUEsT0FBSyxFQUFMLENBQVEsTUFBUixFQUFnQixVQUFDLEVBQUQsRUFBUTtBQUN0QixZQUFRLEtBQUssSUFBYjtBQUNBLFdBQU8sT0FBUCxDQUFlLFVBQUMsQ0FBRCxFQUFPO0FBQ3BCLFVBQUksRUFBRSxRQUFGLENBQVcsUUFBZixFQUF5QjtBQUN2QixVQUFFLFFBQUYsQ0FBVyxRQUFYLENBQW9CLE1BQXBCLENBQTJCLEtBQTNCLEdBQW1DLE9BQU8sVUFBUCxHQUFvQixPQUFPLFdBQTlEO0FBQ0EsVUFBRSxRQUFGLENBQVcsUUFBWCxDQUFvQixXQUFwQixDQUFnQyxLQUFoQyxHQUF3QyxJQUF4QztBQUNEO0FBQ0QsUUFBRSxRQUFGLENBQVcsQ0FBWCxJQUFpQixLQUFLLElBQU4sR0FBYyxFQUFFLGNBQWhDO0FBQ0EsUUFBRSxRQUFGLENBQVcsQ0FBWCxJQUFpQixLQUFLLElBQU4sR0FBYyxFQUFFLEtBQWhCLEdBQXdCLElBQUksV0FBNUM7QUFDQSxVQUFJLEVBQUUsT0FBTixFQUFlO0FBQ2IsVUFBRSxRQUFGLENBQVcsT0FBWCxDQUFtQixpQkFBUztBQUMxQixnQkFBTSxRQUFOLENBQWUsQ0FBZixJQUFxQixLQUFLLElBQTFCO0FBQ0QsU0FGRDtBQUdEO0FBQ0QsVUFBTSxhQUFhLEVBQUUsY0FBRixDQUFpQixHQUFqQixDQUFxQixDQUFyQixHQUF5QixFQUFFLGNBQUYsQ0FBaUIsR0FBakIsQ0FBcUIsQ0FBakU7QUFDQSxVQUFJLEVBQUUsTUFBRixLQUNDLEVBQUUsUUFBRixDQUFXLENBQVgsR0FBZ0IsYUFBYSxDQUFiLEdBQWlCLE9BQU8sQ0FBeEIsR0FBNEIsQ0FBNUMsSUFDRCxFQUFFLFFBQUYsQ0FBVyxDQUFYLEdBQWdCLFdBQVcsYUFBYSxDQUZ4QyxDQUFKLEVBRWlEO0FBQy9DLFVBQUUsTUFBRixHQUFXLEtBQVg7QUFDQSxVQUFFLE9BQUYsR0FBWSxLQUFaO0FBQ0Q7QUFDRixLQW5CRDtBQW9CRCxHQXRCRDs7QUF3QkEsTUFBTSxNQUFNO0FBQ1YsOEJBRFU7QUFFVix3QkFGVTtBQUdWLDRCQUhVO0FBSVYsa0NBSlU7QUFLViwwQkFMVTtBQU1WLDBDQU5VO0FBT1YsaUJBQWEsQ0FQSDtBQVFWO0FBUlUsR0FBWjs7QUFXQSxTQUFPLEdBQVA7O0FBRUEsV0FBUyxrQkFBVCxHQUErQjtBQUM3QixXQUFPLE9BQVAsQ0FBZSxhQUFLO0FBQ2xCLGVBQVMsSUFBVCxDQUFjLFNBQVMsQ0FBVCxDQUFkO0FBQ0EsUUFBRSxRQUFGLEdBQWEsVUFBVSxLQUFLLEtBQUwsQ0FBVyxLQUFLLE1BQUwsS0FBZ0IsVUFBVSxNQUFyQyxDQUFWLEVBQXdELEtBQXhELEVBQWI7QUFDQSxlQUFTLENBQVQsRUFBWSxRQUFaO0FBQ0QsS0FKRDtBQUtEOztBQUVELFdBQVMsYUFBVCxHQUEwQjtBQUN4QixXQUFPLE9BQVAsQ0FBZSxhQUFLO0FBQ2xCLFFBQUUsTUFBRixHQUFXLEtBQVg7QUFDQSxRQUFFLE9BQUYsR0FBWSxLQUFaO0FBQ0QsS0FIRDtBQUlEOztBQUVELFdBQVMsY0FBVCxHQUEyQjtBQUN6QixXQUFPLFNBQVMsZUFBZSxTQUFTLE1BQWpDLENBQVA7QUFDRDs7QUFFRCxXQUFTLFVBQVQsQ0FBcUIsT0FBckIsRUFBOEI7QUFDNUIsV0FBTyxNQUFQLEdBQWdCLENBQWhCO0FBQ0Esa0JBQWMsTUFBZCxHQUF1QixDQUF2Qjs7QUFFQSxhQUFTLFFBQVEsS0FBUixFQUFUO0FBQ0Esa0JBQWMsT0FBTyxLQUFQLEVBQWQ7QUFDQSxvQkFBZ0IsT0FBTyxLQUFQLEVBQWhCOzs7QUFHQSxXQUFPLE9BQVAsQ0FBZSxhQUFLO0FBQ2xCLG1CQUFhLENBQWI7QUFDRCxLQUZEO0FBR0Q7O0FBRUQsV0FBUyxXQUFULEdBQWdDO0FBQUEsUUFBVixHQUFVLHlEQUFKLEVBQUk7O0FBQzlCLFFBQUksYUFBYSxTQUFTLGlCQUFpQixTQUFTLE1BQW5DLENBQWpCOztBQUVBLGVBQVcsVUFBWDtBQUNEOztBQUVELFdBQVMsWUFBVCxHQUFpQztBQUFBLFFBQVYsR0FBVSx5REFBSixFQUFJOztBQUMvQixTQUFLLElBQUksS0FBSSxDQUFSLEVBQVcsUUFBUSxDQUF4QixFQUEyQixLQUFJLE9BQU8sTUFBWCxJQUFxQixRQUFRLGdCQUF4RCxFQUEwRSxJQUExRSxFQUErRTtBQUM3RSxVQUFNLElBQUksT0FBTyxFQUFQLENBQVY7O0FBRUEsVUFBSSxDQUFDLEVBQUUsTUFBSCxLQUFjLElBQUksSUFBSixLQUFhLEVBQUUsSUFBZixJQUF1QixPQUFPLElBQUksSUFBWCxLQUFvQixXQUF6RCxDQUFKLEVBQTJFO0FBQ3pFLGtCQUFVLENBQVY7QUFDQTtBQUNEO0FBQ0Y7QUFDRjs7QUFFRCxXQUFTLFNBQVQsQ0FBb0IsSUFBcEIsRUFBb0M7QUFBQSxRQUFWLEdBQVUseURBQUosRUFBSTs7QUFDbEMsUUFBTSxPQUFPLElBQUksT0FBSixHQUFjLFNBQWQsR0FBMEIsT0FBdkM7QUFDQSxTQUFLLFFBQUwsQ0FBYyxDQUFkLEdBQWtCLE9BQU8sS0FBSyxDQUFMLENBQVAsRUFBZ0IsS0FBSyxDQUFMLENBQWhCLENBQWxCO0FBQ0EsU0FBSyxNQUFMLEdBQWMsSUFBZDtBQUNBLFNBQUssT0FBTCxHQUFlLElBQWY7QUFDQSxRQUFJLEtBQUssUUFBTCxDQUFjLFFBQWxCLEVBQTRCO0FBQzFCLFdBQUssUUFBTCxDQUFjLFFBQWQsQ0FBdUIsS0FBdkIsQ0FBNkIsS0FBN0IsR0FBcUMsS0FBSyxNQUFMLEtBQWdCLEdBQWhCLEdBQXNCLE9BQU8sQ0FBUCxFQUFVLENBQVYsQ0FBdEIsR0FBcUMsQ0FBMUU7QUFDRDtBQUNELGlCQUFhLElBQWI7QUFDQSxRQUFJLElBQUksT0FBSixLQUFnQixLQUFwQixFQUEyQjtBQUFBO0FBQ3pCLFlBQU0sV0FBVyxLQUFqQjtBQUNBLFlBQU0sUUFBUSxFQUFFLE9BQU8sQ0FBVCxFQUFkO0FBQ0EsYUFBSyxLQUFMLENBQVcsR0FBWCxDQUFlLFFBQWYsRUFBeUIsUUFBekIsRUFBbUMsUUFBbkM7QUFDQSxlQUFPLEVBQVAsQ0FBVSxLQUFWLEVBQWlCLEVBQUUsVUFBVSxHQUFaLEVBQWlCLE9BQU8sQ0FBeEIsRUFBMkIsTUFBTSxTQUFqQyxFQUFqQixFQUNHLEVBREgsQ0FDTSxRQUROLEVBQ2dCLFlBQU07QUFDbEIsY0FBTSxRQUFRLE1BQU0sS0FBcEI7QUFDQSxlQUFLLEtBQUwsQ0FBVyxHQUFYLENBQWUsS0FBZixFQUFzQixLQUF0QixFQUE2QixLQUE3QjtBQUNELFNBSkg7QUFKeUI7QUFTMUI7QUFDRjs7QUFFRCxXQUFTLFNBQVQsR0FBc0I7QUFDcEIsUUFBSSxPQUFPLE1BQVAsS0FBa0IsQ0FBdEIsRUFBeUI7QUFDdkI7QUFDRDtBQUNELGtCQUFjLElBQWQsQ0FBbUIsT0FBTyxLQUFQLEVBQW5CO0FBQ0Q7O0FBRUQsV0FBUyxPQUFULEdBQTRCO0FBQUEsUUFBVixHQUFVLHlEQUFKLEVBQUk7O0FBQzFCLFFBQUksYUFBSjtBQUNBLFFBQUksSUFBSSxJQUFKLEtBQWEsQ0FBakIsRUFBb0I7QUFDbEIsVUFBTSxZQUFZLEtBQUssS0FBTCxDQUFXLE9BQU8sQ0FBUCxFQUFVLEVBQVYsQ0FBWCxDQUFsQjtBQUNBLFVBQU0sWUFBWSxPQUFPLElBQVAsRUFBYSxJQUFiLENBQWxCO0FBQ0EsYUFBTyxRQUFRLGFBQWE7QUFDMUIsV0FBRyxDQUR1QjtBQUUxQixnQkFBUSxPQUFPLElBQVAsRUFBYSxHQUFiLENBRmtCO0FBRzFCLGdCQUFRLE9BQU8sR0FBUCxFQUFZLEdBQVosQ0FIa0I7QUFJMUIsbUJBQVcsU0FKZTtBQUsxQix1QkFBZSxDQUxXO0FBTTFCLG1CQUFZLEtBQUssQ0FBTixHQUFXLENBQVgsR0FBZSxTQUFmLEdBQTJCO0FBTlosT0FBYixDQUFSLEVBT0gsR0FQRyxDQUFQO0FBUUQsS0FYRCxNQVdPLElBQUksSUFBSSxJQUFKLEtBQWEsQ0FBakIsRUFBb0I7QUFDekIsVUFBTSxTQUFTLE9BQU8sQ0FBUCxFQUFVLENBQVYsQ0FBZjtBQUNBLGFBQU8sUUFBUSxPQUFPO0FBQ3BCLFdBQUcsQ0FEaUI7QUFFcEIscUJBQWEsT0FBTyxDQUFDLEVBQVIsRUFBWSxFQUFaLENBRk87QUFHcEIsbUJBQVcsT0FBTyxDQUFDLEVBQVIsRUFBWSxFQUFaLENBSFM7QUFJcEIscUJBQWEsTUFKTztBQUtwQixxQkFBYSxTQUFTLE9BQU8sS0FBUCxFQUFjLElBQWQsQ0FMRjtBQU1wQixrQkFBVSxDQU5VO0FBT3BCLG1CQUFXO0FBUFMsT0FBUCxDQUFSLEVBUUgsR0FSRyxDQUFQO0FBU0Q7O0FBRUQsUUFBSSxRQUFRLENBQUMsSUFBSSxNQUFqQixFQUF5QjtBQUN2QixXQUFLLE1BQUwsR0FBYyxLQUFkO0FBQ0EsV0FBSyxPQUFMLEdBQWUsS0FBZjtBQUNEO0FBQ0QsUUFBSSxJQUFKLEVBQVUsS0FBSyxJQUFMLEdBQVksSUFBSSxJQUFoQjtBQUNWLFdBQU8sSUFBUDtBQUNEOztBQUVELFdBQVMsT0FBVCxDQUFrQixPQUFsQixFQUFxQztBQUFBLFFBQVYsR0FBVSx5REFBSixFQUFJOztBQUNuQyxRQUFJLFFBQVEsS0FBUixDQUFjLE1BQWQsS0FBeUIsQ0FBN0IsRUFBZ0MsT0FBTyxJQUFQO0FBQ2hDLFFBQU0sT0FBTyxjQUFjLE9BQWQsRUFBdUIsR0FBdkIsQ0FBYjtBQUNBLFFBQUksQ0FBQyxJQUFMLEVBQVc7QUFDWCxRQUFJLE1BQU0sVUFBVSxLQUFLLEtBQUwsQ0FBVyxLQUFLLE1BQUwsS0FBZ0IsVUFBVSxNQUFyQyxDQUFWLEVBQXdELEtBQXhELEVBQVY7QUFDQSxRQUFNLE9BQU8sUUFBUSxJQUFSLEVBQWMsR0FBZCxFQUFtQixHQUFuQixDQUFiO0FBQ0EsaUJBQWEsSUFBYjtBQUNBLFdBQU8sSUFBUDtBQUNEOztBQUVELFdBQVMsT0FBVCxDQUFrQixJQUFsQixFQUF3QixHQUF4QixFQUE2QixHQUE3QixFQUFrQztBQUNoQyxRQUFJLE9BQU8sSUFBSSxNQUFNLElBQVYsQ0FBZSxJQUFmLEVBQXFCLEdBQXJCLENBQVg7O0FBRUEsUUFBSSxJQUFJLE1BQVIsRUFBZ0I7QUFDZCxVQUFNLFNBQVMsSUFBSSxNQUFKLElBQWMsQ0FBN0I7QUFDQSxVQUFNLFFBQVEsSUFBSSxNQUFNLFFBQVYsRUFBZDtBQUNBLFVBQU0sY0FBYyxDQUFwQjtBQUNBLFdBQUssSUFBSSxJQUFJLENBQWIsRUFBZ0IsSUFBSSxXQUFwQixFQUFpQyxHQUFqQyxFQUFzQztBQUNwQyxZQUFNLElBQUksS0FBSyxDQUFMLElBQVUsSUFBSSxXQUFkLENBQVY7QUFDQSxZQUFNLEtBQUssS0FBSyxLQUFMLEVBQVg7OztBQUdBLFdBQUcsUUFBSCxDQUFZLENBQVosR0FBZ0IsS0FBSyxHQUFMLENBQVMsQ0FBVCxJQUFjLE1BQTlCO0FBQ0EsV0FBRyxRQUFILENBQVksQ0FBWixHQUFnQixLQUFLLEdBQUwsQ0FBUyxDQUFULElBQWMsTUFBOUI7QUFDQSxjQUFNLEdBQU4sQ0FBVSxFQUFWO0FBQ0Q7QUFDRCxhQUFPLElBQVAsQ0FBWSxLQUFaO0FBQ0EsYUFBTyxLQUFQO0FBQ0EsV0FBSyxPQUFMLEdBQWUsSUFBZjtBQUNELEtBaEJELE1BZ0JPO0FBQ0wsYUFBTyxJQUFQLENBQVksSUFBWjtBQUNEO0FBQ0QsU0FBSyxjQUFMLEdBQXNCLElBQUksTUFBTSxJQUFWLEdBQWlCLGFBQWpCLENBQStCLElBQS9CLENBQXRCO0FBQ0EsU0FBSyxjQUFMLEdBQXNCLE9BQU8sQ0FBQyxHQUFSLEVBQWEsR0FBYixDQUF0QjtBQUNBLFNBQUssS0FBTCxHQUFhLE9BQU8sR0FBUCxFQUFZLENBQVosQ0FBYjtBQUNBLFNBQUssTUFBTCxHQUFjLElBQWQ7QUFDQSxTQUFLLFFBQUwsQ0FBYyxDQUFkLEdBQWtCLE9BQU8sVUFBVSxDQUFWLENBQVAsRUFBcUIsVUFBVSxDQUFWLENBQXJCLENBQWxCO0FBQ0EsVUFBTSxHQUFOLENBQVUsSUFBVjtBQUNBLFdBQU8sSUFBUDtBQUNEOztBQUVELFdBQVMsU0FBVCxHQUFzQjtBQUNwQixXQUFPLGNBQWMsS0FBSyxLQUFMLENBQVcsS0FBSyxNQUFMLEtBQWdCLGNBQWMsTUFBekMsQ0FBZCxDQUFQO0FBQ0Q7O0FBRUQsV0FBUyxZQUFULENBQXVCLElBQXZCLEVBQTZCO0FBQzNCLFFBQUksTUFBTSxLQUFLLFFBQWY7QUFDQSxRQUFJLElBQUksS0FBUixFQUFlLElBQUksS0FBSixDQUFVLFFBQVYsQ0FBbUIsV0FBbkIsRUFBZixLQUNLLElBQUksUUFBSixDQUFhLEtBQWIsQ0FBbUIsS0FBbkIsQ0FBeUIsUUFBekIsQ0FBa0MsV0FBbEM7QUFDTjs7QUFFRCxXQUFTLFFBQVQsQ0FBbUIsSUFBbkIsRUFBeUIsS0FBekIsRUFBZ0M7QUFDOUIsUUFBSSxNQUFNLEtBQUssUUFBZjtBQUNBLFFBQUksSUFBSSxLQUFSLEVBQWUsSUFBSSxLQUFKLENBQVUsSUFBVixDQUFlLEtBQWYsRUFBZixLQUNLLElBQUksUUFBSixDQUFhLEtBQWIsQ0FBbUIsS0FBbkIsQ0FBeUIsSUFBekIsQ0FBOEIsS0FBOUI7QUFDTjs7QUFFRCxXQUFTLFFBQVQsQ0FBbUIsSUFBbkIsRUFBeUI7QUFDdkIsUUFBSSxNQUFNLEtBQUssUUFBZjtBQUNBLFFBQUksSUFBSSxLQUFSLEVBQWUsT0FBTyxJQUFJLEtBQVgsQ0FBZixLQUNLLE9BQU8sSUFBSSxRQUFKLENBQWEsS0FBYixDQUFtQixLQUExQjtBQUNOOztBQUVELFdBQVMsYUFBVCxDQUF3QixLQUF4QixFQUErQjtBQUM3QixhQUFTLGFBQVQsQ0FBdUIsS0FBdkIsRUFBOEIsQ0FBOUI7QUFDQSxhQUFTLElBQVQsQ0FBYyxLQUFkLENBQW9CLFVBQXBCLEdBQWlDLEtBQWpDO0FBQ0Q7QUFDRixDQXRSRDs7O0FDbEJBOzs7O0FDQUEsSUFBTSxTQUFTLFFBQVEsUUFBUixHQUFmO0FBQ0EsSUFBTSxNQUFNLFFBQVEsU0FBUixDQUFaO0FBQ0EsSUFBTSxXQUFXLFFBQVEsWUFBUixDQUFqQjtBQUNBLElBQU0sT0FBTyxTQUFQLElBQU8sR0FBWSxDQUFFLENBQTNCOztBQUVBLE9BQU8sT0FBUCxHQUFpQixZQUErQjtBQUFBLE1BQXJCLEdBQXFCLHlEQUFmLEVBQWU7QUFBQSxNQUFYLEVBQVcseURBQU4sSUFBTTs7QUFDOUMsTUFBTSxVQUFVLFNBQVMsYUFBVCxDQUF1QixXQUF2QixDQUFoQjtBQUNBLE1BQU0sVUFBVSxTQUFTLGFBQVQsQ0FBdUIsV0FBdkIsQ0FBaEI7QUFDQSxNQUFNLFNBQVMsU0FBUyxhQUFULENBQXVCLFVBQXZCLENBQWY7QUFDQSxNQUFNLFNBQVMsU0FBUyxhQUFULENBQXVCLFVBQXZCLENBQWY7QUFDQSxNQUFNLFNBQVMsU0FBUyxhQUFULENBQXVCLG1CQUF2QixDQUFmO0FBQ0EsTUFBTSxPQUFPLFNBQVMsYUFBVCxDQUF1QixpQkFBdkIsQ0FBYjtBQUNBLE1BQU0saUJBQWlCLFNBQVMsYUFBVCxDQUF1QixRQUF2QixDQUF2QjtBQUNBLE1BQU0sT0FBTyxFQUFiO0FBQ0EsTUFBTSxpQkFBaUIsSUFBdkI7QUFDQSxNQUFNLGlCQUFpQixDQUFFLE1BQUYsRUFBVSxJQUFWLEVBQWlCLE1BQWpCLENBQXdCLE9BQXhCLENBQXZCOztBQUVBLE1BQU0sY0FBYyxHQUFwQjs7QUFFQSxNQUFJLGdCQUFnQixLQUFwQjtBQUNBLE1BQU0sZUFBZSxJQUFJLFlBQXpCOztBQUVBLE1BQUkseUJBQXlCLElBQTdCOztBQUVBLE1BQU0sWUFBWSxXQUFXLE9BQVgsR0FBcUIsT0FBdkM7QUFDQSxNQUFJLFFBQUosRUFBYztBQUNaLFdBQU8sU0FBUCxHQUFtQixnRUFBbkI7QUFDQSxXQUFPLFNBQVAsR0FBbUIsbURBQW5CO0FBQ0Q7O0FBRUQsTUFBTSxhQUFhLEdBQW5CO0FBQ0EsWUFBVSxNQUFWLEVBQWtCO0FBQ2hCLGtCQUFjO0FBREUsR0FBbEI7QUFHQTs7QUFFQSxXQUFTLGtCQUFULEdBQStCO0FBQzdCLGNBQVUsU0FBVixFQUFxQixFQUFFLE9BQU8sYUFBYSxHQUF0QixFQUFyQixFQUFrRCxZQUFNO0FBQ3RELGlCQUFXLFNBQVgsRUFBc0IsRUFBRSxPQUFPLFdBQVQsRUFBdEIsRUFBOEMsWUFBTTtBQUNsRDtBQUNELE9BRkQ7QUFHRCxLQUpEO0FBS0Q7O0FBRUQsV0FBUyxjQUFULEdBQTJCO0FBQ3pCLGNBQVUsTUFBVjtBQUNBLGlCQUFhLE1BQWI7QUFDQSxpQkFBYSxJQUFiLENBQWtCLE9BQWxCLEVBQTJCLFlBQU07QUFDL0I7QUFDQSxpQkFBVyxNQUFYLEVBQW1CLEVBQW5CLEVBQXVCLFlBQU07QUFDM0IsWUFBSSxDQUFDLGFBQUwsRUFBb0I7QUFDbEIsbUNBQXlCLFdBQVcsWUFBTTtBQUN4QyxzQkFBVSxNQUFWO0FBQ0QsV0FGd0IsRUFFdEIsR0FGc0IsQ0FBekI7QUFHRDtBQUNGLE9BTkQ7QUFPRCxLQVREO0FBVUEsaUJBQWEsSUFBYixDQUFrQixNQUFsQixFQUEwQixZQUFNO0FBQzlCLHNCQUFnQixJQUFoQjtBQUNBLGlCQUFXLE1BQVg7QUFDQTtBQUNELEtBSkQ7QUFLRDs7QUFFRCxXQUFTLFVBQVQsR0FBdUI7QUFDckIsUUFBSSxzQkFBSixFQUE0QixhQUFhLHNCQUFiO0FBQzVCLG1CQUFlLEtBQWYsQ0FBcUIsT0FBckIsR0FBK0IsTUFBL0I7QUFDQTtBQUNBO0FBQ0Q7O0FBRUQsV0FBUyxTQUFULEdBQXNCO0FBQ3BCLG1CQUFlLE9BQWYsQ0FBdUIsYUFBSzs7QUFFMUIsUUFBRSxLQUFGLENBQVEsT0FBUixHQUFrQixNQUFsQjtBQUNELEtBSEQ7QUFJRDs7QUFFRCxXQUFTLFNBQVQsQ0FBb0IsT0FBcEIsRUFBa0Q7QUFBQSxRQUFyQixHQUFxQix5REFBZixFQUFlO0FBQUEsUUFBWCxFQUFXLHlEQUFOLElBQU07O0FBQ2hELFFBQUksUUFBUSxJQUFJLEtBQUosSUFBYSxDQUF6QjtBQUNBLFlBQVEsS0FBUixDQUFjLE9BQWQsR0FBd0IsT0FBeEI7O0FBRUEsUUFBTSxXQUFXLE9BQU8sSUFBSSxRQUFYLEtBQXdCLFFBQXhCLEdBQW1DLElBQUksUUFBdkMsR0FBa0QsY0FBbkU7QUFDQSxRQUFNLFdBQVcsZUFBZSxPQUFmLEVBQXdCLEdBQXhCLENBQWpCO0FBQ0EsYUFBUyxPQUFULENBQWlCLFVBQUMsS0FBRCxFQUFRLENBQVIsRUFBYztBQUM3QixVQUFNLFFBQVEsRUFBRSxTQUFTLENBQVgsRUFBYyxVQUFkLEVBQW9CLFNBQVMsS0FBN0IsRUFBZDtBQUNBLGFBQU8sRUFBRSxRQUFRLEtBQVYsRUFBUDtBQUNBLFVBQU0sWUFBWSxPQUFPLEVBQVAsQ0FBVSxLQUFWLEVBQWlCLEVBQUUsWUFBRixFQUFTLFNBQVMsQ0FBbEIsRUFBcUIsa0JBQXJCLEVBQStCLE1BQU0sU0FBckMsRUFBakIsRUFDZixFQURlLENBQ1osUUFEWSxFQUNGLE1BREUsQ0FBbEI7QUFFQSxhQUFPLEVBQVAsQ0FBVSxLQUFWLEVBQWlCLEVBQUUsWUFBRixFQUFTLE1BQU0sQ0FBZixFQUFrQixVQUFVLFdBQVcsR0FBdkMsRUFBNEMsTUFBTSxTQUFsRCxFQUFqQjtBQUNBLGVBQVMsR0FBVDtBQUNBLFVBQUksTUFBTSxTQUFTLE1BQVQsR0FBa0IsQ0FBNUIsRUFBK0IsVUFBVSxFQUFWLENBQWEsVUFBYixFQUF5QixFQUF6QjtBQUNoQyxLQVJEO0FBU0Q7O0FBRUQsV0FBUyxVQUFULENBQXFCLE9BQXJCLEVBQW1EO0FBQUEsUUFBckIsR0FBcUIseURBQWYsRUFBZTtBQUFBLFFBQVgsRUFBVyx5REFBTixJQUFNOztBQUNqRCxRQUFJLFFBQVEsSUFBSSxLQUFKLElBQWEsQ0FBekI7QUFDQSxRQUFNLFdBQVcsT0FBTyxJQUFJLFFBQVgsS0FBd0IsUUFBeEIsR0FBbUMsSUFBSSxRQUF2QyxHQUFrRCxjQUFuRTtBQUNBLFFBQU0sV0FBVyxlQUFlLE9BQWYsRUFBd0IsR0FBeEIsQ0FBakI7QUFDQSxhQUFTLE9BQVQ7QUFDQSxhQUFTLE9BQVQsQ0FBaUIsVUFBQyxLQUFELEVBQVEsQ0FBUixFQUFjO0FBQzdCLFVBQU0sUUFBUSxFQUFFLFNBQVMsQ0FBWCxFQUFjLE1BQU0sQ0FBcEIsRUFBdUIsU0FBUyxLQUFoQyxFQUFkO0FBQ0EsYUFBTyxFQUFFLFFBQVEsS0FBVixFQUFQO0FBQ0EsYUFBTyxFQUFQLENBQVUsS0FBVixFQUFpQixFQUFFLFlBQUYsRUFBUyxTQUFTLENBQWxCLEVBQXFCLFVBQVUsV0FBVyxJQUExQyxFQUFnRCxNQUFNLFNBQXRELEVBQWpCO0FBQ0EsVUFBTSxZQUFZLE9BQU8sRUFBUCxDQUFVLEtBQVYsRUFBaUIsRUFBRSxZQUFGLEVBQVMsTUFBTSxJQUFmLEVBQXFCLFVBQVUsV0FBVyxHQUExQyxFQUErQyxNQUFNLFNBQXJELEVBQWpCLEVBQ2YsRUFEZSxDQUNaLFFBRFksRUFDRixNQURFLENBQWxCO0FBRUEsZUFBUyxLQUFUO0FBQ0EsVUFBSSxNQUFNLFNBQVMsTUFBVCxHQUFrQixDQUE1QixFQUErQjtBQUM3QixrQkFBVSxFQUFWLENBQWEsVUFBYixFQUF5QixZQUFNO0FBQzdCLGtCQUFRLEtBQVIsQ0FBYyxPQUFkLEdBQXdCLE1BQXhCO0FBQ0E7QUFDRCxTQUhEO0FBSUQ7QUFDRixLQWJEO0FBY0Q7O0FBRUQsV0FBUyxNQUFULENBQWlCLEVBQWpCLEVBQXFCO0FBQ25CLFFBQU0sUUFBUSxHQUFHLE1BQWpCO0FBQ0EsUUFBSSxNQUFNLE9BQVYsRUFBbUI7QUFDakIsaUNBQXlCLE1BQU0sSUFBL0IsUUFEaUI7QUFFakIsZUFBUyxNQUFNO0FBRkUsS0FBbkI7QUFJRDs7QUFFRCxXQUFTLGNBQVQsQ0FBeUIsT0FBekIsRUFBNEM7QUFBQSxRQUFWLEdBQVUseURBQUosRUFBSTs7QUFDMUMsUUFBTSxXQUFXLE1BQU0sU0FBTixDQUFnQixLQUFoQixDQUFzQixJQUF0QixDQUEyQixRQUFRLGdCQUFSLENBQXlCLElBQUksWUFBSixJQUFvQixHQUE3QyxDQUEzQixDQUFqQjtBQUNBLFFBQUksU0FBUyxNQUFULEtBQW9CLENBQXhCLEVBQTJCLFNBQVMsSUFBVCxDQUFjLE9BQWQ7QUFDM0IsV0FBTyxRQUFQO0FBQ0Q7QUFDRixDQTVIRDs7Ozs7QUNMQSxPQUFPLE9BQVAsR0FBaUIsOEJBQThCLElBQTlCLENBQW1DLFVBQVUsU0FBN0MsQ0FBakI7Ozs7O0FDQUEsSUFBTSxPQUFPLG1EQUFiOzs7Ozs7Ozs7Ozs7Ozs7QUFlQSxJQUFNLFNBQVMsYUFBZjs7QUFFQSxPQUFPLE9BQVAsR0FBaUIsVUFBVSxHQUFWLEVBQWU7QUFDOUIsVUFBUSxHQUFSLFFBQWlCLEdBQWpCLEVBQXdCLElBQXhCO0FBQ0QsQ0FGRDs7QUFJQSxPQUFPLE9BQVAsQ0FBZSxLQUFmLEdBQXVCLFVBQVUsR0FBVixFQUFlO0FBQ3BDLFVBQVEsR0FBUixDQUFZLENBQ1YscUJBRFUsRUFFVixzRUFGVSxzQkFHUSxNQUhSLEVBSVYsb0RBSlUsRUFLViwyQ0FMVSxFQU1WLElBTlUsQ0FNTCxJQU5LLENBQVosRUFNaUIsSUFOakIsOENBTWdFLElBTmhFLEVBTXlFLElBTnpFLHVCQU1pRyxJQU5qRyxFQU11RyxJQU52RyxFQU02RyxJQU43RyxFQU1tSCxJQU5uSDtBQU9ELENBUkQ7O0FBVUEsT0FBTyxPQUFQLENBQWUsU0FBZixHQUEyQixZQUFZOzs7QUFHdEMsQ0FIRDs7Ozs7QUMvQkEsSUFBTSxVQUFVLFFBQVEsZUFBUixDQUFoQjtBQUNBLElBQU0sZUFBZSxRQUFRLGdCQUFSLENBQXJCO0FBQ0EsSUFBTSxXQUFXLFFBQVEsdUJBQVIsRUFBaUMsS0FBakMsQ0FBdUMsQ0FBdkMsRUFBMEMsR0FBMUMsQ0FBakI7QUFDQSxJQUFNLGdCQUFnQixRQUFRLHVCQUFSLENBQXRCOztBQUVBLE9BQU8sT0FBUCxHQUFpQixZQUFZO0FBQzNCLE1BQU0sUUFBUSxRQUFRLGFBQVIsRUFBdUIsQ0FBdkIsQ0FBZDs7QUFFQSxNQUFNLE1BQU0sUUFBUSxRQUFSLENBQVo7QUFDQSxNQUFNLE1BQU0sYUFBYSxHQUFiLEVBQWtCLEtBQWxCLENBQVo7QUFDQSxNQUFJLFFBQVEsQ0FBQyxDQUFiLEVBQWdCLElBQUksTUFBSixDQUFXLEdBQVgsRUFBZ0IsQ0FBaEI7QUFDaEIsTUFBSSxPQUFKLENBQVksS0FBWjtBQUNBLFNBQU8sR0FBUDtBQUNELENBUkQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNMQSxJQUFNLGVBQWUsUUFBUSxRQUFSLEVBQWtCLFlBQXZDO0FBQ0EsSUFBTSxXQUFXLFFBQVEsWUFBUixDQUFqQjtBQUNBLElBQU0sTUFBTSxRQUFRLE9BQVIsQ0FBWjs7QUFFQSxPQUFPLE9BQVAsR0FBaUIsZ0JBQWlFO0FBQUEsTUFBckQsS0FBcUQsUUFBckQsS0FBcUQ7QUFBQSxNQUE5QyxZQUE4QyxRQUE5QyxZQUE4QztBQUFBLE1BQWhDLEtBQWdDLFFBQWhDLEtBQWdDO0FBQUEsTUFBekIsTUFBeUIsUUFBekIsTUFBeUI7QUFBQSxNQUFqQixRQUFpQixRQUFqQixRQUFpQjtBQUFBLE1BQVAsR0FBTyxRQUFQLEdBQU87O0FBQ2hGLE1BQUksa0JBQWtCLElBQUksY0FBSixFQUF0QjtBQUNBLE1BQU0sTUFBTSxJQUFJLFlBQUosRUFBWjtBQUNBLE1BQUksT0FBSixHQUFjLEtBQWQ7QUFDQSxNQUFJLGFBQUosR0FBb0IsS0FBcEI7QUFDQSxNQUFJLE1BQUosR0FBYSxNQUFiO0FBQ0EsTUFBSSxXQUFXLEtBQWY7O0FBRUEsTUFBTSxtQkFBbUIsU0FBUyxRQUFsQztBQUNBLE1BQU0saUJBQWlCLFNBQVMsYUFBVCxDQUF1QixnQkFBdkIsQ0FBdkI7QUFDQSxNQUFNLFlBQVksU0FBUyxhQUFULENBQXVCLGFBQXZCLENBQWxCO0FBQ0EsTUFBTSxjQUFjLFNBQVMsYUFBVCxDQUF1QixlQUF2QixDQUFwQjs7QUFFQSxTQUFPLEdBQVA7O0FBRUEsV0FBUyxNQUFULEdBQW1CO0FBQ2pCLFFBQUksU0FBSjtBQUNBLFdBQU8sZ0JBQVAsQ0FBd0IsU0FBeEIsRUFBbUMsVUFBQyxFQUFELEVBQVE7QUFDekMsVUFBSSxHQUFHLE9BQUgsS0FBZSxFQUFmLElBQXFCLENBQUMsSUFBSSxPQUE5QixFQUF1QztBQUNyQztBQUNBLGVBQU8sS0FBUDtBQUNELE9BSEQsTUFHTyxJQUFJLEdBQUcsT0FBSCxLQUFlLEVBQWYsSUFBcUIsQ0FBQyxJQUFJLGFBQTlCLEVBQTZDOzs7Ozs7QUFNbkQ7QUFDRixLQVhEO0FBWUEsV0FBTyxnQkFBUCxDQUF3QixPQUF4QixFQUFpQyxVQUFDLEVBQUQsRUFBUTtBQUN2QyxVQUFJLEdBQUcsT0FBSCxLQUFlLEVBQWYsSUFBcUIsSUFBSSxPQUE3QixFQUFzQztBQUNwQztBQUNBLGVBQU8sS0FBUDtBQUNELE9BSEQsTUFHTyxJQUFJLEdBQUcsT0FBSCxLQUFlLEVBQWYsSUFBcUIsSUFBSSxhQUE3QixFQUE0Qzs7Ozs7O0FBTWxEO0FBQ0YsS0FYRDs7QUFhQSxRQUFJLFFBQUosRUFBYztBQUNaLFVBQU0sU0FBUyxTQUFTLGFBQVQsQ0FBdUIsU0FBdkIsQ0FBZjtBQUNBLGFBQU8sZ0JBQVAsQ0FBd0IsWUFBeEIsRUFBc0MsVUFBdEM7QUFDQSxhQUFPLGdCQUFQLENBQXdCLFVBQXhCLEVBQW9DLFFBQXBDO0FBQ0Q7QUFDRjs7QUFFRCxXQUFTLFVBQVQsR0FBdUI7QUFDckIsUUFBSSxJQUFKLENBQVMsT0FBVDtBQUNBLHNCQUFrQixJQUFJLGNBQUosRUFBbEI7QUFDQSxRQUFJLFVBQUosQ0FBZSxZQUFmO0FBQ0EsUUFBSSxPQUFKLEdBQWMsSUFBZDs7QUFFQSxlQUFXLEtBQVg7QUFDQSxVQUFNLElBQU4sQ0FBVyxPQUFYLEVBQW9CLFlBQU07QUFDeEIsaUJBQVcsSUFBWDtBQUNELEtBRkQ7QUFHQSxRQUFNLE9BQU8sTUFBTSxLQUFOLEVBQWI7QUFDQSxjQUFVLElBQVY7QUFDQSxVQUFNLE1BQU4sR0FBZSxDQUFmO0FBQ0EsUUFBSSxXQUFKLEdBQWtCLElBQWxCO0FBQ0EsYUFBUyxRQUFULENBQWtCLENBQWxCLElBQXVCLENBQUMsQ0FBeEI7QUFDRDs7QUFFRCxXQUFTLFFBQVQsR0FBcUI7QUFDbkIsUUFBSSxPQUFKLEdBQWMsS0FBZDtBQUNBLGNBQVUsSUFBVjtBQUNBLFFBQUksVUFBSixDQUFlLGVBQWY7QUFDQSxVQUFNLFVBQU47QUFDQSxVQUFNLE1BQU4sR0FBZSxDQUFmO0FBQ0EsYUFBUyxRQUFULENBQWtCLENBQWxCLElBQXVCLENBQXZCO0FBQ0EsYUFBUyxRQUFULEdBQW9CLGdCQUFwQjtBQUNBLFFBQUksV0FBSixHQUFrQixDQUFsQjtBQUNBLFFBQUksV0FBSjtBQUNBLFFBQUksSUFBSixDQUFTLE1BQVQsRUFBaUIsUUFBakI7QUFDRDs7QUFFRCxXQUFTLFNBQVQsQ0FBb0IsSUFBcEIsRUFBMEI7QUFDeEIsUUFBSSxDQUFDLElBQUwsRUFBVztBQUNULHFCQUFlLEtBQWYsQ0FBcUIsT0FBckIsR0FBK0IsTUFBL0I7QUFDQTtBQUNEO0FBQ0QsbUJBQWUsS0FBZixDQUFxQixPQUFyQixHQUErQixPQUEvQjs7QUFFQSxRQUFNLFFBQVEsS0FBSyxLQUFMLENBQVcsR0FBWCxFQUFnQixHQUFoQixDQUFvQjtBQUFBLGFBQUssRUFBRSxJQUFGLEVBQUw7QUFBQSxLQUFwQixDQUFkO0FBQ0EsZ0JBQVksV0FBWixHQUEwQixZQUExQjtBQUNBLGNBQVUsV0FBVixHQUF3QixNQUFNLENBQU4sQ0FBeEI7QUFDRDtBQUNGLENBMUZEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNTQSxPQUFPLE9BQVAsR0FBaUI7O0FBRWYsWUFBVTs7QUFFUixnQkFBZ0IsRUFBRSxNQUFNLEdBQVIsRUFBYSxPQUFPLElBQXBCLEVBRlI7QUFHUixjQUFnQixFQUFFLE1BQU0sR0FBUixFQUFhLE9BQU8sSUFBcEIsRUFIUjtBQUlSLGtCQUFnQixFQUFFLE1BQU0sSUFBUixFQUFjLE9BQU8sSUFBSSxNQUFNLE9BQVYsQ0FBbUIsR0FBbkIsRUFBd0IsR0FBeEIsQ0FBckIsRUFKUjtBQUtSLGtCQUFnQixFQUFFLE1BQU0sR0FBUixFQUFhLE9BQU8sQ0FBcEIsRUFMUjtBQU1SLGlCQUFnQixFQUFFLE1BQU0sR0FBUixFQUFhLE9BQU8sR0FBcEIsRUFOUjtBQU9SLGNBQWdCLEVBQUUsTUFBTSxHQUFSLEVBQWEsT0FBTyxDQUFwQixFQVBSO0FBUVIsZUFBZ0IsRUFBRSxNQUFNLEdBQVIsRUFBYSxPQUFPLEdBQXBCLEVBUlI7QUFTUixvQkFBZ0IsRUFBRSxNQUFNLEdBQVIsRUFBYSxPQUFPLEdBQXBCOztBQVRSLEdBRks7O0FBZWYsZ0JBQWMsQ0FFWixtQkFGWSxFQUlaLGVBSlksRUFNVixXQU5VLEVBUVYsMkVBUlUsRUFVWixHQVZZLEVBWVosSUFaWSxDQVlOLElBWk0sQ0FmQzs7QUE2QmYsa0JBQWdCLENBRWQsMkJBRmMsRUFHZCwwQkFIYyxFQUtkLHNCQUxjLEU7O0FBT2QsNEJBUGMsRTtBQVFkLDBCQVJjLEU7O0FBVWQsK0JBVmMsRTs7QUFZZCwrQkFaYyxFQWFkLGlDQWJjLEVBZWQsbUJBZmM7OztBQWtCZCxnQ0FsQmMsRTtBQW1CZCxtQ0FuQmM7Ozs7QUF1QmQsMEJBdkJjLEU7QUF3QmQsNkJBeEJjLEU7O0FBMEJkLGdDQTFCYyxFO0FBMkJkLHFDQTNCYyxFOztBQTZCZCwrQkE3QmMsRTtBQThCZCxnQ0E5QmMsRTs7Ozs7Ozs7Ozs7O0FBMkNkLHlDQTNDYyxFQTZDWixtQkE3Q1ksRUErQ1osbUJBL0NZLEVBaURWLG9EQWpEVSxFQWtEViwwREFsRFUsRUFvRFYsMEVBcERVLEVBc0RaLFVBdERZLEVBd0RWLG1FQXhEVSxFQXlEViw2REF6RFUsRUEyRFYsb0VBM0RVLEVBNkRaLEdBN0RZLEVBK0RaLDhDQS9EWSxFQWlFZCxHQWpFYyxFQW1FZCwwQ0FuRWMsRUFxRVosbURBckVZLEVBc0VaLG9EQXRFWSxFQXVFWixzQ0F2RVksRUF5RVosZ0dBekVZLEVBMkVkLEdBM0VjLEVBNkVkLHNGQTdFYyxFQStFWixvQkEvRVksRTtBQWdGWiw2Q0FoRlksRTs7OztBQW9GWiw2QkFwRlksRUFzRlYsbUJBdEZVLEVBd0ZaLFVBeEZZLEVBMEZWLFVBMUZVLEVBNEZaLEdBNUZZLEVBOEZaLDhCQTlGWSxFQStGWixpRUEvRlksRUFnR1osZUFoR1ksRUFrR2QsR0FsR2MsRUFvR2QsbURBcEdjLEVBc0daLHFDQXRHWSxFQXVHWiwyQkF2R1ksRUF5R1osOEJBekdZLEVBMEdaLDhCQTFHWSxFQTRHWixvQkE1R1ksRUE2R1osb0JBN0dZLEVBK0daLGNBL0dZLEVBZ0haLDJEQWhIWTs7OztBQW9IWixvQkFwSFksRUFzSFYsMkRBdEhVLEVBdUhWLG1DQXZIVSxFQXlIWixHQXpIWSxFQTJIWixlQTNIWSxFQTZIZCxHQTdIYyxFQStIZCxlQS9IYyxFQWlJWixpQ0FqSVksRUFrSVosaUNBbElZLEVBbUlaLDBDQW5JWSxFQXFJWiwyRUFySVksRUFzSVosMEVBdElZLEVBd0laLGlCQXhJWSxFQTBJWixvQ0ExSVksRUEySVosMkJBM0lZLEVBNElaLGdCQTVJWSxFQThJWix5Q0E5SVksRUFnSlYsNEJBaEpVLEVBa0pWLDBCQWxKVSxFQW1KViwwQkFuSlUsRUFvSlYsd0NBcEpVLEVBcUpWLGFBckpVLEVBc0pWLGFBdEpVLEVBd0paLEdBeEpZLEVBMEpaLHlCQTFKWSxFQTJKWixnQkEzSlksRUE2SlosOENBN0pZLEVBK0paLDhDQS9KWSxFQWdLWix5Q0FoS1ksRUFpS1osK0JBaktZLEVBbUtaLHdGQW5LWSxFOztBQXFLWixtQkFyS1ksRUF1S1YsMkVBdktVLEU7O0FBeUtaLEtBektZLEVBMktaLG9DQTNLWSxFQTZLZCxHQTdLYyxFQStLZCxJQS9LYyxDQStLUixJQS9LUTs7QUE3QkQsQ0FBakI7OztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM1SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDaE9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQ3hFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBOztBQ0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDMUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDL0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDM05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsImNvbnN0IGNyZWF0ZUxvb3AgPSByZXF1aXJlKCdyYWYtbG9vcCcpO1xuY29uc3QgY3JlYXRlQXBwID0gcmVxdWlyZSgnLi9saWIvYXBwJyk7XG5jb25zdCBuZXdBcnJheSA9IHJlcXVpcmUoJ25ldy1hcnJheScpO1xuY29uc3QgZ2VvU2NlbmUgPSByZXF1aXJlKCcuL2xpYi9nZW9TY2VuZScpO1xuY29uc3QgZ2V0UGFsZXR0ZSA9IHJlcXVpcmUoJy4vbGliL3BhbGV0dGUnKTtcbmNvbnN0IHJpZ2h0Tm93ID0gcmVxdWlyZSgncmlnaHQtbm93Jyk7XG5jb25zdCBzZXR1cEludGVyYWN0aW9ucyA9IHJlcXVpcmUoJy4vbGliL3NldHVwSW50ZXJhY3Rpb25zJyk7XG5jb25zdCBsb2cgPSByZXF1aXJlKCcuL2xpYi9sb2cnKTtcblxuY29uc3QgaXNNb2JpbGUgPSByZXF1aXJlKCcuL2xpYi9pc01vYmlsZScpO1xuY29uc3Qgc2hvd0ludHJvID0gcmVxdWlyZSgnLi9saWIvaW50cm8nKTtcbmNvbnN0IEVmZmVjdENvbXBvc2VyID0gcmVxdWlyZSgnLi9saWIvRWZmZWN0Q29tcG9zZXInKTtcbmNvbnN0IEJsb29tUGFzcyA9IHJlcXVpcmUoJy4vbGliL0Jsb29tUGFzcycpO1xuY29uc3QgU1NBT1NoYWRlciA9IHJlcXVpcmUoJy4vbGliL3NoYWRlci9TU0FPU2hhZGVyJyk7XG5jb25zdCBjcmVhdGVBdWRpbyA9IHJlcXVpcmUoJy4vbGliL2F1ZGlvJyk7XG5cbmNvbnN0IHdoaXRlID0gbmV3IFRIUkVFLkNvbG9yKCd3aGl0ZScpO1xuY29uc3Qgb3B0ID0geyBhbnRpYWxpYXM6IGZhbHNlLCBhbHBoYTogZmFsc2UsIHN0ZW5jaWw6IGZhbHNlIH07XG5jb25zdCB7IHVwZGF0ZVByb2plY3Rpb25NYXRyaXgsIGNhbWVyYSwgc2NlbmUsIHJlbmRlcmVyLCBjb250cm9scywgY2FudmFzIH0gPSBjcmVhdGVBcHAob3B0KTtcblxubGV0IHN1cHBvcnRzRGVwdGggPSB0cnVlO1xuaWYgKCFyZW5kZXJlci5leHRlbnNpb25zLmdldCgnV0VCR0xfZGVwdGhfdGV4dHVyZScpKSB7XG4gIGlmICh3aW5kb3cuZ2EpIHdpbmRvdy5nYSgnc2VuZCcsICdldmVudCcsICdlcnJvcicsICdXRUJHTF9kZXB0aF90ZXh0dXJlJywgMClcbiAgY29uc29sZS53YXJuKCdSZXF1aXJlcyBXRUJHTF9kZXB0aF90ZXh0dXJlIGZvciBjZXJ0YWluIHBvc3QtcHJvY2Vzc2luZyBlZmZlY3RzLicpO1xuICBzdXBwb3J0c0RlcHRoID0gZmFsc2U7XG59XG5cbnZhciBmbG9hdERlcHRoID0gZmFsc2U7XG5yZW5kZXJlci5nYW1tYUlucHV0ID0gdHJ1ZTtcbnJlbmRlcmVyLmdhbW1hT3V0cHV0ID0gdHJ1ZTtcbnJlbmRlcmVyLmdhbW1hRmFjdG9yID0gMi4yO1xuXG5jb25zdCBydDEgPSBjcmVhdGVSZW5kZXJUYXJnZXQoKTtcbmNvbnN0IHJ0MiA9IGNyZWF0ZVJlbmRlclRhcmdldCgpO1xuY29uc3QgcnREZXB0aCA9IGZsb2F0RGVwdGggPyBydDEuY2xvbmUoKSA6IG51bGw7XG5jb25zdCBydEluaXRpYWwgPSBjcmVhdGVSZW5kZXJUYXJnZXQoKTtcbmNvbnN0IGNvbXBvc2VyID0gbmV3IEVmZmVjdENvbXBvc2VyKHJlbmRlcmVyLCBydDEsIHJ0MiwgcnRJbml0aWFsKTtcbmNvbnN0IHRhcmdldHMgPSBbIHJ0MSwgcnQyLCBydEluaXRpYWwsIHJ0RGVwdGggXS5maWx0ZXIoQm9vbGVhbik7XG5cbmlmIChmbG9hdERlcHRoKSB7XG4gIGNvbXBvc2VyLmRlcHRoVGV4dHVyZSA9IHJ0RGVwdGg7ICBcbiAgcnREZXB0aC50ZXh0dXJlLnR5cGUgPSBUSFJFRS5GbG9hdFR5cGU7XG59IGVsc2UgaWYgKHN1cHBvcnRzRGVwdGgpIHtcbiAgcnRJbml0aWFsLmRlcHRoVGV4dHVyZSA9IG5ldyBUSFJFRS5EZXB0aFRleHR1cmUoKTtcbn1cblxuY29uc3QgZGVwdGhUYXJnZXQgPSBmbG9hdERlcHRoID8gcnREZXB0aCA6IHJ0SW5pdGlhbC5kZXB0aFRleHR1cmU7XG5cbmNvbnN0IGRlcHRoTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaERlcHRoTWF0ZXJpYWwoKTtcbmRlcHRoTWF0ZXJpYWwuZGVwdGhQYWNraW5nID0gVEhSRUUuQmFzaWNEZXB0aFBhY2tpbmc7XG5kZXB0aE1hdGVyaWFsLmJsZW5kaW5nID0gVEhSRUUuTm9CbGVuZGluZztcblxubGV0IHRpbWUgPSAwO1xubGV0IG1lc2ggPSBudWxsO1xuXG5jb25zdCBsb29wID0gY3JlYXRlTG9vcChyZW5kZXIpLnN0YXJ0KCk7XG5yZXNpemUoKTtcbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemUpO1xud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCBldiA9PiBldi5wcmV2ZW50RGVmYXVsdCgpKTtcbmhlbGxvV29ybGQoKTtcblxuLy8gZW5zdXJlIHdlIGFyZSBhdCB0b3Agb24gaVBob25lIGluIGxhbmRzY2FwZVxuY29uc3QgaXNJT1MgPSAvKGlQaG9uZXxpUGFkKS9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCk7XG5pZiAoaXNJT1MpIHtcbiAgY29uc3QgZml4U2Nyb2xsID0gKCkgPT4ge1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgd2luZG93LnNjcm9sbFRvKDAsIDEpO1xuICAgIH0sIDUwMCk7XG4gIH07XG5cbiAgZml4U2Nyb2xsKCk7XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdvcmllbnRhdGlvbmNoYW5nZScsICgpID0+IHtcbiAgICBmaXhTY3JvbGwoKTtcbiAgfSwgZmFsc2UpO1xufVxuXG53aW5kb3cub25rZXlkb3duID0gZnVuY3Rpb24gKGUpIHsgXG4gIGlmIChlLmtleUNvZGUgPT09IDMyKSByZXR1cm4gZmFsc2U7XG59O1xuc2V0dXBQb3N0KCk7XG5cbmNvbnN0IHN1cHBvcnRzTWVkaWEgPSAhaXNJT1M7XG5zZXR1cFNjZW5lKHsgcGFsZXR0ZXM6IGdldFBhbGV0dGUoKSwgc3VwcG9ydHNNZWRpYSB9KTtcblxuZnVuY3Rpb24gc2V0dXBQb3N0ICgpIHtcbiAgY29tcG9zZXIuYWRkUGFzcyhuZXcgRWZmZWN0Q29tcG9zZXIuUmVuZGVyUGFzcyhzY2VuZSwgY2FtZXJhKSk7XG5cbiAgaWYgKHN1cHBvcnRzRGVwdGgpIHtcbiAgICB2YXIgcGFzcyA9IG5ldyBFZmZlY3RDb21wb3Nlci5TaGFkZXJQYXNzKFNTQU9TaGFkZXIpO1xuICAgIHBhc3MubWF0ZXJpYWwucHJlY2lzaW9uID0gJ2hpZ2hwJ1xuICAgIGNvbXBvc2VyLmFkZFBhc3MocGFzcyk7XG4gICAgcGFzcy51bmlmb3Jtcy50RGVwdGgudmFsdWUgPSBkZXB0aFRhcmdldDtcbiAgICBwYXNzLnVuaWZvcm1zLmNhbWVyYU5lYXIudmFsdWUgPSBjYW1lcmEubmVhcjtcbiAgICBwYXNzLnVuaWZvcm1zLmNhbWVyYUZhci52YWx1ZSA9IGNhbWVyYS5mYXI7XG4gIH1cblxuICBjb21wb3Nlci5hZGRQYXNzKG5ldyBCbG9vbVBhc3Moc2NlbmUsIGNhbWVyYSkpO1xuICBjb21wb3Nlci5wYXNzZXNbY29tcG9zZXIucGFzc2VzLmxlbmd0aCAtIDFdLnJlbmRlclRvU2NyZWVuID0gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUmVuZGVyVGFyZ2V0IChudW1BdHRhY2htZW50cykge1xuICBudW1BdHRhY2htZW50cyA9IG51bUF0dGFjaG1lbnRzIHx8IDA7XG4gIGNvbnN0IHRhcmdldCA9IG51bUF0dGFjaG1lbnRzID4gMVxuICAgID8gbmV3IFRIUkVFLldlYkdMTXVsdGlSZW5kZXJUYXJnZXQod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodClcbiAgICA6IG5ldyBUSFJFRS5XZWJHTFJlbmRlclRhcmdldCh3aW5kb3cuaW5uZXJXaWR0aCwgd2luZG93LmlubmVySGVpZ2h0KTtcbiAgdGFyZ2V0LnRleHR1cmUuZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xuICB0YXJnZXQudGV4dHVyZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICB0YXJnZXQudGV4dHVyZS5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICB0YXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSBmYWxzZTtcbiAgdGFyZ2V0LnN0ZW5jaWxCdWZmZXIgPSBmYWxzZTtcbiAgdGFyZ2V0LmRlcHRoQnVmZmVyID0gdHJ1ZTtcbiAgaWYgKG51bUF0dGFjaG1lbnRzID4gMSkge1xuICAgIHZhciBnQnVmZmVyTm9ybWFsUm91Z2huZXNzID0gdGFyZ2V0LnRleHR1cmUuY2xvbmUoKTtcbiAgICBnQnVmZmVyTm9ybWFsUm91Z2huZXNzLmZvcm1hdCA9IFRIUkVFLlJHQkFGb3JtYXQ7XG4gICAgZ0J1ZmZlck5vcm1hbFJvdWdobmVzcy50eXBlID0gVEhSRUUuRmxvYXRUeXBlO1xuICAgIHRhcmdldC5hdHRhY2htZW50cy5wdXNoKGdCdWZmZXJOb3JtYWxSb3VnaG5lc3MpO1xuICB9XG4gIHJldHVybiB0YXJnZXQ7XG59XG5cbmZ1bmN0aW9uIHJlc2l6ZSAoKSB7XG4gIGNvbnN0IGRwciA9IHJlbmRlcmVyLmdldFBpeGVsUmF0aW8oKTtcbiAgY29uc3Qgc2l6ZSA9IHJlbmRlcmVyLmdldFNpemUoKTtcbiAgY29uc3Qgd2lkdGggPSBzaXplLndpZHRoICogZHByO1xuICBjb25zdCBoZWlnaHQgPSBzaXplLmhlaWdodCAqIGRwcjtcbiAgdGFyZ2V0cy5mb3JFYWNoKHQgPT4ge1xuICAgIHQuc2V0U2l6ZSh3aWR0aCwgaGVpZ2h0KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlciAoZHQpIHtcbiAgdGltZSArPSBNYXRoLm1pbigzMCwgZHQpIC8gMTAwMDtcbiAgaWYgKG1lc2gpIHtcbiAgICBtZXNoLnBvc2l0aW9uLnkgPSBNYXRoLnNpbih0aW1lKSAqIDAuMjUgKyAxO1xuICAgIG1lc2gucm90YXRpb24ueSArPSBkdCAqIDAuMDAwMDU7XG4gIH1cblxuICB1cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG5cbiAgY29uc3Qgb2xkQ2xlYXIgPSByZW5kZXJlci5nZXRDbGVhckNvbG9yKCk7XG4gIGlmIChmbG9hdERlcHRoKSB7XG4gICAgc2NlbmUub3ZlcnJpZGVNYXRlcmlhbCA9IGRlcHRoTWF0ZXJpYWw7XG4gICAgcmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KHJ0RGVwdGgpO1xuICAgIHJlbmRlcmVyLnNldENsZWFyQ29sb3Iod2hpdGUsIDEpO1xuICAgIHJlbmRlcmVyLmNsZWFyKHRydWUsIHRydWUsIHRydWUpO1xuICAgIHJlbmRlcmVyLnJlbmRlcihzY2VuZSwgY2FtZXJhLCBydERlcHRoKTtcbiAgfVxuXG4gIGNvbXBvc2VyLnBhc3Nlcy5mb3JFYWNoKHBhc3MgPT4ge1xuICAgIGlmIChwYXNzLnVuaWZvcm1zICYmIHBhc3MudW5pZm9ybXMucmVzb2x1dGlvbikge1xuICAgICAgcGFzcy51bmlmb3Jtcy5yZXNvbHV0aW9uLnZhbHVlLnNldChydEluaXRpYWwud2lkdGgsIHJ0SW5pdGlhbC5oZWlnaHQpO1xuICAgIH1cbiAgfSk7XG5cbiAgcmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KG51bGwpO1xuICByZW5kZXJlci5zZXRDbGVhckNvbG9yKG9sZENsZWFyLCAxKTtcbiAgc2NlbmUub3ZlcnJpZGVNYXRlcmlhbCA9IG51bGw7XG4gIGlmIChjb21wb3Nlci5wYXNzZXMubGVuZ3RoID4gMSkgY29tcG9zZXIucmVuZGVyKCk7XG4gIGVsc2UgcmVuZGVyZXIucmVuZGVyKHNjZW5lLCBjYW1lcmEpO1xufVxuXG5mdW5jdGlvbiBzZXR1cFNjZW5lICh7IHBhbGV0dGVzLCBlbnZNYXAgfSkge1xuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjY2FudmFzJykuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cbiAgLy8gY29uc29sZS5sb2coJ1RvdGFsIHBhbGV0dGVzJywgcGFsZXR0ZXMubGVuZ3RoKTtcbiAgY29uc3QgZ2VvID0gZ2VvU2NlbmUoeyBwYWxldHRlcywgc2NlbmUsIGVudk1hcCwgbG9vcCwgY2FtZXJhLCByZW5kZXJlciB9KTtcblxuICBjb25zdCBpbml0aWFsUGFsZXR0ZSA9IFsgJyNmZmYnLCAnI2UyZTJlMicgXTtcbiAgZ2VvLnNldFBhbGV0dGUoaW5pdGlhbFBhbGV0dGUpO1xuICBkb2N1bWVudC5ib2R5LnN0eWxlLmJhY2tncm91bmQgPSAnI0Y5RjlGOSc7XG5cbiAgY29uc3QgYXVkaW8gPSBjcmVhdGVBdWRpbygpO1xuICBsZXQgc3RhcnRlZCA9IGZhbHNlO1xuICBsZXQgdGltZSA9IDA7XG4gIGxldCBzd2l0Y2hQYWxldHRlcyA9IGZhbHNlO1xuICBsZXQgcmVhZHlGb3JHZW9tZXRyeSA9IG5ld0FycmF5KGF1ZGlvLmJpbkNvdW50LCB0cnVlKTtcbiAgbGV0IHJlYWR5Rm9yUGFsZXR0ZUNoYW5nZSA9IGZhbHNlO1xuICBsZXQgcGFsZXR0ZUludGVydmFsO1xuXG4gIGNvbnN0IHdoaXRlUGFsZXR0ZSA9IFsgJyNmZmYnLCAnI2QzZDNkMycsICcjYTVhNWE1JyBdO1xuICBjb25zdCBpbnRlcmFjdGlvbnMgPSBzZXR1cEludGVyYWN0aW9ucyh7IHdoaXRlUGFsZXR0ZSwgc2NlbmUsIGNvbnRyb2xzLCBhdWRpbywgY2FtZXJhLCBnZW8gfSk7XG5cbiAgY29uc3QgaW50cm9BdXRvR2VvID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgIGdlby5uZXh0R2VvbWV0cnkoKTtcbiAgfSwgNDAwKTtcblxuICBpZiAoaXNNb2JpbGUpIHtcbiAgICBhdWRpby5za2lwKCk7XG4gIH0gZWxzZSB7XG4gICAgYXVkaW8ucXVldWUoKTtcbiAgICBhdWRpby5vbmNlKCdyZWFkeScsICgpID0+IHtcbiAgICAgIGF1ZGlvLnBsYXlRdWV1ZWQoKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIGV2ZXJ5IHRpbWUgd2UgcmVsZWFzZSBzcGFjZWJhciwgd2UgcmVzZXQgdGhlIGNvdW50ZXIgaGVyZVxuICBpbnRlcmFjdGlvbnMub24oJ3N0b3AnLCAoKSA9PiB7XG4gICAgcmVzZXRQYWxldHRlU3dhcHBpbmcoKTtcbiAgICByZWFkeUZvclBhbGV0dGVDaGFuZ2UgPSBmYWxzZTtcbiAgfSk7XG5cbiAgLy8gaGFuZGxlIHNsb3cgaW50ZXJuZXQgb24gZmlyc3QgdHJhY2tcbiAgaW50ZXJhY3Rpb25zLm9uY2UoJ3N0b3AnLCAoaXNMb2FkZWQpID0+IHtcbiAgICBsZXQgZmlyc3RTd2FwVGltZW91dCA9IG51bGw7XG4gICAgY29uc3Qgb25BdWRpb1BsYXlpbmcgPSAoKSA9PiB7XG4gICAgICBjb25zdCBmaXJzdFN3YXBEZWxheSA9IDc3MjE7XG4gICAgICBmaXJzdFN3YXBUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGZpcnN0U3dhcCgpO1xuICAgICAgfSwgZmlyc3RTd2FwRGVsYXkpO1xuICAgIH07XG4gICAgaWYgKCFpc0xvYWRlZCkgYXVkaW8ub25jZSgncmVhZHknLCBvbkF1ZGlvUGxheWluZyk7XG4gICAgZWxzZSBvbkF1ZGlvUGxheWluZygpO1xuICAgIGludGVyYWN0aW9ucy5vbmNlKCdzdGFydCcsICgpID0+IHtcbiAgICAgIGlmIChmaXJzdFN3YXBUaW1lb3V0KSBjbGVhclRpbWVvdXQoZmlyc3RTd2FwVGltZW91dCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHNob3dJbnRybyh7IGludGVyYWN0aW9ucyB9LCAoKSA9PiB7XG4gICAgc3RhcnRlZCA9IHRydWU7XG4gICAgY2xlYXJJbnRlcnZhbChpbnRyb0F1dG9HZW8pO1xuICB9KTtcblxuICBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCByZWFkeUZvckdlb21ldHJ5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICByZWFkeUZvckdlb21ldHJ5W2ldID0gdHJ1ZTtcbiAgICB9XG4gIH0sIDEwMCk7XG5cbiAgbG9vcC5vbigndGljaycsIGR0ID0+IHtcbiAgICB0aW1lICs9IGR0O1xuICAgIGlmICghc3RhcnRlZCkgcmV0dXJuO1xuXG4gICAgYXVkaW8udXBkYXRlKGR0KTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXVkaW8uYmVhdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChyZWFkeUZvckdlb21ldHJ5W2ldICYmIGF1ZGlvLmJlYXRzW2ldKSB7XG4gICAgICAgIGdlby5uZXh0R2VvbWV0cnkoeyB0eXBlOiBpIH0pO1xuICAgICAgICByZWFkeUZvckdlb21ldHJ5W2ldID0gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIGlmICghaW50ZXJhY3Rpb25zLmtleURvd24gJiYgcmVhZHlGb3JQYWxldHRlQ2hhbmdlICYmIGF1ZGlvLmJlYXRzWzFdICYmIHN3aXRjaFBhbGV0dGVzKSB7XG4gICAgICBnZW8ubmV4dFBhbGV0dGUoKTtcbiAgICAgIHJlYWR5Rm9yUGFsZXR0ZUNoYW5nZSA9IGZhbHNlO1xuICAgIH1cbiAgfSk7XG5cbiAgZnVuY3Rpb24gZmlyc3RTd2FwICgpIHtcbiAgICBzd2l0Y2hQYWxldHRlcyA9IHRydWU7XG4gICAgZ2VvLm5leHRQYWxldHRlKCk7XG4gICAgcmVzZXRQYWxldHRlU3dhcHBpbmcoKTtcbiAgfVxuICBcbiAgZnVuY3Rpb24gcmVzZXRQYWxldHRlU3dhcHBpbmcgKCkge1xuICAgIHJlYWR5Rm9yUGFsZXR0ZUNoYW5nZSA9IGZhbHNlO1xuICAgIGlmIChwYWxldHRlSW50ZXJ2YWwpIGNsZWFySW50ZXJ2YWwocGFsZXR0ZUludGVydmFsKTtcbiAgICBwYWxldHRlSW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICByZWFkeUZvclBhbGV0dGVDaGFuZ2UgPSB0cnVlO1xuICAgIH0sIDIwMDApO1xuICB9XG59XG5cbmZ1bmN0aW9uIGhlbGxvV29ybGQgKCkge1xuICBsb2cuaW50cm8oKTtcbn0iLCJjb25zdCBnbHNsaWZ5ID0gcmVxdWlyZSgnZ2xzbGlmeScpO1xuY29uc3QgY2xhbXAgPSByZXF1aXJlKCdjbGFtcCcpO1xuY29uc3QgQ29weVNoYWRlciA9IHJlcXVpcmUoJ3RocmVlLWNvcHlzaGFkZXInKTtcbmNvbnN0IGlzTW9iaWxlID0gcmVxdWlyZSgnLi9pc01vYmlsZScpO1xuY29uc3QgZG93bnNhbXBsZSA9IDI7XG5jb25zdCBtYXhTaXplID0gNDA5NjtcblxubW9kdWxlLmV4cG9ydHMgPSBCbG9vbVBhc3M7XG5mdW5jdGlvbiBCbG9vbVBhc3MgKHNjZW5lLCBjYW1lcmEsIG9wdCA9IHt9KSB7XG4gIHRoaXMuc2NlbmUgPSBzY2VuZTtcbiAgdGhpcy5jYW1lcmEgPSBjYW1lcmE7XG5cbiAgdGhpcy5kZWJ1Z0NvcHlTaGFkZXIgPSBuZXcgVEhSRUUuU2hhZGVyTWF0ZXJpYWwoQ29weVNoYWRlcik7XG5cbiAgdGhpcy5fbGFzdFdpZHRoID0gbnVsbDtcbiAgdGhpcy5fbGFzdEhlaWdodCA9IG51bGw7XG4gIHRoaXMuX2JsdXJUYXJnZXQgPSBudWxsOyAvLyBsYXppbHkgY3JlYXRlZFxuICB0aGlzLl90aHJlc2hvbGRUYXJnZXQgPSBudWxsO1xuXG4gIHRoaXMuZW5hYmxlZCA9IHRydWU7XG4gIHRoaXMubmVlZHNTd2FwID0gdHJ1ZTtcbiAgdGhpcy5vbGRDb2xvciA9IG5ldyBUSFJFRS5Db2xvcigpO1xuICB0aGlzLm9sZEFscGhhID0gMTtcbiAgdGhpcy5jbGVhckNvbG9yID0gbmV3IFRIUkVFLkNvbG9yKCcjZmZmJyk7XG4gIHRoaXMuY2xlYXJBbHBoYSA9IDA7XG5cbiAgdGhpcy5wb3N0U2hhZGVyID0gbmV3IFRIUkVFLlJhd1NoYWRlck1hdGVyaWFsKHtcbiAgICB2ZXJ0ZXhTaGFkZXI6IGdsc2xpZnkoX19kaXJuYW1lICsgJy9zaGFkZXIvcGFzcy52ZXJ0JyksXG4gICAgZnJhZ21lbnRTaGFkZXI6IGdsc2xpZnkoX19kaXJuYW1lICsgJy9zaGFkZXIvYmxvb20tYmx1ci5mcmFnJyksXG4gICAgdW5pZm9ybXM6IHtcbiAgICAgIHREaWZmdXNlOiB7IHR5cGU6ICd0JywgdmFsdWU6IG51bGwgfSxcbiAgICAgIHJlc29sdXRpb246IHsgdHlwZTogJ3YyJywgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDEsIDEpIH1cbiAgICB9XG4gIH0pO1xuICB0aGlzLnBvc3RTaGFkZXIubmFtZSA9ICdibG9vbS1ibHVyLW1hdGVyaWFsJztcblxuICB0aGlzLmNvbWJpbmVTaGFkZXIgPSBuZXcgVEhSRUUuUmF3U2hhZGVyTWF0ZXJpYWwoe1xuICAgIHZlcnRleFNoYWRlcjogZ2xzbGlmeShfX2Rpcm5hbWUgKyAnL3NoYWRlci9wYXNzLnZlcnQnKSxcbiAgICBmcmFnbWVudFNoYWRlcjogZ2xzbGlmeShfX2Rpcm5hbWUgKyAnL3NoYWRlci9ibG9vbS1jb21iaW5lLmZyYWcnKSxcbiAgICB1bmlmb3Jtczoge1xuICAgICAgcmVzb2x1dGlvbjogeyB0eXBlOiAndjInLCB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoKSB9LFxuICAgICAgdERpZmZ1c2U6IHsgdHlwZTogJ3QnLCB2YWx1ZTogbnVsbCB9LFxuICAgICAgdEJsb29tRGlmZnVzZTogeyB0eXBlOiAndCcsIHZhbHVlOiBudWxsIH1cbiAgICB9XG4gIH0pO1xuICB0aGlzLmNvbWJpbmVTaGFkZXIubmFtZSA9ICdibG9vbS1jb21iaW5lLW1hdGVyaWFsJztcblxuICB0aGlzLnBvc3RDYW1lcmEgPSBuZXcgVEhSRUUuT3J0aG9ncmFwaGljQ2FtZXJhKC0xLCAxLCAxLCAtMSwgMCwgMSk7XG4gIHRoaXMucG9zdFNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XG5cbiAgdGhpcy5wb3N0UXVhZCA9IG5ldyBUSFJFRS5NZXNoKG5ldyBUSFJFRS5QbGFuZUJ1ZmZlckdlb21ldHJ5KDIsIDIpKTtcbiAgdGhpcy5wb3N0UXVhZC5uYW1lID0gJ2dvZHJheS1wb3N0LXF1YWQnO1xuICB0aGlzLnBvc3RTY2VuZS5hZGQodGhpcy5wb3N0UXVhZCk7XG5cbiAgdGhpcy5yZW5kZXJUb1NjcmVlbiA9IGZhbHNlO1xufVxuXG5CbG9vbVBhc3MucHJvdG90eXBlID0ge1xuXG4gIF91cGRhdGVUYXJnZXRzOiBmdW5jdGlvbiAocmVuZGVyVGFyZ2V0KSB7XG4gICAgdmFyIHdpZHRoID0gcmVuZGVyVGFyZ2V0LndpZHRoO1xuICAgIHZhciBoZWlnaHQgPSByZW5kZXJUYXJnZXQuaGVpZ2h0O1xuICAgIHZhciBkb3duV2lkdGggPSBjbGFtcChNYXRoLmZsb29yKHdpZHRoIC8gZG93bnNhbXBsZSksIDIsIG1heFNpemUpO1xuICAgIHZhciBkb3duSGVpZ2h0ID0gY2xhbXAoTWF0aC5mbG9vcihoZWlnaHQgLyBkb3duc2FtcGxlKSwgMiwgbWF4U2l6ZSk7XG4gICAgaWYgKCF0aGlzLl90aHJlc2hvbGRUYXJnZXQgfHwgIXRoaXMuX2JsdXJUYXJnZXQpIHsgICAgICBcbiAgICAgIHRoaXMuX2JsdXJUYXJnZXQgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJUYXJnZXQoZG93bldpZHRoLCBkb3duSGVpZ2h0KTtcbiAgICAgIHRoaXMuX2JsdXJUYXJnZXQudGV4dHVyZS5taW5GaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG4gICAgICB0aGlzLl9ibHVyVGFyZ2V0LnRleHR1cmUubWFnRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xuICAgICAgdGhpcy5fYmx1clRhcmdldC50ZXh0dXJlLmdlbmVyYXRlTWlwbWFwcyA9IGZhbHNlO1xuICAgICAgdGhpcy5fYmx1clRhcmdldC5kZXB0aEJ1ZmZlciA9IHRydWU7XG4gICAgICB0aGlzLl9ibHVyVGFyZ2V0LnN0ZW5jaWxCdWZmZXIgPSBmYWxzZTtcbiAgICAgIHRoaXMuX3RocmVzaG9sZFRhcmdldCA9IHRoaXMuX2JsdXJUYXJnZXQuY2xvbmUoKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuX3RocmVzaG9sZFRhcmdldC53aWR0aCAhPT0gd2lkdGggfHwgdGhpcy5fdGhyZXNob2xkVGFyZ2V0LmhlaWdodCAhPT0gaGVpZ2h0KSB7XG4gICAgICB0aGlzLl90aHJlc2hvbGRUYXJnZXQuc2V0U2l6ZShkb3duV2lkdGgsIGRvd25IZWlnaHQpO1xuICAgICAgdGhpcy5fYmx1clRhcmdldC5zZXRTaXplKGRvd25XaWR0aCwgZG93bkhlaWdodCk7XG4gICAgfVxuICB9LFxuXG4gIHJlbmRlcjogZnVuY3Rpb24gKHJlbmRlcmVyLCB3cml0ZUJ1ZmZlciwgcmVhZEJ1ZmZlciwgZGVsdGEpIHtcbiAgICB0aGlzLl91cGRhdGVUYXJnZXRzKHJlYWRCdWZmZXIpO1xuICAgIHZhciBmaW5hbEJ1ZmZlciA9IHRoaXMucmVuZGVyVG9TY3JlZW4gPyB1bmRlZmluZWQgOiB3cml0ZUJ1ZmZlcjtcblxuICAgIC8vIDEuIEZpcnN0LCByZW5kZXIgc2NlbmUgaW50byBkb3duc2FtcGxlZCBGQk8gYW5kIHRocmVzaG9sZCBjb2xvclxuICAgIHRoaXMub2xkQ29sb3IuY29weShyZW5kZXJlci5nZXRDbGVhckNvbG9yKCkpO1xuICAgIHRoaXMub2xkQWxwaGEgPSByZW5kZXJlci5nZXRDbGVhckFscGhhKCk7XG4gICAgdmFyIG9sZEF1dG9DbGVhciA9IHJlbmRlcmVyLmF1dG9DbGVhcjtcblxuICAgIC8vIENsZWFyIHRhcmdldFxuICAgIHJlbmRlcmVyLnNldENsZWFyQ29sb3IodGhpcy5jbGVhckNvbG9yLCB0aGlzLmNsZWFyQWxwaGEpO1xuICAgIHJlbmRlcmVyLmF1dG9DbGVhciA9IGZhbHNlO1xuICAgIHJlbmRlcmVyLmNsZWFyVGFyZ2V0KHRoaXMuX3RocmVzaG9sZFRhcmdldCwgdHJ1ZSwgdHJ1ZSwgZmFsc2UpO1xuXG4gICAgLy8gRHJhdyBzY2VuZVxuICAgIHJlbmRlcmVyLnJlbmRlcih0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYSwgdGhpcy5fdGhyZXNob2xkVGFyZ2V0LCBmYWxzZSk7XG5cbiAgICAvLyAzLiBOb3cgYmx1ciB0aGUgdGhyZXNob2xkIHRhcmdldFxuICAgIHRoaXMucG9zdFNjZW5lLm92ZXJyaWRlTWF0ZXJpYWwgPSB0aGlzLnBvc3RTaGFkZXI7XG5cbiAgICB0aGlzLnBvc3RTaGFkZXIudW5pZm9ybXMucmVzb2x1dGlvbi52YWx1ZS5zZXQodGhpcy5fdGhyZXNob2xkVGFyZ2V0LndpZHRoLCB0aGlzLl90aHJlc2hvbGRUYXJnZXQuaGVpZ2h0KTtcbiAgICB0aGlzLnBvc3RTaGFkZXIudW5pZm9ybXMudERpZmZ1c2UudmFsdWUgPSB0aGlzLl90aHJlc2hvbGRUYXJnZXQ7XG4gICAgcmVuZGVyZXIucmVuZGVyKHRoaXMucG9zdFNjZW5lLCB0aGlzLnBvc3RDYW1lcmEsIHRoaXMuX2JsdXJUYXJnZXQsIHRydWUpO1xuXG4gICAgLy8gTm93IHdlIHJlbmRlciBiYWNrIHRvIG9yaWdpbmFsIHNjZW5lLCB3aXRoIGFkZGl0aXZlIGJsZW5kaW5nIVxuICAgIHRoaXMucG9zdFNjZW5lLm92ZXJyaWRlTWF0ZXJpYWwgPSB0aGlzLmNvbWJpbmVTaGFkZXI7XG4gICAgdGhpcy5jb21iaW5lU2hhZGVyLnVuaWZvcm1zLnREaWZmdXNlLnZhbHVlID0gcmVhZEJ1ZmZlcjtcbiAgICB0aGlzLmNvbWJpbmVTaGFkZXIudW5pZm9ybXMudEJsb29tRGlmZnVzZS52YWx1ZSA9IHRoaXMuX2JsdXJUYXJnZXQ7XG5cbiAgICB2YXIgZHByID0gcmVuZGVyZXIuZ2V0UGl4ZWxSYXRpbygpO1xuICAgIHRoaXMuY29tYmluZVNoYWRlci51bmlmb3Jtcy5yZXNvbHV0aW9uLnZhbHVlLnNldChcbiAgICAgIGZpbmFsQnVmZmVyID8gZmluYWxCdWZmZXIud2lkdGggOiAod2luZG93LmlubmVyV2lkdGggKiBkcHIpLFxuICAgICAgZmluYWxCdWZmZXIgPyBmaW5hbEJ1ZmZlci5oZWlnaHQgOiAod2luZG93LmlubmVySGVpZ2h0ICogZHByKVxuICAgICk7XG4gICAgcmVuZGVyZXIucmVuZGVyKHRoaXMucG9zdFNjZW5lLCB0aGlzLnBvc3RDYW1lcmEsIGZpbmFsQnVmZmVyLCB0cnVlKTtcblxuICAgIHJlbmRlcmVyLnNldENsZWFyQ29sb3IodGhpcy5vbGRDb2xvciwgdGhpcy5vbGRBbHBoYSk7XG4gICAgcmVuZGVyZXIuYXV0b0NsZWFyID0gb2xkQXV0b0NsZWFyO1xuICB9LFxuXG59O1xuIiwiLyoqXG4gKiBAYXV0aG9yIGFsdGVyZWRxIC8gaHR0cDovL2FsdGVyZWRxdWFsaWEuY29tL1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gRWZmZWN0Q29tcG9zZXI7XG5cbnZhciBDb3B5U2hhZGVyID0gRWZmZWN0Q29tcG9zZXIuQ29weVNoYWRlciA9IHJlcXVpcmUoJ3RocmVlLWNvcHlzaGFkZXInKVxuICAsIFJlbmRlclBhc3MgPSBFZmZlY3RDb21wb3Nlci5SZW5kZXJQYXNzID0gcmVxdWlyZSgndGhyZWUtZWZmZWN0Y29tcG9zZXIvbGliL3JlbmRlcnBhc3MnKShUSFJFRSlcbiAgLCBTaGFkZXJQYXNzID0gRWZmZWN0Q29tcG9zZXIuU2hhZGVyUGFzcyA9IHJlcXVpcmUoJ3RocmVlLWVmZmVjdGNvbXBvc2VyL2xpYi9zaGFkZXJwYXNzJykoVEhSRUUsIEVmZmVjdENvbXBvc2VyKVxuICAsIE1hc2tQYXNzID0gRWZmZWN0Q29tcG9zZXIuTWFza1Bhc3MgPSByZXF1aXJlKCd0aHJlZS1lZmZlY3Rjb21wb3Nlci9saWIvbWFza3Bhc3MnKShUSFJFRSlcbiAgLCBDbGVhck1hc2tQYXNzID0gRWZmZWN0Q29tcG9zZXIuQ2xlYXJNYXNrUGFzcyA9IHJlcXVpcmUoJ3RocmVlLWVmZmVjdGNvbXBvc2VyL2xpYi9jbGVhcm1hc2twYXNzJykoVEhSRUUpXG5cbmZ1bmN0aW9uIEVmZmVjdENvbXBvc2VyKCByZW5kZXJlciwgcmVuZGVyVGFyZ2V0MSwgcmVuZGVyVGFyZ2V0MiwgaW5pdGlhbFJlbmRlclRhcmdldCApIHtcbiAgdGhpcy5yZW5kZXJlciA9IHJlbmRlcmVyO1xuXG4gIGlmICggcmVuZGVyVGFyZ2V0MSA9PT0gdW5kZWZpbmVkICkge1xuICAgIHRocm93IG5ldyBFcnJvcignbXVzdCBzcGVjaWZ5IHRhcmdldHMnKTtcbiAgfVxuXG4gIHRoaXMucmVuZGVyVGFyZ2V0MSA9IHJlbmRlclRhcmdldDE7XG4gIHRoaXMucmVuZGVyVGFyZ2V0MiA9IHJlbmRlclRhcmdldDI7XG4gIHRoaXMuaW5pdGlhbFJlbmRlclRhcmdldCA9IGluaXRpYWxSZW5kZXJUYXJnZXQ7XG4gIFxuICB0aGlzLndyaXRlQnVmZmVyID0gdGhpcy5yZW5kZXJUYXJnZXQxO1xuICB0aGlzLnJlYWRCdWZmZXIgPSB0aGlzLnJlbmRlclRhcmdldDI7XG5cbiAgdGhpcy5wYXNzZXMgPSBbXTtcblxuICB0aGlzLmNvcHlQYXNzID0gbmV3IFNoYWRlclBhc3MoIENvcHlTaGFkZXIgKTtcbn07XG5cbkVmZmVjdENvbXBvc2VyLnByb3RvdHlwZSA9IHtcbiAgc3dhcEJ1ZmZlcnM6IGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIHRtcCA9IHRoaXMucmVhZEJ1ZmZlcjtcbiAgICB0aGlzLnJlYWRCdWZmZXIgPSB0aGlzLndyaXRlQnVmZmVyO1xuICAgIHRoaXMud3JpdGVCdWZmZXIgPSB0bXA7XG5cbiAgfSxcblxuICBhZGRQYXNzOiBmdW5jdGlvbiAoIHBhc3MgKSB7XG5cbiAgICB0aGlzLnBhc3Nlcy5wdXNoKCBwYXNzICk7XG5cbiAgfSxcblxuICBjbGVhclBhc3NlczogZnVuY3Rpb24gKCkge1xuICAgIHRoaXMucGFzc2VzLmxlbmd0aCA9IDA7XG4gIH0sXG5cbiAgaW5zZXJ0UGFzczogZnVuY3Rpb24gKCBwYXNzLCBpbmRleCApIHtcblxuICAgIHRoaXMucGFzc2VzLnNwbGljZSggaW5kZXgsIDAsIHBhc3MgKTtcbiAgICB0aGlzLmluaXRpYWxDbGVhckNvbG9yID0gbmV3IFRIUkVFLkNvbG9yKDEsIDAsIDApO1xuICB9LFxuXG4gIHJlbmRlcjogZnVuY3Rpb24gKCBkZWx0YSApIHtcblxuICAgIHRoaXMud3JpdGVCdWZmZXIgPSB0aGlzLnJlbmRlclRhcmdldDE7XG4gICAgdGhpcy5yZWFkQnVmZmVyID0gdGhpcy5yZW5kZXJUYXJnZXQyO1xuXG4gICAgdmFyIG1hc2tBY3RpdmUgPSBmYWxzZTtcblxuICAgIHZhciBwYXNzLCBpLCBwYXNzSW5kZXgsIGlsID0gdGhpcy5wYXNzZXMubGVuZ3RoO1xuXG4gICAgZm9yICggaSA9IDAsIHBhc3NJbmRleCA9IDA7IGkgPCBpbDsgaSArKyApIHtcblxuICAgICAgcGFzcyA9IHRoaXMucGFzc2VzWyBpIF07XG5cbiAgICAgIGlmICggIXBhc3MuZW5hYmxlZCApIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHZhciByZWFkVGFyZ2V0O1xuICAgICAgdmFyIHdyaXRlVGFyZ2V0O1xuICAgICAgaWYgKHBhc3NJbmRleCA8PSAxKSB7XG4gICAgICAgIC8vIEZpcnN0IHBhc3M6IFdyaXRlIGludG8gTVNBQSB0YXJnZXRcbiAgICAgICAgd3JpdGVUYXJnZXQgPSB0aGlzLndyaXRlQnVmZmVyO1xuICAgICAgICByZWFkVGFyZ2V0ID0gdGhpcy5pbml0aWFsUmVuZGVyVGFyZ2V0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gU3Vic2VxdWVudCBwYXNzZXM6IFJlYWQgZnJvbSBNU0FBIHRhcmdldFxuICAgICAgICB3cml0ZVRhcmdldCA9IHRoaXMud3JpdGVCdWZmZXI7XG4gICAgICAgIHJlYWRUYXJnZXQgPSB0aGlzLnJlYWRCdWZmZXI7XG4gICAgICB9XG5cbiAgICAgIHZhciBkZXB0aFRleHR1cmU7XG4gICAgICBpZiAodGhpcy5kZXB0aFRleHR1cmUpIHtcbiAgICAgICAgZGVwdGhUZXh0dXJlID0gdGhpcy5kZXB0aFRleHR1cmU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZXB0aFRleHR1cmUgPSBwYXNzSW5kZXggPT09IDAgXG4gICAgICAgID8gdW5kZWZpbmVkIFxuICAgICAgICA6IHRoaXMuaW5pdGlhbFJlbmRlclRhcmdldC5kZXB0aFRleHR1cmU7XG4gICAgICB9XG4gICAgICB2YXIgYXR0YWNobWVudHMgPSB0aGlzLmluaXRpYWxSZW5kZXJUYXJnZXQuYXR0YWNobWVudHM7XG4gICAgICBwYXNzLnJlbmRlciggdGhpcy5yZW5kZXJlciwgd3JpdGVUYXJnZXQsIHJlYWRUYXJnZXQsIGRlbHRhLCBtYXNrQWN0aXZlLCBkZXB0aFRleHR1cmUsIGF0dGFjaG1lbnRzICk7XG5cbiAgICAgIGlmICggcGFzcy5uZWVkc1N3YXAgKSB7XG5cbiAgICAgICAgaWYgKCBtYXNrQWN0aXZlICkge1xuXG4gICAgICAgICAgdmFyIGNvbnRleHQgPSB0aGlzLnJlbmRlcmVyLmNvbnRleHQ7XG5cbiAgICAgICAgICBjb250ZXh0LnN0ZW5jaWxGdW5jKCBjb250ZXh0Lk5PVEVRVUFMLCAxLCAweGZmZmZmZmZmICk7XG5cbiAgICAgICAgICB0aGlzLmNvcHlQYXNzLnJlbmRlciggdGhpcy5yZW5kZXJlciwgdGhpcy53cml0ZUJ1ZmZlciwgdGhpcy5yZWFkQnVmZmVyLCBkZWx0YSApO1xuXG4gICAgICAgICAgY29udGV4dC5zdGVuY2lsRnVuYyggY29udGV4dC5FUVVBTCwgMSwgMHhmZmZmZmZmZiApO1xuXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnN3YXBCdWZmZXJzKCk7XG5cbiAgICAgIH1cblxuICAgICAgaWYgKCBwYXNzIGluc3RhbmNlb2YgTWFza1Bhc3MgKSB7XG5cbiAgICAgICAgbWFza0FjdGl2ZSA9IHRydWU7XG5cbiAgICAgIH0gZWxzZSBpZiAoIHBhc3MgaW5zdGFuY2VvZiBDbGVhck1hc2tQYXNzICkge1xuXG4gICAgICAgIG1hc2tBY3RpdmUgPSBmYWxzZTtcblxuICAgICAgfVxuXG4gICAgICBwYXNzSW5kZXgrKztcbiAgICB9XG5cbiAgfSxcblxuICByZXNldDogZnVuY3Rpb24gKCByZW5kZXJUYXJnZXQgKSB7XG5cbiAgICBpZiAoIHJlbmRlclRhcmdldCA9PT0gdW5kZWZpbmVkICkge1xuXG4gICAgICByZW5kZXJUYXJnZXQgPSB0aGlzLnJlbmRlclRhcmdldDEuY2xvbmUoKTtcblxuICAgICAgcmVuZGVyVGFyZ2V0LndpZHRoID0gd2luZG93LmlubmVyV2lkdGg7XG4gICAgICByZW5kZXJUYXJnZXQuaGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0O1xuXG4gICAgfVxuXG4gICAgdGhpcy5yZW5kZXJUYXJnZXQxID0gcmVuZGVyVGFyZ2V0O1xuICAgIHRoaXMucmVuZGVyVGFyZ2V0MiA9IHJlbmRlclRhcmdldC5jbG9uZSgpO1xuXG4gICAgdGhpcy53cml0ZUJ1ZmZlciA9IHRoaXMucmVuZGVyVGFyZ2V0MTtcbiAgICB0aGlzLnJlYWRCdWZmZXIgPSB0aGlzLnJlbmRlclRhcmdldDI7XG5cbiAgfSxcblxuICBzZXRTaXplOiBmdW5jdGlvbiAoIHdpZHRoLCBoZWlnaHQgKSB7XG5cbiAgICB2YXIgcmVuZGVyVGFyZ2V0ID0gdGhpcy5yZW5kZXJUYXJnZXQxLmNsb25lKCk7XG5cbiAgICByZW5kZXJUYXJnZXQud2lkdGggPSB3aWR0aDtcbiAgICByZW5kZXJUYXJnZXQuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgdGhpcy5yZXNldCggcmVuZGVyVGFyZ2V0ICk7XG5cbiAgfVxuXG59O1xuXG4vLyBzaGFyZWQgb3J0aG8gY2FtZXJhXG5cbkVmZmVjdENvbXBvc2VyLmNhbWVyYSA9IG5ldyBUSFJFRS5PcnRob2dyYXBoaWNDYW1lcmEoIC0xLCAxLCAxLCAtMSwgMCwgMSApO1xuXG5FZmZlY3RDb21wb3Nlci5xdWFkID0gbmV3IFRIUkVFLk1lc2goIG5ldyBUSFJFRS5QbGFuZUJ1ZmZlckdlb21ldHJ5KCAyLCAyICksIG51bGwgKTtcblxuRWZmZWN0Q29tcG9zZXIuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbkVmZmVjdENvbXBvc2VyLnNjZW5lLmFkZCggRWZmZWN0Q29tcG9zZXIucXVhZCApOyIsIlxuLypcbiAgVGhpcyBpcyBhIGdlbmVyaWMgXCJUaHJlZUpTIEFwcGxpY2F0aW9uXCJcbiAgaGVscGVyIHdoaWNoIHNldHMgdXAgYSByZW5kZXJlciBhbmQgY2FtZXJhXG4gIGNvbnRyb2xzLlxuICovXG5cbmNvbnN0IGNyZWF0ZUNvbnRyb2xzID0gcmVxdWlyZSgnb3JiaXQtY29udHJvbHMnKTtcbmNvbnN0IGFzc2lnbiA9IHJlcXVpcmUoJ29iamVjdC1hc3NpZ24nKTtcblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVBcHA7XG5mdW5jdGlvbiBjcmVhdGVBcHAgKG9wdCA9IHt9KSB7XG4gIC8vIFNjYWxlIGZvciByZXRpbmFcbiAgY29uc3QgZHByID0gTWF0aC5taW4oMS41LCB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyk7XG4gIGNvbnN0IGlzSU9TID0gLyhpUGhvbmV8aVBhZHxpUG9kKS9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCk7XG5cbiAgLy8gT3VyIFdlYkdMIHJlbmRlcmVyIHdpdGggYWxwaGEgYW5kIGRldmljZS1zY2FsZWRcbiAgY29uc3QgcmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcihhc3NpZ24oe1xuICAgIGNhbnZhczogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2NhbnZhcycpLFxuICAgIGFudGlhbGlhczogdHJ1ZSAvLyBkZWZhdWx0IGVuYWJsZWRcbiAgfSwgb3B0KSk7XG4gIHJlbmRlcmVyLnNldFBpeGVsUmF0aW8oZHByKTtcblxuICAvLyAzRCBjYW1lcmEgbG9va2luZ1xuICBjb25zdCBjYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoNzUsIDEsIDAuMDEsIDEwMCk7XG4gIGNvbnN0IHRhcmdldCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG5cbiAgLy8gM0Qgc2NlbmVcbiAgY29uc3Qgc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcblxuICAvLyAzRCBvcmJpdCBjb250cm9sbGVyIHdpdGggZGFtcGluZ1xuICBjb25zdCBjb250cm9scyA9IGNyZWF0ZUNvbnRyb2xzKGFzc2lnbih7XG4gICAgY2FudmFzLFxuICAgIHJvdGF0ZVNwZWVkOiAwLFxuICAgIHpvb21TcGVlZDogMCxcbiAgICBwaW5jaFNwZWVkOiAwLFxuICAgIC8vIHRoZXRhOiAwLFxuICAgIHBoaTogMCxcbiAgICBkaXN0YW5jZTogMSxcbiAgICAvLyBwaGlCb3VuZHM6IFsgMCwgMSBdLFxuICAgIC8vIHBoaUJvdW5kczogWyAwLCAwIF0sXG4gICAgZGlzdGFuY2VCb3VuZHM6IFsgMCwgMTAwIF1cbiAgfSwgb3B0KSk7XG5cbiAgLy8gVXBkYXRlIGZyYW1lIHNpemVcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSk7XG5cbiAgLy8gU2V0dXAgaW5pdGlhbCBzaXplXG4gIHJlc2l6ZSgpO1xuXG4gIHJldHVybiB7XG4gICAgdXBkYXRlUHJvamVjdGlvbk1hdHJpeCxcbiAgICBjYW1lcmEsXG4gICAgc2NlbmUsXG4gICAgcmVuZGVyZXIsXG4gICAgY29udHJvbHMsXG4gICAgY2FudmFzXG4gIH07XG5cbiAgZnVuY3Rpb24gdXBkYXRlUHJvamVjdGlvbk1hdHJpeCAoKSB7XG4gICAgY29uc3Qgd2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aDtcbiAgICBjb25zdCBoZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQ7XG4gICAgY29uc3QgYXNwZWN0ID0gd2lkdGggLyBoZWlnaHQ7XG5cbiAgICAvLyB1cGRhdGUgY2FtZXJhIGNvbnRyb2xzXG4gICAgY29udHJvbHMudXBkYXRlKCk7XG4gICAgY2FtZXJhLnBvc2l0aW9uLmZyb21BcnJheShjb250cm9scy5wb3NpdGlvbik7XG4gICAgY2FtZXJhLnVwLmZyb21BcnJheShjb250cm9scy51cCk7XG4gICAgY2FtZXJhLmxvb2tBdCh0YXJnZXQuZnJvbUFycmF5KGNvbnRyb2xzLmRpcmVjdGlvbikpO1xuXG4gICAgLy8gVXBkYXRlIGNhbWVyYSBtYXRyaWNlc1xuICAgIGNhbWVyYS5hc3BlY3QgPSBhc3BlY3Q7XG4gICAgY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc2l6ZSAoKSB7XG4gICAgbGV0IHdpZHRoID0gd2luZG93LmlubmVyV2lkdGg7XG4gICAgbGV0IGhlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodDtcbiAgICBpZiAoaXNJT1MpIHtcbiAgICAgIC8vIGZpeCBsYW5kc2NhcGUgYnVnIHdpdGggaU9TXG4gICAgICB3aWR0aCsrO1xuICAgICAgaGVpZ2h0Kys7XG4gICAgfVxuICAgIHJlbmRlcmVyLnNldFNpemUod2lkdGgsIGhlaWdodCk7XG4gICAgdXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICB9XG59XG4iLCJjb25zdCBhdWRpb1BsYXllciA9IHJlcXVpcmUoJ3dlYi1hdWRpby1wbGF5ZXInKTtcbmNvbnN0IGZyZXF1ZW5jeVRvSW5kZXggPSByZXF1aXJlKCdhdWRpby1mcmVxdWVuY3ktdG8taW5kZXgnKTtcbmNvbnN0IGNyZWF0ZUF1ZGlvQ29udGV4dCA9IHJlcXVpcmUoJ2lvcy1zYWZlLWF1ZGlvLWNvbnRleHQnKTtcbmNvbnN0IGNyZWF0ZUJlYXREZXRlY3Rpb24gPSByZXF1aXJlKCdiZWF0cycpO1xuY29uc3QgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xuY29uc3QgbmV3QXJyYXkgPSByZXF1aXJlKCduZXctYXJyYXknKTtcbmNvbnN0IFJldmVyYiA9IHJlcXVpcmUoJ3NvdW5kYmFuay1yZXZlcmInKTtcbmNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5jb25zdCBsb2cgPSByZXF1aXJlKCcuL2xvZycpO1xuY29uc3QgTlVNX0JJTlMgPSAyO1xuXG5jb25zdCBjYW5QbGF5RERTID0gdGVzdENhblBsYXlERFBsdXMoKTtcbmNvbnN0IGZpbGVuYW1lcyA9IFtcbiAgJzAxXy1fTWF0dGVyJyxcbiAgJzAyXy1fTm93X0JlX1RoZV9MaWdodCcsXG4gICcwM18tX0VudHJhbmNlJyxcbiAgJzA0Xy1fSV9BbV9Zb3UnLFxuICAnMDVfLV9Ta2luJyxcbiAgJzA2Xy1fQW50aGVtJyxcbiAgJzA3Xy1fTGlwc3RpY2snLFxuICAnMDhfLV9Tb2Z0Y29yZScsXG4gICcwOV8tX1N0YXJmaWx0ZXJfRnVyX0FsaW5hJ1xuXTtcblxuY29uc3QgZnJlcXVlbmNpZXMgPSBbXG4gIFsgWzQwLCA1NV0sIFs0MCwgNTVdIF0sIC8vIE1hdHRlclxuICBbIFsxNDUsIDUwMDBdLCBbMTQ1LCA1MDAwXSBdLCAvLyBOb3cgQmUgVGhlIExpZ2h0XG4gIFsgWzUxMCwgNTM1XSwgWzIwLCA1MF0gXSwgLy8gRW50cmFuY2VcbiAgWyBbMzUsIDU1XSwgWzM1LCA1NV0gXSwgLy8gSSBBbSBZb3VcbiAgWyBbMzAsIDU1XSwgWzMwLCA1MF0gXSwgLy8gU2tpblxuICBbIFsxMjAwLCAyMDAwXSwgWzIwLCA1MF0gXSwgLy8gQW50aGVtXG4gIFsgWzUwLCA4MF0sIFsxNjgwMCwgMjAwMDBdIF0sIC8vIExpcHN0aWNrXG4gIFsgWzEwLCAxNTBdLCBbMTAsIDE1MF0gXSwgLy8gU29mdGNvcmVcbiAgWyBbMCwgMF0sIFs0NTAsIDQ1MDBdIF0gLy8gRnVyIEFsaW5hXG5dO1xuXG5jb25zdCBwbGF5bGlzdHMgPSBmaWxlbmFtZXMubWFwKGYgPT4ge1xuICByZXR1cm4gYGFzc2V0cy9hdWRpby9waWxvdHByaWVzdC8ke2Z9YDtcbn0pLm1hcCh1cmwgPT4ge1xuICBjb25zdCBmb3JtYXRzID0gWyB1cmwgKyAnLm1wMycgXTtcbiAgaWYgKGNhblBsYXlERFMpIHtcbiAgICBmb3JtYXRzLnVuc2hpZnQoe1xuICAgICAgc3JjOiB1cmwgKyAnX0RvbGJ5Lm1wNCdcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gZm9ybWF0cztcbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKGNhblBsYXlERFMpIGxvZygnRG9sYnkgRGlnaXRhbCBQbHVzIHN1cHBvcnRlZCEnKTtcblxuICBjb25zdCBhdWRpb0NhY2hlID0ge307XG4gIGNvbnN0IGF1ZGlvVGltZUNhY2hlID0ge307XG4gIGxldCBwbGF5bGlzdENvdW50ZXIgPSAwO1xuXG4gIGNvbnN0IGF1ZGlvQ29udGV4dCA9IGNyZWF0ZUF1ZGlvQ29udGV4dCgpO1xuICBzZXRUaW1lb3V0KCgpID0+IHJlc3VtZSgpLCAxMDAwKTtcblxuICAvLyBjb25zb2xlLmxvZyhhdWRpb0NvbnRleHQuc2FtcGxlUmF0ZSlcbiAgLy9uZXcgKHdpbmRvdy5BdWRpb0NvbnRleHQgfHwgd2luZG93LndlYmtpdEF1ZGlvQ29udGV4dCkoKTtcbiAgY29uc3QgYW5hbHlzZXJOb2RlID0gYXVkaW9Db250ZXh0LmNyZWF0ZUFuYWx5c2VyKCk7XG4gIGNvbnN0IGZyZXFBcnJheSA9IG5ldyBVaW50OEFycmF5KGFuYWx5c2VyTm9kZS5mcmVxdWVuY3lCaW5Db3VudCk7XG5cbiAgLy8gSWYgcmF0ZSBpcyBub3QgNDQxMDAsIHRoZSByZXZlcmIgbW9kdWxlIGJ1Z3Mgb3V0XG4gIGNvbnN0IHN1cHBvcnRSZXZlcmIgPSBhdWRpb0NvbnRleHQuc2FtcGxlUmF0ZSA9PT0gNDQxMDA7XG5cbiAgY29uc3QgZWZmZWN0Tm9kZSA9IGNyZWF0ZUVmZmVjdE5vZGUoYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcbiAgYW5hbHlzZXJOb2RlLmNvbm5lY3QoZWZmZWN0Tm9kZSk7XG5cbiAgY29uc3Qgc2FtcGxlUmF0ZSA9IGF1ZGlvQ29udGV4dC5zYW1wbGVSYXRlO1xuICBjb25zdCBmcmVxQmluQ291bnQgPSBhbmFseXNlck5vZGUuZnJlcXVlbmN5QmluQ291bnQ7XG5cbiAgbGV0IGVmZmVjdCA9IDA7XG4gIGNvbnN0IHBsYXllciA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcblxuICBsZXQgbG9hZGluZ0F1ZGlvID0gZmFsc2U7XG4gIGxldCBxdWV1ZWluZyA9IGZhbHNlO1xuICBsZXQgd2FpdGluZ0Zvck5leHQgPSBmYWxzZTtcbiAgbGV0IHF1ZXVlZEF1ZGlvLCBwbGF5aW5nQXVkaW87XG4gIGxldCBkYXRhSXNJbnZhbGlkID0gZmFsc2U7XG4gIGxldCBkYXRhVmFsaWRhdGlvbkludGVydmFsID0gbnVsbDtcbiAgbGV0IGZpbGxXaXRoRmFrZURhdGEgPSBmYWxzZTtcbiAgbGV0IGxhc3RUcmFja05hbWU7XG4gIGNvbnN0IFZBTElEQVRJT05fVElNRSA9IDMwMDA7XG5cbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHBsYXllciwgJ2VmZmVjdCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBlZmZlY3Q7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICAgIGVmZmVjdCA9IHZhbDtcbiAgICAgIGVmZmVjdE5vZGUud2V0LnZhbHVlID0gdmFsO1xuICAgICAgZWZmZWN0Tm9kZS5kcnkudmFsdWUgPSAxIC0gdmFsO1xuICAgIH1cbiAgfSk7XG5cbiAgcGxheWVyLnVwZGF0ZSA9IHVwZGF0ZTtcbiAgcGxheWVyLmJpbkNvdW50ID0gTlVNX0JJTlM7XG4gIHBsYXllci5iZWF0cyA9IG5ld0FycmF5KE5VTV9CSU5TLCAwKTtcblxuICBwbGF5ZXIucXVldWUgPSBxdWV1ZTtcbiAgcGxheWVyLnBsYXlRdWV1ZWQgPSBwbGF5UXVldWVkO1xuICBwbGF5ZXIuc2tpcCA9IHNraXA7XG4gIHJldHVybiBwbGF5ZXI7XG5cbiAgZnVuY3Rpb24gc2tpcCAoKSB7XG4gICAgcGxheWxpc3RDb3VudGVyKys7XG4gIH1cblxuICBmdW5jdGlvbiByZXN1bWUgKCkge1xuICAgIGlmIChhdWRpb0NvbnRleHQuc3RhdGUgPT09ICdzdXNwZW5kZWQnICYmXG4gICAgICAgIHR5cGVvZiBhdWRpb0NvbnRleHQucmVzdW1lID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBhdWRpb0NvbnRleHQucmVzdW1lKCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRWZmZWN0Tm9kZSAob3V0cHV0KSB7XG4gICAgaWYgKHN1cHBvcnRSZXZlcmIpIHtcbiAgICAgIGNvbnN0IHJldmVyYiA9IFJldmVyYihhdWRpb0NvbnRleHQpO1xuICAgICAgcmV2ZXJiLnRpbWUgPSA0LjU7IC8vIHNlY29uZHNcbiAgICAgIHJldmVyYi53ZXQudmFsdWUgPSAwO1xuICAgICAgcmV2ZXJiLmRyeS52YWx1ZSA9IDE7XG4gICAgICByZXZlcmIuZmlsdGVyVHlwZSA9ICdoaWdocGFzcyc7XG4gICAgICByZXZlcmIuY3V0b2ZmLnZhbHVlID0gMjAwOyAvLyBIelxuICAgICAgcmV2ZXJiLmNvbm5lY3Qob3V0cHV0KTtcbiAgICAgIHJldHVybiByZXZlcmI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IG5vZGUgPSBhdWRpb0NvbnRleHQuY3JlYXRlR2FpbigpO1xuICAgICAgY29uc3QgZHJ5ID0gYXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKTtcbiAgICAgIGNvbnN0IHdldCA9IGF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XG4gICAgICBjb25zdCBmaWx0ZXIgPSBhdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XG5cbiAgICAgIG5vZGUuY29ubmVjdChkcnkpO1xuICAgICAgbm9kZS5jb25uZWN0KHdldCk7XG5cbiAgICAgIGZpbHRlci50eXBlID0gJ2xvd3Bhc3MnO1xuICAgICAgZmlsdGVyLmZyZXF1ZW5jeS52YWx1ZSA9IDEwMDA7XG5cbiAgICAgIGRyeS5jb25uZWN0KG91dHB1dCk7XG4gICAgICB3ZXQuY29ubmVjdChmaWx0ZXIpO1xuICAgICAgZmlsdGVyLmNvbm5lY3Qob3V0cHV0KTtcblxuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMobm9kZSwge1xuICAgICAgICB3ZXQ6IHsgZ2V0OiAoKSA9PiB3ZXQuZ2FpbiB9LFxuICAgICAgICBkcnk6IHsgZ2V0OiAoKSA9PiBkcnkuZ2FpbiB9XG4gICAgICB9KTtcbiAgICAgIG5vZGUud2V0LnZhbHVlID0gMDtcbiAgICAgIG5vZGUuZHJ5LnZhbHVlID0gMTtcbiAgICAgIHJldHVybiBub2RlO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZSAoZHQpIHtcbiAgICBpZiAoIXBsYXlpbmdBdWRpbykgcmV0dXJuO1xuICAgIGFuYWx5c2VyTm9kZS5nZXRCeXRlVGltZURvbWFpbkRhdGEoZnJlcUFycmF5KTtcbiAgICBwbGF5ZXIuYmVhdHMgPSBwbGF5aW5nQXVkaW8uZGV0ZWN0QmVhdHMoZnJlcUFycmF5KTtcblxuICAgIGlmICghaXNEYXRhVmFsaWQoKSkge1xuICAgICAgZGF0YUlzSW52YWxpZCA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKGZpbGxXaXRoRmFrZURhdGEpIGZpbGxGYWtlRGF0YSgpO1xuICB9XG5cbiAgLy8gU2FmYXJpIChpT1MvRGVza3RvcCkgcmV0dXJucyBnYXJiYWdlIGF1ZGlvXG4gIC8vIGZyZXF1ZW5jeSBkYXRhIHNpbmNlIHdlIGFyZSB1c2luZyBhIG1lZGlhXG4gIC8vIGVsZW1lbnQgc291cmNlLCBub3QgYSBmdWxseSBkZWNvZGVkIHNvdXJjZS5cbiAgLy8gRm9yIHRoZXNlIGJyb3dzZXJzIHdlIHdpbGwganVzdCBcImZha2VcIiB0aGVcbiAgLy8gdmlzdWFsaXphdGlvbi5cbiAgZnVuY3Rpb24gaXNEYXRhVmFsaWQgKCkge1xuICAgIHZhciB0ZXN0ID0gZnJlcUFycmF5WzBdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZnJlcUFycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoZnJlcUFycmF5W2ldICE9PSB0ZXN0KSByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgZnVuY3Rpb24gZGF0YVZhbGlkYXRpb24gKCkge1xuICAgIGlmIChkYXRhSXNJbnZhbGlkKSB7XG4gICAgICAvLyBjb25zb2xlLmxvZygnRGF0YSBoYXMgYmVlbiBpbnZhbGlkIGZvciBYIGZyYW1lcywgZmlsbGluZyB3aXRoIGZha2UgZnJlcXVlbmNpZXMuJyk7XG4gICAgICBkYXRhSXNJbnZhbGlkID0gZmFsc2U7XG4gICAgICBmaWxsV2l0aEZha2VEYXRhID0gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBmaWxsRmFrZURhdGEgKCkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZnJlcUFycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBmcmVxQXJyYXlbaV0gPSAxMjc7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcXVldWUgKCkge1xuICAgIGlmIChxdWV1ZWluZykgcmV0dXJuIGxhc3RUcmFja05hbWU7XG4gICAgcXVldWVpbmcgPSB0cnVlO1xuICAgIGNvbnN0IG5ld0lkeCA9IHBsYXlsaXN0Q291bnRlcisrICUgcGxheWxpc3RzLmxlbmd0aDtcbiAgICBjb25zdCBzb3VyY2VzID0gcGxheWxpc3RzW25ld0lkeF07XG4gICAgY29uc3QgZnJlcXVlbmN5QmFuZCA9IGZyZXF1ZW5jaWVzW25ld0lkeF07XG4gICAgY29uc3Qgc291cmNlVXJsID0gdHlwZW9mIHNvdXJjZXNbMF0gPT09ICdzdHJpbmcnID8gc291cmNlc1swXSA6IHNvdXJjZXNbMF0uc3JjO1xuXG4gICAgbG9hZEF1ZGlvKHNvdXJjZXMsIGZyZXF1ZW5jeUJhbmQsIChhdWRpbykgPT4ge1xuICAgICAgcXVldWVkQXVkaW8gPSBhdWRpbztcbiAgICAgIHF1ZXVlaW5nID0gZmFsc2U7XG4gICAgICBwbGF5ZXIuZW1pdCgncmVhZHknKTtcbiAgICB9KTtcbiAgICBsYXN0VHJhY2tOYW1lID0gcGF0aC5iYXNlbmFtZShzb3VyY2VVcmwsIHBhdGguZXh0bmFtZShzb3VyY2VVcmwpKTtcblxuICAgIC8vIFNlbmQgb3JpZ2luYWwgdHJhY2sgbmFtZSBzbyB3ZSBrbm93IHdoYXQgaXMgYmVpbmcgcGxheWVkXG4gICAgaWYgKHdpbmRvdy5nYSkge1xuICAgICAgd2luZG93LmdhKCdzZW5kJywgJ2V2ZW50JywgJ2F1ZGlvJywgJ3F1ZXVlJywgbGFzdFRyYWNrTmFtZSk7XG4gICAgfVxuXG4gICAgbGFzdFRyYWNrTmFtZSA9IGxhc3RUcmFja05hbWUucmVwbGFjZSgvXFxfRG9sYnkvaSwgJycpO1xuICAgIGxhc3RUcmFja05hbWUgPSBsYXN0VHJhY2tOYW1lLnJlcGxhY2UoL1xcXy9nLCAnICcpO1xuICAgIGxhc3RUcmFja05hbWUgPSBsYXN0VHJhY2tOYW1lLnJlcGxhY2UoJ0ludGVybHVkZScsICcgKEludGVybHVkZSknKTtcbiAgICBsYXN0VHJhY2tOYW1lID0gbGFzdFRyYWNrTmFtZS5yZXBsYWNlKCdGdXIgQWxpbmEnLCAnKEbDvHIgQWxpbmEpJyk7XG4gICAgcmV0dXJuIGxhc3RUcmFja05hbWUudHJpbSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcGxheVF1ZXVlZCAoKSB7XG4gICAgLy8gY29uc29sZS5sb2coJ0Fib3V0IHRvIHBsYXkuLi4nKTtcbiAgICBpZiAod2FpdGluZ0Zvck5leHQpIHJldHVybjtcbiAgICBpZiAocXVldWVpbmcpIHtcbiAgICAgIHN0b3BMYXN0KCk7XG4gICAgICB3YWl0aW5nRm9yTmV4dCA9IHRydWU7XG4gICAgICBwbGF5ZXIub25jZSgncmVhZHknLCAoKSA9PiB7XG4gICAgICAgIHdhaXRpbmdGb3JOZXh0ID0gZmFsc2U7XG4gICAgICAgIHBsYXlRdWV1ZWQoKTtcbiAgICAgIH0pO1xuICAgICAgLy8gY29uc29sZS5sb2coJ0RlZmVycmluZyBuZXh0IGxvYWQuLi4nKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc3RvcExhc3QoKTtcbiAgICBkYXRhSXNJbnZhbGlkID0gZmFsc2U7XG4gICAgZmlsbFdpdGhGYWtlRGF0YSA9IGZhbHNlO1xuICAgIHF1ZXVlZEF1ZGlvLnBsYXkoKTtcbiAgICBwbGF5aW5nQXVkaW8gPSBxdWV1ZWRBdWRpbztcbiAgICBpZiAoZGF0YVZhbGlkYXRpb25JbnRlcnZhbCkgY2xlYXJUaW1lb3V0KGRhdGFWYWxpZGF0aW9uSW50ZXJ2YWwpO1xuICAgIGRhdGFWYWxpZGF0aW9uSW50ZXJ2YWwgPSBzZXRUaW1lb3V0KGRhdGFWYWxpZGF0aW9uLCBWQUxJREFUSU9OX1RJTUUpO1xuICAgIC8vIGNvbnNvbGUubG9nKCdQbGF5aW5nLi4uJyk7XG4gIH1cbiAgXG4gIGZ1bmN0aW9uIHN0b3BMYXN0ICgpIHtcbiAgICBpZiAocGxheWluZ0F1ZGlvKSB7XG4gICAgICBhdWRpb1RpbWVDYWNoZVtwbGF5aW5nQXVkaW8udXJsS2V5XSA9IHBsYXlpbmdBdWRpby5lbGVtZW50LmN1cnJlbnRUaW1lO1xuICAgICAgcGxheWluZ0F1ZGlvLnN0b3AoKTtcblxuICAgICAgY29uc3QgbGFzdFNvdXJjZXMgPSBbXTtcbiAgICAgIGNvbnN0IGVsZW1lbnQgPSBwbGF5aW5nQXVkaW8uZWxlbWVudDtcbiAgICAgIHdoaWxlIChlbGVtZW50LmZpcnN0Q2hpbGQpIHtcbiAgICAgICAgbGFzdFNvdXJjZXMucHVzaChlbGVtZW50LmZpcnN0Q2hpbGQpO1xuICAgICAgICBlbGVtZW50LnJlbW92ZUNoaWxkKGVsZW1lbnQuZmlyc3RDaGlsZCk7XG4gICAgICB9XG5cbiAgICAgIHBsYXlpbmdBdWRpby5sYXN0U291cmNlcyA9IGxhc3RTb3VyY2VzO1xuICAgICAgcGxheWluZ0F1ZGlvLmVsZW1lbnQubG9hZCgpO1xuICAgICAgcGxheWluZ0F1ZGlvLm5vZGUuZGlzY29ubmVjdCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGxvYWRBdWRpbyAoc291cmNlcywgcmFuZ2VzLCBjYikge1xuICAgIGlmIChsb2FkaW5nQXVkaW8pIHJldHVybjtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoc291cmNlcykpIHNvdXJjZXMgPSBbIHNvdXJjZXMgXTtcbiAgICBjb25zdCB1cmxLZXkgPSB0eXBlb2Ygc291cmNlc1swXSA9PT0gJ3N0cmluZycgPyBzb3VyY2VzWzBdIDogc291cmNlc1swXS5zcmM7XG4gICAgbG9hZGluZ0F1ZGlvID0gdHJ1ZTtcblxuICAgIC8vIGlmICh1cmxLZXkgaW4gYXVkaW9DYWNoZSkge1xuICAgIC8vICAgY29uc3QgcmV0ID0gYXVkaW9DYWNoZVt1cmxLZXldO1xuICAgIC8vICAgcmV0Lmxhc3RTb3VyY2VzLmZvckVhY2goc291cmNlID0+IHtcbiAgICAvLyAgICAgcmV0LmVsZW1lbnQuYXBwZW5kQ2hpbGQoc291cmNlKTtcbiAgICAvLyAgIH0pO1xuICAgIC8vICAgcmV0Lmxhc3RTb3VyY2VzLmxlbmd0aCA9IDA7XG4gICAgLy8gICByZXQuZWxlbWVudC5jdXJyZW50VGltZSA9IHJldC5sYXN0VGltZTtcbiAgICAvLyAgIHJldC5lbGVtZW50LmxvYWQoKTtcbiAgICAvLyAgIHByb2Nlc3MubmV4dFRpY2soKCkgPT4ge1xuICAgIC8vICAgICBjYihyZXQpO1xuICAgIC8vICAgICBsb2FkaW5nQXVkaW8gPSBmYWxzZTtcbiAgICAvLyAgIH0pO1xuICAgIC8vICAgcmV0dXJuIHJldDtcbiAgICAvLyB9XG5cbiAgICAvLyBGaXggU2FmYXJpIDkgYnVnXG4gICAgcmVzdW1lKCk7XG5cbiAgICBjb25zdCBhdWRpbyA9IGF1ZGlvUGxheWVyKHNvdXJjZXMsIHtcbiAgICAgIGxvb3A6IHRydWUsXG4gICAgICBidWZmZXI6IGZhbHNlLFxuICAgICAgY29udGV4dDogYXVkaW9Db250ZXh0XG4gICAgfSk7XG4gICAgYXVkaW9DYWNoZVt1cmxLZXldID0gYXVkaW87XG4gICAgYXVkaW8udXJsS2V5ID0gdXJsS2V5O1xuXG4gICAgYXVkaW8ub24oJ2Vycm9yJywgZXJyID0+IHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGJpbnMgPSByYW5nZXMubWFwKHJhbmdlID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGxvOiBmcmVxdWVuY3lUb0luZGV4KHJhbmdlWzBdLCBzYW1wbGVSYXRlLCBmcmVxQmluQ291bnQpLFxuICAgICAgICBoaTogZnJlcXVlbmN5VG9JbmRleChyYW5nZVsxXSwgc2FtcGxlUmF0ZSwgZnJlcUJpbkNvdW50KSxcbiAgICAgICAgdGhyZXNob2xkOiAxMDAsXG4gICAgICAgIGRlY2F5OiAwLjAwMVxuICAgICAgfTtcbiAgICB9KTtcbiAgICBhdWRpby5kZXRlY3RCZWF0cyA9IGNyZWF0ZUJlYXREZXRlY3Rpb24oYmlucyk7XG4gICAgXG4gICAgYXVkaW8ub24oJ2RlY29kaW5nJywgKCkgPT4ge1xuICAgICAgLy8gY29uc29sZS5sb2coJ0RlY29kaW5nJywgdXJsS2V5KTtcbiAgICB9KTtcbiAgICBhdWRpby5vbignbG9hZCcsICgpID0+IHtcbiAgICAgIC8vIGNvbnNvbGUubG9nKCdBdWRpbyBsb2FkZWQuLi4nKTtcbiAgICAgIC8vIHN0YXJ0IHBsYXlpbmcgYXVkaW8gZmlsZVxuICAgICAgXG4gICAgICBpZiAodXJsS2V5IGluIGF1ZGlvVGltZUNhY2hlKSB7XG4gICAgICAgIGF1ZGlvLmVsZW1lbnQuY3VycmVudFRpbWUgPSBhdWRpb1RpbWVDYWNoZVt1cmxLZXldO1xuICAgICAgfVxuXG4gICAgICBjYihhdWRpbyk7XG4gICAgICBsb2FkaW5nQXVkaW8gPSBmYWxzZTtcbiAgICB9KTtcbiAgICBhdWRpby5ub2RlLmNvbm5lY3QoYW5hbHlzZXJOb2RlKTtcbiAgICByZXR1cm4gYXVkaW87XG4gIH1cbn07XG5cbmZ1bmN0aW9uIHRlc3RDYW5QbGF5RERQbHVzICgpIHtcbiAgLy8gY3JlYXRlIGF1ZGlvIGVsZW1lbnQgdG8gdGVzdCBEb2xieSBEaWdpdGFsIFBsdXMgcGxheWJhY2tcbiAgdmFyIGF1ZGlvID0gbmV3IHdpbmRvdy5BdWRpbygpO1xuXG4gIC8vIGNoZWNrIHRvIHNlZSBpZiBFQy0zIChEb2xieSBEaWdpdGFsIFBsdXMpIGNhbiBiZSBwbGF5ZWRcbiAgaWYgKGF1ZGlvLmNhblBsYXlUeXBlKCdhdWRpby9tcDQ7Y29kZWNzPVwiZWMtM1wiJykgIT09ICcnKSB7XG4gICAgaWYgKG5hdmlnYXRvci51c2VyQWdlbnQuaW5kZXhPZignU2FmYXJpJykgIT09IC0xICYmXG4gICAgICAgIG5hdmlnYXRvci51c2VyQWdlbnQuaW5kZXhPZignTWFjIE9TIFggMTBfMTEnKSAhPT0gLTEgJiZcbiAgICAgICAgbmF2aWdhdG9yLnVzZXJBZ2VudC5pbmRleE9mKCdWZXJzaW9uLzknKSAhPT0gLTEpIHtcbiAgICAgIC8vIGV2ZXJ5dGhpbmcgY2hlY2tzIG91dCBzbyB3ZSBjYW4gcGxheSBEb2xieSBEaWdpdGFsIFBsdXNcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAobmF2aWdhdG9yLnVzZXJBZ2VudC5pbmRleE9mKCdFZGdlJykgIT09IC0xKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuIiwibW9kdWxlLmV4cG9ydHM9W1tcIiM2OUQyRTdcIixcIiNBN0RCRDhcIixcIiNFMEU0Q0NcIixcIiNGMzg2MzBcIixcIiNGQTY5MDBcIl0sW1wiI0ZFNDM2NVwiLFwiI0ZDOUQ5QVwiLFwiI0Y5Q0RBRFwiLFwiI0M4QzhBOVwiLFwiIzgzQUY5QlwiXSxbXCIjRUNEMDc4XCIsXCIjRDk1QjQzXCIsXCIjQzAyOTQyXCIsXCIjNTQyNDM3XCIsXCIjNTM3NzdBXCJdLFtcIiM1NTYyNzBcIixcIiM0RUNEQzRcIixcIiNDN0Y0NjRcIixcIiNGRjZCNkJcIixcIiNDNDRENThcIl0sW1wiIzc3NEYzOFwiLFwiI0UwOEU3OVwiLFwiI0YxRDRBRlwiLFwiI0VDRTVDRVwiLFwiI0M1RTBEQ1wiXSxbXCIjRThERENCXCIsXCIjQ0RCMzgwXCIsXCIjMDM2NTY0XCIsXCIjMDMzNjQ5XCIsXCIjMDMxNjM0XCJdLFtcIiM0OTBBM0RcIixcIiNCRDE1NTBcIixcIiNFOTdGMDJcIixcIiNGOENBMDBcIixcIiM4QTlCMEZcIl0sW1wiIzU5NEY0RlwiLFwiIzU0Nzk4MFwiLFwiIzQ1QURBOFwiLFwiIzlERTBBRFwiLFwiI0U1RkNDMlwiXSxbXCIjMDBBMEIwXCIsXCIjNkE0QTNDXCIsXCIjQ0MzMzNGXCIsXCIjRUI2ODQxXCIsXCIjRURDOTUxXCJdLFtcIiNFOTRFNzdcIixcIiNENjgxODlcIixcIiNDNkE0OUFcIixcIiNDNkU1RDlcIixcIiNGNEVBRDVcIl0sW1wiI0Q5Q0VCMlwiLFwiIzk0OEM3NVwiLFwiI0Q1REVEOVwiLFwiIzdBNkE1M1wiLFwiIzk5QjJCN1wiXSxbXCIjRkZGRkZGXCIsXCIjQ0JFODZCXCIsXCIjRjJFOUUxXCIsXCIjMUMxNDBEXCIsXCIjQ0JFODZCXCJdLFtcIiNFRkZGQ0RcIixcIiNEQ0U5QkVcIixcIiM1NTUxNTJcIixcIiMyRTI2MzNcIixcIiM5OTE3M0NcIl0sW1wiIzNGQjhBRlwiLFwiIzdGQzdBRlwiLFwiI0RBRDhBN1wiLFwiI0ZGOUU5RFwiLFwiI0ZGM0Q3RlwiXSxbXCIjMzQzODM4XCIsXCIjMDA1RjZCXCIsXCIjMDA4QzlFXCIsXCIjMDBCNENDXCIsXCIjMDBERkZDXCJdLFtcIiM0MTNFNEFcIixcIiM3MzYyNkVcIixcIiNCMzgxODRcIixcIiNGMEI0OUVcIixcIiNGN0U0QkVcIl0sW1wiIzk5Qjg5OFwiLFwiI0ZFQ0VBOFwiLFwiI0ZGODQ3Q1wiLFwiI0U4NEE1RlwiLFwiIzJBMzYzQlwiXSxbXCIjRkY0RTUwXCIsXCIjRkM5MTNBXCIsXCIjRjlENDIzXCIsXCIjRURFNTc0XCIsXCIjRTFGNUM0XCJdLFtcIiM1NTQyMzZcIixcIiNGNzc4MjVcIixcIiNEM0NFM0RcIixcIiNGMUVGQTVcIixcIiM2MEI5OUFcIl0sW1wiIzM1MTMzMFwiLFwiIzQyNDI1NFwiLFwiIzY0OTA4QVwiLFwiI0U4Q0FBNFwiLFwiI0NDMkE0MVwiXSxbXCIjMDBBOEM2XCIsXCIjNDBDMENCXCIsXCIjRjlGMkU3XCIsXCIjQUVFMjM5XCIsXCIjOEZCRTAwXCJdLFtcIiNGRjQyNDJcIixcIiNGNEZBRDJcIixcIiNENEVFNUVcIixcIiNFMUVEQjlcIixcIiNGMEYyRUJcIl0sW1wiIzY1NTY0M1wiLFwiIzgwQkNBM1wiLFwiI0Y2RjdCRFwiLFwiI0U2QUMyN1wiLFwiI0JGNEQyOFwiXSxbXCIjOEMyMzE4XCIsXCIjNUU4QzZBXCIsXCIjODhBNjVFXCIsXCIjQkZCMzVBXCIsXCIjRjJDNDVBXCJdLFtcIiNGQUQwODlcIixcIiNGRjlDNUJcIixcIiNGNTYzNEFcIixcIiNFRDMwM0NcIixcIiMzQjgxODNcIl0sW1wiI0JDQkRBQ1wiLFwiI0NGQkUyN1wiLFwiI0YyNzQzNVwiLFwiI0YwMjQ3NVwiLFwiIzNCMkQzOFwiXSxbXCIjRDFFNzUxXCIsXCIjRkZGRkZGXCIsXCIjMDAwMDAwXCIsXCIjNERCQ0U5XCIsXCIjMjZBREU0XCJdLFtcIiNGRjk5MDBcIixcIiM0MjQyNDJcIixcIiNFOUU5RTlcIixcIiNCQ0JDQkNcIixcIiMzMjk5QkJcIl0sW1wiIzVENDE1N1wiLFwiIzgzODY4OVwiLFwiI0E4Q0FCQVwiLFwiI0NBRDdCMlwiLFwiI0VCRTNBQVwiXSxbXCIjNUU0MTJGXCIsXCIjRkNFQkI2XCIsXCIjNzhDMEE4XCIsXCIjRjA3ODE4XCIsXCIjRjBBODMwXCJdLFtcIiNFRUU2QUJcIixcIiNDNUJDOEVcIixcIiM2OTY3NThcIixcIiM0NTQ4NEJcIixcIiMzNjM5M0JcIl0sW1wiIzFCNjc2QlwiLFwiIzUxOTU0OFwiLFwiIzg4QzQyNVwiLFwiI0JFRjIwMlwiLFwiI0VBRkRFNlwiXSxbXCIjRjhCMTk1XCIsXCIjRjY3MjgwXCIsXCIjQzA2Qzg0XCIsXCIjNkM1QjdCXCIsXCIjMzU1QzdEXCJdLFtcIiM0NTI2MzJcIixcIiM5MTIwNERcIixcIiNFNDg0NEFcIixcIiNFOEJGNTZcIixcIiNFMkY3Q0VcIl0sW1wiI0YwNDE1NVwiLFwiI0ZGODIzQVwiLFwiI0YyRjI2RlwiLFwiI0ZGRjdCRFwiLFwiIzk1Q0ZCN1wiXSxbXCIjRjBEOEE4XCIsXCIjM0QxQzAwXCIsXCIjODZCOEIxXCIsXCIjRjJENjk0XCIsXCIjRkEyQTAwXCJdLFtcIiMyQTA0NEFcIixcIiMwQjJFNTlcIixcIiMwRDY3NTlcIixcIiM3QUIzMTdcIixcIiNBMEM1NUZcIl0sW1wiIzY3OTE3QVwiLFwiIzE3MDQwOVwiLFwiI0I4QUYwM1wiLFwiI0NDQkY4MlwiLFwiI0UzMzI1OFwiXSxbXCIjQjlEN0Q5XCIsXCIjNjY4Mjg0XCIsXCIjMkEyODI5XCIsXCIjNDkzNzM2XCIsXCIjN0IzQjNCXCJdLFtcIiNCQkJCODhcIixcIiNDQ0M2OERcIixcIiNFRUREOTlcIixcIiNFRUMyOTBcIixcIiNFRUFBODhcIl0sW1wiI0EzQTk0OFwiLFwiI0VEQjkyRVwiLFwiI0Y4NTkzMVwiLFwiI0NFMTgzNlwiLFwiIzAwOTk4OVwiXSxbXCIjRThENUI3XCIsXCIjMEUyNDMwXCIsXCIjRkMzQTUxXCIsXCIjRjVCMzQ5XCIsXCIjRThENUI5XCJdLFtcIiNCM0NDNTdcIixcIiNFQ0YwODFcIixcIiNGRkJFNDBcIixcIiNFRjc0NkZcIixcIiNBQjNFNUJcIl0sW1wiI0FCNTI2QlwiLFwiI0JDQTI5N1wiLFwiI0M1Q0VBRVwiLFwiI0YwRTJBNFwiLFwiI0Y0RUJDM1wiXSxbXCIjNjA3ODQ4XCIsXCIjNzg5MDQ4XCIsXCIjQzBEODYwXCIsXCIjRjBGMEQ4XCIsXCIjNjA0ODQ4XCJdLFtcIiM1MTUxNTFcIixcIiNGRkZGRkZcIixcIiMwMEI0RkZcIixcIiNFRUVFRUVcIl0sW1wiIzNFNDE0N1wiLFwiI0ZGRkVERlwiLFwiI0RGQkE2OVwiLFwiIzVBMkUyRVwiLFwiIzJBMkMzMVwiXSxbXCIjMzAwMDMwXCIsXCIjNDgwMDQ4XCIsXCIjNjAxODQ4XCIsXCIjQzA0ODQ4XCIsXCIjRjA3MjQxXCJdLFtcIiMxQzIxMzBcIixcIiMwMjhGNzZcIixcIiNCM0UwOTlcIixcIiNGRkVBQURcIixcIiNEMTQzMzRcIl0sW1wiI0E4RTZDRVwiLFwiI0RDRURDMlwiLFwiI0ZGRDNCNVwiLFwiI0ZGQUFBNlwiLFwiI0ZGOEM5NFwiXSxbXCIjRURFQkU2XCIsXCIjRDZFMUM3XCIsXCIjOTRDN0I2XCIsXCIjNDAzQjMzXCIsXCIjRDM2NDNCXCJdLFtcIiNGREYxQ0NcIixcIiNDNkQ2QjhcIixcIiM5ODdGNjlcIixcIiNFM0FENDBcIixcIiNGQ0QwMzZcIl0sW1wiI0FBQjNBQlwiLFwiI0M0Q0JCN1wiLFwiI0VCRUZDOVwiLFwiI0VFRTBCN1wiLFwiI0U4Q0FBRlwiXSxbXCIjQ0MwQzM5XCIsXCIjRTY3ODFFXCIsXCIjQzhDRjAyXCIsXCIjRjhGQ0MxXCIsXCIjMTY5M0E3XCJdLFtcIiMzQTExMUNcIixcIiM1NzQ5NTFcIixcIiM4Mzk4OEVcIixcIiNCQ0RFQTVcIixcIiNFNkY5QkNcIl0sW1wiI0ZDMzU0Q1wiLFwiIzI5MjIxRlwiLFwiIzEzNzQ3RFwiLFwiIzBBQkZCQ1wiLFwiI0ZDRjdDNVwiXSxbXCIjQjlEM0IwXCIsXCIjODFCREE0XCIsXCIjQjI4Nzc0XCIsXCIjRjg4Rjc5XCIsXCIjRjZBQTkzXCJdLFtcIiM1RTM5MjlcIixcIiNDRDhDNTJcIixcIiNCN0QxQTNcIixcIiNERUU4QkVcIixcIiNGQ0Y3RDNcIl0sW1wiIzIzMEYyQlwiLFwiI0YyMUQ0MVwiLFwiI0VCRUJCQ1wiLFwiI0JDRTNDNVwiLFwiIzgyQjNBRVwiXSxbXCIjNUMzMjNFXCIsXCIjQTgyNzQzXCIsXCIjRTE1RTMyXCIsXCIjQzBEMjNFXCIsXCIjRTVGMDRDXCJdLFtcIiM0RTM5NURcIixcIiM4MjcwODVcIixcIiM4RUJFOTRcIixcIiNDQ0ZDOEVcIixcIiNEQzVCM0VcIl0sW1wiI0RBRDZDQVwiLFwiIzFCQjBDRVwiLFwiIzRGODY5OVwiLFwiIzZBNUU3MlwiLFwiIzU2MzQ0NFwiXSxbXCIjQzI0MTJEXCIsXCIjRDFBQTM0XCIsXCIjQTdBODQ0XCIsXCIjQTQ2NTgzXCIsXCIjNUExRTRBXCJdLFtcIiNEMTMxM0RcIixcIiNFNTYyNUNcIixcIiNGOUJGNzZcIixcIiM4RUIyQzVcIixcIiM2MTUzNzVcIl0sW1wiIzlEN0U3OVwiLFwiI0NDQUM5NVwiLFwiIzlBOTQ3Q1wiLFwiIzc0OEI4M1wiLFwiIzVCNzU2Q1wiXSxbXCIjMUMwMTEzXCIsXCIjNkIwMTAzXCIsXCIjQTMwMDA2XCIsXCIjQzIxQTAxXCIsXCIjRjAzQzAyXCJdLFtcIiM4RENDQURcIixcIiM5ODg4NjRcIixcIiNGRUE2QTJcIixcIiNGOUQ2QUNcIixcIiNGRkU5QUZcIl0sW1wiI0NGRkZERFwiLFwiI0I0REVDMVwiLFwiIzVDNTg2M1wiLFwiI0E4NTE2M1wiLFwiI0ZGMUY0Q1wiXSxbXCIjNzU2MTZCXCIsXCIjQkZDRkY3XCIsXCIjRENFNEY3XCIsXCIjRjhGM0JGXCIsXCIjRDM0MDE3XCJdLFtcIiMzODJGMzJcIixcIiNGRkVBRjJcIixcIiNGQ0Q5RTVcIixcIiNGQkM1RDhcIixcIiNGMTM5NkRcIl0sW1wiI0I2RDhDMFwiLFwiI0M4RDlCRlwiLFwiI0RBREFCRFwiLFwiI0VDREJCQ1wiLFwiI0ZFRENCQVwiXSxbXCIjRTNERkJBXCIsXCIjQzhENkJGXCIsXCIjOTNDQ0M2XCIsXCIjNkNCREI1XCIsXCIjMUExRjFFXCJdLFtcIiNBN0M1QkRcIixcIiNFNUREQ0JcIixcIiNFQjdCNTlcIixcIiNDRjQ2NDdcIixcIiM1MjQ2NTZcIl0sW1wiIzlEQzlBQ1wiLFwiI0ZGRkVDN1wiLFwiI0Y1NjIxOFwiLFwiI0ZGOUQyRVwiLFwiIzkxOTE2N1wiXSxbXCIjNDEzRDNEXCIsXCIjMDQwMDA0XCIsXCIjQzhGRjAwXCIsXCIjRkEwMjNDXCIsXCIjNEIwMDBGXCJdLFtcIiNFREY2RUVcIixcIiNEMUMwODlcIixcIiNCMzIwNERcIixcIiM0MTJFMjhcIixcIiMxNTExMDFcIl0sW1wiI0E4QTdBN1wiLFwiI0NDNTI3QVwiLFwiI0U4MTc1RFwiLFwiIzQ3NDc0N1wiLFwiIzM2MzYzNlwiXSxbXCIjN0U1Njg2XCIsXCIjQTVBQUQ5XCIsXCIjRThGOUEyXCIsXCIjRjhBMTNGXCIsXCIjQkEzQzNEXCJdLFtcIiNGRkVEQkZcIixcIiNGNzgwM0NcIixcIiNGNTQ4MjhcIixcIiMyRTBEMjNcIixcIiNGOEU0QzFcIl0sW1wiI0MxQjM5OFwiLFwiIzYwNTk1MVwiLFwiI0ZCRUVDMlwiLFwiIzYxQTZBQlwiLFwiI0FDQ0VDMFwiXSxbXCIjNUU5RkEzXCIsXCIjRENEMUI0XCIsXCIjRkFCODdGXCIsXCIjRjg3RTdCXCIsXCIjQjA1NTc0XCJdLFtcIiM5NTFGMkJcIixcIiNGNUY0RDdcIixcIiNFMERGQjFcIixcIiNBNUEzNkNcIixcIiM1MzUyMzNcIl0sW1wiI0ZGRkJCN1wiLFwiI0E2RjZBRlwiLFwiIzY2QjZBQlwiLFwiIzVCN0M4RFwiLFwiIzRGMjk1OFwiXSxbXCIjMDAwMDAwXCIsXCIjOUYxMTFCXCIsXCIjQjExNjIzXCIsXCIjMjkyQzM3XCIsXCIjQ0NDQ0NDXCJdLFtcIiM5Q0REQzhcIixcIiNCRkQ4QURcIixcIiNEREQ5QUJcIixcIiNGN0FGNjNcIixcIiM2MzNEMkVcIl0sW1wiI0VGRjNDRFwiLFwiI0IyRDVCQVwiLFwiIzYxQURBMFwiLFwiIzI0OEY4RFwiLFwiIzYwNTA2M1wiXSxbXCIjODRCMjk1XCIsXCIjRUNDRjhEXCIsXCIjQkI4MTM4XCIsXCIjQUMyMDA1XCIsXCIjMkMxNTA3XCJdLFtcIiNGQ0ZFRjVcIixcIiNFOUZGRTFcIixcIiNDRENGQjdcIixcIiNENkU2QzNcIixcIiNGQUZCRTNcIl0sW1wiIzBDQTVCMFwiLFwiIzRFM0YzMFwiLFwiI0ZFRkVFQlwiLFwiI0Y4RjRFNFwiLFwiI0E1QjNBQVwiXSxbXCIjNEQzQjNCXCIsXCIjREU2MjYyXCIsXCIjRkZCODhDXCIsXCIjRkZEMEIzXCIsXCIjRjVFMEQzXCJdLFtcIiNCNUFDMDFcIixcIiNFQ0JBMDlcIixcIiNFODZFMUNcIixcIiNENDFFNDVcIixcIiMxQjE1MjFcIl0sW1wiIzM3OUY3QVwiLFwiIzc4QUU2MlwiLFwiI0JCQjc0OVwiLFwiI0UwRkJBQ1wiLFwiIzFGMUMwRFwiXSxbXCIjRkZFMTgxXCIsXCIjRUVFOUU1XCIsXCIjRkFEM0IyXCIsXCIjRkZCQTdGXCIsXCIjRkY5Qzk3XCJdLFtcIiM0RTRENEFcIixcIiMzNTM0MzJcIixcIiM5NEJBNjVcIixcIiMyNzkwQjBcIixcIiMyQjRFNzJcIl0sW1wiI0E3MDI2N1wiLFwiI0YxMEM0OVwiLFwiI0ZCNkI0MVwiLFwiI0Y2RDg2QlwiLFwiIzMzOTE5NFwiXSxbXCIjMzAyNjFDXCIsXCIjNDAzODMxXCIsXCIjMzY1NDRGXCIsXCIjMUY1RjYxXCIsXCIjMEI4MTg1XCJdLFtcIiMyRDJEMjlcIixcIiMyMTVBNkRcIixcIiMzQ0EyQTJcIixcIiM5MkM3QTNcIixcIiNERkVDRTZcIl0sW1wiI0YzOEE4QVwiLFwiIzU1NDQzRFwiLFwiI0EwQ0FCNVwiLFwiI0NERTlDQVwiLFwiI0YxRUREMFwiXSxbXCIjNzkzQTU3XCIsXCIjNEQzMzM5XCIsXCIjOEM4NzNFXCIsXCIjRDFDNUE1XCIsXCIjQTM4QTVGXCJdLFtcIiMxMTc2NkRcIixcIiM0MTA5MzZcIixcIiNBNDBCNTRcIixcIiNFNDZGMEFcIixcIiNGMEIzMDBcIl0sW1wiI0FBRkYwMFwiLFwiI0ZGQUEwMFwiLFwiI0ZGMDBBQVwiLFwiI0FBMDBGRlwiLFwiIzAwQUFGRlwiXSxbXCIjQzc1MjMzXCIsXCIjQzc4OTMzXCIsXCIjRDZDRUFBXCIsXCIjNzlCNUFDXCIsXCIjNUUyRjQ2XCJdLFtcIiNGOEVERDFcIixcIiNEODhBOEFcIixcIiM0NzQ4NDNcIixcIiM5RDlEOTNcIixcIiNDNUNGQzZcIl0sW1wiIzZEQTY3QVwiLFwiIzc3Qjg4NVwiLFwiIzg2QzI4QlwiLFwiIzg1OTk4N1wiLFwiIzRBNDg1N1wiXSxbXCIjMUIzMjVGXCIsXCIjOUNDNEU0XCIsXCIjRTlGMkY5XCIsXCIjM0E4OUM5XCIsXCIjRjI2QzRGXCJdLFtcIiNCRUQ2QzdcIixcIiNBREMwQjRcIixcIiM4QTdFNjZcIixcIiNBNzlCODNcIixcIiNCQkIyQTFcIl0sW1wiIzA0NkQ4QlwiLFwiIzMwOTI5MlwiLFwiIzJGQjhBQ1wiLFwiIzkzQTQyQVwiLFwiI0VDQkUxM1wiXSxbXCIjODI4MzdFXCIsXCIjOTRCMDUzXCIsXCIjQkRFQjA3XCIsXCIjQkZGQTM3XCIsXCIjRTBFMEUwXCJdLFtcIiMzMTI3MzZcIixcIiNENDgzOEZcIixcIiNENkFCQjFcIixcIiNEOUQ5RDlcIixcIiNDNEZGRUJcIl0sW1wiI0U1RUFBNFwiLFwiI0E4QzRBMlwiLFwiIzY5QTVBNFwiLFwiIzYxNjM4MlwiLFwiIzY2MjQ1QlwiXSxbXCIjNkRBNjdBXCIsXCIjOTlBNjZEXCIsXCIjQTlCRDY4XCIsXCIjQjVDQzZBXCIsXCIjQzBERTVEXCJdLFtcIiMzOTVBNEZcIixcIiM0MzIzMzBcIixcIiM4NTNDNDNcIixcIiNGMjVDNUVcIixcIiNGRkE1NjZcIl0sW1wiIzMzMTMyN1wiLFwiIzk5MTc2NlwiLFwiI0Q5MEY1QVwiLFwiI0YzNDczOVwiLFwiI0ZGNkUyN1wiXSxbXCIjRkRGRkQ5XCIsXCIjRkZGMEI4XCIsXCIjRkZENkEzXCIsXCIjRkFBRDhFXCIsXCIjMTQyRjMwXCJdLFtcIiNFMjFCNUFcIixcIiM5RTBDMzlcIixcIiMzMzMzMzNcIixcIiNGQkZGRTNcIixcIiM4M0EzMDBcIl0sW1wiI0ZCQzU5OVwiLFwiI0NEQkI5M1wiLFwiIzlFQUU4QVwiLFwiIzMzNTY1MFwiLFwiI0YzNUY1NVwiXSxbXCIjQzdGQ0Q3XCIsXCIjRDlENUE3XCIsXCIjRDlBQjkxXCIsXCIjRTY4NjdBXCIsXCIjRUQ0QTZBXCJdLFtcIiNFQzQ0MDFcIixcIiNDQzlCMjVcIixcIiMxM0NENEFcIixcIiM3QjZFRDZcIixcIiM1RTUyNUNcIl0sW1wiI0JGNDk2QVwiLFwiI0IzOUM4MlwiLFwiI0I4Qzk5RFwiLFwiI0YwRDM5OVwiLFwiIzU5NTE1MVwiXSxbXCIjRkZFRkQzXCIsXCIjRkZGRUU0XCIsXCIjRDBFQ0VBXCIsXCIjOUZENkQyXCIsXCIjOEI3QTVFXCJdLFtcIiNGMTM5NkRcIixcIiNGRDYwODFcIixcIiNGM0ZGRUJcIixcIiNBQ0M5NUZcIixcIiM4Rjk5MjRcIl0sW1wiI0Y2RjZGNlwiLFwiI0U4RThFOFwiLFwiIzMzMzMzM1wiLFwiIzk5MDEwMFwiLFwiI0I5MDUwNFwiXSxbXCIjMjYxQzIxXCIsXCIjNkUxRTYyXCIsXCIjQjAyNTRGXCIsXCIjREU0MTI2XCIsXCIjRUI5NjA1XCJdLFtcIiNFOUUwRDFcIixcIiM5MUEzOThcIixcIiMzMzYwNUFcIixcIiMwNzAwMDFcIixcIiM2ODQ2MkJcIl0sW1wiI0YyRTNDNlwiLFwiI0ZGQzZBNVwiLFwiI0U2MzI0QlwiLFwiIzJCMkIyQlwiLFwiIzM1MzYzNFwiXSxbXCIjRkZBQjA3XCIsXCIjRTlENTU4XCIsXCIjNzJBRDc1XCIsXCIjMEU4RDk0XCIsXCIjNDM0RDUzXCJdLFtcIiM1OUIzOTBcIixcIiNGMEREQUFcIixcIiNFNDdDNURcIixcIiNFMzJENDBcIixcIiMxNTJCM0NcIl0sW1wiI0ZERTZCRFwiLFwiI0ExQzVBQlwiLFwiI0Y0REQ1MVwiLFwiI0QxMUU0OFwiLFwiIzYzMkY1M1wiXSxbXCIjRTRFNEM1XCIsXCIjQjlENDhCXCIsXCIjOEQyMDM2XCIsXCIjQ0UwQTMxXCIsXCIjRDNFNEM1XCJdLFtcIiM1MTJCNTJcIixcIiM2MzUyNzRcIixcIiM3QkIwQThcIixcIiNBN0RCQUJcIixcIiNFNEY1QjFcIl0sW1wiIzgwNTg0MVwiLFwiI0RDRjdGM1wiLFwiI0ZGRkNERFwiLFwiI0ZGRDhEOFwiLFwiI0Y1QTJBMlwiXSxbXCIjRTY1NTQwXCIsXCIjRjhFQ0MyXCIsXCIjNjVBOEE2XCIsXCIjNzk4OTZEXCJdLFtcIiNDQUZGNDJcIixcIiNFQkY3RjhcIixcIiNEMEUwRUJcIixcIiM4OEFCQzJcIixcIiM0OTcwOEFcIl0sW1wiIzU5NTY0M1wiLFwiIzRFNkI2NlwiLFwiI0VEODM0RVwiLFwiI0VCQ0M2RVwiLFwiI0VCRTFDNVwiXSxbXCIjRTRERUQwXCIsXCIjQUJDQ0JEXCIsXCIjN0RCRUI4XCIsXCIjMTgxNjE5XCIsXCIjRTMyRjIxXCJdLFtcIiMwNTg3ODlcIixcIiM1MDNEMkVcIixcIiNENTRCMUFcIixcIiNFM0E3MkZcIixcIiNGMEVDQzlcIl0sW1wiI0ZGMDAzQ1wiLFwiI0ZGOEEwMFwiLFwiI0ZBQkUyOFwiLFwiIzg4QzEwMFwiLFwiIzAwQzE3NlwiXSxbXCIjMzExRDM5XCIsXCIjNjc0MzRGXCIsXCIjOUI4RTdFXCIsXCIjQzNDQ0FGXCIsXCIjQTUxQTQxXCJdLFtcIiNFRkQ5QjRcIixcIiNENkE2OTJcIixcIiNBMzkwODFcIixcIiM0RDYxNjBcIixcIiMyOTI1MjJcIl0sW1wiI0M2Q0NBNVwiLFwiIzhBQjhBOFwiLFwiIzZCOTk5N1wiLFwiIzU0Nzg3RFwiLFwiIzYxNTE0NVwiXSxbXCIjQ0M1RDRDXCIsXCIjRkZGRUM2XCIsXCIjQzdEMUFGXCIsXCIjOTZCNDlDXCIsXCIjNUI1ODQ3XCJdLFtcIiMxMTE2MjVcIixcIiMzNDE5MzFcIixcIiM1NzFCM0NcIixcIiM3QTFFNDhcIixcIiM5RDIwNTNcIl0sW1wiI0VGRUVDQ1wiLFwiI0ZFOEIwNVwiLFwiI0ZFMDU1N1wiLFwiIzQwMDQwM1wiLFwiIzBBQUJCQVwiXSxbXCIjQ0NGMzkwXCIsXCIjRTBFMDVBXCIsXCIjRjdDNDFGXCIsXCIjRkM5MzBBXCIsXCIjRkYwMDNEXCJdLFtcIiM3M0M4QTlcIixcIiNERUUxQjZcIixcIiNFMUI4NjZcIixcIiNCRDU1MzJcIixcIiMzNzNCNDRcIl0sW1wiIzc5MjU0QVwiLFwiIzc5NUM2NFwiLFwiIzc5OTI3RFwiLFwiI0FFQjE4RVwiLFwiI0UzQ0Y5RVwiXSxbXCIjRTBFRkYxXCIsXCIjN0RCNEI1XCIsXCIjRkZGRkZGXCIsXCIjNjgwMTQ4XCIsXCIjMDAwMDAwXCJdLFtcIiNGMDZENjFcIixcIiNEQTgyNUZcIixcIiNDNDk3NUNcIixcIiNBOEFCN0JcIixcIiM4Q0JGOTlcIl0sW1wiIzJEMUIzM1wiLFwiI0YzNkE3MVwiLFwiI0VFODg3QVwiLFwiI0U0RTM5MVwiLFwiIzlBQkM4QVwiXSxbXCIjMkIyNzI2XCIsXCIjMEE1MTZEXCIsXCIjMDE4NzkwXCIsXCIjN0RBRDkzXCIsXCIjQkFDQ0E0XCJdLFtcIiM5NUExMzFcIixcIiNDOENEM0JcIixcIiNGNkYxREVcIixcIiNGNUI5QUVcIixcIiNFRTBCNUJcIl0sW1wiIzM2MDc0NVwiLFwiI0Q2MUM1OVwiLFwiI0U3RDg0QlwiLFwiI0VGRUFDNVwiLFwiIzFCODc5OFwiXSxbXCIjRTNFOENEXCIsXCIjQkNEOEJGXCIsXCIjRDNCOUEzXCIsXCIjRUU5QzkyXCIsXCIjRkU4NTdFXCJdLFtcIiM4MDc0NjJcIixcIiNBNjk3ODVcIixcIiNCOEZBRkZcIixcIiNFOEZERkZcIixcIiM2NjVDNDlcIl0sW1wiIzRCMTEzOVwiLFwiIzNCNDA1OFwiLFwiIzJBNkU3OFwiLFwiIzdBOTA3Q1wiLFwiI0M5QjE4MFwiXSxbXCIjRkMyODRGXCIsXCIjRkY4MjRBXCIsXCIjRkVBODg3XCIsXCIjRjZFN0Y3XCIsXCIjRDFEMEQ3XCJdLFtcIiNGRkI4ODRcIixcIiNGNURGOThcIixcIiNGRkY4RDRcIixcIiNDMEQxQzJcIixcIiMyRTQzNDdcIl0sW1wiIzAyN0I3RlwiLFwiI0ZGQTU4OFwiLFwiI0Q2Mjk1N1wiLFwiI0JGMUU2MlwiLFwiIzU3MkU0RlwiXSxbXCIjODBBOEE4XCIsXCIjOTA5RDlFXCIsXCIjQTg4QzhDXCIsXCIjRkYwRDUxXCIsXCIjN0E4Qzg5XCJdLFtcIiNBNjlFODBcIixcIiNFMEJBOUJcIixcIiNFN0E5N0VcIixcIiNEMjg1NzRcIixcIiMzQjE5MjJcIl0sW1wiI0ExREJCMlwiLFwiI0ZFRTVBRFwiLFwiI0ZBQ0E2NlwiLFwiI0Y3QTU0MVwiLFwiI0Y0NUQ0Q1wiXSxbXCIjNjQxRjVFXCIsXCIjNjc2MDc3XCIsXCIjNjVBQzkyXCIsXCIjQzJDMDkyXCIsXCIjRURENDhFXCJdLFtcIiNGRkYzREJcIixcIiNFN0U0RDVcIixcIiNEM0M4QjRcIixcIiNDODQ2NDhcIixcIiM3MDNFM0JcIl0sW1wiI0Y1REQ5RFwiLFwiI0JDQzQ5OVwiLFwiIzkyQTY4QVwiLFwiIzdCOEY4QVwiLFwiIzUwNjI2NlwiXSxbXCIjMkIyMjJDXCIsXCIjNUU0MzUyXCIsXCIjOTY1RDYyXCIsXCIjQzc5NTZEXCIsXCIjRjJEOTc0XCJdLFtcIiNENEY3RENcIixcIiNEQkU3QjRcIixcIiNEQkMwOTJcIixcIiNFMDg0NkRcIixcIiNGNTE0NDFcIl0sW1wiI0EzMkMyOFwiLFwiIzFDMDkwQlwiLFwiIzM4NDAzMFwiLFwiIzdCODA1NVwiLFwiI0JDQTg3NVwiXSxbXCIjODU4NDdFXCIsXCIjQUI2QTZFXCIsXCIjRjczNDVCXCIsXCIjMzUzMTMwXCIsXCIjQ0JDRkI0XCJdLFtcIiNFNkIzOUFcIixcIiNFNkNCQTVcIixcIiNFREUzQjRcIixcIiM4QjlFOUJcIixcIiM2RDc1NzhcIl0sW1wiIzExNjQ0RFwiLFwiI0EwQjA0NlwiLFwiI0YyQzk0RVwiLFwiI0Y3ODE0NVwiLFwiI0YyNEU0RVwiXSxbXCIjNkQ5Nzg4XCIsXCIjMUUyNTI4XCIsXCIjN0UxQzEzXCIsXCIjQkYwQTBEXCIsXCIjRTZFMUMyXCJdLFtcIiMyMzE5MkRcIixcIiNGRDBBNTRcIixcIiNGNTc1NzZcIixcIiNGRUJGOTdcIixcIiNGNUVDQjdcIl0sW1wiI0VCOUM0RFwiLFwiI0YyRDY4MFwiLFwiI0YzRkZDRlwiLFwiI0JBQzlBOVwiLFwiIzY5NzA2MFwiXSxbXCIjRDNENUIwXCIsXCIjQjVDRUE0XCIsXCIjOURDMTlEXCIsXCIjOEM3QzYyXCIsXCIjNzE0NDNGXCJdLFtcIiM0NTJFM0NcIixcIiNGRjNENUFcIixcIiNGRkI5NjlcIixcIiNFQUYyN0VcIixcIiMzQjhDODhcIl0sW1wiIzA0MTEyMlwiLFwiIzI1OTA3M1wiLFwiIzdGREE4OVwiLFwiI0M4RTk4RVwiLFwiI0U2Rjk5RFwiXSxbXCIjQjFFNkQxXCIsXCIjNzdCMUE5XCIsXCIjM0Q3QjgwXCIsXCIjMjcwQTMzXCIsXCIjNDUxQTNFXCJdLFtcIiM5RDlFOTRcIixcIiNDOTlFOTNcIixcIiNGNTlEOTJcIixcIiNFNUI4QURcIixcIiNENUQyQzhcIl0sW1wiI0ZEQ0ZCRlwiLFwiI0ZFQjg5RlwiLFwiI0UyM0Q3NVwiLFwiIzVGMEQzQlwiLFwiIzc0MjM2NVwiXSxbXCIjNTQwMDQ1XCIsXCIjQzYwMDUyXCIsXCIjRkY3MTRCXCIsXCIjRUFGRjg3XCIsXCIjQUNGRkU5XCJdLFtcIiNCN0NCQkZcIixcIiM4Qzg4NkZcIixcIiNGOUE3OTlcIixcIiNGNEJGQURcIixcIiNGNURBQkRcIl0sW1wiIzI4MDkwNFwiLFwiIzY4MEUzNFwiLFwiIzlBMTUxQVwiLFwiI0MyMUIxMlwiLFwiI0ZDNEIyQVwiXSxbXCIjRjBGRkM5XCIsXCIjQTlEQTg4XCIsXCIjNjI5OTdBXCIsXCIjNzIyNDNEXCIsXCIjM0IwODE5XCJdLFtcIiM0MjkzOThcIixcIiM2QjVENERcIixcIiNCMEExOEZcIixcIiNERkNEQjRcIixcIiNGQkVFRDNcIl0sW1wiI0U2RUJBOVwiLFwiI0FCQkI5RlwiLFwiIzZGOEI5NFwiLFwiIzcwNjQ4MlwiLFwiIzcwM0Q2RlwiXSxbXCIjQTNDNjhDXCIsXCIjODc5Njc2XCIsXCIjNkU2NjYyXCIsXCIjNEYzNjRBXCIsXCIjMzQwNzM1XCJdLFtcIiM0NDc0OURcIixcIiNDNkQ0RTFcIixcIiNGRkZGRkZcIixcIiNFQkU3RTBcIixcIiNCREI4QURcIl0sW1wiIzMyMjkzOFwiLFwiIzg5QTE5NFwiLFwiI0NGQzg5QVwiLFwiI0NDODgzQVwiLFwiI0ExNDAxNlwiXSxbXCIjQ0ZCNTkwXCIsXCIjOUU5QTQxXCIsXCIjNzU4OTE4XCIsXCIjNTY0MzM0XCIsXCIjNDkyODFGXCJdLFtcIiNGQTZBNjRcIixcIiM3QTRFNDhcIixcIiM0QTQwMzFcIixcIiNGNkUyQkJcIixcIiM5RUM2QjhcIl0sW1wiIzFEMTMxM1wiLFwiIzI0QjY5NFwiLFwiI0QyMjA0MlwiLFwiI0EzQjgwOFwiLFwiIzMwQzRDOVwiXSxbXCIjRjZENzZCXCIsXCIjRkY5MDM2XCIsXCIjRDYyNTREXCIsXCIjRkY1NDc1XCIsXCIjRkRFQkE5XCJdLFtcIiNFN0VERUFcIixcIiNGRkM1MkNcIixcIiNGQjBDMDZcIixcIiMwMzBENEZcIixcIiNDRUVDRUZcIl0sW1wiIzM3MzczN1wiLFwiIzhEQjk4NlwiLFwiI0FDQ0U5MVwiLFwiI0JBREI3M1wiLFwiI0VGRUFFNFwiXSxbXCIjMTYxNjE2XCIsXCIjQzk0RDY1XCIsXCIjRTdDMDQ5XCIsXCIjOTJCMzVBXCIsXCIjMUY2NzY0XCJdLFtcIiMyNjI1MUNcIixcIiNFQjBBNDRcIixcIiNGMjY0M0RcIixcIiNGMkE3M0RcIixcIiNBMEU4QjdcIl0sW1wiIzRCM0U0RFwiLFwiIzFFOEM5M1wiLFwiI0RCRDhBMlwiLFwiI0M0QUMzMFwiLFwiI0Q3NEYzM1wiXSxbXCIjOEQ3OTY2XCIsXCIjQThBMzlEXCIsXCIjRDhDOEI4XCIsXCIjRTJEREQ5XCIsXCIjRjhGMUU5XCJdLFtcIiNGMkU4QzRcIixcIiM5OEQ5QjZcIixcIiMzRUM5QTdcIixcIiMyQjg3OUVcIixcIiM2MTY2NjhcIl0sW1wiIzVDQUNDNFwiLFwiIzhDRDE5RFwiLFwiI0NFRTg3OVwiLFwiI0ZDQjY1M1wiLFwiI0ZGNTI1NFwiXV0iLCJjb25zdCBjcmVhdGVTaW1wbGljaWFsQ29tcGxleCA9IHJlcXVpcmUoJ3RocmVlLXNpbXBsaWNpYWwtY29tcGxleCcpKFRIUkVFKTtcbmNvbnN0IHVubGVycCA9IHJlcXVpcmUoJ3VubGVycCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjb21wbGV4LCBvcHQgPSB7fSkge1xuICBjb25zdCB0eXBlID0gb3B0LnR5cGUgfHwgMDtcbiAgY29uc3QgZ2VvbWV0cnkgPSBjcmVhdGVTaW1wbGljaWFsQ29tcGxleChjb21wbGV4KTtcbiAgZ2VvbWV0cnkuY29tcHV0ZUJvdW5kaW5nQm94KCk7XG4gIGNvbnN0IGJib3ggPSBnZW9tZXRyeS5ib3VuZGluZ0JveDtcbiAgXG4gIGNvbnN0IGZhY2VWZXJ0ZXhVdnMgPSBbXTtcbiAgY29uc3QgdmVydGljZXMgPSBnZW9tZXRyeS52ZXJ0aWNlcztcbiAgY29uc3QgZmFjZXMgPSBnZW9tZXRyeS5mYWNlcztcbiAgXG4gIFxuICBjb25zdCBBID0gJ3gnO1xuICBjb25zdCBCID0gdHlwZSA9PT0gMCA/ICd5JyA6ICd6JztcbiAgY29uc3QgcmFkaWFsID0gdHlwZSA9PT0gMDtcblxuICBjb25zdCBtaW5YID0gYmJveC5taW5bQV07XG4gIGNvbnN0IG1heFggPSBiYm94Lm1heFtBXTtcbiAgY29uc3QgbWluWiA9IGJib3gubWluW0JdO1xuICBjb25zdCBtYXhaID0gYmJveC5tYXhbQl07XG4gIGZhY2VzLmZvckVhY2goKGZhY2UsIGkpID0+IHtcbiAgICBjb25zdCBhID0gZmFjZS5hO1xuICAgIGNvbnN0IGIgPSBmYWNlLmI7XG4gICAgY29uc3QgYyA9IGZhY2UuYztcbiAgICBjb25zdCB2YSA9IHZlcnRpY2VzW2FdO1xuICAgIGNvbnN0IHZiID0gdmVydGljZXNbYl07XG4gICAgY29uc3QgdmMgPSB2ZXJ0aWNlc1tjXTtcblxuICAgIGZhY2VWZXJ0ZXhVdnMucHVzaChbXG4gICAgICBnZXRVVih2YSksXG4gICAgICBnZXRVVih2YiksXG4gICAgICBnZXRVVih2YykgICAgICBcbiAgICBdKTtcbiAgfSk7XG4gIGdlb21ldHJ5LmZhY2VWZXJ0ZXhVdnNbMF0gPSBmYWNlVmVydGV4VXZzO1xuICBnZW9tZXRyeS51dnNOZWVkVXBkYXRlID0gdHJ1ZTtcbiAgZ2VvbWV0cnkuZHluYW1pYyA9IHRydWU7XG4gIHJldHVybiBnZW9tZXRyeTtcbiAgXG4gIGZ1bmN0aW9uIGdldFVWICh2ZXJ0KSB7XG4gICAgbGV0IHU7XG4gICAgXG4gICAgaWYgKHJhZGlhbCkge1xuICAgICAgbGV0IGFuZ2xlID0gTWF0aC5hdGFuMih2ZXJ0LnosIHZlcnQueCk7XG4gICAgICBpZiAoYW5nbGUgPCAwKSBhbmdsZSArPSAyICogTWF0aC5QSTtcbiAgICAgIHUgPSBhbmdsZSAvIChNYXRoLlBJICogMik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHUgPSBtaW5YID09PSBtYXhYID8gMCA6IHVubGVycChtaW5YLCBtYXhYLCB2ZXJ0W0FdKTtcbiAgICB9XG4gICAgY29uc3QgdiA9IG1pblogPT09IG1heFogPyAwIDogdW5sZXJwKG1pblosIG1heFosIHZlcnRbQl0pO1xuICAgIHJldHVybiBuZXcgVEhSRUUuVmVjdG9yMih1LCAxIC0gdik7XG4gIH1cbn0iLCJjb25zdCByYW5kb20gPSByZXF1aXJlKCdyYW5kb20tZmxvYXQnKTtcbmNvbnN0IGdlb1BpZWNlUmluZyA9IHJlcXVpcmUoJ2dlby1waWVjZXJpbmcnKTtcbmNvbnN0IGdlb0FyYyA9IHJlcXVpcmUoJ2dlby1hcmMnKTtcbmNvbnN0IHNodWZmbGUgPSByZXF1aXJlKCdhcnJheS1zaHVmZmxlJyk7XG5jb25zdCBjcmVhdGVDb21wbGV4ID0gcmVxdWlyZSgnLi9jcmVhdGVDb21wbGV4Jyk7XG5jb25zdCBQSSA9IE1hdGguUEk7XG5jb25zdCB0d2VlbnIgPSByZXF1aXJlKCd0d2VlbnInKSgpO1xuY29uc3QgZ2xzbGlmeSA9IHJlcXVpcmUoJ2dsc2xpZnknKTtcbmNvbnN0IGlzTW9iaWxlID0gcmVxdWlyZSgnLi9pc01vYmlsZScpO1xuXG5jb25zdCBSRVNFVF9ZID0gWyAtMTIsIC0yIF1cbmNvbnN0IElOSVRJQUxfWSA9IFsgLTEwLCAwIF1cbmNvbnN0IExPV0VTVF9ZID0gUkVTRVRfWVswXTtcblxuY29uc3QgQURESVRJT05BTF9QQVJUUyA9IDQ7XG5jb25zdCBUT1RBTF9QQVJUUyA9IGlzTW9iaWxlID8gNjAgOiAxMDA7XG5jb25zdCBJTklUSUFMX1BBUlRTID0gNTA7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHsgcmVuZGVyZXIsIGNhbWVyYSwgc2NlbmUsIHBhbGV0dGVzLCBlbnZNYXAsIGxvb3AgfSkge1xuICBjb25zdCB3aXJlTWF0ID0gbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICB3aXJlZnJhbWU6IHRydWUsXG4gICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgb3BhY2l0eTogMSxcbiAgICBzaWRlOiBUSFJFRS5Eb3VibGVTaWRlXG4gIH0pO1xuXG4gIGNvbnN0IHBsYWluTWF0ID0gbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICBvcGFjaXR5OiAxLFxuICAgIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGVcbiAgfSk7XG5cbiAgY29uc3Qgc2hhZGVyTWF0ID0gbmV3IFRIUkVFLlJhd1NoYWRlck1hdGVyaWFsKHtcbiAgICBvcGFjaXR5OiAxLFxuICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgIHVuaWZvcm1zOiB7XG4gICAgICBpR2xvYmFsVGltZTogeyB0eXBlOiAnZicsIHZhbHVlOiAwIH0sXG4gICAgICBhc3BlY3Q6IHsgdHlwZTogJ3YyJywgdmFsdWU6IDEgfSxcbiAgICAgIGNvbG9yOiB7IHR5cGU6ICdjJywgdmFsdWU6IG5ldyBUSFJFRS5Db2xvcigpIH0sXG4gICAgICBkYW5jZTogeyB0eXBlOiAnZicsIHZhbHVlOiAwIH1cbiAgICB9LFxuICAgIHZlcnRleFNoYWRlcjogZ2xzbGlmeSgnLi9zaGFkZXIvc2hhcGUudmVydCcpLFxuICAgIGZyYWdtZW50U2hhZGVyOiBnbHNsaWZ5KCcuL3NoYWRlci9zaGFwZS5mcmFnJyksXG4gICAgc2lkZTogVEhSRUUuRG91YmxlU2lkZVxuICB9KTtcblxuICBjb25zdCBzaGFkZXJNYXRXaXJlID0gc2hhZGVyTWF0LmNsb25lKCk7XG4gIHNoYWRlck1hdFdpcmUud2lyZWZyYW1lID0gdHJ1ZTtcblxuICBjb25zdCBtYXRlcmlhbHMgPSBbXG4gICAgd2lyZU1hdCxcbiAgICBwbGFpbk1hdCxcbiAgICBzaGFkZXJNYXQsXG4gICAgc2hhZGVyTWF0V2lyZVxuICBdO1xuXG4gIGxldCBwYWxldHRlSW5kZXggPSAwO1xuICBsZXQgY29sb3JzID0gcGFsZXR0ZXNbcGFsZXR0ZUluZGV4XS5zbGljZSgpO1xuICBcbiAgLy8gXG4gIGNvbnN0IG1lc2hlcyA9IFtdO1xuICBzZXRCYWNrZ3JvdW5kKGNvbG9ycy5zaGlmdCgpKTtcbiAgXG4gIGxldCBjdXJyZW50Q29sb3JzID0gY29sb3JzLnNsaWNlKCk7XG4gIC8vIGNvbnN0IGNvbG9ySW50ZXJ2YWwgPSBzZXRJbnRlcnZhbChuZXh0Q29sb3IsIDUwMDApO1xuICAvLyBuZXh0Q29sb3IoKTtcbiAgLy8gY29uc3QgbWVzaEludGVydmFsID0gc2V0SW50ZXJ2YWwoZW1pdEdlb21ldHJ5LCBNRVNIX0lOVEVSVkFMKVxuICBcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBUT1RBTF9QQVJUUzsgaSsrKSB7XG4gICAgY29uc3QgbWVzaCA9IGFkZENvcmUoeyBhY3RpdmU6IGkgPCBJTklUSUFMX1BBUlRTLCB0eXBlOiBNYXRoLnJhbmRvbSgpID4gMC41ID8gMCA6IDEgfSk7XG4gICAgaWYgKG1lc2ggJiYgaSA8IElOSVRJQUxfUEFSVFMpIHtcbiAgICAgIHJlc2V0TWVzaChtZXNoLCB7IGluaXRpYWw6IHRydWUsIGFuaW1hdGU6IGZhbHNlIH0pO1xuICAgIH1cbiAgfVxuICBcbiAgbGV0IHRpbWUgPSAwO1xuICBjb25zdCB0bXBWZWMgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICBjb25zdCB0bXBDb2xvciA9IG5ldyBUSFJFRS5Db2xvcigpO1xuICB0bXBWZWMuY29weShjYW1lcmEucG9zaXRpb24pO1xuICBjYW1lcmEubG9jYWxUb1dvcmxkKHRtcFZlYyk7XG5cbiAgbG9vcC5vbigndGljaycsIChkdCkgPT4ge1xuICAgIHRpbWUgKz0gZHQgLyAxMDAwO1xuICAgIG1lc2hlcy5mb3JFYWNoKChtKSA9PiB7XG4gICAgICBpZiAobS5tYXRlcmlhbC51bmlmb3Jtcykge1xuICAgICAgICBtLm1hdGVyaWFsLnVuaWZvcm1zLmFzcGVjdC52YWx1ZSA9IHdpbmRvdy5pbm5lcldpZHRoIC8gd2luZG93LmlubmVySGVpZ2h0O1xuICAgICAgICBtLm1hdGVyaWFsLnVuaWZvcm1zLmlHbG9iYWxUaW1lLnZhbHVlID0gdGltZTtcbiAgICAgIH1cbiAgICAgIG0ucm90YXRpb24ueSArPSAoZHQgLyAxMDAwKSAqIG0ucm90YXRpb25GYWN0b3I7XG4gICAgICBtLnBvc2l0aW9uLnkgKz0gKGR0IC8gMTAwMCkgKiBtLnNwZWVkICogYXBpLmdsb2JhbFNwZWVkO1xuICAgICAgaWYgKG0uaXNHcm91cCkge1xuICAgICAgICBtLmNoaWxkcmVuLmZvckVhY2goY2hpbGQgPT4ge1xuICAgICAgICAgIGNoaWxkLnJvdGF0aW9uLnggKz0gKGR0IC8gMTAwMCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgY29uc3QgbWVzaEhlaWdodCA9IG0uYm91bmRpbmdSZWdpb24ubWF4LnkgLSBtLmJvdW5kaW5nUmVnaW9uLm1pbi55O1xuICAgICAgaWYgKG0uYWN0aXZlICYmXG4gICAgICAgICAgKG0ucG9zaXRpb24ueSA+IChtZXNoSGVpZ2h0ICogMiArIHRtcFZlYy55ICsgNSkgfHxcbiAgICAgICAgICBtLnBvc2l0aW9uLnkgPCAoTE9XRVNUX1kgLSBtZXNoSGVpZ2h0ICogMikpKSB7XG4gICAgICAgIG0uYWN0aXZlID0gZmFsc2U7XG4gICAgICAgIG0udmlzaWJsZSA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcblxuICBjb25zdCBhcGkgPSB7XG4gICAgbmV4dEdlb21ldHJ5LFxuICAgIG5leHRDb2xvcixcbiAgICBuZXh0UGFsZXR0ZSxcbiAgICBnZXRGdWxsUGFsZXR0ZSxcbiAgICBzZXRQYWxldHRlLFxuICAgIHJhbmRvbWl6ZU1hdGVyaWFscyxcbiAgICBnbG9iYWxTcGVlZDogMSxcbiAgICBjbGVhckdlb21ldHJ5XG4gIH07XG4gIFxuICByZXR1cm4gYXBpO1xuICBcbiAgZnVuY3Rpb24gcmFuZG9taXplTWF0ZXJpYWxzICgpIHtcbiAgICBtZXNoZXMuZm9yRWFjaChtID0+IHtcbiAgICAgIHRtcENvbG9yLmNvcHkoZ2V0Q29sb3IobSkpO1xuICAgICAgbS5tYXRlcmlhbCA9IG1hdGVyaWFsc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBtYXRlcmlhbHMubGVuZ3RoKV0uY2xvbmUoKTtcbiAgICAgIHNldENvbG9yKG0sIHRtcENvbG9yKTtcbiAgICB9KTtcbiAgfVxuICBcbiAgZnVuY3Rpb24gY2xlYXJHZW9tZXRyeSAoKSB7XG4gICAgbWVzaGVzLmZvckVhY2gobSA9PiB7XG4gICAgICBtLmFjdGl2ZSA9IGZhbHNlO1xuICAgICAgbS52aXNpYmxlID0gZmFsc2U7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRGdWxsUGFsZXR0ZSAoKSB7XG4gICAgcmV0dXJuIHBhbGV0dGVzW3BhbGV0dGVJbmRleCAlIHBhbGV0dGVzLmxlbmd0aF07XG4gIH1cblxuICBmdW5jdGlvbiBzZXRQYWxldHRlIChwYWxldHRlKSB7XG4gICAgY29sb3JzLmxlbmd0aCA9IDA7XG4gICAgY3VycmVudENvbG9ycy5sZW5ndGggPSAwO1xuXG4gICAgY29sb3JzID0gcGFsZXR0ZS5zbGljZSgpO1xuICAgIHNldEJhY2tncm91bmQoY29sb3JzLnNoaWZ0KCkpO1xuICAgIGN1cnJlbnRDb2xvcnMgPSBjb2xvcnMuc2xpY2UoKTtcbiAgICAvLyBjb25zb2xlLmxvZyhcIk5ldyBjb2xvcnNcIiwgY3VycmVudENvbG9ycyk7XG5cbiAgICBtZXNoZXMuZm9yRWFjaChtID0+IHtcbiAgICAgIHNldFJhbmRDb2xvcihtKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG5leHRQYWxldHRlIChvcHQgPSB7fSkge1xuICAgIGxldCBuZXdQYWxldHRlID0gcGFsZXR0ZXNbcGFsZXR0ZUluZGV4KysgJSBwYWxldHRlcy5sZW5ndGhdO1xuICAgIC8vIGlmIChvcHQuc2h1ZmZsZSAhPT0gZmFsc2UpIG5ld1BhbGV0dGUgPSBzaHVmZmxlKG5ld1BhbGV0dGUpO1xuICAgIHNldFBhbGV0dGUobmV3UGFsZXR0ZSk7XG4gIH1cblxuICBmdW5jdGlvbiBuZXh0R2VvbWV0cnkgKG9wdCA9IHt9KSB7XG4gICAgZm9yIChsZXQgaSA9IDAsIGNvdW50ID0gMDsgaSA8IG1lc2hlcy5sZW5ndGggJiYgY291bnQgPCBBRERJVElPTkFMX1BBUlRTOyBpKyspIHtcbiAgICAgIGNvbnN0IG0gPSBtZXNoZXNbaV07XG5cbiAgICAgIGlmICghbS5hY3RpdmUgJiYgKG9wdC50eXBlID09PSBtLnR5cGUgfHwgdHlwZW9mIG9wdC50eXBlID09PSAndW5kZWZpbmVkJykpIHtcbiAgICAgICAgcmVzZXRNZXNoKG0pO1xuICAgICAgICBjb3VudCsrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc2V0TWVzaCAobWVzaCwgb3B0ID0ge30pIHtcbiAgICBjb25zdCB5T2ZmID0gb3B0LmluaXRpYWwgPyBJTklUSUFMX1kgOiBSRVNFVF9ZO1xuICAgIG1lc2gucG9zaXRpb24ueSA9IHJhbmRvbSh5T2ZmWzBdLCB5T2ZmWzFdKTtcbiAgICBtZXNoLmFjdGl2ZSA9IHRydWU7XG4gICAgbWVzaC52aXNpYmxlID0gdHJ1ZTtcbiAgICBpZiAobWVzaC5tYXRlcmlhbC51bmlmb3Jtcykge1xuICAgICAgbWVzaC5tYXRlcmlhbC51bmlmb3Jtcy5kYW5jZS52YWx1ZSA9IE1hdGgucmFuZG9tKCkgPiAwLjUgPyByYW5kb20oMCwgMSkgOiAwO1xuICAgIH1cbiAgICBzZXRSYW5kQ29sb3IobWVzaCk7XG4gICAgaWYgKG9wdC5hbmltYXRlICE9PSBmYWxzZSkge1xuICAgICAgY29uc3QgbWluU2NhbGUgPSAxZS0xMDtcbiAgICAgIGNvbnN0IHR3ZWVuID0geyB2YWx1ZTogMCB9O1xuICAgICAgbWVzaC5zY2FsZS5zZXQobWluU2NhbGUsIG1pblNjYWxlLCBtaW5TY2FsZSk7XG4gICAgICB0d2VlbnIudG8odHdlZW4sIHsgZHVyYXRpb246IDAuNSwgdmFsdWU6IDEsIGVhc2U6ICdleHBvT3V0JyB9KVxuICAgICAgICAub24oJ3VwZGF0ZScsICgpID0+IHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHR3ZWVuLnZhbHVlO1xuICAgICAgICAgIG1lc2guc2NhbGUuc2V0KHZhbHVlLCB2YWx1ZSwgdmFsdWUpO1xuICAgICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBuZXh0Q29sb3IgKCkge1xuICAgIGlmIChjb2xvcnMubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGN1cnJlbnRDb2xvcnMucHVzaChjb2xvcnMuc2hpZnQoKSk7XG4gIH1cblxuICBmdW5jdGlvbiBhZGRDb3JlIChvcHQgPSB7fSkge1xuICAgIGxldCBtZXNoO1xuICAgIGlmIChvcHQudHlwZSA9PT0gMCkge1xuICAgICAgY29uc3QgbnVtUGllY2VzID0gTWF0aC5mbG9vcihyYW5kb20oNSwgNDApKTtcbiAgICAgIGNvbnN0IHBpZWNlU2l6ZSA9IHJhbmRvbSgwLjI1LCAwLjc1KTtcbiAgICAgIG1lc2ggPSBhZGRHZW9tKGdlb1BpZWNlUmluZyh7XG4gICAgICAgIHk6IDAsXG4gICAgICAgIGhlaWdodDogcmFuZG9tKDAuMDEsIDEuMCksXG4gICAgICAgIHJhZGl1czogcmFuZG9tKDAuMSwgMS41KSxcbiAgICAgICAgbnVtUGllY2VzOiBudW1QaWVjZXMsXG4gICAgICAgIHF1YWRzUGVyUGllY2U6IDEsXG4gICAgICAgIHBpZWNlU2l6ZTogKFBJICogMikgKiAxIC8gbnVtUGllY2VzICogcGllY2VTaXplXG4gICAgICB9KSwgb3B0KTtcbiAgICB9IGVsc2UgaWYgKG9wdC50eXBlID09PSAxKSB7XG4gICAgICBjb25zdCByYWRpdXMgPSByYW5kb20oMCwgMik7XG4gICAgICBtZXNoID0gYWRkR2VvbShnZW9BcmMoe1xuICAgICAgICB5OiAwLFxuICAgICAgICBzdGFydFJhZGlhbjogcmFuZG9tKC1QSSwgUEkpLFxuICAgICAgICBlbmRSYWRpYW46IHJhbmRvbSgtUEksIFBJKSxcbiAgICAgICAgaW5uZXJSYWRpdXM6IHJhZGl1cyxcbiAgICAgICAgb3V0ZXJSYWRpdXM6IHJhZGl1cyArIHJhbmRvbSgwLjAwNSwgMC4xNSksXG4gICAgICAgIG51bUJhbmRzOiAyLFxuICAgICAgICBudW1TbGljZXM6IDkwLFxuICAgICAgfSksIG9wdCk7XG4gICAgfVxuXG4gICAgaWYgKG1lc2ggJiYgIW9wdC5hY3RpdmUpIHtcbiAgICAgIG1lc2guYWN0aXZlID0gZmFsc2U7XG4gICAgICBtZXNoLnZpc2libGUgPSBmYWxzZTtcbiAgICB9XG4gICAgaWYgKG1lc2gpIG1lc2gudHlwZSA9IG9wdC50eXBlO1xuICAgIHJldHVybiBtZXNoO1xuICB9XG5cbiAgZnVuY3Rpb24gYWRkR2VvbSAoY29tcGxleCwgb3B0ID0ge30pIHtcbiAgICBpZiAoY29tcGxleC5jZWxscy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGdlb20gPSBjcmVhdGVDb21wbGV4KGNvbXBsZXgsIG9wdCk7XG4gICAgaWYgKCFnZW9tKSByZXR1cm47XG4gICAgbGV0IG1hdCA9IG1hdGVyaWFsc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBtYXRlcmlhbHMubGVuZ3RoKV0uY2xvbmUoKTtcbiAgICBjb25zdCBtZXNoID0gYWRkTWVzaChnZW9tLCBtYXQsIG9wdCk7XG4gICAgc2V0UmFuZENvbG9yKG1lc2gpO1xuICAgIHJldHVybiBtZXNoO1xuICB9XG5cbiAgZnVuY3Rpb24gYWRkTWVzaCAoZ2VvbSwgbWF0LCBvcHQpIHtcbiAgICBsZXQgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb20sIG1hdCk7XG4gICAgXG4gICAgaWYgKG9wdC5taXJyb3IpIHtcbiAgICAgIGNvbnN0IG9mZnNldCA9IG9wdC5vZmZzZXQgfHwgMDtcbiAgICAgIGNvbnN0IGdyb3VwID0gbmV3IFRIUkVFLk9iamVjdDNEKCk7XG4gICAgICBjb25zdCBtaXJyb3JDb3VudCA9IDQ7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pcnJvckNvdW50OyBpKyspIHtcbiAgICAgICAgY29uc3QgYSA9IFBJICogMiAqIChpIC8gbWlycm9yQ291bnQpO1xuICAgICAgICBjb25zdCBtMiA9IG1lc2guY2xvbmUoKTtcbiAgICAgICAgLy8gbTIucm90YXRpb24ueSA9IC1hO1xuICAgICAgICAvLyBtMi5yb3RhdGlvbi56ID0gLU1hdGguUEk7XG4gICAgICAgIG0yLnBvc2l0aW9uLnggPSBNYXRoLmNvcyhhKSAqIG9mZnNldDtcbiAgICAgICAgbTIucG9zaXRpb24ueiA9IE1hdGguc2luKGEpICogb2Zmc2V0O1xuICAgICAgICBncm91cC5hZGQobTIpO1xuICAgICAgfVxuICAgICAgbWVzaGVzLnB1c2goZ3JvdXApO1xuICAgICAgbWVzaCA9IGdyb3VwO1xuICAgICAgbWVzaC5pc0dyb3VwID0gdHJ1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgbWVzaGVzLnB1c2gobWVzaCk7XG4gICAgfVxuICAgIG1lc2guYm91bmRpbmdSZWdpb24gPSBuZXcgVEhSRUUuQm94MygpLnNldEZyb21PYmplY3QobWVzaCk7XG4gICAgbWVzaC5yb3RhdGlvbkZhY3RvciA9IHJhbmRvbSgtMC41LCAwLjUpO1xuICAgIG1lc2guc3BlZWQgPSByYW5kb20oMC44LCAxKTtcbiAgICBtZXNoLmFjdGl2ZSA9IHRydWU7XG4gICAgbWVzaC5wb3NpdGlvbi55ID0gcmFuZG9tKElOSVRJQUxfWVswXSwgSU5JVElBTF9ZWzFdKTtcbiAgICBzY2VuZS5hZGQobWVzaCk7XG4gICAgcmV0dXJuIG1lc2g7XG4gIH1cblxuICBmdW5jdGlvbiByYW5kQ29sb3IgKCkge1xuICAgIHJldHVybiBjdXJyZW50Q29sb3JzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGN1cnJlbnRDb2xvcnMubGVuZ3RoKV07XG4gIH1cblxuICBmdW5jdGlvbiBzZXRSYW5kQ29sb3IgKG1lc2gpIHtcbiAgICB2YXIgbWF0ID0gbWVzaC5tYXRlcmlhbDtcbiAgICBpZiAobWF0LmNvbG9yKSBtYXQuY29sb3Iuc2V0U3R5bGUocmFuZENvbG9yKCkpO1xuICAgIGVsc2UgbWF0LnVuaWZvcm1zLmNvbG9yLnZhbHVlLnNldFN0eWxlKHJhbmRDb2xvcigpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldENvbG9yIChtZXNoLCBjb2xvcikge1xuICAgIHZhciBtYXQgPSBtZXNoLm1hdGVyaWFsO1xuICAgIGlmIChtYXQuY29sb3IpIG1hdC5jb2xvci5jb3B5KGNvbG9yKTtcbiAgICBlbHNlIG1hdC51bmlmb3Jtcy5jb2xvci52YWx1ZS5jb3B5KGNvbG9yKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldENvbG9yIChtZXNoKSB7XG4gICAgdmFyIG1hdCA9IG1lc2gubWF0ZXJpYWw7XG4gICAgaWYgKG1hdC5jb2xvcikgcmV0dXJuIG1hdC5jb2xvcjtcbiAgICBlbHNlIHJldHVybiBtYXQudW5pZm9ybXMuY29sb3IudmFsdWU7XG4gIH1cbiAgXG4gIGZ1bmN0aW9uIHNldEJhY2tncm91bmQgKGNvbG9yKSB7XG4gICAgcmVuZGVyZXIuc2V0Q2xlYXJDb2xvcihjb2xvciwgMSk7XG4gICAgZG9jdW1lbnQuYm9keS5zdHlsZS5iYWNrZ3JvdW5kID0gY29sb3I7XG4gIH1cbn07XG4iLCJtb2R1bGUuZXhwb3J0cz1bW1wiIzMwMDAzMFwiLFwiIzQ4MDA0OFwiLFwiIzYwMTg0OFwiLFwiI0MwNDg0OFwiLFwiI0YwNzI0MVwiXSxbXCIjRThERENCXCIsXCIjQ0RCMzgwXCIsXCIjMDM2NTY0XCIsXCIjMDMzNjQ5XCIsXCIjMDMxNjM0XCJdLFtcIiMzNDM4MzhcIixcIiMwMDVGNkJcIixcIiMwMDhDOUVcIixcIiMwMEI0Q0NcIixcIiMwMERGRkNcIl0sW1wiI0I5RDdEOVwiLFwiIzY2ODI4NFwiLFwiIzJBMjgyOVwiLFwiIzQ5MzczNlwiLFwiIzdCM0IzQlwiXSxbXCIjRjBEOEE4XCIsXCIjM0QxQzAwXCIsXCIjODZCOEIxXCIsXCIjRjJENjk0XCIsXCIjRkEyQTAwXCJdLFtcIiM1RDQxNTdcIixcIiM4Mzg2ODlcIixcIiNBOENBQkFcIixcIiNDQUQ3QjJcIixcIiNFQkUzQUFcIl0sW1wiIzM1MTMzMFwiLFwiIzQyNDI1NFwiLFwiIzY0OTA4QVwiLFwiI0U4Q0FBNFwiLFwiI0NDMkE0MVwiXSxbXCIjNDEzRTRBXCIsXCIjNzM2MjZFXCIsXCIjQjM4MTg0XCIsXCIjRjBCNDlFXCIsXCIjRjdFNEJFXCJdLFtcIiNGRTQzNjVcIixcIiNGQzlEOUFcIixcIiNGOUNEQURcIixcIiNDOEM4QTlcIixcIiM4M0FGOUJcIl0sW1wiIzQ5MEEzRFwiLFwiI0JEMTU1MFwiLFwiI0U5N0YwMlwiLFwiI0Y4Q0EwMFwiLFwiIzhBOUIwRlwiXSxbXCIjMDBBMEIwXCIsXCIjNkE0QTNDXCIsXCIjQ0MzMzNGXCIsXCIjRUI2ODQxXCIsXCIjRURDOTUxXCJdXSIsImNvbnN0IHR3ZWVuciA9IHJlcXVpcmUoJ3R3ZWVucicpKCk7XG5jb25zdCBjc3MgPSByZXF1aXJlKCdkb20tY3NzJyk7XG5jb25zdCBpc01vYmlsZSA9IHJlcXVpcmUoJy4vaXNNb2JpbGUnKTtcbmNvbnN0IG5vb3AgPSBmdW5jdGlvbiAoKSB7fTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob3B0ID0ge30sIGNiID0gbm9vcCkge1xuICBjb25zdCBpbnRybzFhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmludHJvLTFhJyk7XG4gIGNvbnN0IGludHJvMWIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuaW50cm8tMWInKTtcbiAgY29uc3QgaW50cm8yID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmludHJvLTInKTtcbiAgY29uc3QgaW50cm8zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmludHJvLTMnKTtcbiAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmhlYWRlci1jb250YWluZXInKTtcbiAgY29uc3QgbG9nbyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5sb2dvLWNvbnRhaW5lcicpO1xuICBjb25zdCBpbnRyb0NvbnRhbmllciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbnRybycpO1xuICBjb25zdCB5T2ZmID0gMTA7XG4gIGNvbnN0IGdsb2JhbER1cmF0aW9uID0gMC4yNTtcbiAgY29uc3QgZWxlbWVudHNUb0hpZGUgPSBbIGhlYWRlciwgbG9nbyBdLmZpbHRlcihCb29sZWFuKTtcbiAgLy8gY29uc3QgV0FJVF9USU1FX0EgPSAxLjU7XG4gIGNvbnN0IFdBSVRfVElNRV9CID0gMy41O1xuXG4gIGxldCBmaW5pc2hlZEVhcmx5ID0gZmFsc2U7XG4gIGNvbnN0IGludGVyYWN0aW9ucyA9IG9wdC5pbnRlcmFjdGlvbnM7XG5cbiAgbGV0IGRlbGF5ZWRSZWxlYXNlU3BhY2ViYXIgPSBudWxsO1xuXG4gIGNvbnN0IGludHJvSGludCA9IGlzTW9iaWxlID8gaW50cm8xYSA6IGludHJvMWI7XG4gIGlmIChpc01vYmlsZSkge1xuICAgIGludHJvMi5pbm5lckhUTUwgPSAnPHNwYW4gY2xhc3M9XCJzcGFjZWJhclwiPnRhcDwvc3Bhbj4gYW5kIGhvbGQgdG8gbG9hZCBhIG5ldyB0cmFjayc7XG4gICAgaW50cm8zLmlubmVySFRNTCA9ICdSZWxlYXNlIDxzcGFuIGNsYXNzPVwic3BhY2ViYXJcIj50YXA8L3NwYW4+IHRvIHBsYXknO1xuICB9XG5cbiAgY29uc3QgaW50cm9EZWxheSA9IDAuMDtcbiAgYW5pbWF0ZUluKGhlYWRlciwge1xuICAgIGNoaWxkVGFnTmFtZTogJ2RpdidcbiAgfSk7XG4gIHNob3dJbnRyb1RyYWNrTmFtZSgpO1xuXG4gIGZ1bmN0aW9uIHNob3dJbnRyb1RyYWNrTmFtZSAoKSB7XG4gICAgYW5pbWF0ZUluKGludHJvSGludCwgeyBkZWxheTogaW50cm9EZWxheSArIDAuNSB9LCAoKSA9PiB7XG4gICAgICBhbmltYXRlT3V0KGludHJvSGludCwgeyBkZWxheTogV0FJVF9USU1FX0IgfSwgKCkgPT4ge1xuICAgICAgICBzaG93SWRsZVNwbGFzaCgpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBzaG93SWRsZVNwbGFzaCAoKSB7XG4gICAgYW5pbWF0ZUluKGludHJvMik7XG4gICAgaW50ZXJhY3Rpb25zLmVuYWJsZSgpO1xuICAgIGludGVyYWN0aW9ucy5vbmNlKCdzdGFydCcsICgpID0+IHtcbiAgICAgIGhpZGVMb2dvcygpO1xuICAgICAgYW5pbWF0ZU91dChpbnRybzIsIHt9LCAoKSA9PiB7XG4gICAgICAgIGlmICghZmluaXNoZWRFYXJseSkge1xuICAgICAgICAgIGRlbGF5ZWRSZWxlYXNlU3BhY2ViYXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIGFuaW1hdGVJbihpbnRybzMpO1xuICAgICAgICAgIH0sIDY1MCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIGludGVyYWN0aW9ucy5vbmNlKCdzdG9wJywgKCkgPT4ge1xuICAgICAgZmluaXNoZWRFYXJseSA9IHRydWU7XG4gICAgICBhbmltYXRlT3V0KGludHJvMyk7XG4gICAgICBvbkZpbmlzaGVkKCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBvbkZpbmlzaGVkICgpIHtcbiAgICBpZiAoZGVsYXllZFJlbGVhc2VTcGFjZWJhcikgY2xlYXJUaW1lb3V0KGRlbGF5ZWRSZWxlYXNlU3BhY2ViYXIpO1xuICAgIGludHJvQ29udGFuaWVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgaGlkZUxvZ29zKCk7XG4gICAgY2IoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhpZGVMb2dvcyAoKSB7XG4gICAgZWxlbWVudHNUb0hpZGUuZm9yRWFjaChlID0+IHtcbiAgICAgIC8vIGFuaW1hdGVPdXQoZSwgeyBkdXJhdGlvbjogMSB9KTtcbiAgICAgIGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFuaW1hdGVJbiAoZWxlbWVudCwgb3B0ID0ge30sIGNiID0gbm9vcCkge1xuICAgIGxldCBkZWxheSA9IG9wdC5kZWxheSB8fCAwO1xuICAgIGVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cbiAgICBjb25zdCBkdXJhdGlvbiA9IHR5cGVvZiBvcHQuZHVyYXRpb24gPT09ICdudW1iZXInID8gb3B0LmR1cmF0aW9uIDogZ2xvYmFsRHVyYXRpb247XG4gICAgY29uc3QgY2hpbGRyZW4gPSBnZXRBbmltYXRhYmxlcyhlbGVtZW50LCBvcHQpO1xuICAgIGNoaWxkcmVuLmZvckVhY2goKGNoaWxkLCBpKSA9PiB7XG4gICAgICBjb25zdCB0d2VlbiA9IHsgb3BhY2l0eTogMCwgeU9mZiwgZWxlbWVudDogY2hpbGQgfTtcbiAgICAgIHVwZGF0ZSh7IHRhcmdldDogdHdlZW4gfSk7XG4gICAgICBjb25zdCBsYXN0VHdlZW4gPSB0d2VlbnIudG8odHdlZW4sIHsgZGVsYXksIG9wYWNpdHk6IDEsIGR1cmF0aW9uLCBlYXNlOiAncXVhZE91dCcgfSlcbiAgICAgICAgLm9uKCd1cGRhdGUnLCB1cGRhdGUpO1xuICAgICAgdHdlZW5yLnRvKHR3ZWVuLCB7IGRlbGF5LCB5T2ZmOiAwLCBkdXJhdGlvbjogZHVyYXRpb24gKiAwLjUsIGVhc2U6ICdleHBvT3V0JyB9KTtcbiAgICAgIGRlbGF5ICs9IDAuMTtcbiAgICAgIGlmIChpID09PSBjaGlsZHJlbi5sZW5ndGggLSAxKSBsYXN0VHdlZW4ub24oJ2NvbXBsZXRlJywgY2IpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gYW5pbWF0ZU91dCAoZWxlbWVudCwgb3B0ID0ge30sIGNiID0gbm9vcCkge1xuICAgIGxldCBkZWxheSA9IG9wdC5kZWxheSB8fCAwO1xuICAgIGNvbnN0IGR1cmF0aW9uID0gdHlwZW9mIG9wdC5kdXJhdGlvbiA9PT0gJ251bWJlcicgPyBvcHQuZHVyYXRpb24gOiBnbG9iYWxEdXJhdGlvbjtcbiAgICBjb25zdCBjaGlsZHJlbiA9IGdldEFuaW1hdGFibGVzKGVsZW1lbnQsIG9wdCk7XG4gICAgY2hpbGRyZW4ucmV2ZXJzZSgpO1xuICAgIGNoaWxkcmVuLmZvckVhY2goKGNoaWxkLCBpKSA9PiB7XG4gICAgICBjb25zdCB0d2VlbiA9IHsgb3BhY2l0eTogMSwgeU9mZjogMCwgZWxlbWVudDogY2hpbGQgfTtcbiAgICAgIHVwZGF0ZSh7IHRhcmdldDogdHdlZW4gfSk7XG4gICAgICB0d2VlbnIudG8odHdlZW4sIHsgZGVsYXksIG9wYWNpdHk6IDAsIGR1cmF0aW9uOiBkdXJhdGlvbiAqIDAuMjUsIGVhc2U6ICdxdWFkT3V0JyB9KVxuICAgICAgY29uc3QgbGFzdFR3ZWVuID0gdHdlZW5yLnRvKHR3ZWVuLCB7IGRlbGF5LCB5T2ZmOiB5T2ZmLCBkdXJhdGlvbjogZHVyYXRpb24gKiAwLjUsIGVhc2U6ICdleHBvT3V0JyB9KVxuICAgICAgICAub24oJ3VwZGF0ZScsIHVwZGF0ZSk7XG4gICAgICBkZWxheSArPSAwLjA3NTtcbiAgICAgIGlmIChpID09PSBjaGlsZHJlbi5sZW5ndGggLSAxKSB7XG4gICAgICAgIGxhc3RUd2Vlbi5vbignY29tcGxldGUnLCAoKSA9PiB7XG4gICAgICAgICAgZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgIGNiKCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlIChldikge1xuICAgIGNvbnN0IHR3ZWVuID0gZXYudGFyZ2V0O1xuICAgIGNzcyh0d2Vlbi5lbGVtZW50LCB7XG4gICAgICB0cmFuc2Zvcm06IGB0cmFuc2xhdGVZKCR7dHdlZW4ueU9mZn1weClgLFxuICAgICAgb3BhY2l0eTogdHdlZW4ub3BhY2l0eVxuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0QW5pbWF0YWJsZXMgKGVsZW1lbnQsIG9wdCA9IHt9KSB7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwob3B0LmNoaWxkVGFnTmFtZSB8fCAncCcpKTtcbiAgICBpZiAoY2hpbGRyZW4ubGVuZ3RoID09PSAwKSBjaGlsZHJlbi5wdXNoKGVsZW1lbnQpO1xuICAgIHJldHVybiBjaGlsZHJlbjtcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSAvKEFuZHJvaWR8aVBob25lfGlQb2R8aVBhZCkvaS50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpIiwiY29uc3QgZm9udCA9ICdmb250LWZhbWlseTogXCJOb3RvU2Fuc1wiLCBcIkhlbHZldGljYVwiLCBzYW5zLXNlcmlmOyc7XG4vLyBjb25zdCBrYmQgPSBgXG4vLyAgIGRpc3BsYXk6IGlubGluZS1ibG9jaztcbi8vICAgcGFkZGluZzogMnB4IDRweDtcbi8vICAgZm9udC1zaXplOiAxMXB4O1xuLy8gICBsaW5lLWhlaWdodDogMTBweDtcbi8vICAgY29sb3I6ICM1NTU7XG4vLyAgIHZlcnRpY2FsLWFsaWduOiBtaWRkbGU7XG4vLyAgIGJhY2tncm91bmQtY29sb3I6ICNmY2ZjZmM7XG4vLyAgIGJvcmRlcjogc29saWQgMXB4ICNjY2M7XG4vLyAgIGJvcmRlci1ib3R0b20tY29sb3I6ICNiYmI7XG4vLyAgIGJvcmRlci1yYWRpdXM6IDNweDtcbi8vICAgYm94LXNoYWRvdzogaW5zZXQgMCAtMXB4IDAgI2JiYjtcbi8vIGAudHJpbSgpO1xuXG5jb25zdCBhcnRpc3QgPSAnUGlsb3Rwcmllc3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtc2cpIHtcbiAgY29uc29sZS5sb2coYCVjJHttc2d9YCwgZm9udCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5pbnRybyA9IGZ1bmN0aW9uIChtc2cpIHtcbiAgY29uc29sZS5sb2coW1xuICAgICclY/CfjrkgYXVkaW9ncmFwaC54eXonLFxuICAgICclY1xcdFxcdENyZWF0ZWQgYnkgTWF0dCBEZXNMYXVyaWVycyAoJWNodHRwOi8vdHdpdHRlci5jb20vbWF0dGRlc2wvJWMpJyxcbiAgICBgJWNcXHRcXHRBdWRpbyBieSAke2FydGlzdH1gLFxuICAgICclY1xcdFxcdENvbG9yIHBhbGV0dGVzIHNvdXJjZWQgZnJvbSBDb2xvdXJMb3ZlcnMuY29tJyxcbiAgICAnJWNcXHRcXHRXaXRoIFVYIGhlbHAgZnJvbSBNZWxpc3NhIEhlcm5hbmRleidcbiAgXS5qb2luKCdcXG4nKSwgYCR7Zm9udH0gYmFja2dyb3VuZDogI2VmZWZlZjsgcGFkZGluZzogMXB4IDVweDtgLCBmb250LCBgJHtmb250fSBjb2xvcjogIzNhYTNlMDtgLCBmb250LCBmb250LCBmb250LCBmb250KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLmVhc3RlckVnZyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gdG8gYmUgZGVjaWRlZC4uLlxuICAvLyBjb25zb2xlLmxvZygnJWNIaW50OiVjIEhvbGQgJWNDJWMgZm9yIHNvbWV0aGluZyBjb29sJywgYCR7Zm9udH0gY29sb3I6ICNmZjY2MDBgLCBmb250LCBrYmQsIGZvbnQpXG59O1xuIiwiY29uc3Qgc2h1ZmZsZSA9IHJlcXVpcmUoJ2FycmF5LXNodWZmbGUnKTtcbmNvbnN0IGluZGV4T2ZBcnJheSA9IHJlcXVpcmUoJ2luZGV4LW9mLWFycmF5Jyk7XG5jb25zdCBwYWxldHRlcyA9IHJlcXVpcmUoJy4vY29sb3ItcGFsZXR0ZXMuanNvbicpLnNsaWNlKDAsIDIwMCk7XG5jb25zdCBpbnRyb1BhbGV0dGVzID0gcmVxdWlyZSgnLi9pbnRyby1wYWxldHRlcy5qc29uJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBmaXJzdCA9IHNodWZmbGUoaW50cm9QYWxldHRlcylbMF07XG5cbiAgY29uc3QgcmV0ID0gc2h1ZmZsZShwYWxldHRlcyk7XG4gIGNvbnN0IGlkeCA9IGluZGV4T2ZBcnJheShyZXQsIGZpcnN0KTtcbiAgaWYgKGlkeCAhPT0gLTEpIHJldC5zcGxpY2UoaWR4LCAxKTtcbiAgcmV0LnVuc2hpZnQoZmlyc3QpO1xuICByZXR1cm4gcmV0O1xufTtcblxuLy8gY29uc3Qgb2ZmbGluZSA9IHJlcXVpcmUoJy4vb2ZmbGluZS1wYWxldHRlcycpO1xuLy8gY29uc3QgY29sb3JEaWZmID0gcmVxdWlyZSgnY29sb3ItZGlmZicpO1xuLy8gY29uc3QgaGV4UmdiID0gcmVxdWlyZSgnaGV4LXJnYicpO1xuLy8gY29uc3QgbHVtaW5hbmNlID0gcmVxdWlyZSgnY29sb3ItbHVtaW5hbmNlJyk7XG4vLyBjb25zdCByZ2IyaHNsID0gcmVxdWlyZSgnZmxvYXQtcmdiMmhzbCcpO1xuXG4vLyBjb25zdCBoZXhSZ2JGbG9hdCA9IChoZXgpID0+IGhleFJnYihoZXgpLm1hcCh4ID0+IHggLyAyNTUpO1xuXG4vLyBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjYikge1xuLy8gICBwcm9jZXNzLm5leHRUaWNrKCgpID0+IHtcbi8vICAgICBsZXQgcGFyc2VkID0gcGFyc2Uob2ZmbGluZSk7XG4vLyAgICAgd2luZG93LnBhcnNlZCA9IHBhcnNlZDtcbi8vICAgICBjb25zb2xlLmxvZyhwYXJzZWQpO1xuLy8gICAgIHBhcnNlZCA9IHNodWZmbGUocGFyc2VkKTtcbi8vICAgICAvLyBwYXJzZWQuc29ydChzb3J0ZXIpO1xuICAgIFxuLy8gICAgIGNiKHBhcnNlZCk7XG4vLyAgIH0pO1xuICBcbi8vICAgZnVuY3Rpb24gc29ydGVyIChhLCBiKSB7XG4vLyAgICAgY29uc3QgY0EgPSBoZXhSZ2JGbG9hdChhWzBdKTtcbi8vICAgICBjb25zdCBjQiA9IGhleFJnYkZsb2F0KGJbMF0pO1xuLy8gICAgIC8vIGNvbnN0IGhzbEEgPSByZ2IyaHNsKGNBKTtcbi8vICAgICAvLyBjb25zdCBoc2xCID0gcmdiMmhzbChjQik7XG4vLyAgICAgLy8gcmV0dXJuIGhzbEFbMl0gLSBoc2xCWzJdO1xuLy8gICAgIGNvbnN0IGxBID0gbHVtaW5hbmNlKGNBWzBdLCBjQVsxXSwgY0FbMl0pO1xuLy8gICAgIGNvbnN0IGxCID0gbHVtaW5hbmNlKGNCWzBdLCBjQlsxXSwgY0JbMl0pO1xuLy8gICAgIHJldHVybiBsQSAtIGxCO1xuLy8gICAgIGNvbnN0IGNBT2JqID0geyBSOiBjQVswXSwgRzogY0FbMV0sIEI6IGNBWzJdIH07XG4vLyAgICAgY29uc3QgY0JPYmogPSB7IFI6IGNCWzBdLCBHOiBjQlsxXSwgQjogY0JbMl0gfTtcbi8vICAgICBjb25zdCBkaWZmID0gY29sb3JEaWZmLmRpZmYoY29sb3JEaWZmLnJnYl90b19sYWIoY0FPYmopLCBjb2xvckRpZmYucmdiX3RvX2xhYihjQk9iaikpO1xuLy8gICAgIHJldHVybiBkaWZmO1xuLy8gICB9XG4vLyB9O1xuXG4vLyBmdW5jdGlvbiBwYXJzZSAoanNvbikge1xuLy8gICByZXR1cm4ganNvbi5tYXAocmVzdWx0ID0+IHtcbi8vICAgICByZXR1cm4gcmVzdWx0LmNvbG9ycy5zbGljZSgwLCAxNSkubWFwKHggPT4gYCMke3h9YCk7XG4vLyAgIH0pO1xuLy8gfVxuIiwiY29uc3QgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xuY29uc3QgaXNNb2JpbGUgPSByZXF1aXJlKCcuL2lzTW9iaWxlJyk7XG5jb25zdCBsb2cgPSByZXF1aXJlKCcuL2xvZycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh7IHNjZW5lLCB3aGl0ZVBhbGV0dGUsIGF1ZGlvLCBjYW1lcmEsIGNvbnRyb2xzLCBnZW8gfSkge1xuICBsZXQgcHJldmlvdXNQYWxldHRlID0gZ2VvLmdldEZ1bGxQYWxldHRlKCk7XG4gIGNvbnN0IHJldCA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcbiAgcmV0LmtleURvd24gPSBmYWxzZTtcbiAgcmV0LmVhc3RlckVnZ0Rvd24gPSBmYWxzZTtcbiAgcmV0LmVuYWJsZSA9IGVuYWJsZTtcbiAgbGV0IGlzTG9hZGVkID0gZmFsc2U7XG5cbiAgY29uc3Qgb3JpZ2luYWxEaXN0YW5jZSA9IGNvbnRyb2xzLmRpc3RhbmNlO1xuICBjb25zdCB0cmFja0NvbnRhaW5lciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy50cmFjay1hbGlnbmVyJyk7XG4gIGNvbnN0IHRyYWNrTmFtZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy50cmFjay1uYW1lJyk7XG4gIGNvbnN0IHRyYWNrTnVtYmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnRyYWNrLW51bWJlcicpO1xuXG4gIHJldHVybiByZXQ7XG5cbiAgZnVuY3Rpb24gZW5hYmxlICgpIHtcbiAgICBsb2cuZWFzdGVyRWdnKCk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZXYpID0+IHtcbiAgICAgIGlmIChldi5rZXlDb2RlID09PSAzMiAmJiAhcmV0LmtleURvd24pIHtcbiAgICAgICAgYmVnaW5FdmVudCgpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9IGVsc2UgaWYgKGV2LmtleUNvZGUgPT09IDY3ICYmICFyZXQuZWFzdGVyRWdnRG93bikge1xuICAgICAgICAvLyByZXQuZWFzdGVyRWdnRG93biA9IHRydWU7XG4gICAgICAgIC8vIGNvbnRyb2xzLnBvc2l0aW9uWzBdID0gMTA7XG4gICAgICAgIC8vIGNvbnRyb2xzLnBvc2l0aW9uWzJdID0gMDtcbiAgICAgICAgLy8gY29udHJvbHMuZGlzdGFuY2UgPSA1O1xuICAgICAgICAvLyByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgKGV2KSA9PiB7XG4gICAgICBpZiAoZXYua2V5Q29kZSA9PT0gMzIgJiYgcmV0LmtleURvd24pIHtcbiAgICAgICAgZW5kRXZlbnQoKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSBlbHNlIGlmIChldi5rZXlDb2RlID09PSA2NyAmJiByZXQuZWFzdGVyRWdnRG93bikge1xuICAgICAgICAvLyByZXQuZWFzdGVyRWdnRG93biA9IGZhbHNlO1xuICAgICAgICAvLyBjb250cm9scy5wb3NpdGlvblswXSA9IDA7XG4gICAgICAgIC8vIGNvbnRyb2xzLnBvc2l0aW9uWzJdID0gMDtcbiAgICAgICAgLy8gY29udHJvbHMuZGlzdGFuY2UgPSBvcmlnaW5hbERpc3RhbmNlO1xuICAgICAgICAvLyByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoaXNNb2JpbGUpIHtcbiAgICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNjYW52YXMnKTtcbiAgICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0JywgYmVnaW5FdmVudCk7XG4gICAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hlbmQnLCBlbmRFdmVudCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYmVnaW5FdmVudCAoKSB7XG4gICAgcmV0LmVtaXQoJ3N0YXJ0Jyk7XG4gICAgcHJldmlvdXNQYWxldHRlID0gZ2VvLmdldEZ1bGxQYWxldHRlKCk7XG4gICAgZ2VvLnNldFBhbGV0dGUod2hpdGVQYWxldHRlKTtcbiAgICByZXQua2V5RG93biA9IHRydWU7XG4gICAgXG4gICAgaXNMb2FkZWQgPSBmYWxzZTtcbiAgICBhdWRpby5vbmNlKCdyZWFkeScsICgpID0+IHtcbiAgICAgIGlzTG9hZGVkID0gdHJ1ZTtcbiAgICB9KTtcbiAgICBjb25zdCBuYW1lID0gYXVkaW8ucXVldWUoKTtcbiAgICBzZXR1cE5hbWUobmFtZSk7XG4gICAgYXVkaW8uZWZmZWN0ID0gMTtcbiAgICBnZW8uZ2xvYmFsU3BlZWQgPSAwLjc1O1xuICAgIGNvbnRyb2xzLnBvc2l0aW9uWzFdID0gLTE7XG4gIH1cblxuICBmdW5jdGlvbiBlbmRFdmVudCAoKSB7XG4gICAgcmV0LmtleURvd24gPSBmYWxzZTtcbiAgICBzZXR1cE5hbWUobnVsbCk7XG4gICAgZ2VvLnNldFBhbGV0dGUocHJldmlvdXNQYWxldHRlKTtcbiAgICBhdWRpby5wbGF5UXVldWVkKCk7XG4gICAgYXVkaW8uZWZmZWN0ID0gMDtcbiAgICBjb250cm9scy5wb3NpdGlvblsxXSA9IDE7XG4gICAgY29udHJvbHMuZGlzdGFuY2UgPSBvcmlnaW5hbERpc3RhbmNlO1xuICAgIGdlby5nbG9iYWxTcGVlZCA9IDE7XG4gICAgZ2VvLm5leHRQYWxldHRlKCk7XG4gICAgcmV0LmVtaXQoJ3N0b3AnLCBpc0xvYWRlZCk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXR1cE5hbWUgKG5hbWUpIHtcbiAgICBpZiAoIW5hbWUpIHtcbiAgICAgIHRyYWNrQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRyYWNrQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAndGFibGUnO1xuXG4gICAgY29uc3QgcGFydHMgPSBuYW1lLnNwbGl0KCctJykubWFwKHggPT4geC50cmltKCkpO1xuICAgIHRyYWNrTnVtYmVyLnRleHRDb250ZW50ID0gJ25leHQgdHJhY2snO1xuICAgIHRyYWNrTmFtZS50ZXh0Q29udGVudCA9IHBhcnRzWzFdO1xuICB9XG59O1xuIiwiLyoqXG4gKiBAYXV0aG9yIGFsdGVyZWRxIC8gaHR0cDovL2FsdGVyZWRxdWFsaWEuY29tL1xuICpcbiAqIFNjcmVlbi1zcGFjZSBhbWJpZW50IG9jY2x1c2lvbiBzaGFkZXJcbiAqIC0gcG9ydGVkIGZyb21cbiAqICAgU1NBTyBHTFNMIHNoYWRlciB2MS4yXG4gKiAgIGFzc2VtYmxlZCBieSBNYXJ0aW5zIFVwaXRpcyAobWFydGluc2gpIChodHRwOi8vZGV2bG9nLW1hcnRpbnNoLmJsb2dzcG90LmNvbSlcbiAqICAgb3JpZ2luYWwgdGVjaG5pcXVlIGlzIG1hZGUgYnkgQXJLYW5vMjIgKGh0dHA6Ly93d3cuZ2FtZWRldi5uZXQvdG9waWMvNTUwNjk5LXNzYW8tbm8taGFsby1hcnRpZmFjdHMvKVxuICogLSBtb2RpZmljYXRpb25zXG4gKiAtIG1vZGlmaWVkIHRvIHVzZSBSR0JBIHBhY2tlZCBkZXB0aCB0ZXh0dXJlICh1c2UgY2xlYXIgY29sb3IgMSwxLDEsMSBmb3IgZGVwdGggcGFzcylcbiAqIC0gcmVmYWN0b3JpbmcgYW5kIG9wdGltaXphdGlvbnNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcblxuICB1bmlmb3Jtczoge1xuXG4gICAgXCJ0RGlmZnVzZVwiOiAgICAgeyB0eXBlOiBcInRcIiwgdmFsdWU6IG51bGwgfSxcbiAgICBcInREZXB0aFwiOiAgICAgICB7IHR5cGU6IFwidFwiLCB2YWx1ZTogbnVsbCB9LFxuICAgIFwicmVzb2x1dGlvblwiOiAgIHsgdHlwZTogXCJ2MlwiLCB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoIDUxMiwgNTEyICkgfSxcbiAgICBcImNhbWVyYU5lYXJcIjogICB7IHR5cGU6IFwiZlwiLCB2YWx1ZTogMSB9LFxuICAgIFwiY2FtZXJhRmFyXCI6ICAgIHsgdHlwZTogXCJmXCIsIHZhbHVlOiAxMDAgfSxcbiAgICBcIm9ubHlBT1wiOiAgICAgICB7IHR5cGU6IFwiaVwiLCB2YWx1ZTogMCB9LFxuICAgIFwiYW9DbGFtcFwiOiAgICAgIHsgdHlwZTogXCJmXCIsIHZhbHVlOiAwLjUgfSxcbiAgICBcImx1bUluZmx1ZW5jZVwiOiB7IHR5cGU6IFwiZlwiLCB2YWx1ZTogMC41IH1cblxuICB9LFxuXG4gIHZlcnRleFNoYWRlcjogW1xuXG4gICAgXCJ2YXJ5aW5nIHZlYzIgdlV2O1wiLFxuXG4gICAgXCJ2b2lkIG1haW4oKSB7XCIsXG5cbiAgICAgIFwidlV2ID0gdXY7XCIsXG5cbiAgICAgIFwiZ2xfUG9zaXRpb24gPSBwcm9qZWN0aW9uTWF0cml4ICogbW9kZWxWaWV3TWF0cml4ICogdmVjNCggcG9zaXRpb24sIDEuMCApO1wiLFxuXG4gICAgXCJ9XCJcblxuICBdLmpvaW4oIFwiXFxuXCIgKSxcblxuICBmcmFnbWVudFNoYWRlcjogW1xuXG4gICAgXCJ1bmlmb3JtIGZsb2F0IGNhbWVyYU5lYXI7XCIsXG4gICAgXCJ1bmlmb3JtIGZsb2F0IGNhbWVyYUZhcjtcIixcblxuICAgIFwidW5pZm9ybSBib29sIG9ubHlBTztcIiwgICAgICAvLyB1c2Ugb25seSBhbWJpZW50IG9jY2x1c2lvbiBwYXNzP1xuXG4gICAgXCJ1bmlmb3JtIHZlYzIgcmVzb2x1dGlvbjtcIiwgICAgICAgIC8vIHRleHR1cmUgd2lkdGgsIGhlaWdodFxuICAgIFwidW5pZm9ybSBmbG9hdCBhb0NsYW1wO1wiLCAgICAvLyBkZXB0aCBjbGFtcCAtIHJlZHVjZXMgaGFsb2luZyBhdCBzY3JlZW4gZWRnZXNcblxuICAgIFwidW5pZm9ybSBmbG9hdCBsdW1JbmZsdWVuY2U7XCIsICAvLyBob3cgbXVjaCBsdW1pbmFuY2UgYWZmZWN0cyBvY2NsdXNpb25cblxuICAgIFwidW5pZm9ybSBzYW1wbGVyMkQgdERpZmZ1c2U7XCIsXG4gICAgXCJ1bmlmb3JtIGhpZ2hwIHNhbXBsZXIyRCB0RGVwdGg7XCIsXG5cbiAgICBcInZhcnlpbmcgdmVjMiB2VXY7XCIsXG5cbiAgICAvLyBcIiNkZWZpbmUgUEkgMy4xNDE1OTI2NVwiLFxuICAgIFwiI2RlZmluZSBETCAyLjM5OTk2MzIyOTcyODY1M1wiLCAgLy8gUEkgKiAoIDMuMCAtIHNxcnQoIDUuMCApIClcbiAgICBcIiNkZWZpbmUgRVVMRVIgMi43MTgyODE4Mjg0NTkwNDVcIixcblxuICAgIC8vIHVzZXIgdmFyaWFibGVzXG5cbiAgICBcImNvbnN0IGludCBzYW1wbGVzID0gNDtcIiwgICAgIC8vIGFvIHNhbXBsZSBjb3VudFxuICAgIFwiY29uc3QgZmxvYXQgcmFkaXVzID0gNS4wO1wiLCAgLy8gYW8gcmFkaXVzXG4gICAgXG4gICAgXCJjb25zdCBib29sIHVzZU5vaXNlID0gZmFsc2U7XCIsICAgICAgLy8gdXNlIG5vaXNlIGluc3RlYWQgb2YgcGF0dGVybiBmb3Igc2FtcGxlIGRpdGhlcmluZ1xuICAgIFwiY29uc3QgZmxvYXQgbm9pc2VBbW91bnQgPSAwLjAwMDM7XCIsIC8vIGRpdGhlcmluZyBhbW91bnRcblxuICAgIFwiY29uc3QgZmxvYXQgZGlmZkFyZWEgPSAwLjQ7XCIsICAgLy8gc2VsZi1zaGFkb3dpbmcgcmVkdWN0aW9uXG4gICAgXCJjb25zdCBmbG9hdCBnRGlzcGxhY2UgPSAwLjQ7XCIsICAvLyBnYXVzcyBiZWxsIGNlbnRlclxuXG5cbiAgICAvLyBnZW5lcmF0aW5nIG5vaXNlIC8gcGF0dGVybiB0ZXh0dXJlIGZvciBkaXRoZXJpbmdcbiAgICAvLyBcImhpZ2hwIGZsb2F0IHJhbmRvbSh2ZWMyIGNvKSB7XCIsXG4gICAgLy8gICAgIFwiaGlnaHAgZmxvYXQgYSA9IDEyLjk4OTg7XCIsXG4gICAgLy8gICAgIFwiaGlnaHAgZmxvYXQgYiA9IDc4LjIzMztcIixcbiAgICAvLyAgICAgXCJoaWdocCBmbG9hdCBjID0gNDM3NTguNTQ1MztcIixcbiAgICAvLyAgICAgXCJoaWdocCBmbG9hdCBkdD0gZG90KGNvLnh5ICx2ZWMyKGEsYikpO1wiLFxuICAgIC8vICAgICBcImhpZ2hwIGZsb2F0IHNuPSBtb2QoZHQsMy4xNCk7XCIsXG4gICAgLy8gICAgIFwicmV0dXJuIGZyYWN0KHNpbihzbikgKiBjKTtcIixcbiAgICAvLyBcIn1cIixcblxuICAgIFwiaGlnaHAgdmVjMiByYW5kKCBjb25zdCB2ZWMyIGNvb3JkICkge1wiLFxuXG4gICAgICBcImhpZ2hwIHZlYzIgbm9pc2U7XCIsXG5cbiAgICAgIFwiaWYgKCB1c2VOb2lzZSApIHtcIixcblxuICAgICAgICBcImZsb2F0IG54ID0gZG90ICggY29vcmQsIHZlYzIoIDEyLjk4OTgsIDc4LjIzMyApICk7XCIsXG4gICAgICAgIFwiZmxvYXQgbnkgPSBkb3QgKCBjb29yZCwgdmVjMiggMTIuOTg5OCwgNzguMjMzICkgKiAyLjAgKTtcIixcblxuICAgICAgICBcIm5vaXNlID0gY2xhbXAoIGZyYWN0ICggNDM3NTguNTQ1MyAqIHNpbiggdmVjMiggbngsIG55ICkgKSApLCAwLjAsIDEuMCApO1wiLFxuXG4gICAgICBcIn0gZWxzZSB7XCIsXG5cbiAgICAgICAgXCJoaWdocCBmbG9hdCBmZiA9IGZyYWN0KCAxLjAgLSBjb29yZC5zICogKCByZXNvbHV0aW9uLnggLyAyLjAgKSApO1wiLFxuICAgICAgICBcImhpZ2hwIGZsb2F0IGdnID0gZnJhY3QoIGNvb3JkLnQgKiAoIHJlc29sdXRpb24ueSAvIDIuMCApICk7XCIsXG5cbiAgICAgICAgXCJub2lzZSA9IHZlYzIoIDAuMjUsIDAuNzUgKSAqIHZlYzIoIGZmICkgKyB2ZWMyKCAwLjc1LCAwLjI1ICkgKiBnZztcIixcblxuICAgICAgXCJ9XCIsXG5cbiAgICAgIFwicmV0dXJuICggbm9pc2UgKiAyLjAgIC0gMS4wICkgKiBub2lzZUFtb3VudDtcIixcblxuICAgIFwifVwiLFxuXG4gICAgXCJmbG9hdCByZWFkRGVwdGgoIGNvbnN0IGluIHZlYzIgY29vcmQgKSB7XCIsXG5cbiAgICAgIFwiZmxvYXQgY2FtZXJhRmFyUGx1c05lYXIgPSBjYW1lcmFGYXIgKyBjYW1lcmFOZWFyO1wiLFxuICAgICAgXCJmbG9hdCBjYW1lcmFGYXJNaW51c05lYXIgPSBjYW1lcmFGYXIgLSBjYW1lcmFOZWFyO1wiLFxuICAgICAgXCJmbG9hdCBjYW1lcmFDb2VmID0gMi4wICogY2FtZXJhTmVhcjtcIixcblxuICAgICAgXCJyZXR1cm4gY2FtZXJhQ29lZiAvICggY2FtZXJhRmFyUGx1c05lYXIgLSB0ZXh0dXJlMkQoIHREZXB0aCwgY29vcmQgKS54ICogY2FtZXJhRmFyTWludXNOZWFyICk7XCIsXG5cbiAgICBcIn1cIixcblxuICAgIFwiZmxvYXQgY29tcGFyZURlcHRocyggY29uc3QgaW4gZmxvYXQgZGVwdGgxLCBjb25zdCBpbiBmbG9hdCBkZXB0aDIsIGlub3V0IGludCBmYXIgKSB7XCIsXG5cbiAgICAgIFwiZmxvYXQgZ2FyZWEgPSAyLjA7XCIsICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGdhdXNzIGJlbGwgd2lkdGhcbiAgICAgIFwiZmxvYXQgZGlmZiA9ICggZGVwdGgxIC0gZGVwdGgyICkgKiAxMDAuMDtcIiwgIC8vIGRlcHRoIGRpZmZlcmVuY2UgKDAtMTAwKVxuXG4gICAgICAvLyByZWR1Y2UgbGVmdCBiZWxsIHdpZHRoIHRvIGF2b2lkIHNlbGYtc2hhZG93aW5nXG5cbiAgICAgIFwiaWYgKCBkaWZmIDwgZ0Rpc3BsYWNlICkge1wiLFxuXG4gICAgICAgIFwiZ2FyZWEgPSBkaWZmQXJlYTtcIixcblxuICAgICAgXCJ9IGVsc2Uge1wiLFxuXG4gICAgICAgIFwiZmFyID0gMTtcIixcblxuICAgICAgXCJ9XCIsXG5cbiAgICAgIFwiZmxvYXQgZGQgPSBkaWZmIC0gZ0Rpc3BsYWNlO1wiLFxuICAgICAgXCJmbG9hdCBnYXVzcyA9IHBvdyggRVVMRVIsIC0yLjAgKiBkZCAqIGRkIC8gKCBnYXJlYSAqIGdhcmVhICkgKTtcIixcbiAgICAgIFwicmV0dXJuIGdhdXNzO1wiLFxuXG4gICAgXCJ9XCIsXG5cbiAgICBcImZsb2F0IGNhbGNBTyggZmxvYXQgZGVwdGgsIGZsb2F0IGR3LCBmbG9hdCBkaCApIHtcIixcblxuICAgICAgXCJmbG9hdCBkZCA9IHJhZGl1cyAtIGRlcHRoICogcmFkaXVzO1wiLFxuICAgICAgXCJ2ZWMyIHZ2ID0gdmVjMiggZHcsIGRoICk7XCIsXG5cbiAgICAgIFwidmVjMiBjb29yZDEgPSB2VXYgKyBkZCAqIHZ2O1wiLFxuICAgICAgXCJ2ZWMyIGNvb3JkMiA9IHZVdiAtIGRkICogdnY7XCIsXG5cbiAgICAgIFwiZmxvYXQgdGVtcDEgPSAwLjA7XCIsXG4gICAgICBcImZsb2F0IHRlbXAyID0gMC4wO1wiLFxuXG4gICAgICBcImludCBmYXIgPSAwO1wiLFxuICAgICAgXCJ0ZW1wMSA9IGNvbXBhcmVEZXB0aHMoIGRlcHRoLCByZWFkRGVwdGgoIGNvb3JkMSApLCBmYXIgKTtcIixcblxuICAgICAgLy8gREVQVEggRVhUUkFQT0xBVElPTlxuXG4gICAgICBcImlmICggZmFyID4gMCApIHtcIixcblxuICAgICAgICBcInRlbXAyID0gY29tcGFyZURlcHRocyggcmVhZERlcHRoKCBjb29yZDIgKSwgZGVwdGgsIGZhciApO1wiLFxuICAgICAgICBcInRlbXAxICs9ICggMS4wIC0gdGVtcDEgKSAqIHRlbXAyO1wiLFxuXG4gICAgICBcIn1cIixcblxuICAgICAgXCJyZXR1cm4gdGVtcDE7XCIsXG5cbiAgICBcIn1cIixcblxuICAgIFwidm9pZCBtYWluKCkge1wiLFxuXG4gICAgICBcImhpZ2hwIHZlYzIgbm9pc2UgPSByYW5kKCB2VXYgKTtcIixcbiAgICAgIFwiZmxvYXQgZGVwdGggPSByZWFkRGVwdGgoIHZVdiApO1wiLFxuICAgICAgXCJmbG9hdCB0dCA9IGNsYW1wKCBkZXB0aCwgYW9DbGFtcCwgMS4wICk7XCIsXG5cbiAgICAgIFwiZmxvYXQgdyA9ICggMS4wIC8gcmVzb2x1dGlvbi54ICkgIC8gdHQgKyAoIG5vaXNlLnggKiAoIDEuMCAtIG5vaXNlLnggKSApO1wiLFxuICAgICAgXCJmbG9hdCBoID0gKCAxLjAgLyByZXNvbHV0aW9uLnkgKSAvIHR0ICsgKCBub2lzZS55ICogKCAxLjAgLSBub2lzZS55ICkgKTtcIixcblxuICAgICAgXCJmbG9hdCBhbyA9IDAuMDtcIixcblxuICAgICAgXCJmbG9hdCBkeiA9IDEuMCAvIGZsb2F0KCBzYW1wbGVzICk7XCIsXG4gICAgICBcImZsb2F0IHogPSAxLjAgLSBkeiAvIDIuMDtcIixcbiAgICAgIFwiZmxvYXQgbCA9IDAuMDtcIixcblxuICAgICAgXCJmb3IgKCBpbnQgaSA9IDA7IGkgPD0gc2FtcGxlczsgaSArKyApIHtcIixcblxuICAgICAgICBcImZsb2F0IHIgPSBzcXJ0KCAxLjAgLSB6ICk7XCIsXG5cbiAgICAgICAgXCJmbG9hdCBwdyA9IGNvcyggbCApICogcjtcIixcbiAgICAgICAgXCJmbG9hdCBwaCA9IHNpbiggbCApICogcjtcIixcbiAgICAgICAgXCJhbyArPSBjYWxjQU8oIGRlcHRoLCBwdyAqIHcsIHBoICogaCApO1wiLFxuICAgICAgICBcInogPSB6IC0gZHo7XCIsXG4gICAgICAgIFwibCA9IGwgKyBETDtcIixcblxuICAgICAgXCJ9XCIsXG5cbiAgICAgIFwiYW8gLz0gZmxvYXQoIHNhbXBsZXMgKTtcIixcbiAgICAgIFwiYW8gPSAxLjAgLSBhbztcIixcblxuICAgICAgXCJ2ZWMzIGNvbG9yID0gdGV4dHVyZTJEKCB0RGlmZnVzZSwgdlV2ICkucmdiO1wiLFxuXG4gICAgICBcInZlYzMgbHVtY29lZmYgPSB2ZWMzKCAwLjI5OSwgMC41ODcsIDAuMTE0ICk7XCIsXG4gICAgICBcImZsb2F0IGx1bSA9IGRvdCggY29sb3IucmdiLCBsdW1jb2VmZiApO1wiLFxuICAgICAgXCJ2ZWMzIGx1bWluYW5jZSA9IHZlYzMoIGx1bSApO1wiLFxuXG4gICAgICBcInZlYzMgZmluYWwgPSB2ZWMzKCBjb2xvciAqIG1peCggdmVjMyggYW8gKSwgdmVjMyggMS4wICksIGx1bWluYW5jZSAqIGx1bUluZmx1ZW5jZSApICk7XCIsICAvLyBtaXgoIGNvbG9yICogYW8sIHdoaXRlLCBsdW1pbmFuY2UgKVxuXG4gICAgICBcImlmICggb25seUFPICkge1wiLFxuXG4gICAgICAgIFwiZmluYWwgPSB2ZWMzKCBtaXgoIHZlYzMoIGFvICksIHZlYzMoIDEuMCApLCBsdW1pbmFuY2UgKiBsdW1JbmZsdWVuY2UgKSApO1wiLCAgLy8gYW1iaWVudCBvY2NsdXNpb24gb25seVxuXG4gICAgICBcIn1cIixcblxuICAgICAgXCJnbF9GcmFnQ29sb3IgPSB2ZWM0KCBmaW5hbCwgMS4wICk7XCIsXG5cbiAgICBcIn1cIlxuXG4gIF0uam9pbiggXCJcXG5cIiApXG5cbn07XG4iLCIndXNlIHN0cmljdCc7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChhcnIpIHtcblx0aWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcblx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBhbiBhcnJheScpO1xuXHR9XG5cblx0dmFyIHJhbmQ7XG5cdHZhciB0bXA7XG5cdHZhciBsZW4gPSBhcnIubGVuZ3RoO1xuXHR2YXIgcmV0ID0gYXJyLnNsaWNlKCk7XG5cblx0d2hpbGUgKGxlbikge1xuXHRcdHJhbmQgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBsZW4tLSk7XG5cdFx0dG1wID0gcmV0W2xlbl07XG5cdFx0cmV0W2xlbl0gPSByZXRbcmFuZF07XG5cdFx0cmV0W3JhbmRdID0gdG1wO1xuXHR9XG5cblx0cmV0dXJuIHJldDtcbn07XG4iLCJ2YXIgY2xhbXAgPSByZXF1aXJlKCdjbGFtcCcpXG5cbm1vZHVsZS5leHBvcnRzID0gZnJlcXVlbmN5VG9JbmRleFxuZnVuY3Rpb24gZnJlcXVlbmN5VG9JbmRleCAoZnJlcXVlbmN5LCBzYW1wbGVSYXRlLCBmcmVxdWVuY3lCaW5Db3VudCkge1xuICB2YXIgbnlxdWlzdCA9IHNhbXBsZVJhdGUgLyAyXG4gIHZhciBpbmRleCA9IE1hdGgucm91bmQoZnJlcXVlbmN5IC8gbnlxdWlzdCAqIGZyZXF1ZW5jeUJpbkNvdW50KVxuICByZXR1cm4gY2xhbXAoaW5kZXgsIDAsIGZyZXF1ZW5jeUJpbkNvdW50KVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBiZWF0c1xuXG5mdW5jdGlvbiBiZWF0cyhiaW5zLCBob2xkKSB7XG4gIGJpbnMgPSBBcnJheS5pc0FycmF5KGJpbnMpID8gYmlucyA6IFtiaW5zXVxuXG4gIHZhciBtaW50aHJlc2hvbGRzID0gYmlucy5tYXAocGljaygndGhyZXNob2xkJywgMCkpXG4gIHZhciB0aHJlc2hvbGRzID0gYmlucy5tYXAocGljaygndGhyZXNob2xkJywgMCkpXG4gIHZhciBkZWNheXMgPSBiaW5zLm1hcChwaWNrKCdkZWNheScsIDAuMDA1KSlcbiAgdmFyIGhpcyA9IGJpbnMubWFwKHJvdW5kRm4ocGljaygnaGknLCA1MTIpKSlcbiAgdmFyIGxvcyA9IGJpbnMubWFwKHJvdW5kRm4ocGljaygnbG8nLCAwKSkpXG4gIHZhciBzaXplcyA9IGRpZmYoaGlzLCBsb3MpXG4gIHZhciBiaW5Db3VudCA9IGJpbnMubGVuZ3RoXG4gIHZhciB0aW1lcyA9IG5ldyBGbG9hdDY0QXJyYXkoYmluQ291bnQpXG4gIHZhciBiZWF0cyA9IG5ldyBVaW50OEFycmF5KGJpbkNvdW50KVxuXG4gIGhvbGQgPSBob2xkIHx8IDBcblxuICBhbGxOdW1iZXJzKGhpcywgJ0FsbCBcImhpXCIga2V5cyBtdXN0IGJlIG51bWJlcnMnKVxuICBhbGxOdW1iZXJzKGxvcywgJ0FsbCBcImxvXCIga2V5cyBtdXN0IGJlIG51bWJlcnMnKVxuICBhbGxOdW1iZXJzKHRocmVzaG9sZHMsICdBbGwgXCJ0aHJlc2hvbGRcIiBrZXlzIG11c3QgYmUgbnVtYmVycycpXG4gIGFsbE51bWJlcnMoZGVjYXlzLCAnQWxsIFwiZGVjYXlcIiBrZXlzIG11c3QgYmUgbnVtYmVycycpXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBkZWNheXMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICBkZWNheXNbaV0gPSAxIC0gZGVjYXlzW2ldXG4gIH1cblxuICByZXR1cm4gZnVuY3Rpb24oZGF0YSwgZHQpIHtcbiAgICBkdCA9IGR0IHx8IDFcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYmluQ291bnQ7IGkgKz0gMSkge1xuICAgICAgdmFyIHNjYWxlID0gMSAvIHNpemVzW2ldXG4gICAgICB2YXIgaGkgPSBoaXNbaV1cbiAgICAgIHZhciBsbyA9IGxvc1tpXVxuICAgICAgdmFyIHZvbHVtZSA9IDBcblxuICAgICAgZm9yICh2YXIgaiA9IGxvOyBqIDwgaGk7IGogKz0gMSkge1xuICAgICAgICB2b2x1bWUgKz0gc2NhbGUgKiBkYXRhW2pdXG4gICAgICB9XG5cbiAgICAgIHRpbWVzW2ldICs9IGR0XG5cbiAgICAgIGlmICh0aW1lc1tpXSA+IGhvbGQgJiYgdm9sdW1lID4gdGhyZXNob2xkc1tpXSkge1xuICAgICAgICBiZWF0c1tpXSA9IHZvbHVtZVxuICAgICAgICB0aW1lc1tpXSA9IDBcbiAgICAgICAgdGhyZXNob2xkc1tpXSA9IHZvbHVtZSA+IG1pbnRocmVzaG9sZHNbaV1cbiAgICAgICAgICA/IHZvbHVtZVxuICAgICAgICAgIDogdGhyZXNob2xkc1tpXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYmVhdHNbaV0gPSAwXG4gICAgICB9XG5cbiAgICAgIHRocmVzaG9sZHNbaV0gKj0gZGVjYXlzW2ldXG4gICAgfVxuXG4gICAgcmV0dXJuIGJlYXRzXG4gIH1cbn1cblxuXG5mdW5jdGlvbiBwaWNrKGtleSwgZGVmKSB7XG4gIHJldHVybiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICByZXR1cm4ga2V5IGluIG9iamVjdCA/IG9iamVjdFtrZXldIDogZGVmXG4gIH1cbn1cblxuZnVuY3Rpb24gZGlmZihhLCBiKSB7XG4gIHZhciBhcnIgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGEubGVuZ3RoOyBpICs9IDEpIHtcbiAgICBhcnJbaV0gPSBhW2ldIC0gYltpXVxuICB9XG4gIHJldHVybiBhcnJcbn1cblxuZnVuY3Rpb24gcm91bmRGbihmbikge1xuICByZXR1cm4gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gTWF0aC5yb3VuZChmbih2YWx1ZSkpXG4gIH1cbn1cblxuZnVuY3Rpb24gYWxsTnVtYmVycyhhcnIsIG1zZykge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGlmICh0eXBlb2YgYXJyW2ldICE9PSAnbnVtYmVyJykgdGhyb3cgbmV3IEVycm9yKG1zZylcbiAgfVxuICByZXR1cm4gYXJyXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGNsYW1wXG5cbmZ1bmN0aW9uIGNsYW1wKHZhbHVlLCBtaW4sIG1heCkge1xuICByZXR1cm4gbWluIDwgbWF4XG4gICAgPyAodmFsdWUgPCBtaW4gPyBtaW4gOiB2YWx1ZSA+IG1heCA/IG1heCA6IHZhbHVlKVxuICAgIDogKHZhbHVlIDwgbWF4ID8gbWF4IDogdmFsdWUgPiBtaW4gPyBtaW4gOiB2YWx1ZSlcbn1cbiIsInZhciBwcmVmaXggPSByZXF1aXJlKCdwcmVmaXgtc3R5bGUnKVxudmFyIHRvQ2FtZWxDYXNlID0gcmVxdWlyZSgndG8tY2FtZWwtY2FzZScpXG52YXIgY2FjaGUgPSB7ICdmbG9hdCc6ICdjc3NGbG9hdCcgfVxudmFyIGFkZFB4VG9TdHlsZSA9IHJlcXVpcmUoJ2FkZC1weC10by1zdHlsZScpXG5cbmZ1bmN0aW9uIHN0eWxlIChlbGVtZW50LCBwcm9wZXJ0eSwgdmFsdWUpIHtcbiAgdmFyIGNhbWVsID0gY2FjaGVbcHJvcGVydHldXG4gIGlmICh0eXBlb2YgY2FtZWwgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgY2FtZWwgPSBkZXRlY3QocHJvcGVydHkpXG4gIH1cblxuICAvLyBtYXkgYmUgZmFsc2UgaWYgQ1NTIHByb3AgaXMgdW5zdXBwb3J0ZWRcbiAgaWYgKGNhbWVsKSB7XG4gICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBlbGVtZW50LnN0eWxlW2NhbWVsXVxuICAgIH1cblxuICAgIGVsZW1lbnQuc3R5bGVbY2FtZWxdID0gYWRkUHhUb1N0eWxlKGNhbWVsLCB2YWx1ZSlcbiAgfVxufVxuXG5mdW5jdGlvbiBlYWNoIChlbGVtZW50LCBwcm9wZXJ0aWVzKSB7XG4gIGZvciAodmFyIGsgaW4gcHJvcGVydGllcykge1xuICAgIGlmIChwcm9wZXJ0aWVzLmhhc093blByb3BlcnR5KGspKSB7XG4gICAgICBzdHlsZShlbGVtZW50LCBrLCBwcm9wZXJ0aWVzW2tdKVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBkZXRlY3QgKGNzc1Byb3ApIHtcbiAgdmFyIGNhbWVsID0gdG9DYW1lbENhc2UoY3NzUHJvcClcbiAgdmFyIHJlc3VsdCA9IHByZWZpeChjYW1lbClcbiAgY2FjaGVbY2FtZWxdID0gY2FjaGVbY3NzUHJvcF0gPSBjYWNoZVtyZXN1bHRdID0gcmVzdWx0XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gc2V0ICgpIHtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDIpIHtcbiAgICBlYWNoKGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKVxuICB9IGVsc2Uge1xuICAgIHN0eWxlKGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pXG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBzZXRcbm1vZHVsZS5leHBvcnRzLnNldCA9IHNldFxuXG5tb2R1bGUuZXhwb3J0cy5nZXQgPSBmdW5jdGlvbiAoZWxlbWVudCwgcHJvcGVydGllcykge1xuICBpZiAoQXJyYXkuaXNBcnJheShwcm9wZXJ0aWVzKSkge1xuICAgIHJldHVybiBwcm9wZXJ0aWVzLnJlZHVjZShmdW5jdGlvbiAob2JqLCBwcm9wKSB7XG4gICAgICBvYmpbcHJvcF0gPSBzdHlsZShlbGVtZW50LCBwcm9wIHx8ICcnKVxuICAgICAgcmV0dXJuIG9ialxuICAgIH0sIHt9KVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBzdHlsZShlbGVtZW50LCBwcm9wZXJ0aWVzIHx8ICcnKVxuICB9XG59XG4iLCIvKiBUaGUgZm9sbG93aW5nIGxpc3QgaXMgZGVmaW5lZCBpbiBSZWFjdCdzIGNvcmUgKi9cbnZhciBJU19VTklUTEVTUyA9IHtcbiAgYW5pbWF0aW9uSXRlcmF0aW9uQ291bnQ6IHRydWUsXG4gIGJveEZsZXg6IHRydWUsXG4gIGJveEZsZXhHcm91cDogdHJ1ZSxcbiAgYm94T3JkaW5hbEdyb3VwOiB0cnVlLFxuICBjb2x1bW5Db3VudDogdHJ1ZSxcbiAgZmxleDogdHJ1ZSxcbiAgZmxleEdyb3c6IHRydWUsXG4gIGZsZXhQb3NpdGl2ZTogdHJ1ZSxcbiAgZmxleFNocmluazogdHJ1ZSxcbiAgZmxleE5lZ2F0aXZlOiB0cnVlLFxuICBmbGV4T3JkZXI6IHRydWUsXG4gIGdyaWRSb3c6IHRydWUsXG4gIGdyaWRDb2x1bW46IHRydWUsXG4gIGZvbnRXZWlnaHQ6IHRydWUsXG4gIGxpbmVDbGFtcDogdHJ1ZSxcbiAgbGluZUhlaWdodDogdHJ1ZSxcbiAgb3BhY2l0eTogdHJ1ZSxcbiAgb3JkZXI6IHRydWUsXG4gIG9ycGhhbnM6IHRydWUsXG4gIHRhYlNpemU6IHRydWUsXG4gIHdpZG93czogdHJ1ZSxcbiAgekluZGV4OiB0cnVlLFxuICB6b29tOiB0cnVlLFxuXG4gIC8vIFNWRy1yZWxhdGVkIHByb3BlcnRpZXNcbiAgZmlsbE9wYWNpdHk6IHRydWUsXG4gIHN0b3BPcGFjaXR5OiB0cnVlLFxuICBzdHJva2VEYXNob2Zmc2V0OiB0cnVlLFxuICBzdHJva2VPcGFjaXR5OiB0cnVlLFxuICBzdHJva2VXaWR0aDogdHJ1ZVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xuICBpZih0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmICFJU19VTklUTEVTU1sgbmFtZSBdKSB7XG4gICAgcmV0dXJuIHZhbHVlICsgJ3B4JztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbn07IiwidmFyIGRpdiA9IG51bGxcbnZhciBwcmVmaXhlcyA9IFsgJ1dlYmtpdCcsICdNb3onLCAnTycsICdtcycgXVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHByZWZpeFN0eWxlIChwcm9wKSB7XG4gIC8vIHJlLXVzZSBhIGR1bW15IGRpdlxuICBpZiAoIWRpdikge1xuICAgIGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpXG4gIH1cblxuICB2YXIgc3R5bGUgPSBkaXYuc3R5bGVcblxuICAvLyBwcm9wIGV4aXN0cyB3aXRob3V0IHByZWZpeFxuICBpZiAocHJvcCBpbiBzdHlsZSkge1xuICAgIHJldHVybiBwcm9wXG4gIH1cblxuICAvLyBib3JkZXJSYWRpdXMgLT4gQm9yZGVyUmFkaXVzXG4gIHZhciB0aXRsZUNhc2UgPSBwcm9wLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcHJvcC5zbGljZSgxKVxuXG4gIC8vIGZpbmQgdGhlIHZlbmRvci1wcmVmaXhlZCBwcm9wXG4gIGZvciAodmFyIGkgPSBwcmVmaXhlcy5sZW5ndGg7IGkgPj0gMDsgaS0tKSB7XG4gICAgdmFyIG5hbWUgPSBwcmVmaXhlc1tpXSArIHRpdGxlQ2FzZVxuICAgIC8vIGUuZy4gV2Via2l0Qm9yZGVyUmFkaXVzIG9yIHdlYmtpdEJvcmRlclJhZGl1c1xuICAgIGlmIChuYW1lIGluIHN0eWxlKSB7XG4gICAgICByZXR1cm4gbmFtZVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmYWxzZVxufVxuIiwiXG52YXIgdG9TcGFjZSA9IHJlcXVpcmUoJ3RvLXNwYWNlLWNhc2UnKTtcblxuXG4vKipcbiAqIEV4cG9zZSBgdG9DYW1lbENhc2VgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gdG9DYW1lbENhc2U7XG5cblxuLyoqXG4gKiBDb252ZXJ0IGEgYHN0cmluZ2AgdG8gY2FtZWwgY2FzZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyaW5nXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKi9cblxuXG5mdW5jdGlvbiB0b0NhbWVsQ2FzZSAoc3RyaW5nKSB7XG4gIHJldHVybiB0b1NwYWNlKHN0cmluZykucmVwbGFjZSgvXFxzKFxcdykvZywgZnVuY3Rpb24gKG1hdGNoZXMsIGxldHRlcikge1xuICAgIHJldHVybiBsZXR0ZXIudG9VcHBlckNhc2UoKTtcbiAgfSk7XG59IiwiXG52YXIgY2xlYW4gPSByZXF1aXJlKCd0by1uby1jYXNlJyk7XG5cblxuLyoqXG4gKiBFeHBvc2UgYHRvU3BhY2VDYXNlYC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IHRvU3BhY2VDYXNlO1xuXG5cbi8qKlxuICogQ29udmVydCBhIGBzdHJpbmdgIHRvIHNwYWNlIGNhc2UuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0cmluZ1xuICogQHJldHVybiB7U3RyaW5nfVxuICovXG5cblxuZnVuY3Rpb24gdG9TcGFjZUNhc2UgKHN0cmluZykge1xuICByZXR1cm4gY2xlYW4oc3RyaW5nKS5yZXBsYWNlKC9bXFxXX10rKC58JCkvZywgZnVuY3Rpb24gKG1hdGNoZXMsIG1hdGNoKSB7XG4gICAgcmV0dXJuIG1hdGNoID8gJyAnICsgbWF0Y2ggOiAnJztcbiAgfSk7XG59IiwiXG4vKipcbiAqIEV4cG9zZSBgdG9Ob0Nhc2VgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gdG9Ob0Nhc2U7XG5cblxuLyoqXG4gKiBUZXN0IHdoZXRoZXIgYSBzdHJpbmcgaXMgY2FtZWwtY2FzZS5cbiAqL1xuXG52YXIgaGFzU3BhY2UgPSAvXFxzLztcbnZhciBoYXNDYW1lbCA9IC9bYS16XVtBLVpdLztcbnZhciBoYXNTZXBhcmF0b3IgPSAvW1xcV19dLztcblxuXG4vKipcbiAqIFJlbW92ZSBhbnkgc3RhcnRpbmcgY2FzZSBmcm9tIGEgYHN0cmluZ2AsIGxpa2UgY2FtZWwgb3Igc25ha2UsIGJ1dCBrZWVwXG4gKiBzcGFjZXMgYW5kIHB1bmN0dWF0aW9uIHRoYXQgbWF5IGJlIGltcG9ydGFudCBvdGhlcndpc2UuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0cmluZ1xuICogQHJldHVybiB7U3RyaW5nfVxuICovXG5cbmZ1bmN0aW9uIHRvTm9DYXNlIChzdHJpbmcpIHtcbiAgaWYgKGhhc1NwYWNlLnRlc3Qoc3RyaW5nKSkgcmV0dXJuIHN0cmluZy50b0xvd2VyQ2FzZSgpO1xuXG4gIGlmIChoYXNTZXBhcmF0b3IudGVzdChzdHJpbmcpKSBzdHJpbmcgPSB1bnNlcGFyYXRlKHN0cmluZyk7XG4gIGlmIChoYXNDYW1lbC50ZXN0KHN0cmluZykpIHN0cmluZyA9IHVuY2FtZWxpemUoc3RyaW5nKTtcbiAgcmV0dXJuIHN0cmluZy50b0xvd2VyQ2FzZSgpO1xufVxuXG5cbi8qKlxuICogU2VwYXJhdG9yIHNwbGl0dGVyLlxuICovXG5cbnZhciBzZXBhcmF0b3JTcGxpdHRlciA9IC9bXFxXX10rKC58JCkvZztcblxuXG4vKipcbiAqIFVuLXNlcGFyYXRlIGEgYHN0cmluZ2AuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0cmluZ1xuICogQHJldHVybiB7U3RyaW5nfVxuICovXG5cbmZ1bmN0aW9uIHVuc2VwYXJhdGUgKHN0cmluZykge1xuICByZXR1cm4gc3RyaW5nLnJlcGxhY2Uoc2VwYXJhdG9yU3BsaXR0ZXIsIGZ1bmN0aW9uIChtLCBuZXh0KSB7XG4gICAgcmV0dXJuIG5leHQgPyAnICcgKyBuZXh0IDogJyc7XG4gIH0pO1xufVxuXG5cbi8qKlxuICogQ2FtZWxjYXNlIHNwbGl0dGVyLlxuICovXG5cbnZhciBjYW1lbFNwbGl0dGVyID0gLyguKShbQS1aXSspL2c7XG5cblxuLyoqXG4gKiBVbi1jYW1lbGNhc2UgYSBgc3RyaW5nYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyaW5nXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKi9cblxuZnVuY3Rpb24gdW5jYW1lbGl6ZSAoc3RyaW5nKSB7XG4gIHJldHVybiBzdHJpbmcucmVwbGFjZShjYW1lbFNwbGl0dGVyLCBmdW5jdGlvbiAobSwgcHJldmlvdXMsIHVwcGVycykge1xuICAgIHJldHVybiBwcmV2aW91cyArICcgJyArIHVwcGVycy50b0xvd2VyQ2FzZSgpLnNwbGl0KCcnKS5qb2luKCcgJyk7XG4gIH0pO1xufSIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG5mdW5jdGlvbiBFdmVudEVtaXR0ZXIoKSB7XG4gIHRoaXMuX2V2ZW50cyA9IHRoaXMuX2V2ZW50cyB8fCB7fTtcbiAgdGhpcy5fbWF4TGlzdGVuZXJzID0gdGhpcy5fbWF4TGlzdGVuZXJzIHx8IHVuZGVmaW5lZDtcbn1cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRFbWl0dGVyO1xuXG4vLyBCYWNrd2FyZHMtY29tcGF0IHdpdGggbm9kZSAwLjEwLnhcbkV2ZW50RW1pdHRlci5FdmVudEVtaXR0ZXIgPSBFdmVudEVtaXR0ZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX2V2ZW50cyA9IHVuZGVmaW5lZDtcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX21heExpc3RlbmVycyA9IHVuZGVmaW5lZDtcblxuLy8gQnkgZGVmYXVsdCBFdmVudEVtaXR0ZXJzIHdpbGwgcHJpbnQgYSB3YXJuaW5nIGlmIG1vcmUgdGhhbiAxMCBsaXN0ZW5lcnMgYXJlXG4vLyBhZGRlZCB0byBpdC4gVGhpcyBpcyBhIHVzZWZ1bCBkZWZhdWx0IHdoaWNoIGhlbHBzIGZpbmRpbmcgbWVtb3J5IGxlYWtzLlxuRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnMgPSAxMDtcblxuLy8gT2J2aW91c2x5IG5vdCBhbGwgRW1pdHRlcnMgc2hvdWxkIGJlIGxpbWl0ZWQgdG8gMTAuIFRoaXMgZnVuY3Rpb24gYWxsb3dzXG4vLyB0aGF0IHRvIGJlIGluY3JlYXNlZC4gU2V0IHRvIHplcm8gZm9yIHVubGltaXRlZC5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuc2V0TWF4TGlzdGVuZXJzID0gZnVuY3Rpb24obikge1xuICBpZiAoIWlzTnVtYmVyKG4pIHx8IG4gPCAwIHx8IGlzTmFOKG4pKVxuICAgIHRocm93IFR5cGVFcnJvcignbiBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJyk7XG4gIHRoaXMuX21heExpc3RlbmVycyA9IG47XG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIgZXIsIGhhbmRsZXIsIGxlbiwgYXJncywgaSwgbGlzdGVuZXJzO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gIC8vIElmIHRoZXJlIGlzIG5vICdlcnJvcicgZXZlbnQgbGlzdGVuZXIgdGhlbiB0aHJvdy5cbiAgaWYgKHR5cGUgPT09ICdlcnJvcicpIHtcbiAgICBpZiAoIXRoaXMuX2V2ZW50cy5lcnJvciB8fFxuICAgICAgICAoaXNPYmplY3QodGhpcy5fZXZlbnRzLmVycm9yKSAmJiAhdGhpcy5fZXZlbnRzLmVycm9yLmxlbmd0aCkpIHtcbiAgICAgIGVyID0gYXJndW1lbnRzWzFdO1xuICAgICAgaWYgKGVyIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgdGhyb3cgZXI7IC8vIFVuaGFuZGxlZCAnZXJyb3InIGV2ZW50XG4gICAgICB9XG4gICAgICB0aHJvdyBUeXBlRXJyb3IoJ1VuY2F1Z2h0LCB1bnNwZWNpZmllZCBcImVycm9yXCIgZXZlbnQuJyk7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlciA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICBpZiAoaXNVbmRlZmluZWQoaGFuZGxlcikpXG4gICAgcmV0dXJuIGZhbHNlO1xuXG4gIGlmIChpc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG4gICAgc3dpdGNoIChhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgICAvLyBmYXN0IGNhc2VzXG4gICAgICBjYXNlIDE6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDI6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICAvLyBzbG93ZXJcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH1cbiAgfSBlbHNlIGlmIChpc09iamVjdChoYW5kbGVyKSkge1xuICAgIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgIGxpc3RlbmVycyA9IGhhbmRsZXIuc2xpY2UoKTtcbiAgICBsZW4gPSBsaXN0ZW5lcnMubGVuZ3RoO1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKylcbiAgICAgIGxpc3RlbmVyc1tpXS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIHZhciBtO1xuXG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBUbyBhdm9pZCByZWN1cnNpb24gaW4gdGhlIGNhc2UgdGhhdCB0eXBlID09PSBcIm5ld0xpc3RlbmVyXCIhIEJlZm9yZVxuICAvLyBhZGRpbmcgaXQgdG8gdGhlIGxpc3RlbmVycywgZmlyc3QgZW1pdCBcIm5ld0xpc3RlbmVyXCIuXG4gIGlmICh0aGlzLl9ldmVudHMubmV3TGlzdGVuZXIpXG4gICAgdGhpcy5lbWl0KCduZXdMaXN0ZW5lcicsIHR5cGUsXG4gICAgICAgICAgICAgIGlzRnVuY3Rpb24obGlzdGVuZXIubGlzdGVuZXIpID9cbiAgICAgICAgICAgICAgbGlzdGVuZXIubGlzdGVuZXIgOiBsaXN0ZW5lcik7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgLy8gT3B0aW1pemUgdGhlIGNhc2Ugb2Ygb25lIGxpc3RlbmVyLiBEb24ndCBuZWVkIHRoZSBleHRyYSBhcnJheSBvYmplY3QuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gbGlzdGVuZXI7XG4gIGVsc2UgaWYgKGlzT2JqZWN0KHRoaXMuX2V2ZW50c1t0eXBlXSkpXG4gICAgLy8gSWYgd2UndmUgYWxyZWFkeSBnb3QgYW4gYXJyYXksIGp1c3QgYXBwZW5kLlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5wdXNoKGxpc3RlbmVyKTtcbiAgZWxzZVxuICAgIC8vIEFkZGluZyB0aGUgc2Vjb25kIGVsZW1lbnQsIG5lZWQgdG8gY2hhbmdlIHRvIGFycmF5LlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IFt0aGlzLl9ldmVudHNbdHlwZV0sIGxpc3RlbmVyXTtcblxuICAvLyBDaGVjayBmb3IgbGlzdGVuZXIgbGVha1xuICBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSAmJiAhdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCkge1xuICAgIGlmICghaXNVbmRlZmluZWQodGhpcy5fbWF4TGlzdGVuZXJzKSkge1xuICAgICAgbSA9IHRoaXMuX21heExpc3RlbmVycztcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IEV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzO1xuICAgIH1cblxuICAgIGlmIChtICYmIG0gPiAwICYmIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGggPiBtKSB7XG4gICAgICB0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkID0gdHJ1ZTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyhub2RlKSB3YXJuaW5nOiBwb3NzaWJsZSBFdmVudEVtaXR0ZXIgbWVtb3J5ICcgK1xuICAgICAgICAgICAgICAgICAgICAnbGVhayBkZXRlY3RlZC4gJWQgbGlzdGVuZXJzIGFkZGVkLiAnICtcbiAgICAgICAgICAgICAgICAgICAgJ1VzZSBlbWl0dGVyLnNldE1heExpc3RlbmVycygpIHRvIGluY3JlYXNlIGxpbWl0LicsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGgpO1xuICAgICAgaWYgKHR5cGVvZiBjb25zb2xlLnRyYWNlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIC8vIG5vdCBzdXBwb3J0ZWQgaW4gSUUgMTBcbiAgICAgICAgY29uc29sZS50cmFjZSgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbiA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICB2YXIgZmlyZWQgPSBmYWxzZTtcblxuICBmdW5jdGlvbiBnKCkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgZyk7XG5cbiAgICBpZiAoIWZpcmVkKSB7XG4gICAgICBmaXJlZCA9IHRydWU7XG4gICAgICBsaXN0ZW5lci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH1cbiAgfVxuXG4gIGcubGlzdGVuZXIgPSBsaXN0ZW5lcjtcbiAgdGhpcy5vbih0eXBlLCBnKTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8vIGVtaXRzIGEgJ3JlbW92ZUxpc3RlbmVyJyBldmVudCBpZmYgdGhlIGxpc3RlbmVyIHdhcyByZW1vdmVkXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIGxpc3QsIHBvc2l0aW9uLCBsZW5ndGgsIGk7XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgbGlzdCA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgbGVuZ3RoID0gbGlzdC5sZW5ndGg7XG4gIHBvc2l0aW9uID0gLTE7XG5cbiAgaWYgKGxpc3QgPT09IGxpc3RlbmVyIHx8XG4gICAgICAoaXNGdW5jdGlvbihsaXN0Lmxpc3RlbmVyKSAmJiBsaXN0Lmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuXG4gIH0gZWxzZSBpZiAoaXNPYmplY3QobGlzdCkpIHtcbiAgICBmb3IgKGkgPSBsZW5ndGg7IGktLSA+IDA7KSB7XG4gICAgICBpZiAobGlzdFtpXSA9PT0gbGlzdGVuZXIgfHxcbiAgICAgICAgICAobGlzdFtpXS5saXN0ZW5lciAmJiBsaXN0W2ldLmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICAgICAgcG9zaXRpb24gPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocG9zaXRpb24gPCAwKVxuICAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICAgIGxpc3QubGVuZ3RoID0gMDtcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGxpc3Quc3BsaWNlKHBvc2l0aW9uLCAxKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKVxuICAgICAgdGhpcy5lbWl0KCdyZW1vdmVMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciBrZXksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICByZXR1cm4gdGhpcztcblxuICAvLyBub3QgbGlzdGVuaW5nIGZvciByZW1vdmVMaXN0ZW5lciwgbm8gbmVlZCB0byBlbWl0XG4gIGlmICghdGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKSB7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApXG4gICAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICBlbHNlIGlmICh0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gZW1pdCByZW1vdmVMaXN0ZW5lciBmb3IgYWxsIGxpc3RlbmVycyBvbiBhbGwgZXZlbnRzXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgZm9yIChrZXkgaW4gdGhpcy5fZXZlbnRzKSB7XG4gICAgICBpZiAoa2V5ID09PSAncmVtb3ZlTGlzdGVuZXInKSBjb250aW51ZTtcbiAgICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKGtleSk7XG4gICAgfVxuICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKCdyZW1vdmVMaXN0ZW5lcicpO1xuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgbGlzdGVuZXJzID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIGlmIChpc0Z1bmN0aW9uKGxpc3RlbmVycykpIHtcbiAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVycyk7XG4gIH0gZWxzZSBpZiAobGlzdGVuZXJzKSB7XG4gICAgLy8gTElGTyBvcmRlclxuICAgIHdoaWxlIChsaXN0ZW5lcnMubGVuZ3RoKVxuICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcnNbbGlzdGVuZXJzLmxlbmd0aCAtIDFdKTtcbiAgfVxuICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciByZXQ7XG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0ID0gW107XG4gIGVsc2UgaWYgKGlzRnVuY3Rpb24odGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICByZXQgPSBbdGhpcy5fZXZlbnRzW3R5cGVdXTtcbiAgZWxzZVxuICAgIHJldCA9IHRoaXMuX2V2ZW50c1t0eXBlXS5zbGljZSgpO1xuICByZXR1cm4gcmV0O1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lckNvdW50ID0gZnVuY3Rpb24odHlwZSkge1xuICBpZiAodGhpcy5fZXZlbnRzKSB7XG4gICAgdmFyIGV2bGlzdGVuZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgICBpZiAoaXNGdW5jdGlvbihldmxpc3RlbmVyKSlcbiAgICAgIHJldHVybiAxO1xuICAgIGVsc2UgaWYgKGV2bGlzdGVuZXIpXG4gICAgICByZXR1cm4gZXZsaXN0ZW5lci5sZW5ndGg7XG4gIH1cbiAgcmV0dXJuIDA7XG59O1xuXG5FdmVudEVtaXR0ZXIubGlzdGVuZXJDb3VudCA9IGZ1bmN0aW9uKGVtaXR0ZXIsIHR5cGUpIHtcbiAgcmV0dXJuIGVtaXR0ZXIubGlzdGVuZXJDb3VudCh0eXBlKTtcbn07XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZ2VvQXJjO1xuXG5mdW5jdGlvbiBnZW9BcmMob3B0aW9ucykge1xuXG4gIHZhciBnZW8gPSB7XG4gICAgcG9zaXRpb25zOiBbXSxcbiAgICBjZWxsczogW10sXG4gICAgdXZzOiBbXVxuICB9O1xuXG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICBvcHRpb25zLmNlbGxTaXplID0gb3B0aW9ucy5jZWxsU2l6ZSB8fCAzO1xuICBvcHRpb25zLnggPSBvcHRpb25zLnggfHwgMDtcbiAgb3B0aW9ucy55ID0gb3B0aW9ucy55IHx8IDA7XG4gIG9wdGlvbnMueiA9IG9wdGlvbnMueiB8fCAwO1xuICBvcHRpb25zLnN0YXJ0UmFkaWFuID0gb3B0aW9ucy5zdGFydFJhZGlhbiB8fCAwO1xuICBvcHRpb25zLmVuZFJhZGlhbiA9IG9wdGlvbnMuZW5kUmFkaWFuIHx8IE1hdGguUEkgKiAxLjU7XG4gIG9wdGlvbnMuaW5uZXJSYWRpdXMgPSB0eXBlb2Ygb3B0aW9ucy5pbm5lclJhZGl1cyA9PSAnbnVtYmVyJyA/IG9wdGlvbnMuaW5uZXJSYWRpdXMgOiA0MDtcbiAgb3B0aW9ucy5vdXRlclJhZGl1cyA9IG9wdGlvbnMub3V0ZXJSYWRpdXMgfHwgMjAwO1xuICBvcHRpb25zLm51bUJhbmRzID0gb3B0aW9ucy5udW1CYW5kcyB8fCAyO1xuICBvcHRpb25zLm51bVNsaWNlcyA9IG9wdGlvbnMubnVtU2xpY2VzIHx8IDQwO1xuICBvcHRpb25zLmRyYXdPdXRsaW5lID0gb3B0aW9ucy5kcmF3T3V0bGluZSAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5kcmF3T3V0bGluZSA6IHRydWU7XG5cbiAgY3JlYXRlR2VvbWV0cnkob3B0aW9ucywgZ2VvLnBvc2l0aW9ucywgZ2VvLmNlbGxzLCBnZW8udXZzKTtcblxuICByZXR1cm4gZ2VvO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVHZW9tZXRyeShvcHRpb25zLCBwb3NpdGlvbnMsIGNlbGxzLCB1dnMpIHtcblxuICAgIHZhciBvID0gb3B0aW9ucztcbiAgICB2YXIgaWR4U2l6ZSA9IG8uY2VsbFNpemU7XG4gICAgdmFyIHJhZERpc3QgPSBvLmVuZFJhZGlhbiAtIG8uc3RhcnRSYWRpYW47XG4gICAgdmFyIG51bVNsaWNlcyA9IE1hdGguZmxvb3IoTWF0aC5hYnMocmFkRGlzdCkgLyAoTWF0aC5QSSAqIDIpICogby5udW1TbGljZXMpO1xuICAgIHZhciByYWRJbmMgPSByYWREaXN0IC8gbnVtU2xpY2VzO1xuICAgIHZhciBudW1CYW5kSW5jcyA9IChvLm51bUJhbmRzID09IDEpID8gMSA6IG8ubnVtQmFuZHMgLSAxO1xuICAgIHZhciBiYW5kSW5jID0gKG8ub3V0ZXJSYWRpdXMgLSBvLmlubmVyUmFkaXVzKSAvIG51bUJhbmRJbmNzO1xuICAgIHZhciBjUmFkLCB4LCB5LCB6LCBjUmFkaXVzLCBjdXJTbGlkZUlkeCwgcHJldlNsaWRlSWR4O1xuXG4gIGZvcih2YXIgaSA9IDAsIGxlbiA9IG51bVNsaWNlczsgaSA8PSBsZW47IGkrKykge1xuXG4gICAgY1JhZCA9IGkgKiByYWRJbmMgKyBvLnN0YXJ0UmFkaWFuO1xuICAgIHByZXZTbGlkZUlkeCA9IChpIC0gMSkgKiBvLm51bUJhbmRzO1xuICAgIGN1clNsaWRlSWR4ID0gaSAqIG8ubnVtQmFuZHM7XG5cbiAgICBmb3IodmFyIGogPSAwLCBsZW5KID0gby5udW1CYW5kczsgaiA8IGxlbko7IGorKykge1xuXG4gICAgICBjUmFkaXVzID0gby5pbm5lclJhZGl1cyArIGJhbmRJbmMgKiBqO1xuXG4gICAgICB4ID0gTWF0aC5jb3MoY1JhZCkgKiBjUmFkaXVzICsgby54O1xuICAgICAgeSA9IG8ueTtcbiAgICAgIHogPSBNYXRoLnNpbihjUmFkKSAqIGNSYWRpdXMgKyBvLno7XG5cbiAgICAgIHBvc2l0aW9ucy5wdXNoKFsgeCwgeSwgeiBdKTtcbiAgICAgIHV2cy5wdXNoKFtpL251bVNsaWNlcywgai9udW1CYW5kSW5jc10pXG5cbiAgICAgIC8vaWYgd2UndmUgYWRkZWQgaW4gcG9zaXRpb25zIHRoZW4gd2UnbGwgYWRkIGNlbGxzXG4gICAgICBpZihpZHhTaXplID09IDEpIHtcblxuICAgICAgICBjZWxscy5wdXNoKFsgY3VyU2xpZGVJZHggKyBqIF0pO1xuICAgICAgfSBlbHNlIGlmKGlkeFNpemUgPT0gMikge1xuXG4gICAgICAgIGlmKGkgPiAwICYmIGogKyAxIDwgbGVuSikge1xuXG4gICAgICAgICAgY2VsbHMucHVzaCggWyBcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZXZTbGlkZUlkeCArIGosIFxuICAgICAgICAgICAgICAgICAgICAgICAgY3VyU2xpZGVJZHggKyBqIFxuICAgICAgICAgICAgICAgICAgICAgIF0pO1xuXG4gICAgICAgICAgY2VsbHMucHVzaCggWyBcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1clNsaWRlSWR4ICsgaiArIDEsIFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJldlNsaWRlSWR4ICsgaiArIDEgXG4gICAgICAgICAgICAgICAgICAgICAgXSk7XG5cbiAgICAgICAgICBpZiggIW8uZHJhd091dGxpbmUgKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNlbGxzLnB1c2goIFsgXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGN1clNsaWRlSWR4ICsgaiwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGN1clNsaWRlSWR4ICsgaiArIDEgXG4gICAgICAgICAgICAgICAgICAgICAgICBdKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZihpZHhTaXplID09IDMpIHtcblxuICAgICAgICBpZihpID4gMCAmJiBqICsgMSA8IGxlbkopIHtcblxuICAgICAgICAgIGNlbGxzLnB1c2goIFsgXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJTbGlkZUlkeCArIGosXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2U2xpZGVJZHggKyBqICsgMSwgXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2U2xpZGVJZHggKyBqXG4gICAgICAgICAgICAgICAgICAgICAgXSk7XG5cbiAgICAgICAgICBjZWxscy5wdXNoKCBbIFxuICAgICAgICAgICAgICAgICAgICAgICAgY3VyU2xpZGVJZHggKyBqLCBcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1clNsaWRlSWR4ICsgaiArIDEsIFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJldlNsaWRlSWR4ICsgaiArIDEgXG4gICAgICAgICAgICAgICAgICAgICAgXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvL2NhcCBpdCBvZmZcbiAgaWYoaWR4U2l6ZSA9PSAyKSB7XG4gICAgXG4gICAgLy8gaWYgaXQncyBnb2luZyBhbGwgdGhlIHdheSBhcm91bmQgdGhlbiB3ZSB3b250IHB1dCB0aGUgY29ubmVjdGluZyBsaW5lXG4gICAgaWYoIHJhZERpc3QgJSBNYXRoLlBJICogMiAhPSAwICkge1xuXG4gICAgICBmb3IodmFyIGogPSAwLCBsZW5KID0gby5udW1CYW5kcyAtIDE7IGogPCBsZW5KOyBqKyspIHtcblxuICAgICAgICBjZWxscy5wdXNoKFsgXG4gICAgICAgICAgICAgICAgICAgICAgY3VyU2xpZGVJZHggKyBqLCBcbiAgICAgICAgICAgICAgICAgICAgICBjdXJTbGlkZUlkeCArIGogKyAxIF0pO1xuICAgICAgfVxuXG4gICAgICBjdXJTbGlkZUlkeCA9IDA7XG5cbiAgICAgIGZvcih2YXIgaiA9IDAsIGxlbkogPSBvLm51bUJhbmRzIC0gMTsgaiA8IGxlbko7IGorKykge1xuXG4gICAgICAgIGNlbGxzLnB1c2goWyBcbiAgICAgICAgICAgICAgICAgICAgICBjdXJTbGlkZUlkeCArIGosIFxuICAgICAgICAgICAgICAgICAgICAgIGN1clNsaWRlSWR4ICsgaiArIDEgXSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59IiwibW9kdWxlLmV4cG9ydHMgPSBnZW9QaWVjZVJpbmc7XG5cbmZ1bmN0aW9uIGdlb1BpZWNlUmluZyhvcHRpb25zKSB7XG5cbiAgdmFyIGdlbyA9IHtcbiAgICBwb3NpdGlvbnM6IFtdLFxuICAgIGNlbGxzOiBbXVxuICB9O1xuXG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICBvcHRpb25zLmNlbGxTaXplID0gb3B0aW9ucy5jZWxsU2l6ZSB8fCAzO1xuICBvcHRpb25zLnggPSBvcHRpb25zLnggfHwgMDtcbiAgb3B0aW9ucy55ID0gb3B0aW9ucy55IHx8IDA7XG4gIG9wdGlvbnMueiA9IG9wdGlvbnMueiB8fCAwO1xuICBvcHRpb25zLnJhZGl1cyA9IG9wdGlvbnMucmFkaXVzIHx8IDIwMDtcbiAgb3B0aW9ucy5waWVjZVNpemUgPSBvcHRpb25zLnBpZWNlU2l6ZSB8fCBNYXRoLlBJICogMC4xNTtcbiAgb3B0aW9ucy5zdGFydFJhZGlhbiA9IG9wdGlvbnMuc3RhcnRSYWRpYW4gfHwgMDtcbiAgb3B0aW9ucy5udW1QaWVjZXMgPSBvcHRpb25zLm51bVBpZWNlcyB8fCA4O1xuICBvcHRpb25zLnF1YWRzUGVyUGllY2UgPSBvcHRpb25zLnF1YWRzUGVyUGllY2UgfHwgNTtcbiAgb3B0aW9ucy5oZWlnaHQgPSBvcHRpb25zLmhlaWdodCB8fCAxMDtcbiAgb3B0aW9ucy5kcmF3T3V0bGluZSA9IG9wdGlvbnMuZHJhd091dGxpbmUgPT09IHVuZGVmaW5lZCA/IHRydWUgOiBvcHRpb25zLmRyYXdPdXRsaW5lO1xuICBcbiAgY3JlYXRlR2VvbWV0cnkob3B0aW9ucywgZ2VvLnBvc2l0aW9ucywgZ2VvLmNlbGxzKTtcblxuICByZXR1cm4gZ2VvO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVHZW9tZXRyeShvcHRpb25zLCBwb3NpdGlvbnMsIGNlbGxzKSB7XG5cbiAgdmFyIG8gPSBvcHRpb25zO1xuICB2YXIgcG9zID0gcG9zaXRpb25zO1xuICB2YXIgeSA9IG8ueTtcbiAgdmFyIGhhbGZIZWlnaHQgPSBvLmhlaWdodCAqIDAuNTtcbiAgdmFyIHJhZGl1cyA9IG8ucmFkaXVzO1xuICB2YXIgcGllY2VTaXplID0gby5waWVjZVNpemU7XG4gIHZhciBudW1QaWVjZXMgPSBvLm51bVBpZWNlcztcbiAgdmFyIHF1YWRzUFAgPSBvLnF1YWRzUGVyUGllY2U7XG4gIHZhciBzdGFydFJhZGlhbiA9IG8uc3RhcnRSYWRpYW47XG4gIHZhciByYWRJbmMgPSAoMiAqIE1hdGguUEkgLSAoIG51bVBpZWNlcyAqIHBpZWNlU2l6ZSApKSAvIG51bVBpZWNlcztcbiAgdmFyIHF1YWRSYWRJbmMgPSBwaWVjZVNpemUgLyBxdWFkc1BQO1xuICB2YXIgY3VyUmFkID0gMDsgXG4gIHZhciBzSWR4ID0gMDtcbiAgdmFyIHgsIHosIHgyLCB6MiwgcjEsIHIyO1xuXG4gIGZvcih2YXIgaSA9IDA7IGkgPCBudW1QaWVjZXM7IGkrKykge1xuXG4gICAgZm9yKHZhciBqID0gMDsgaiA8IHF1YWRzUFA7IGorKykge1xuXG4gICAgICByMSA9IGN1clJhZCArIHF1YWRSYWRJbmMgKiBqICsgc3RhcnRSYWRpYW47XG4gICAgICByMiA9IGN1clJhZCArIHF1YWRSYWRJbmMgKiAoaiArIDEpICsgc3RhcnRSYWRpYW47XG5cbiAgICAgIHggPSBNYXRoLmNvcyhyMSkgKiByYWRpdXMgKyBvLng7XG4gICAgICB6ID0gTWF0aC5zaW4ocjEpICogcmFkaXVzICsgby56O1xuICAgICAgeDIgPSBNYXRoLmNvcyhyMikgKiByYWRpdXMgKyBvLng7XG4gICAgICB6MiA9IE1hdGguc2luKHIyKSAqIHJhZGl1cyArIG8uejtcblxuICAgICAgcG9zLnB1c2goWyB4LCB5IC0gaGFsZkhlaWdodCwgeiBdKTtcbiAgICAgIHBvcy5wdXNoKFsgeCwgeSArIGhhbGZIZWlnaHQsIHogXSk7XG4gICAgICBwb3MucHVzaChbIHgyLCB5ICsgaGFsZkhlaWdodCwgejIgXSk7XG4gICAgICBwb3MucHVzaChbIHgyLCB5IC0gaGFsZkhlaWdodCwgejIgXSk7XG4gICAgICBcbiAgICAgIC8vYWRkIGluIHRoZSBjZWxsc1xuICAgICAgaWYoby5jZWxsU2l6ZSA9PSAxKSB7XG5cbiAgICAgICAgY2VsbHMucHVzaChbIHNJZHggXSk7XG4gICAgICAgIGNlbGxzLnB1c2goWyBzSWR4ICsgMSBdKTtcbiAgICAgICAgY2VsbHMucHVzaChbIHNJZHggKyAyIF0pO1xuICAgICAgICBjZWxscy5wdXNoKFsgc0lkeCArIDMgXSk7XG4gICAgICB9IGVsc2UgaWYoby5jZWxsU2l6ZSA9PSAyKSB7XG5cbiAgICAgICAgLy8gdmVydGljYWwgbGluZXNcbiAgICAgICAgaWYoICFvLmRyYXdPdXRsaW5lICkge1xuXG4gICAgICAgICAgY2VsbHMucHVzaChbIHNJZHgsIHNJZHggKyAxIF0pO1xuICAgICAgICAgIGNlbGxzLnB1c2goWyBzSWR4ICsgMiwgc0lkeCArIDMgXSk7XG4gICAgICAgIH0gZWxzZSBpZiggaiA9PT0gMCApIHtcblxuICAgICAgICAgIGNlbGxzLnB1c2goWyBzSWR4LCBzSWR4ICsgMSBdKTtcbiAgICAgICAgfSBlbHNlIGlmKCBqID09IHF1YWRzUFAgLSAxICkge1xuXG4gICAgICAgICAgY2VsbHMucHVzaChbIHNJZHggKyAyLCBzSWR4ICsgMyBdKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gaG9yaXpvbnRhbCBsaW5lc1xuICAgICAgICBjZWxscy5wdXNoKFsgc0lkeCArIDEsIHNJZHggKyAyIF0pO1xuICAgICAgICBjZWxscy5wdXNoKFsgc0lkeCArIDMsIHNJZHggXSk7XG4gICAgICB9IGVsc2UgaWYoby5jZWxsU2l6ZSA9PSAzKSB7XG5cbiAgICAgICAgY2VsbHMucHVzaChbIHNJZHgsIHNJZHggKyAxLCBzSWR4ICsgMiBdKTtcbiAgICAgICAgY2VsbHMucHVzaChbIHNJZHggKyAzLCBzSWR4LCBzSWR4ICsgMiBdKTtcbiAgICAgIH1cblxuICAgICAgc0lkeCArPSA0O1xuICAgIH1cblxuICAgIGN1clJhZCArPSByYWRJbmMgKyBwaWVjZVNpemU7XG4gIH1cbn0iLCJ2YXIgYXJyYXlFcXVhbCA9IHJlcXVpcmUoJ2FycmF5LWVxdWFsJylcblxubW9kdWxlLmV4cG9ydHMgPSBpbmRleE9mQXJyYXlcbmZ1bmN0aW9uIGluZGV4T2ZBcnJheSAoYXJyYXksIHNlYXJjaEVsZW1lbnQsIGZyb21JbmRleCkge1xuICAvLyB1c2UgdWludDMyXG4gIHZhciBsZW4gPSBhcnJheS5sZW5ndGggPj4+IDBcbiAgaWYgKGxlbiA9PT0gMCkge1xuICAgIHJldHVybiAtMVxuICB9XG5cbiAgdmFyIHN0YXJ0ID0gK2Zyb21JbmRleCB8fCAwXG4gIGlmIChNYXRoLmFicyhzdGFydCkgPT09IEluZmluaXR5KSB7XG4gICAgc3RhcnQgPSAwXG4gIH1cblxuICBpZiAoc3RhcnQgPj0gbGVuKSB7XG4gICAgcmV0dXJuIC0xXG4gIH1cblxuICAvLyBhbGxvdyBuZWdhdGl2ZSBmcm9tSW5kZXhcbiAgc3RhcnQgPSBNYXRoLm1heChzdGFydCA+PSAwID8gc3RhcnQgOiBsZW4gLSBNYXRoLmFicyhzdGFydCksIDApXG5cbiAgLy8gc2VhcmNoXG4gIHdoaWxlIChzdGFydCA8IGxlbikge1xuICAgIGlmIChhcnJheUVxdWFsKGFycmF5W3N0YXJ0XSwgc2VhcmNoRWxlbWVudCkpIHtcbiAgICAgIHJldHVybiBzdGFydFxuICAgIH1cbiAgICBzdGFydCsrXG4gIH1cbiAgcmV0dXJuIC0xXG59XG4iLCJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZXF1YWwoYXJyMSwgYXJyMikge1xuICB2YXIgbGVuZ3RoID0gYXJyMS5sZW5ndGhcbiAgaWYgKGxlbmd0aCAhPT0gYXJyMi5sZW5ndGgpIHJldHVybiBmYWxzZVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKVxuICAgIGlmIChhcnIxW2ldICE9PSBhcnIyW2ldKVxuICAgICAgcmV0dXJuIGZhbHNlXG4gIHJldHVybiB0cnVlXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUF1ZGlvQ29udGV4dFxuZnVuY3Rpb24gY3JlYXRlQXVkaW9Db250ZXh0IChkZXNpcmVkU2FtcGxlUmF0ZSkge1xuICB2YXIgQXVkaW9DdG9yID0gd2luZG93LkF1ZGlvQ29udGV4dCB8fCB3aW5kb3cud2Via2l0QXVkaW9Db250ZXh0XG5cbiAgZGVzaXJlZFNhbXBsZVJhdGUgPSB0eXBlb2YgZGVzaXJlZFNhbXBsZVJhdGUgPT09ICdudW1iZXInXG4gICAgPyBkZXNpcmVkU2FtcGxlUmF0ZVxuICAgIDogNDQxMDBcbiAgdmFyIGNvbnRleHQgPSBuZXcgQXVkaW9DdG9yKClcblxuICAvLyBDaGVjayBpZiBoYWNrIGlzIG5lY2Vzc2FyeS4gT25seSBvY2N1cnMgaW4gaU9TNisgZGV2aWNlc1xuICAvLyBhbmQgb25seSB3aGVuIHlvdSBmaXJzdCBib290IHRoZSBpUGhvbmUsIG9yIHBsYXkgYSBhdWRpby92aWRlb1xuICAvLyB3aXRoIGEgZGlmZmVyZW50IHNhbXBsZSByYXRlXG4gIGlmICgvKGlQaG9uZXxpUGFkKS9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCkgJiZcbiAgICAgIGNvbnRleHQuc2FtcGxlUmF0ZSAhPT0gZGVzaXJlZFNhbXBsZVJhdGUpIHtcbiAgICB2YXIgYnVmZmVyID0gY29udGV4dC5jcmVhdGVCdWZmZXIoMSwgMSwgZGVzaXJlZFNhbXBsZVJhdGUpXG4gICAgdmFyIGR1bW15ID0gY29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKVxuICAgIGR1bW15LmJ1ZmZlciA9IGJ1ZmZlclxuICAgIGR1bW15LmNvbm5lY3QoY29udGV4dC5kZXN0aW5hdGlvbilcbiAgICBkdW1teS5zdGFydCgwKVxuICAgIGR1bW15LmRpc2Nvbm5lY3QoKVxuICAgIFxuICAgIGNvbnRleHQuY2xvc2UoKSAvLyBkaXNwb3NlIG9sZCBjb250ZXh0XG4gICAgY29udGV4dCA9IG5ldyBBdWRpb0N0b3IoKVxuICB9XG5cbiAgcmV0dXJuIGNvbnRleHRcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gbmV3QXJyYXlcblxuZnVuY3Rpb24gbmV3QXJyYXkgKG4sIHZhbHVlKSB7XG4gIG4gPSBuIHx8IDBcbiAgdmFyIGFycmF5ID0gbmV3IEFycmF5KG4pXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgYXJyYXlbaV0gPSB2YWx1ZVxuICB9XG4gIHJldHVybiBhcnJheVxufVxuIiwiLyogZXNsaW50LWRpc2FibGUgbm8tdW51c2VkLXZhcnMgKi9cbid1c2Ugc3RyaWN0JztcbnZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG52YXIgcHJvcElzRW51bWVyYWJsZSA9IE9iamVjdC5wcm90b3R5cGUucHJvcGVydHlJc0VudW1lcmFibGU7XG5cbmZ1bmN0aW9uIHRvT2JqZWN0KHZhbCkge1xuXHRpZiAodmFsID09PSBudWxsIHx8IHZhbCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignT2JqZWN0LmFzc2lnbiBjYW5ub3QgYmUgY2FsbGVkIHdpdGggbnVsbCBvciB1bmRlZmluZWQnKTtcblx0fVxuXG5cdHJldHVybiBPYmplY3QodmFsKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBPYmplY3QuYXNzaWduIHx8IGZ1bmN0aW9uICh0YXJnZXQsIHNvdXJjZSkge1xuXHR2YXIgZnJvbTtcblx0dmFyIHRvID0gdG9PYmplY3QodGFyZ2V0KTtcblx0dmFyIHN5bWJvbHM7XG5cblx0Zm9yICh2YXIgcyA9IDE7IHMgPCBhcmd1bWVudHMubGVuZ3RoOyBzKyspIHtcblx0XHRmcm9tID0gT2JqZWN0KGFyZ3VtZW50c1tzXSk7XG5cblx0XHRmb3IgKHZhciBrZXkgaW4gZnJvbSkge1xuXHRcdFx0aWYgKGhhc093blByb3BlcnR5LmNhbGwoZnJvbSwga2V5KSkge1xuXHRcdFx0XHR0b1trZXldID0gZnJvbVtrZXldO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKSB7XG5cdFx0XHRzeW1ib2xzID0gT2JqZWN0LmdldE93blByb3BlcnR5U3ltYm9scyhmcm9tKTtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgc3ltYm9scy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAocHJvcElzRW51bWVyYWJsZS5jYWxsKGZyb20sIHN5bWJvbHNbaV0pKSB7XG5cdFx0XHRcdFx0dG9bc3ltYm9sc1tpXV0gPSBmcm9tW3N5bWJvbHNbaV1dO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRvO1xufTtcbiIsInZhciBkZWZpbmVkID0gcmVxdWlyZSgnZGVmaW5lZCcpXG52YXIgY2xhbXAgPSByZXF1aXJlKCdjbGFtcCcpXG5cbnZhciBpbnB1dEV2ZW50cyA9IHJlcXVpcmUoJy4vbGliL2lucHV0JylcbnZhciBxdWF0RnJvbVZlYzMgPSByZXF1aXJlKCdxdWF0LWZyb20tdW5pdC12ZWMzJylcbnZhciBxdWF0SW52ZXJ0ID0gcmVxdWlyZSgnZ2wtcXVhdC9pbnZlcnQnKVxuXG52YXIgZ2xWZWMzID0ge1xuICBsZW5ndGg6IHJlcXVpcmUoJ2dsLXZlYzMvbGVuZ3RoJyksXG4gIGFkZDogcmVxdWlyZSgnZ2wtdmVjMy9hZGQnKSxcbiAgc3VidHJhY3Q6IHJlcXVpcmUoJ2dsLXZlYzMvc3VidHJhY3QnKSxcbiAgdHJhbnNmb3JtUXVhdDogcmVxdWlyZSgnZ2wtdmVjMy90cmFuc2Zvcm1RdWF0JyksXG4gIGNvcHk6IHJlcXVpcmUoJ2dsLXZlYzMvY29weScpLFxuICBub3JtYWxpemU6IHJlcXVpcmUoJ2dsLXZlYzMvbm9ybWFsaXplJyksXG4gIGNyb3NzOiByZXF1aXJlKCdnbC12ZWMzL2Nyb3NzJylcbn1cblxudmFyIFlfVVAgPSBbMCwgMSwgMF1cbnZhciBFUFNJTE9OID0gTWF0aC5wb3coMiwgLTIzKVxudmFyIHRtcFZlYzMgPSBbMCwgMCwgMF1cblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVPcmJpdENvbnRyb2xzXG5mdW5jdGlvbiBjcmVhdGVPcmJpdENvbnRyb2xzIChvcHQpIHtcbiAgb3B0ID0gb3B0IHx8IHt9XG5cbiAgdmFyIGlucHV0RGVsdGEgPSBbMCwgMCwgMF0gLy8geCwgeSwgem9vbVxuICB2YXIgb2Zmc2V0ID0gWzAsIDAsIDBdXG5cbiAgdmFyIHVwUXVhdCA9IFswLCAwLCAwLCAxXVxuICB2YXIgdXBRdWF0SW52ZXJzZSA9IHVwUXVhdC5zbGljZSgpXG5cbiAgdmFyIGNvbnRyb2xzID0ge1xuICAgIHVwZGF0ZTogdXBkYXRlLFxuICAgIGNvcHlJbnRvOiBjb3B5SW50byxcblxuICAgIHBvc2l0aW9uOiBvcHQucG9zaXRpb24gPyBvcHQucG9zaXRpb24uc2xpY2UoKSA6IFswLCAwLCAxXSxcbiAgICBkaXJlY3Rpb246IFswLCAwLCAtMV0sXG4gICAgdXA6IG9wdC51cCA/IG9wdC51cC5zbGljZSgpIDogWzAsIDEsIDBdLFxuXG4gICAgdGFyZ2V0OiBvcHQudGFyZ2V0ID8gb3B0LnRhcmdldC5zbGljZSgpIDogWzAsIDAsIDBdLFxuICAgIHBoaTogZGVmaW5lZChvcHQucGhpLCBNYXRoLlBJIC8gMiksXG4gICAgdGhldGE6IG9wdC50aGV0YSB8fCAwLFxuICAgIGRpc3RhbmNlOiBkZWZpbmVkKG9wdC5kaXN0YW5jZSwgMSksXG4gICAgZGFtcGluZzogZGVmaW5lZChvcHQuZGFtcGluZywgMC4yNSksXG4gICAgcm90YXRlU3BlZWQ6IGRlZmluZWQob3B0LnJvdGF0ZVNwZWVkLCAwLjI4KSxcbiAgICB6b29tU3BlZWQ6IGRlZmluZWQob3B0Lnpvb21TcGVlZCwgMC4wMDc1KSxcbiAgICBwaW5jaFNwZWVkOiBkZWZpbmVkKG9wdC5waW5jaFNwZWVkLCAwLjAwNzUpLFxuXG4gICAgcGluY2g6IG9wdC5waW5jaGluZyAhPT0gZmFsc2UsXG4gICAgem9vbTogb3B0Lnpvb20gIT09IGZhbHNlLFxuICAgIHJvdGF0ZTogb3B0LnJvdGF0ZSAhPT0gZmFsc2UsXG5cbiAgICBwaGlCb3VuZHM6IG9wdC5waGlCb3VuZHMgfHwgWzAsIE1hdGguUEldLFxuICAgIHRoZXRhQm91bmRzOiBvcHQudGhldGFCb3VuZHMgfHwgWy1JbmZpbml0eSwgSW5maW5pdHldLFxuICAgIGRpc3RhbmNlQm91bmRzOiBvcHQuZGlzdGFuY2VCb3VuZHMgfHwgWzAsIEluZmluaXR5XVxuICB9XG5cbiAgLy8gQ29tcHV0ZSBkaXN0YW5jZSBpZiBub3QgZGVmaW5lZCBpbiB1c2VyIG9wdGlvbnNcbiAgaWYgKHR5cGVvZiBvcHQuZGlzdGFuY2UgIT09ICdudW1iZXInKSB7XG4gICAgZ2xWZWMzLnN1YnRyYWN0KHRtcFZlYzMsIGNvbnRyb2xzLnBvc2l0aW9uLCBjb250cm9scy50YXJnZXQpXG4gICAgY29udHJvbHMuZGlzdGFuY2UgPSBnbFZlYzMubGVuZ3RoKHRtcFZlYzMpXG4gIH1cblxuICAvLyBBcHBseSBhbiBpbml0aWFsIHBoaSBhbmQgdGhldGFcbiAgYXBwbHlQaGlUaGV0YSgpXG5cbiAgaW5wdXRFdmVudHMoe1xuICAgIHBhcmVudDogb3B0LnBhcmVudCB8fCB3aW5kb3csXG4gICAgZWxlbWVudDogb3B0LmVsZW1lbnQsXG4gICAgcm90YXRlOiBvcHQucm90YXRlICE9PSBmYWxzZSA/IGlucHV0Um90YXRlIDogbnVsbCxcbiAgICB6b29tOiBvcHQuem9vbSAhPT0gZmFsc2UgPyBpbnB1dFpvb20gOiBudWxsLFxuICAgIHBpbmNoOiBvcHQucGluY2ggIT09IGZhbHNlID8gaW5wdXRQaW5jaCA6IG51bGxcbiAgfSlcblxuICByZXR1cm4gY29udHJvbHNcblxuICBmdW5jdGlvbiBpbnB1dFJvdGF0ZSAoZHgsIGR5KSB7XG4gICAgdmFyIFBJMiA9IE1hdGguUEkgKiAyXG4gICAgaW5wdXREZWx0YVswXSAtPSBQSTIgKiBkeCAqIGNvbnRyb2xzLnJvdGF0ZVNwZWVkXG4gICAgaW5wdXREZWx0YVsxXSAtPSBQSTIgKiBkeSAqIGNvbnRyb2xzLnJvdGF0ZVNwZWVkXG4gIH1cblxuICBmdW5jdGlvbiBpbnB1dFpvb20gKGRlbHRhKSB7XG4gICAgaW5wdXREZWx0YVsyXSArPSBkZWx0YSAqIGNvbnRyb2xzLnpvb21TcGVlZFxuICB9XG5cbiAgZnVuY3Rpb24gaW5wdXRQaW5jaCAoZGVsdGEpIHtcbiAgICBpbnB1dERlbHRhWzJdIC09IGRlbHRhICogY29udHJvbHMucGluY2hTcGVlZFxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlICgpIHtcbiAgICB2YXIgY2FtZXJhVXAgPSBjb250cm9scy51cCB8fCBZX1VQXG4gICAgcXVhdEZyb21WZWMzKHVwUXVhdCwgY2FtZXJhVXAsIFlfVVApXG4gICAgcXVhdEludmVydCh1cFF1YXRJbnZlcnNlLCB1cFF1YXQpXG5cbiAgICB2YXIgZGlzdGFuY2UgPSBjb250cm9scy5kaXN0YW5jZVxuXG4gICAgZ2xWZWMzLnN1YnRyYWN0KG9mZnNldCwgY29udHJvbHMucG9zaXRpb24sIGNvbnRyb2xzLnRhcmdldClcbiAgICBnbFZlYzMudHJhbnNmb3JtUXVhdChvZmZzZXQsIG9mZnNldCwgdXBRdWF0KVxuXG4gICAgdmFyIHRoZXRhID0gTWF0aC5hdGFuMihvZmZzZXRbMF0sIG9mZnNldFsyXSlcbiAgICB2YXIgcGhpID0gTWF0aC5hdGFuMihNYXRoLnNxcnQob2Zmc2V0WzBdICogb2Zmc2V0WzBdICsgb2Zmc2V0WzJdICogb2Zmc2V0WzJdKSwgb2Zmc2V0WzFdKVxuXG4gICAgdGhldGEgKz0gaW5wdXREZWx0YVswXVxuICAgIHBoaSArPSBpbnB1dERlbHRhWzFdXG5cbiAgICB0aGV0YSA9IGNsYW1wKHRoZXRhLCBjb250cm9scy50aGV0YUJvdW5kc1swXSwgY29udHJvbHMudGhldGFCb3VuZHNbMV0pXG4gICAgcGhpID0gY2xhbXAocGhpLCBjb250cm9scy5waGlCb3VuZHNbMF0sIGNvbnRyb2xzLnBoaUJvdW5kc1sxXSlcbiAgICBwaGkgPSBjbGFtcChwaGksIEVQU0lMT04sIE1hdGguUEkgLSBFUFNJTE9OKVxuXG4gICAgZGlzdGFuY2UgKz0gaW5wdXREZWx0YVsyXVxuICAgIGRpc3RhbmNlID0gY2xhbXAoZGlzdGFuY2UsIGNvbnRyb2xzLmRpc3RhbmNlQm91bmRzWzBdLCBjb250cm9scy5kaXN0YW5jZUJvdW5kc1sxXSlcblxuICAgIHZhciByYWRpdXMgPSBNYXRoLmFicyhkaXN0YW5jZSkgPD0gRVBTSUxPTiA/IEVQU0lMT04gOiBkaXN0YW5jZVxuICAgIG9mZnNldFswXSA9IHJhZGl1cyAqIE1hdGguc2luKHBoaSkgKiBNYXRoLnNpbih0aGV0YSlcbiAgICBvZmZzZXRbMV0gPSByYWRpdXMgKiBNYXRoLmNvcyhwaGkpXG4gICAgb2Zmc2V0WzJdID0gcmFkaXVzICogTWF0aC5zaW4ocGhpKSAqIE1hdGguY29zKHRoZXRhKVxuXG4gICAgY29udHJvbHMucGhpID0gcGhpXG4gICAgY29udHJvbHMudGhldGEgPSB0aGV0YVxuICAgIGNvbnRyb2xzLmRpc3RhbmNlID0gZGlzdGFuY2VcblxuICAgIGdsVmVjMy50cmFuc2Zvcm1RdWF0KG9mZnNldCwgb2Zmc2V0LCB1cFF1YXRJbnZlcnNlKVxuICAgIGdsVmVjMy5hZGQoY29udHJvbHMucG9zaXRpb24sIGNvbnRyb2xzLnRhcmdldCwgb2Zmc2V0KVxuICAgIGNhbUxvb2tBdChjb250cm9scy5kaXJlY3Rpb24sIGNhbWVyYVVwLCBjb250cm9scy5wb3NpdGlvbiwgY29udHJvbHMudGFyZ2V0KVxuXG4gICAgdmFyIGRhbXAgPSB0eXBlb2YgY29udHJvbHMuZGFtcGluZyA9PT0gJ251bWJlcicgPyBjb250cm9scy5kYW1waW5nIDogMVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW5wdXREZWx0YS5sZW5ndGg7IGkrKykge1xuICAgICAgaW5wdXREZWx0YVtpXSAqPSAxIC0gZGFtcFxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNvcHlJbnRvIChwb3NpdGlvbiwgZGlyZWN0aW9uLCB1cCkge1xuICAgIGlmIChwb3NpdGlvbikgZ2xWZWMzLmNvcHkocG9zaXRpb24sIGNvbnRyb2xzLnBvc2l0aW9uKVxuICAgIGlmIChkaXJlY3Rpb24pIGdsVmVjMy5jb3B5KGRpcmVjdGlvbiwgY29udHJvbHMuZGlyZWN0aW9uKVxuICAgIGlmICh1cCkgZ2xWZWMzLmNvcHkodXAsIGNvbnRyb2xzLnVwKVxuICB9XG5cbiAgZnVuY3Rpb24gYXBwbHlQaGlUaGV0YSAoKSB7XG4gICAgdmFyIGRpc3QgPSBNYXRoLm1heChFUFNJTE9OLCBjb250cm9scy5kaXN0YW5jZSlcbiAgICBjb250cm9scy5wb3NpdGlvblswXSA9IGRpc3QgKiBNYXRoLnNpbihjb250cm9scy5waGkpICogTWF0aC5zaW4oY29udHJvbHMudGhldGEpXG4gICAgY29udHJvbHMucG9zaXRpb25bMV0gPSBkaXN0ICogTWF0aC5jb3MoY29udHJvbHMucGhpKVxuICAgIGNvbnRyb2xzLnBvc2l0aW9uWzJdID0gZGlzdCAqIE1hdGguc2luKGNvbnRyb2xzLnBoaSkgKiBNYXRoLmNvcyhjb250cm9scy50aGV0YSlcbiAgICBnbFZlYzMuYWRkKGNvbnRyb2xzLnBvc2l0aW9uLCBjb250cm9scy5wb3NpdGlvbiwgY29udHJvbHMudGFyZ2V0KVxuICB9XG59XG5cbmZ1bmN0aW9uIGNhbUxvb2tBdCAoZGlyZWN0aW9uLCB1cCwgcG9zaXRpb24sIHRhcmdldCkge1xuICBnbFZlYzMuY29weShkaXJlY3Rpb24sIHRhcmdldClcbiAgZ2xWZWMzLnN1YnRyYWN0KGRpcmVjdGlvbiwgZGlyZWN0aW9uLCBwb3NpdGlvbilcbiAgZ2xWZWMzLm5vcm1hbGl6ZShkaXJlY3Rpb24sIGRpcmVjdGlvbilcbn1cbiIsInZhciBtb3VzZVdoZWVsID0gcmVxdWlyZSgnbW91c2Utd2hlZWwnKVxudmFyIGV2ZW50T2Zmc2V0ID0gcmVxdWlyZSgnbW91c2UtZXZlbnQtb2Zmc2V0JylcbnZhciBjcmVhdGVQaW5jaCA9IHJlcXVpcmUoJ3RvdWNoLXBpbmNoJylcblxubW9kdWxlLmV4cG9ydHMgPSBpbnB1dEV2ZW50c1xuZnVuY3Rpb24gaW5wdXRFdmVudHMgKG9wdCkge1xuICB2YXIgZWxlbWVudCA9IG9wdC5lbGVtZW50IHx8IHdpbmRvd1xuICB2YXIgcGFyZW50ID0gb3B0LnBhcmVudCB8fCBlbGVtZW50XG4gIHZhciBtb3VzZVN0YXJ0ID0gWzAsIDBdXG4gIHZhciBkcmFnZ2luZyA9IGZhbHNlXG4gIHZhciB0bXAgPSBbMCwgMF1cbiAgdmFyIHRtcDIgPSBbMCwgMF1cbiAgdmFyIHBpbmNoXG4gIFxuICB2YXIgem9vbUZuID0gb3B0Lnpvb21cbiAgdmFyIHJvdGF0ZUZuID0gb3B0LnJvdGF0ZVxuICB2YXIgcGluY2hGbiA9IG9wdC5waW5jaFxuICBcbiAgaWYgKHpvb21Gbikge1xuICAgIG1vdXNlV2hlZWwoZWxlbWVudCwgZnVuY3Rpb24gKGR4LCBkeSkge1xuICAgICAgem9vbUZuKGR5KVxuICAgIH0sIHRydWUpXG4gIH1cbiAgXG4gIGlmIChyb3RhdGVGbikge1xuICAgIC8vIGZvciBkcmFnZ2luZyB0byB3b3JrIG91dHNpZGUgY2FudmFzIGJvdW5kcyxcbiAgICAvLyBtb3VzZSBldmVudHMgaGF2ZSB0byBiZSBhZGRlZCB0byBwYXJlbnRcbiAgICBwYXJlbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgb25JbnB1dERvd24pXG4gICAgcGFyZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIG9uSW5wdXRNb3ZlKVxuICAgIHBhcmVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgb25JbnB1dFVwKVxuICB9XG4gIFxuICBpZiAocm90YXRlRm4gfHwgcGluY2hGbikge1xuICAgIHBpbmNoID0gY3JlYXRlUGluY2goZWxlbWVudClcbiAgICBcbiAgICAvLyBkb24ndCBhbGxvdyBzaW11bGF0ZWQgbW91c2UgZXZlbnRzXG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0JywgcHJldmVudERlZmF1bHQpXG4gICAgXG4gICAgaWYgKHJvdGF0ZUZuKSB0b3VjaFJvdGF0ZSgpXG4gICAgaWYgKHBpbmNoRm4pIHRvdWNoUGluY2goKVxuICB9XG5cbiAgZnVuY3Rpb24gcHJldmVudERlZmF1bHQgKGV2KSB7XG4gICAgZXYucHJldmVudERlZmF1bHQoKVxuICB9XG4gIFxuICBmdW5jdGlvbiB0b3VjaFJvdGF0ZSAoKSB7XG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCd0b3VjaG1vdmUnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgIGlmICghZHJhZ2dpbmcgfHwgaXNQaW5jaGluZygpKSByZXR1cm5cbiAgICAgICAgXG4gICAgICAvLyBmaW5kIGN1cnJlbnRseSBhY3RpdmUgZmluZ2VyXG4gICAgICBmb3IgKHZhciBpPTA7IGk8ZXYuY2hhbmdlZFRvdWNoZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoYW5nZWQgPSBldi5jaGFuZ2VkVG91Y2hlc1tpXVxuICAgICAgICB2YXIgaWR4ID0gcGluY2guaW5kZXhPZlRvdWNoKGNoYW5nZWQpXG4gICAgICAgIC8vIGlmIHBpbmNoIGlzIGRpc2FibGVkIGJ1dCByb3RhdGUgZW5hYmxlZCxcbiAgICAgICAgLy8gb25seSBhbGxvdyBmaXJzdCBmaW5nZXIgdG8gYWZmZWN0IHJvdGF0aW9uXG4gICAgICAgIHZhciBhbGxvdyA9IHBpbmNoRm4gPyBpZHggIT09IC0xIDogaWR4ID09PSAwXG4gICAgICAgIGlmIChhbGxvdykge1xuICAgICAgICAgIG9uSW5wdXRNb3ZlKGNoYW5nZWQpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgXG4gICAgcGluY2gub24oJ3BsYWNlJywgZnVuY3Rpb24gKG5ld0ZpbmdlciwgbGFzdEZpbmdlcikge1xuICAgICAgZHJhZ2dpbmcgPSAhaXNQaW5jaGluZygpXG4gICAgICBpZiAoZHJhZ2dpbmcpIHtcbiAgICAgICAgdmFyIGZpcnN0RmluZ2VyID0gbGFzdEZpbmdlciB8fCBuZXdGaW5nZXJcbiAgICAgICAgb25JbnB1dERvd24oZmlyc3RGaW5nZXIpXG4gICAgICB9XG4gICAgfSlcbiAgICBcbiAgICBwaW5jaC5vbignbGlmdCcsIGZ1bmN0aW9uIChsaWZ0ZWQsIHJlbWFpbmluZykge1xuICAgICAgZHJhZ2dpbmcgPSAhaXNQaW5jaGluZygpXG4gICAgICBpZiAoZHJhZ2dpbmcgJiYgcmVtYWluaW5nKSB7XG4gICAgICAgIGV2ZW50T2Zmc2V0KHJlbWFpbmluZywgZWxlbWVudCwgbW91c2VTdGFydClcbiAgICAgIH1cbiAgICB9KVxuICB9XG4gIFxuICBmdW5jdGlvbiBpc1BpbmNoaW5nICgpIHtcbiAgICByZXR1cm4gcGluY2gucGluY2hpbmcgJiYgcGluY2hGblxuICB9XG4gIFxuICBmdW5jdGlvbiB0b3VjaFBpbmNoICgpIHtcbiAgICBwaW5jaC5vbignY2hhbmdlJywgZnVuY3Rpb24gKGN1cnJlbnQsIHByZXYpIHtcbiAgICAgIHBpbmNoRm4oY3VycmVudCAtIHByZXYpXG4gICAgfSlcbiAgfVxuICBcbiAgZnVuY3Rpb24gb25JbnB1dERvd24gKGV2KSB7XG4gICAgZXZlbnRPZmZzZXQoZXYsIGVsZW1lbnQsIG1vdXNlU3RhcnQpICAgIFxuICAgIGlmIChpbnNpZGVCb3VuZHMobW91c2VTdGFydCkpIHtcbiAgICAgIGRyYWdnaW5nID0gdHJ1ZVxuICAgIH1cbiAgfVxuICBcbiAgZnVuY3Rpb24gb25JbnB1dFVwICgpIHtcbiAgICBkcmFnZ2luZyA9IGZhbHNlXG4gIH1cbiAgXG4gIGZ1bmN0aW9uIG9uSW5wdXRNb3ZlIChldikge1xuICAgIHZhciBlbmQgPSBldmVudE9mZnNldChldiwgZWxlbWVudCwgdG1wKVxuICAgIGlmIChwaW5jaCAmJiBpc1BpbmNoaW5nKCkpIHtcbiAgICAgIG1vdXNlU3RhcnQgPSBlbmRcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBpZiAoIWRyYWdnaW5nKSByZXR1cm5cbiAgICB2YXIgcmVjdCA9IGdldENsaWVudFNpemUodG1wMilcbiAgICB2YXIgZHggPSAoZW5kWzBdIC0gbW91c2VTdGFydFswXSkgLyByZWN0WzBdXG4gICAgdmFyIGR5ID0gKGVuZFsxXSAtIG1vdXNlU3RhcnRbMV0pIC8gcmVjdFsxXVxuICAgIHJvdGF0ZUZuKGR4LCBkeSlcbiAgICBtb3VzZVN0YXJ0WzBdID0gZW5kWzBdXG4gICAgbW91c2VTdGFydFsxXSA9IGVuZFsxXVxuICB9XG4gIFxuICBmdW5jdGlvbiBpbnNpZGVCb3VuZHMgKHBvcykge1xuICAgIGlmIChlbGVtZW50ID09PSB3aW5kb3cgfHwgXG4gICAgICAgIGVsZW1lbnQgPT09IGRvY3VtZW50IHx8XG4gICAgICAgIGVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByZWN0ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgcmV0dXJuIHBvc1swXSA+PSAwICYmIHBvc1sxXSA+PSAwICYmXG4gICAgICAgIHBvc1swXSA8IHJlY3Qud2lkdGggJiYgcG9zWzFdIDwgcmVjdC5oZWlnaHRcbiAgICB9XG4gIH1cbiAgXG4gIGZ1bmN0aW9uIGdldENsaWVudFNpemUgKG91dCkge1xuICAgIHZhciBzb3VyY2UgPSBlbGVtZW50XG4gICAgaWYgKHNvdXJjZSA9PT0gd2luZG93IHx8XG4gICAgICAgIHNvdXJjZSA9PT0gZG9jdW1lbnQgfHxcbiAgICAgICAgc291cmNlID09PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgICBzb3VyY2UgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnRcbiAgICB9XG4gICAgb3V0WzBdID0gc291cmNlLmNsaWVudFdpZHRoXG4gICAgb3V0WzFdID0gc291cmNlLmNsaWVudEhlaWdodFxuICAgIHJldHVybiBvdXRcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGFyZ3VtZW50c1tpXSAhPT0gdW5kZWZpbmVkKSByZXR1cm4gYXJndW1lbnRzW2ldO1xuICAgIH1cbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGludmVydFxuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGludmVyc2Ugb2YgYSBxdWF0XG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3F1YXR9IGEgcXVhdCB0byBjYWxjdWxhdGUgaW52ZXJzZSBvZlxuICogQHJldHVybnMge3F1YXR9IG91dFxuICovXG5mdW5jdGlvbiBpbnZlcnQgKG91dCwgYSkge1xuICB2YXIgYTAgPSBhWzBdLCBhMSA9IGFbMV0sIGEyID0gYVsyXSwgYTMgPSBhWzNdLFxuICAgIGRvdCA9IGEwICogYTAgKyBhMSAqIGExICsgYTIgKiBhMiArIGEzICogYTMsXG4gICAgaW52RG90ID0gZG90ID8gMS4wIC8gZG90IDogMFxuXG4gIC8vIFRPRE86IFdvdWxkIGJlIGZhc3RlciB0byByZXR1cm4gWzAsMCwwLDBdIGltbWVkaWF0ZWx5IGlmIGRvdCA9PSAwXG5cbiAgb3V0WzBdID0gLWEwICogaW52RG90XG4gIG91dFsxXSA9IC1hMSAqIGludkRvdFxuICBvdXRbMl0gPSAtYTIgKiBpbnZEb3RcbiAgb3V0WzNdID0gYTMgKiBpbnZEb3RcbiAgcmV0dXJuIG91dFxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBub3JtYWxpemVcblxuLyoqXG4gKiBOb3JtYWxpemUgYSB2ZWM0XG4gKlxuICogQHBhcmFtIHt2ZWM0fSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjNH0gYSB2ZWN0b3IgdG8gbm9ybWFsaXplXG4gKiBAcmV0dXJucyB7dmVjNH0gb3V0XG4gKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZSAob3V0LCBhKSB7XG4gIHZhciB4ID0gYVswXSxcbiAgICB5ID0gYVsxXSxcbiAgICB6ID0gYVsyXSxcbiAgICB3ID0gYVszXVxuICB2YXIgbGVuID0geCAqIHggKyB5ICogeSArIHogKiB6ICsgdyAqIHdcbiAgaWYgKGxlbiA+IDApIHtcbiAgICBsZW4gPSAxIC8gTWF0aC5zcXJ0KGxlbilcbiAgICBvdXRbMF0gPSB4ICogbGVuXG4gICAgb3V0WzFdID0geSAqIGxlblxuICAgIG91dFsyXSA9IHogKiBsZW5cbiAgICBvdXRbM10gPSB3ICogbGVuXG4gIH1cbiAgcmV0dXJuIG91dFxufVxuIiwiLyoqXG4gKiBOb3JtYWxpemUgYSBxdWF0XG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3F1YXR9IGEgcXVhdGVybmlvbiB0byBub3JtYWxpemVcbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqIEBmdW5jdGlvblxuICovXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJ2dsLXZlYzQvbm9ybWFsaXplJylcbiIsIm1vZHVsZS5leHBvcnRzID0gYWRkO1xuXG4vKipcbiAqIEFkZHMgdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xuZnVuY3Rpb24gYWRkKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gKyBiWzBdXG4gICAgb3V0WzFdID0gYVsxXSArIGJbMV1cbiAgICBvdXRbMl0gPSBhWzJdICsgYlsyXVxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IGNvcHk7XG5cbi8qKlxuICogQ29weSB0aGUgdmFsdWVzIGZyb20gb25lIHZlYzMgdG8gYW5vdGhlclxuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIHNvdXJjZSB2ZWN0b3JcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xuZnVuY3Rpb24gY29weShvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSBhWzBdXG4gICAgb3V0WzFdID0gYVsxXVxuICAgIG91dFsyXSA9IGFbMl1cbiAgICByZXR1cm4gb3V0XG59IiwibW9kdWxlLmV4cG9ydHMgPSBjcm9zcztcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgY3Jvc3MgcHJvZHVjdCBvZiB0d28gdmVjMydzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG5mdW5jdGlvbiBjcm9zcyhvdXQsIGEsIGIpIHtcbiAgICB2YXIgYXggPSBhWzBdLCBheSA9IGFbMV0sIGF6ID0gYVsyXSxcbiAgICAgICAgYnggPSBiWzBdLCBieSA9IGJbMV0sIGJ6ID0gYlsyXVxuXG4gICAgb3V0WzBdID0gYXkgKiBieiAtIGF6ICogYnlcbiAgICBvdXRbMV0gPSBheiAqIGJ4IC0gYXggKiBielxuICAgIG91dFsyXSA9IGF4ICogYnkgLSBheSAqIGJ4XG4gICAgcmV0dXJuIG91dFxufSIsIm1vZHVsZS5leHBvcnRzID0gZG90O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGRvdCBwcm9kdWN0IG9mIHR3byB2ZWMzJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGRvdCBwcm9kdWN0IG9mIGEgYW5kIGJcbiAqL1xuZnVuY3Rpb24gZG90KGEsIGIpIHtcbiAgICByZXR1cm4gYVswXSAqIGJbMF0gKyBhWzFdICogYlsxXSArIGFbMl0gKiBiWzJdXG59IiwibW9kdWxlLmV4cG9ydHMgPSBsZW5ndGg7XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgbGVuZ3RoIG9mIGEgdmVjM1xuICpcbiAqIEBwYXJhbSB7dmVjM30gYSB2ZWN0b3IgdG8gY2FsY3VsYXRlIGxlbmd0aCBvZlxuICogQHJldHVybnMge051bWJlcn0gbGVuZ3RoIG9mIGFcbiAqL1xuZnVuY3Rpb24gbGVuZ3RoKGEpIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdLFxuICAgICAgICB6ID0gYVsyXVxuICAgIHJldHVybiBNYXRoLnNxcnQoeCp4ICsgeSp5ICsgeip6KVxufSIsIm1vZHVsZS5leHBvcnRzID0gbm9ybWFsaXplO1xuXG4vKipcbiAqIE5vcm1hbGl6ZSBhIHZlYzNcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHZlY3RvciB0byBub3JtYWxpemVcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xuZnVuY3Rpb24gbm9ybWFsaXplKG91dCwgYSkge1xuICAgIHZhciB4ID0gYVswXSxcbiAgICAgICAgeSA9IGFbMV0sXG4gICAgICAgIHogPSBhWzJdXG4gICAgdmFyIGxlbiA9IHgqeCArIHkqeSArIHoqelxuICAgIGlmIChsZW4gPiAwKSB7XG4gICAgICAgIC8vVE9ETzogZXZhbHVhdGUgdXNlIG9mIGdsbV9pbnZzcXJ0IGhlcmU/XG4gICAgICAgIGxlbiA9IDEgLyBNYXRoLnNxcnQobGVuKVxuICAgICAgICBvdXRbMF0gPSBhWzBdICogbGVuXG4gICAgICAgIG91dFsxXSA9IGFbMV0gKiBsZW5cbiAgICAgICAgb3V0WzJdID0gYVsyXSAqIGxlblxuICAgIH1cbiAgICByZXR1cm4gb3V0XG59IiwibW9kdWxlLmV4cG9ydHMgPSBzZXQ7XG5cbi8qKlxuICogU2V0IHRoZSBjb21wb25lbnRzIG9mIGEgdmVjMyB0byB0aGUgZ2l2ZW4gdmFsdWVzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7TnVtYmVyfSB4IFggY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0geSBZIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHogWiBjb21wb25lbnRcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xuZnVuY3Rpb24gc2V0KG91dCwgeCwgeSwgeikge1xuICAgIG91dFswXSA9IHhcbiAgICBvdXRbMV0gPSB5XG4gICAgb3V0WzJdID0gelxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IHN1YnRyYWN0O1xuXG4vKipcbiAqIFN1YnRyYWN0cyB2ZWN0b3IgYiBmcm9tIHZlY3RvciBhXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG5mdW5jdGlvbiBzdWJ0cmFjdChvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBhWzBdIC0gYlswXVxuICAgIG91dFsxXSA9IGFbMV0gLSBiWzFdXG4gICAgb3V0WzJdID0gYVsyXSAtIGJbMl1cbiAgICByZXR1cm4gb3V0XG59IiwibW9kdWxlLmV4cG9ydHMgPSB0cmFuc2Zvcm1RdWF0O1xuXG4vKipcbiAqIFRyYW5zZm9ybXMgdGhlIHZlYzMgd2l0aCBhIHF1YXRcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSB2ZWN0b3IgdG8gdHJhbnNmb3JtXG4gKiBAcGFyYW0ge3F1YXR9IHEgcXVhdGVybmlvbiB0byB0cmFuc2Zvcm0gd2l0aFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG5mdW5jdGlvbiB0cmFuc2Zvcm1RdWF0KG91dCwgYSwgcSkge1xuICAgIC8vIGJlbmNobWFya3M6IGh0dHA6Ly9qc3BlcmYuY29tL3F1YXRlcm5pb24tdHJhbnNmb3JtLXZlYzMtaW1wbGVtZW50YXRpb25zXG5cbiAgICB2YXIgeCA9IGFbMF0sIHkgPSBhWzFdLCB6ID0gYVsyXSxcbiAgICAgICAgcXggPSBxWzBdLCBxeSA9IHFbMV0sIHF6ID0gcVsyXSwgcXcgPSBxWzNdLFxuXG4gICAgICAgIC8vIGNhbGN1bGF0ZSBxdWF0ICogdmVjXG4gICAgICAgIGl4ID0gcXcgKiB4ICsgcXkgKiB6IC0gcXogKiB5LFxuICAgICAgICBpeSA9IHF3ICogeSArIHF6ICogeCAtIHF4ICogeixcbiAgICAgICAgaXogPSBxdyAqIHogKyBxeCAqIHkgLSBxeSAqIHgsXG4gICAgICAgIGl3ID0gLXF4ICogeCAtIHF5ICogeSAtIHF6ICogelxuXG4gICAgLy8gY2FsY3VsYXRlIHJlc3VsdCAqIGludmVyc2UgcXVhdFxuICAgIG91dFswXSA9IGl4ICogcXcgKyBpdyAqIC1xeCArIGl5ICogLXF6IC0gaXogKiAtcXlcbiAgICBvdXRbMV0gPSBpeSAqIHF3ICsgaXcgKiAtcXkgKyBpeiAqIC1xeCAtIGl4ICogLXF6XG4gICAgb3V0WzJdID0gaXogKiBxdyArIGl3ICogLXF6ICsgaXggKiAtcXkgLSBpeSAqIC1xeFxuICAgIHJldHVybiBvdXRcbn0iLCJ2YXIgcm9vdFBvc2l0aW9uID0geyBsZWZ0OiAwLCB0b3A6IDAgfVxuXG5tb2R1bGUuZXhwb3J0cyA9IG1vdXNlRXZlbnRPZmZzZXRcbmZ1bmN0aW9uIG1vdXNlRXZlbnRPZmZzZXQgKGV2LCB0YXJnZXQsIG91dCkge1xuICB0YXJnZXQgPSB0YXJnZXQgfHwgZXYuY3VycmVudFRhcmdldCB8fCBldi5zcmNFbGVtZW50XG4gIGlmICghQXJyYXkuaXNBcnJheShvdXQpKSB7XG4gICAgb3V0ID0gWyAwLCAwIF1cbiAgfVxuICB2YXIgY3ggPSBldi5jbGllbnRYIHx8IDBcbiAgdmFyIGN5ID0gZXYuY2xpZW50WSB8fCAwXG4gIHZhciByZWN0ID0gZ2V0Qm91bmRpbmdDbGllbnRPZmZzZXQodGFyZ2V0KVxuICBvdXRbMF0gPSBjeCAtIHJlY3QubGVmdFxuICBvdXRbMV0gPSBjeSAtIHJlY3QudG9wXG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gZ2V0Qm91bmRpbmdDbGllbnRPZmZzZXQgKGVsZW1lbnQpIHtcbiAgaWYgKGVsZW1lbnQgPT09IHdpbmRvdyB8fFxuICAgICAgZWxlbWVudCA9PT0gZG9jdW1lbnQgfHxcbiAgICAgIGVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICByZXR1cm4gcm9vdFBvc2l0aW9uXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwYXJzZVVuaXQoc3RyLCBvdXQpIHtcbiAgICBpZiAoIW91dClcbiAgICAgICAgb3V0ID0gWyAwLCAnJyBdXG5cbiAgICBzdHIgPSBTdHJpbmcoc3RyKVxuICAgIHZhciBudW0gPSBwYXJzZUZsb2F0KHN0ciwgMTApXG4gICAgb3V0WzBdID0gbnVtXG4gICAgb3V0WzFdID0gc3RyLm1hdGNoKC9bXFxkLlxcLVxcK10qXFxzKiguKikvKVsxXSB8fCAnJ1xuICAgIHJldHVybiBvdXRcbn0iLCIndXNlIHN0cmljdCdcblxudmFyIHBhcnNlVW5pdCA9IHJlcXVpcmUoJ3BhcnNlLXVuaXQnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHRvUFhcblxudmFyIFBJWEVMU19QRVJfSU5DSCA9IDk2XG5cbmZ1bmN0aW9uIGdldFByb3BlcnR5SW5QWChlbGVtZW50LCBwcm9wKSB7XG4gIHZhciBwYXJ0cyA9IHBhcnNlVW5pdChnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLmdldFByb3BlcnR5VmFsdWUocHJvcCkpXG4gIHJldHVybiBwYXJ0c1swXSAqIHRvUFgocGFydHNbMV0sIGVsZW1lbnQpXG59XG5cbi8vVGhpcyBicnV0YWwgaGFjayBpcyBuZWVkZWRcbmZ1bmN0aW9uIGdldFNpemVCcnV0YWwodW5pdCwgZWxlbWVudCkge1xuICB2YXIgdGVzdERJViA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpXG4gIHRlc3RESVYuc3R5bGVbJ2ZvbnQtc2l6ZSddID0gJzEyOCcgKyB1bml0XG4gIGVsZW1lbnQuYXBwZW5kQ2hpbGQodGVzdERJVilcbiAgdmFyIHNpemUgPSBnZXRQcm9wZXJ0eUluUFgodGVzdERJViwgJ2ZvbnQtc2l6ZScpIC8gMTI4XG4gIGVsZW1lbnQucmVtb3ZlQ2hpbGQodGVzdERJVilcbiAgcmV0dXJuIHNpemVcbn1cblxuZnVuY3Rpb24gdG9QWChzdHIsIGVsZW1lbnQpIHtcbiAgZWxlbWVudCA9IGVsZW1lbnQgfHwgZG9jdW1lbnQuYm9keVxuICBzdHIgPSAoc3RyIHx8ICdweCcpLnRyaW0oKS50b0xvd2VyQ2FzZSgpXG4gIGlmKGVsZW1lbnQgPT09IHdpbmRvdyB8fCBlbGVtZW50ID09PSBkb2N1bWVudCkge1xuICAgIGVsZW1lbnQgPSBkb2N1bWVudC5ib2R5IFxuICB9XG4gIHN3aXRjaChzdHIpIHtcbiAgICBjYXNlICclJzogIC8vQW1iaWd1b3VzLCBub3Qgc3VyZSBpZiB3ZSBzaG91bGQgdXNlIHdpZHRoIG9yIGhlaWdodFxuICAgICAgcmV0dXJuIGVsZW1lbnQuY2xpZW50SGVpZ2h0IC8gMTAwLjBcbiAgICBjYXNlICdjaCc6XG4gICAgY2FzZSAnZXgnOlxuICAgICAgcmV0dXJuIGdldFNpemVCcnV0YWwoc3RyLCBlbGVtZW50KVxuICAgIGNhc2UgJ2VtJzpcbiAgICAgIHJldHVybiBnZXRQcm9wZXJ0eUluUFgoZWxlbWVudCwgJ2ZvbnQtc2l6ZScpXG4gICAgY2FzZSAncmVtJzpcbiAgICAgIHJldHVybiBnZXRQcm9wZXJ0eUluUFgoZG9jdW1lbnQuYm9keSwgJ2ZvbnQtc2l6ZScpXG4gICAgY2FzZSAndncnOlxuICAgICAgcmV0dXJuIHdpbmRvdy5pbm5lcldpZHRoLzEwMFxuICAgIGNhc2UgJ3ZoJzpcbiAgICAgIHJldHVybiB3aW5kb3cuaW5uZXJIZWlnaHQvMTAwXG4gICAgY2FzZSAndm1pbic6XG4gICAgICByZXR1cm4gTWF0aC5taW4od2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCkgLyAxMDBcbiAgICBjYXNlICd2bWF4JzpcbiAgICAgIHJldHVybiBNYXRoLm1heCh3aW5kb3cuaW5uZXJXaWR0aCwgd2luZG93LmlubmVySGVpZ2h0KSAvIDEwMFxuICAgIGNhc2UgJ2luJzpcbiAgICAgIHJldHVybiBQSVhFTFNfUEVSX0lOQ0hcbiAgICBjYXNlICdjbSc6XG4gICAgICByZXR1cm4gUElYRUxTX1BFUl9JTkNIIC8gMi41NFxuICAgIGNhc2UgJ21tJzpcbiAgICAgIHJldHVybiBQSVhFTFNfUEVSX0lOQ0ggLyAyNS40XG4gICAgY2FzZSAncHQnOlxuICAgICAgcmV0dXJuIFBJWEVMU19QRVJfSU5DSCAvIDcyXG4gICAgY2FzZSAncGMnOlxuICAgICAgcmV0dXJuIFBJWEVMU19QRVJfSU5DSCAvIDZcbiAgfVxuICByZXR1cm4gMVxufSIsIid1c2Ugc3RyaWN0J1xuXG52YXIgdG9QWCA9IHJlcXVpcmUoJ3RvLXB4JylcblxubW9kdWxlLmV4cG9ydHMgPSBtb3VzZVdoZWVsTGlzdGVuXG5cbmZ1bmN0aW9uIG1vdXNlV2hlZWxMaXN0ZW4oZWxlbWVudCwgY2FsbGJhY2ssIG5vU2Nyb2xsKSB7XG4gIGlmKHR5cGVvZiBlbGVtZW50ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgbm9TY3JvbGwgPSAhIWNhbGxiYWNrXG4gICAgY2FsbGJhY2sgPSBlbGVtZW50XG4gICAgZWxlbWVudCA9IHdpbmRvd1xuICB9XG4gIHZhciBsaW5lSGVpZ2h0ID0gdG9QWCgnZXgnLCBlbGVtZW50KVxuICB2YXIgbGlzdGVuZXIgPSBmdW5jdGlvbihldikge1xuICAgIGlmKG5vU2Nyb2xsKSB7XG4gICAgICBldi5wcmV2ZW50RGVmYXVsdCgpXG4gICAgfVxuICAgIHZhciBkeCA9IGV2LmRlbHRhWCB8fCAwXG4gICAgdmFyIGR5ID0gZXYuZGVsdGFZIHx8IDBcbiAgICB2YXIgZHogPSBldi5kZWx0YVogfHwgMFxuICAgIHZhciBtb2RlID0gZXYuZGVsdGFNb2RlXG4gICAgdmFyIHNjYWxlID0gMVxuICAgIHN3aXRjaChtb2RlKSB7XG4gICAgICBjYXNlIDE6XG4gICAgICAgIHNjYWxlID0gbGluZUhlaWdodFxuICAgICAgYnJlYWtcbiAgICAgIGNhc2UgMjpcbiAgICAgICAgc2NhbGUgPSB3aW5kb3cuaW5uZXJIZWlnaHRcbiAgICAgIGJyZWFrXG4gICAgfVxuICAgIGR4ICo9IHNjYWxlXG4gICAgZHkgKj0gc2NhbGVcbiAgICBkeiAqPSBzY2FsZVxuICAgIGlmKGR4IHx8IGR5IHx8IGR6KSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2soZHgsIGR5LCBkeilcbiAgICB9XG4gIH1cbiAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCd3aGVlbCcsIGxpc3RlbmVyKVxuICByZXR1cm4gbGlzdGVuZXJcbn1cbiIsIi8vIE9yaWdpbmFsIGltcGxlbWVudGF0aW9uOlxuLy8gaHR0cDovL2xvbGVuZ2luZS5uZXQvYmxvZy8yMDE0LzAyLzI0L3F1YXRlcm5pb24tZnJvbS10d28tdmVjdG9ycy1maW5hbFxuXG52YXIgZG90ID0gcmVxdWlyZSgnZ2wtdmVjMy9kb3QnKVxudmFyIHNldCA9IHJlcXVpcmUoJ2dsLXZlYzMvc2V0JylcbnZhciBub3JtYWxpemUgPSByZXF1aXJlKCdnbC1xdWF0L25vcm1hbGl6ZScpXG52YXIgY3Jvc3MgPSByZXF1aXJlKCdnbC12ZWMzL2Nyb3NzJylcblxudmFyIHRtcCA9IFswLCAwLCAwXVxudmFyIEVQUyA9IDFlLTZcblxubW9kdWxlLmV4cG9ydHMgPSBxdWF0RnJvbVVuaXRWZWMzXG5mdW5jdGlvbiBxdWF0RnJvbVVuaXRWZWMzIChvdXQsIGEsIGIpIHtcbiAgLy8gYXNzdW1lcyBhIGFuZCBiIGFyZSBub3JtYWxpemVkXG4gIHZhciByID0gZG90KGEsIGIpICsgMVxuICBpZiAociA8IEVQUykge1xuICAgIC8qIElmIHUgYW5kIHYgYXJlIGV4YWN0bHkgb3Bwb3NpdGUsIHJvdGF0ZSAxODAgZGVncmVlc1xuICAgICAqIGFyb3VuZCBhbiBhcmJpdHJhcnkgb3J0aG9nb25hbCBheGlzLiBBeGlzIG5vcm1hbGlzYXRpb25cbiAgICAgKiBjYW4gaGFwcGVuIGxhdGVyLCB3aGVuIHdlIG5vcm1hbGlzZSB0aGUgcXVhdGVybmlvbi4gKi9cbiAgICByID0gMFxuICAgIGlmIChNYXRoLmFicyhhWzBdKSA+IE1hdGguYWJzKGFbMl0pKSB7XG4gICAgICBzZXQodG1wLCAtYVsxXSwgYVswXSwgMClcbiAgICB9IGVsc2Uge1xuICAgICAgc2V0KHRtcCwgMCwgLWFbMl0sIGFbMV0pXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIC8qIE90aGVyd2lzZSwgYnVpbGQgcXVhdGVybmlvbiB0aGUgc3RhbmRhcmQgd2F5LiAqL1xuICAgIGNyb3NzKHRtcCwgYSwgYilcbiAgfVxuXG4gIG91dFswXSA9IHRtcFswXVxuICBvdXRbMV0gPSB0bXBbMV1cbiAgb3V0WzJdID0gdG1wWzJdXG4gIG91dFszXSA9IHJcbiAgbm9ybWFsaXplKG91dCwgb3V0KVxuICByZXR1cm4gb3V0XG59XG4iLCJ2YXIgZ2V0RGlzdGFuY2UgPSByZXF1aXJlKCdnbC12ZWMyL2Rpc3RhbmNlJylcbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcbnZhciBkcHJvcCA9IHJlcXVpcmUoJ2Rwcm9wJylcbnZhciBldmVudE9mZnNldCA9IHJlcXVpcmUoJ21vdXNlLWV2ZW50LW9mZnNldCcpXG5cbm1vZHVsZS5leHBvcnRzID0gdG91Y2hQaW5jaFxuZnVuY3Rpb24gdG91Y2hQaW5jaCAodGFyZ2V0KSB7XG4gIHRhcmdldCA9IHRhcmdldCB8fCB3aW5kb3dcblxuICB2YXIgZW1pdHRlciA9IG5ldyBFdmVudEVtaXR0ZXIoKVxuICB2YXIgZmluZ2VycyA9IFsgbnVsbCwgbnVsbCBdXG4gIHZhciBhY3RpdmVDb3VudCA9IDBcblxuICB2YXIgbGFzdERpc3RhbmNlID0gMFxuICB2YXIgZW5kZWQgPSBmYWxzZVxuICB2YXIgZW5hYmxlZCA9IGZhbHNlXG5cbiAgLy8gc29tZSByZWFkLW9ubHkgdmFsdWVzXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKGVtaXR0ZXIsIHtcbiAgICBwaW5jaGluZzogZHByb3AoZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGFjdGl2ZUNvdW50ID09PSAyXG4gICAgfSksXG5cbiAgICBmaW5nZXJzOiBkcHJvcChmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gZmluZ2Vyc1xuICAgIH0pXG4gIH0pXG5cbiAgZW5hYmxlKClcbiAgZW1pdHRlci5lbmFibGUgPSBlbmFibGVcbiAgZW1pdHRlci5kaXNhYmxlID0gZGlzYWJsZVxuICBlbWl0dGVyLmluZGV4T2ZUb3VjaCA9IGluZGV4T2ZUb3VjaFxuICByZXR1cm4gZW1pdHRlclxuXG4gIGZ1bmN0aW9uIGluZGV4T2ZUb3VjaCAodG91Y2gpIHtcbiAgICB2YXIgaWQgPSB0b3VjaC5pZGVudGlmaWVyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmaW5nZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoZmluZ2Vyc1tpXSAmJlxuICAgICAgICBmaW5nZXJzW2ldLnRvdWNoICYmXG4gICAgICAgIGZpbmdlcnNbaV0udG91Y2guaWRlbnRpZmllciA9PT0gaWQpIHtcbiAgICAgICAgcmV0dXJuIGlcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIC0xXG4gIH1cblxuICBmdW5jdGlvbiBlbmFibGUgKCkge1xuICAgIGlmIChlbmFibGVkKSByZXR1cm5cbiAgICBlbmFibGVkID0gdHJ1ZVxuICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0Jywgb25Ub3VjaFN0YXJ0LCBmYWxzZSlcbiAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2htb3ZlJywgb25Ub3VjaE1vdmUsIGZhbHNlKVxuICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyKCd0b3VjaGVuZCcsIG9uVG91Y2hSZW1vdmVkLCBmYWxzZSlcbiAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hjYW5jZWwnLCBvblRvdWNoUmVtb3ZlZCwgZmFsc2UpXG4gIH1cblxuICBmdW5jdGlvbiBkaXNhYmxlICgpIHtcbiAgICBpZiAoIWVuYWJsZWQpIHJldHVyblxuICAgIGVuYWJsZWQgPSBmYWxzZVxuICAgIHRhcmdldC5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0Jywgb25Ub3VjaFN0YXJ0LCBmYWxzZSlcbiAgICB0YXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2htb3ZlJywgb25Ub3VjaE1vdmUsIGZhbHNlKVxuICAgIHRhcmdldC5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaGVuZCcsIG9uVG91Y2hSZW1vdmVkLCBmYWxzZSlcbiAgICB0YXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2hjYW5jZWwnLCBvblRvdWNoUmVtb3ZlZCwgZmFsc2UpXG4gIH1cblxuICBmdW5jdGlvbiBvblRvdWNoU3RhcnQgKGV2KSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBldi5jaGFuZ2VkVG91Y2hlcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIG5ld1RvdWNoID0gZXYuY2hhbmdlZFRvdWNoZXNbaV1cbiAgICAgIHZhciBpZCA9IG5ld1RvdWNoLmlkZW50aWZpZXJcbiAgICAgIHZhciBpZHggPSBpbmRleE9mVG91Y2goaWQpXG5cbiAgICAgIGlmIChpZHggPT09IC0xICYmIGFjdGl2ZUNvdW50IDwgMikge1xuICAgICAgICB2YXIgZmlyc3QgPSBhY3RpdmVDb3VudCA9PT0gMFxuXG4gICAgICAgIC8vIG5ld2VzdCBhbmQgcHJldmlvdXMgZmluZ2VyIChwcmV2aW91cyBtYXkgYmUgdW5kZWZpbmVkKVxuICAgICAgICB2YXIgbmV3SW5kZXggPSBmaW5nZXJzWzBdID8gMSA6IDBcbiAgICAgICAgdmFyIG9sZEluZGV4ID0gZmluZ2Vyc1swXSA/IDAgOiAxXG4gICAgICAgIHZhciBuZXdGaW5nZXIgPSBuZXcgRmluZ2VyKClcblxuICAgICAgICAvLyBhZGQgdG8gc3RhY2tcbiAgICAgICAgZmluZ2Vyc1tuZXdJbmRleF0gPSBuZXdGaW5nZXJcbiAgICAgICAgYWN0aXZlQ291bnQrK1xuXG4gICAgICAgIC8vIHVwZGF0ZSB0b3VjaCBldmVudCAmIHBvc2l0aW9uXG4gICAgICAgIG5ld0Zpbmdlci50b3VjaCA9IG5ld1RvdWNoXG4gICAgICAgIGV2ZW50T2Zmc2V0KG5ld1RvdWNoLCB0YXJnZXQsIG5ld0Zpbmdlci5wb3NpdGlvbilcblxuICAgICAgICB2YXIgb2xkVG91Y2ggPSBmaW5nZXJzW29sZEluZGV4XSA/IGZpbmdlcnNbb2xkSW5kZXhdLnRvdWNoIDogdW5kZWZpbmVkXG4gICAgICAgIGVtaXR0ZXIuZW1pdCgncGxhY2UnLCBuZXdUb3VjaCwgb2xkVG91Y2gpXG5cbiAgICAgICAgaWYgKCFmaXJzdCkge1xuICAgICAgICAgIHZhciBpbml0aWFsRGlzdGFuY2UgPSBjb21wdXRlRGlzdGFuY2UoKVxuICAgICAgICAgIGVuZGVkID0gZmFsc2VcbiAgICAgICAgICBlbWl0dGVyLmVtaXQoJ3N0YXJ0JywgaW5pdGlhbERpc3RhbmNlKVxuICAgICAgICAgIGxhc3REaXN0YW5jZSA9IGluaXRpYWxEaXN0YW5jZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gb25Ub3VjaE1vdmUgKGV2KSB7XG4gICAgdmFyIGNoYW5nZWQgPSBmYWxzZVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZXYuY2hhbmdlZFRvdWNoZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBtb3ZlZFRvdWNoID0gZXYuY2hhbmdlZFRvdWNoZXNbaV1cbiAgICAgIHZhciBpZHggPSBpbmRleE9mVG91Y2gobW92ZWRUb3VjaClcbiAgICAgIGlmIChpZHggIT09IC0xKSB7XG4gICAgICAgIGNoYW5nZWQgPSB0cnVlXG4gICAgICAgIGZpbmdlcnNbaWR4XS50b3VjaCA9IG1vdmVkVG91Y2ggLy8gYXZvaWQgY2FjaGluZyB0b3VjaGVzXG4gICAgICAgIGV2ZW50T2Zmc2V0KG1vdmVkVG91Y2gsIHRhcmdldCwgZmluZ2Vyc1tpZHhdLnBvc2l0aW9uKVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChhY3RpdmVDb3VudCA9PT0gMiAmJiBjaGFuZ2VkKSB7XG4gICAgICB2YXIgY3VycmVudERpc3RhbmNlID0gY29tcHV0ZURpc3RhbmNlKClcbiAgICAgIGVtaXR0ZXIuZW1pdCgnY2hhbmdlJywgY3VycmVudERpc3RhbmNlLCBsYXN0RGlzdGFuY2UpXG4gICAgICBsYXN0RGlzdGFuY2UgPSBjdXJyZW50RGlzdGFuY2VcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBvblRvdWNoUmVtb3ZlZCAoZXYpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGV2LmNoYW5nZWRUb3VjaGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgcmVtb3ZlZCA9IGV2LmNoYW5nZWRUb3VjaGVzW2ldXG4gICAgICB2YXIgaWR4ID0gaW5kZXhPZlRvdWNoKHJlbW92ZWQpXG5cbiAgICAgIGlmIChpZHggIT09IC0xKSB7XG4gICAgICAgIGZpbmdlcnNbaWR4XSA9IG51bGxcbiAgICAgICAgYWN0aXZlQ291bnQtLVxuICAgICAgICB2YXIgb3RoZXJJZHggPSBpZHggPT09IDAgPyAxIDogMFxuICAgICAgICB2YXIgb3RoZXJUb3VjaCA9IGZpbmdlcnNbb3RoZXJJZHhdID8gZmluZ2Vyc1tvdGhlcklkeF0udG91Y2ggOiB1bmRlZmluZWRcbiAgICAgICAgZW1pdHRlci5lbWl0KCdsaWZ0JywgcmVtb3ZlZCwgb3RoZXJUb3VjaClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIWVuZGVkICYmIGFjdGl2ZUNvdW50ICE9PSAyKSB7XG4gICAgICBlbmRlZCA9IHRydWVcbiAgICAgIGVtaXR0ZXIuZW1pdCgnZW5kJylcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjb21wdXRlRGlzdGFuY2UgKCkge1xuICAgIGlmIChhY3RpdmVDb3VudCA8IDIpIHJldHVybiAwXG4gICAgcmV0dXJuIGdldERpc3RhbmNlKGZpbmdlcnNbMF0ucG9zaXRpb24sIGZpbmdlcnNbMV0ucG9zaXRpb24pXG4gIH1cbn1cblxuZnVuY3Rpb24gRmluZ2VyICgpIHtcbiAgdGhpcy5wb3NpdGlvbiA9IFswLCAwXVxuICB0aGlzLnRvdWNoID0gbnVsbFxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBkZWZhdWx0UHJvcGVydHlcblxuZnVuY3Rpb24gZGVmYXVsdFByb3BlcnR5IChnZXQsIHNldCkge1xuICByZXR1cm4ge1xuICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgIGdldDogZ2V0LFxuICAgIHNldDogc2V0XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZGlzdGFuY2VcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBldWNsaWRpYW4gZGlzdGFuY2UgYmV0d2VlbiB0d28gdmVjMidzXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkaXN0YW5jZSBiZXR3ZWVuIGEgYW5kIGJcbiAqL1xuZnVuY3Rpb24gZGlzdGFuY2UoYSwgYikge1xuICAgIHZhciB4ID0gYlswXSAtIGFbMF0sXG4gICAgICAgIHkgPSBiWzFdIC0gYVsxXVxuICAgIHJldHVybiBNYXRoLnNxcnQoeCp4ICsgeSp5KVxufSIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4vLyByZXNvbHZlcyAuIGFuZCAuLiBlbGVtZW50cyBpbiBhIHBhdGggYXJyYXkgd2l0aCBkaXJlY3RvcnkgbmFtZXMgdGhlcmVcbi8vIG11c3QgYmUgbm8gc2xhc2hlcywgZW1wdHkgZWxlbWVudHMsIG9yIGRldmljZSBuYW1lcyAoYzpcXCkgaW4gdGhlIGFycmF5XG4vLyAoc28gYWxzbyBubyBsZWFkaW5nIGFuZCB0cmFpbGluZyBzbGFzaGVzIC0gaXQgZG9lcyBub3QgZGlzdGluZ3Vpc2hcbi8vIHJlbGF0aXZlIGFuZCBhYnNvbHV0ZSBwYXRocylcbmZ1bmN0aW9uIG5vcm1hbGl6ZUFycmF5KHBhcnRzLCBhbGxvd0Fib3ZlUm9vdCkge1xuICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICB2YXIgdXAgPSAwO1xuICBmb3IgKHZhciBpID0gcGFydHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICB2YXIgbGFzdCA9IHBhcnRzW2ldO1xuICAgIGlmIChsYXN0ID09PSAnLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICB9IGVsc2UgaWYgKGxhc3QgPT09ICcuLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwKys7XG4gICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgICAgdXAtLTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gIGlmIChhbGxvd0Fib3ZlUm9vdCkge1xuICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgcGFydHMudW5zaGlmdCgnLi4nKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcGFydHM7XG59XG5cbi8vIFNwbGl0IGEgZmlsZW5hbWUgaW50byBbcm9vdCwgZGlyLCBiYXNlbmFtZSwgZXh0XSwgdW5peCB2ZXJzaW9uXG4vLyAncm9vdCcgaXMganVzdCBhIHNsYXNoLCBvciBub3RoaW5nLlxudmFyIHNwbGl0UGF0aFJlID1cbiAgICAvXihcXC8/fCkoW1xcc1xcU10qPykoKD86XFwuezEsMn18W15cXC9dKz98KShcXC5bXi5cXC9dKnwpKSg/OltcXC9dKikkLztcbnZhciBzcGxpdFBhdGggPSBmdW5jdGlvbihmaWxlbmFtZSkge1xuICByZXR1cm4gc3BsaXRQYXRoUmUuZXhlYyhmaWxlbmFtZSkuc2xpY2UoMSk7XG59O1xuXG4vLyBwYXRoLnJlc29sdmUoW2Zyb20gLi4uXSwgdG8pXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLnJlc29sdmUgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHJlc29sdmVkUGF0aCA9ICcnLFxuICAgICAgcmVzb2x2ZWRBYnNvbHV0ZSA9IGZhbHNlO1xuXG4gIGZvciAodmFyIGkgPSBhcmd1bWVudHMubGVuZ3RoIC0gMTsgaSA+PSAtMSAmJiAhcmVzb2x2ZWRBYnNvbHV0ZTsgaS0tKSB7XG4gICAgdmFyIHBhdGggPSAoaSA+PSAwKSA/IGFyZ3VtZW50c1tpXSA6IHByb2Nlc3MuY3dkKCk7XG5cbiAgICAvLyBTa2lwIGVtcHR5IGFuZCBpbnZhbGlkIGVudHJpZXNcbiAgICBpZiAodHlwZW9mIHBhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgdG8gcGF0aC5yZXNvbHZlIG11c3QgYmUgc3RyaW5ncycpO1xuICAgIH0gZWxzZSBpZiAoIXBhdGgpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHJlc29sdmVkUGF0aCA9IHBhdGggKyAnLycgKyByZXNvbHZlZFBhdGg7XG4gICAgcmVzb2x2ZWRBYnNvbHV0ZSA9IHBhdGguY2hhckF0KDApID09PSAnLyc7XG4gIH1cblxuICAvLyBBdCB0aGlzIHBvaW50IHRoZSBwYXRoIHNob3VsZCBiZSByZXNvbHZlZCB0byBhIGZ1bGwgYWJzb2x1dGUgcGF0aCwgYnV0XG4gIC8vIGhhbmRsZSByZWxhdGl2ZSBwYXRocyB0byBiZSBzYWZlIChtaWdodCBoYXBwZW4gd2hlbiBwcm9jZXNzLmN3ZCgpIGZhaWxzKVxuXG4gIC8vIE5vcm1hbGl6ZSB0aGUgcGF0aFxuICByZXNvbHZlZFBhdGggPSBub3JtYWxpemVBcnJheShmaWx0ZXIocmVzb2x2ZWRQYXRoLnNwbGl0KCcvJyksIGZ1bmN0aW9uKHApIHtcbiAgICByZXR1cm4gISFwO1xuICB9KSwgIXJlc29sdmVkQWJzb2x1dGUpLmpvaW4oJy8nKTtcblxuICByZXR1cm4gKChyZXNvbHZlZEFic29sdXRlID8gJy8nIDogJycpICsgcmVzb2x2ZWRQYXRoKSB8fCAnLic7XG59O1xuXG4vLyBwYXRoLm5vcm1hbGl6ZShwYXRoKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5ub3JtYWxpemUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHZhciBpc0Fic29sdXRlID0gZXhwb3J0cy5pc0Fic29sdXRlKHBhdGgpLFxuICAgICAgdHJhaWxpbmdTbGFzaCA9IHN1YnN0cihwYXRoLCAtMSkgPT09ICcvJztcblxuICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgcGF0aCA9IG5vcm1hbGl6ZUFycmF5KGZpbHRlcihwYXRoLnNwbGl0KCcvJyksIGZ1bmN0aW9uKHApIHtcbiAgICByZXR1cm4gISFwO1xuICB9KSwgIWlzQWJzb2x1dGUpLmpvaW4oJy8nKTtcblxuICBpZiAoIXBhdGggJiYgIWlzQWJzb2x1dGUpIHtcbiAgICBwYXRoID0gJy4nO1xuICB9XG4gIGlmIChwYXRoICYmIHRyYWlsaW5nU2xhc2gpIHtcbiAgICBwYXRoICs9ICcvJztcbiAgfVxuXG4gIHJldHVybiAoaXNBYnNvbHV0ZSA/ICcvJyA6ICcnKSArIHBhdGg7XG59O1xuXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLmlzQWJzb2x1dGUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHJldHVybiBwYXRoLmNoYXJBdCgwKSA9PT0gJy8nO1xufTtcblxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5qb2luID0gZnVuY3Rpb24oKSB7XG4gIHZhciBwYXRocyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCk7XG4gIHJldHVybiBleHBvcnRzLm5vcm1hbGl6ZShmaWx0ZXIocGF0aHMsIGZ1bmN0aW9uKHAsIGluZGV4KSB7XG4gICAgaWYgKHR5cGVvZiBwICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIHRvIHBhdGguam9pbiBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgICB9XG4gICAgcmV0dXJuIHA7XG4gIH0pLmpvaW4oJy8nKSk7XG59O1xuXG5cbi8vIHBhdGgucmVsYXRpdmUoZnJvbSwgdG8pXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLnJlbGF0aXZlID0gZnVuY3Rpb24oZnJvbSwgdG8pIHtcbiAgZnJvbSA9IGV4cG9ydHMucmVzb2x2ZShmcm9tKS5zdWJzdHIoMSk7XG4gIHRvID0gZXhwb3J0cy5yZXNvbHZlKHRvKS5zdWJzdHIoMSk7XG5cbiAgZnVuY3Rpb24gdHJpbShhcnIpIHtcbiAgICB2YXIgc3RhcnQgPSAwO1xuICAgIGZvciAoOyBzdGFydCA8IGFyci5sZW5ndGg7IHN0YXJ0KyspIHtcbiAgICAgIGlmIChhcnJbc3RhcnRdICE9PSAnJykgYnJlYWs7XG4gICAgfVxuXG4gICAgdmFyIGVuZCA9IGFyci5sZW5ndGggLSAxO1xuICAgIGZvciAoOyBlbmQgPj0gMDsgZW5kLS0pIHtcbiAgICAgIGlmIChhcnJbZW5kXSAhPT0gJycpIGJyZWFrO1xuICAgIH1cblxuICAgIGlmIChzdGFydCA+IGVuZCkgcmV0dXJuIFtdO1xuICAgIHJldHVybiBhcnIuc2xpY2Uoc3RhcnQsIGVuZCAtIHN0YXJ0ICsgMSk7XG4gIH1cblxuICB2YXIgZnJvbVBhcnRzID0gdHJpbShmcm9tLnNwbGl0KCcvJykpO1xuICB2YXIgdG9QYXJ0cyA9IHRyaW0odG8uc3BsaXQoJy8nKSk7XG5cbiAgdmFyIGxlbmd0aCA9IE1hdGgubWluKGZyb21QYXJ0cy5sZW5ndGgsIHRvUGFydHMubGVuZ3RoKTtcbiAgdmFyIHNhbWVQYXJ0c0xlbmd0aCA9IGxlbmd0aDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmIChmcm9tUGFydHNbaV0gIT09IHRvUGFydHNbaV0pIHtcbiAgICAgIHNhbWVQYXJ0c0xlbmd0aCA9IGk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICB2YXIgb3V0cHV0UGFydHMgPSBbXTtcbiAgZm9yICh2YXIgaSA9IHNhbWVQYXJ0c0xlbmd0aDsgaSA8IGZyb21QYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgIG91dHB1dFBhcnRzLnB1c2goJy4uJyk7XG4gIH1cblxuICBvdXRwdXRQYXJ0cyA9IG91dHB1dFBhcnRzLmNvbmNhdCh0b1BhcnRzLnNsaWNlKHNhbWVQYXJ0c0xlbmd0aCkpO1xuXG4gIHJldHVybiBvdXRwdXRQYXJ0cy5qb2luKCcvJyk7XG59O1xuXG5leHBvcnRzLnNlcCA9ICcvJztcbmV4cG9ydHMuZGVsaW1pdGVyID0gJzonO1xuXG5leHBvcnRzLmRpcm5hbWUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHZhciByZXN1bHQgPSBzcGxpdFBhdGgocGF0aCksXG4gICAgICByb290ID0gcmVzdWx0WzBdLFxuICAgICAgZGlyID0gcmVzdWx0WzFdO1xuXG4gIGlmICghcm9vdCAmJiAhZGlyKSB7XG4gICAgLy8gTm8gZGlybmFtZSB3aGF0c29ldmVyXG4gICAgcmV0dXJuICcuJztcbiAgfVxuXG4gIGlmIChkaXIpIHtcbiAgICAvLyBJdCBoYXMgYSBkaXJuYW1lLCBzdHJpcCB0cmFpbGluZyBzbGFzaFxuICAgIGRpciA9IGRpci5zdWJzdHIoMCwgZGlyLmxlbmd0aCAtIDEpO1xuICB9XG5cbiAgcmV0dXJuIHJvb3QgKyBkaXI7XG59O1xuXG5cbmV4cG9ydHMuYmFzZW5hbWUgPSBmdW5jdGlvbihwYXRoLCBleHQpIHtcbiAgdmFyIGYgPSBzcGxpdFBhdGgocGF0aClbMl07XG4gIC8vIFRPRE86IG1ha2UgdGhpcyBjb21wYXJpc29uIGNhc2UtaW5zZW5zaXRpdmUgb24gd2luZG93cz9cbiAgaWYgKGV4dCAmJiBmLnN1YnN0cigtMSAqIGV4dC5sZW5ndGgpID09PSBleHQpIHtcbiAgICBmID0gZi5zdWJzdHIoMCwgZi5sZW5ndGggLSBleHQubGVuZ3RoKTtcbiAgfVxuICByZXR1cm4gZjtcbn07XG5cblxuZXhwb3J0cy5leHRuYW1lID0gZnVuY3Rpb24ocGF0aCkge1xuICByZXR1cm4gc3BsaXRQYXRoKHBhdGgpWzNdO1xufTtcblxuZnVuY3Rpb24gZmlsdGVyICh4cywgZikge1xuICAgIGlmICh4cy5maWx0ZXIpIHJldHVybiB4cy5maWx0ZXIoZik7XG4gICAgdmFyIHJlcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGYoeHNbaV0sIGksIHhzKSkgcmVzLnB1c2goeHNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzO1xufVxuXG4vLyBTdHJpbmcucHJvdG90eXBlLnN1YnN0ciAtIG5lZ2F0aXZlIGluZGV4IGRvbid0IHdvcmsgaW4gSUU4XG52YXIgc3Vic3RyID0gJ2FiJy5zdWJzdHIoLTEpID09PSAnYidcbiAgICA/IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHsgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbikgfVxuICAgIDogZnVuY3Rpb24gKHN0ciwgc3RhcnQsIGxlbikge1xuICAgICAgICBpZiAoc3RhcnQgPCAwKSBzdGFydCA9IHN0ci5sZW5ndGggKyBzdGFydDtcbiAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbik7XG4gICAgfVxuO1xuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG52YXIgY3VycmVudFF1ZXVlO1xudmFyIHF1ZXVlSW5kZXggPSAtMTtcblxuZnVuY3Rpb24gY2xlYW5VcE5leHRUaWNrKCkge1xuICAgIGlmICghZHJhaW5pbmcgfHwgIWN1cnJlbnRRdWV1ZSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgaWYgKGN1cnJlbnRRdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgcXVldWUgPSBjdXJyZW50UXVldWUuY29uY2F0KHF1ZXVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgfVxuICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgZHJhaW5RdWV1ZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgdGltZW91dCA9IHNldFRpbWVvdXQoY2xlYW5VcE5leHRUaWNrKTtcbiAgICBkcmFpbmluZyA9IHRydWU7XG5cbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgd2hpbGUgKCsrcXVldWVJbmRleCA8IGxlbikge1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRRdWV1ZSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtxdWV1ZUluZGV4XS5ydW4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgY3VycmVudFF1ZXVlID0gbnVsbDtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbn1cblxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoIC0gMSk7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKG5ldyBJdGVtKGZ1biwgYXJncykpO1xuICAgIGlmIChxdWV1ZS5sZW5ndGggPT09IDEgJiYgIWRyYWluaW5nKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZHJhaW5RdWV1ZSwgMCk7XG4gICAgfVxufTtcblxuLy8gdjggbGlrZXMgcHJlZGljdGlibGUgb2JqZWN0c1xuZnVuY3Rpb24gSXRlbShmdW4sIGFycmF5KSB7XG4gICAgdGhpcy5mdW4gPSBmdW47XG4gICAgdGhpcy5hcnJheSA9IGFycmF5O1xufVxuSXRlbS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZnVuLmFwcGx5KG51bGwsIHRoaXMuYXJyYXkpO1xufTtcbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xucHJvY2Vzcy52ZXJzaW9uID0gJyc7IC8vIGVtcHR5IHN0cmluZyB0byBhdm9pZCByZWdleHAgaXNzdWVzXG5wcm9jZXNzLnZlcnNpb25zID0ge307XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iLCJ2YXIgaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpXG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG52YXIgbm93ID0gcmVxdWlyZSgncmlnaHQtbm93JylcbnZhciByYWYgPSByZXF1aXJlKCdyYWYnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IEVuZ2luZVxuZnVuY3Rpb24gRW5naW5lKGZuKSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEVuZ2luZSkpIFxuICAgICAgICByZXR1cm4gbmV3IEVuZ2luZShmbilcbiAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZVxuICAgIHRoaXMubGFzdCA9IG5vdygpXG4gICAgdGhpcy5fZnJhbWUgPSAwXG4gICAgdGhpcy5fdGljayA9IHRoaXMudGljay5iaW5kKHRoaXMpXG5cbiAgICBpZiAoZm4pXG4gICAgICAgIHRoaXMub24oJ3RpY2snLCBmbilcbn1cblxuaW5oZXJpdHMoRW5naW5lLCBFdmVudEVtaXR0ZXIpXG5cbkVuZ2luZS5wcm90b3R5cGUuc3RhcnQgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5ydW5uaW5nKSBcbiAgICAgICAgcmV0dXJuXG4gICAgdGhpcy5ydW5uaW5nID0gdHJ1ZVxuICAgIHRoaXMubGFzdCA9IG5vdygpXG4gICAgdGhpcy5fZnJhbWUgPSByYWYodGhpcy5fdGljaylcbiAgICByZXR1cm4gdGhpc1xufVxuXG5FbmdpbmUucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZVxuICAgIGlmICh0aGlzLl9mcmFtZSAhPT0gMClcbiAgICAgICAgcmFmLmNhbmNlbCh0aGlzLl9mcmFtZSlcbiAgICB0aGlzLl9mcmFtZSA9IDBcbiAgICByZXR1cm4gdGhpc1xufVxuXG5FbmdpbmUucHJvdG90eXBlLnRpY2sgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLl9mcmFtZSA9IHJhZih0aGlzLl90aWNrKVxuICAgIHZhciB0aW1lID0gbm93KClcbiAgICB2YXIgZHQgPSB0aW1lIC0gdGhpcy5sYXN0XG4gICAgdGhpcy5lbWl0KCd0aWNrJywgZHQpXG4gICAgdGhpcy5sYXN0ID0gdGltZVxufSIsImlmICh0eXBlb2YgT2JqZWN0LmNyZWF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAvLyBpbXBsZW1lbnRhdGlvbiBmcm9tIHN0YW5kYXJkIG5vZGUuanMgJ3V0aWwnIG1vZHVsZVxuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgY3Rvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKHN1cGVyQ3Rvci5wcm90b3R5cGUsIHtcbiAgICAgIGNvbnN0cnVjdG9yOiB7XG4gICAgICAgIHZhbHVlOiBjdG9yLFxuICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgICAgfVxuICAgIH0pO1xuICB9O1xufSBlbHNlIHtcbiAgLy8gb2xkIHNjaG9vbCBzaGltIGZvciBvbGQgYnJvd3NlcnNcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIHZhciBUZW1wQ3RvciA9IGZ1bmN0aW9uICgpIHt9XG4gICAgVGVtcEN0b3IucHJvdG90eXBlID0gc3VwZXJDdG9yLnByb3RvdHlwZVxuICAgIGN0b3IucHJvdG90eXBlID0gbmV3IFRlbXBDdG9yKClcbiAgICBjdG9yLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGN0b3JcbiAgfVxufVxuIiwidmFyIG5vdyA9IHJlcXVpcmUoJ3BlcmZvcm1hbmNlLW5vdycpXG4gICwgcm9vdCA9IHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnID8gZ2xvYmFsIDogd2luZG93XG4gICwgdmVuZG9ycyA9IFsnbW96JywgJ3dlYmtpdCddXG4gICwgc3VmZml4ID0gJ0FuaW1hdGlvbkZyYW1lJ1xuICAsIHJhZiA9IHJvb3RbJ3JlcXVlc3QnICsgc3VmZml4XVxuICAsIGNhZiA9IHJvb3RbJ2NhbmNlbCcgKyBzdWZmaXhdIHx8IHJvb3RbJ2NhbmNlbFJlcXVlc3QnICsgc3VmZml4XVxuXG5mb3IodmFyIGkgPSAwOyAhcmFmICYmIGkgPCB2ZW5kb3JzLmxlbmd0aDsgaSsrKSB7XG4gIHJhZiA9IHJvb3RbdmVuZG9yc1tpXSArICdSZXF1ZXN0JyArIHN1ZmZpeF1cbiAgY2FmID0gcm9vdFt2ZW5kb3JzW2ldICsgJ0NhbmNlbCcgKyBzdWZmaXhdXG4gICAgICB8fCByb290W3ZlbmRvcnNbaV0gKyAnQ2FuY2VsUmVxdWVzdCcgKyBzdWZmaXhdXG59XG5cbi8vIFNvbWUgdmVyc2lvbnMgb2YgRkYgaGF2ZSByQUYgYnV0IG5vdCBjQUZcbmlmKCFyYWYgfHwgIWNhZikge1xuICB2YXIgbGFzdCA9IDBcbiAgICAsIGlkID0gMFxuICAgICwgcXVldWUgPSBbXVxuICAgICwgZnJhbWVEdXJhdGlvbiA9IDEwMDAgLyA2MFxuXG4gIHJhZiA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgaWYocXVldWUubGVuZ3RoID09PSAwKSB7XG4gICAgICB2YXIgX25vdyA9IG5vdygpXG4gICAgICAgICwgbmV4dCA9IE1hdGgubWF4KDAsIGZyYW1lRHVyYXRpb24gLSAoX25vdyAtIGxhc3QpKVxuICAgICAgbGFzdCA9IG5leHQgKyBfbm93XG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgY3AgPSBxdWV1ZS5zbGljZSgwKVxuICAgICAgICAvLyBDbGVhciBxdWV1ZSBoZXJlIHRvIHByZXZlbnRcbiAgICAgICAgLy8gY2FsbGJhY2tzIGZyb20gYXBwZW5kaW5nIGxpc3RlbmVyc1xuICAgICAgICAvLyB0byB0aGUgY3VycmVudCBmcmFtZSdzIHF1ZXVlXG4gICAgICAgIHF1ZXVlLmxlbmd0aCA9IDBcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IGNwLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgaWYoIWNwW2ldLmNhbmNlbGxlZCkge1xuICAgICAgICAgICAgdHJ5e1xuICAgICAgICAgICAgICBjcFtpXS5jYWxsYmFjayhsYXN0KVxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IHRocm93IGUgfSwgMClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sIE1hdGgucm91bmQobmV4dCkpXG4gICAgfVxuICAgIHF1ZXVlLnB1c2goe1xuICAgICAgaGFuZGxlOiArK2lkLFxuICAgICAgY2FsbGJhY2s6IGNhbGxiYWNrLFxuICAgICAgY2FuY2VsbGVkOiBmYWxzZVxuICAgIH0pXG4gICAgcmV0dXJuIGlkXG4gIH1cblxuICBjYWYgPSBmdW5jdGlvbihoYW5kbGUpIHtcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgcXVldWUubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmKHF1ZXVlW2ldLmhhbmRsZSA9PT0gaGFuZGxlKSB7XG4gICAgICAgIHF1ZXVlW2ldLmNhbmNlbGxlZCA9IHRydWVcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihmbikge1xuICAvLyBXcmFwIGluIGEgbmV3IGZ1bmN0aW9uIHRvIHByZXZlbnRcbiAgLy8gYGNhbmNlbGAgcG90ZW50aWFsbHkgYmVpbmcgYXNzaWduZWRcbiAgLy8gdG8gdGhlIG5hdGl2ZSByQUYgZnVuY3Rpb25cbiAgcmV0dXJuIHJhZi5jYWxsKHJvb3QsIGZuKVxufVxubW9kdWxlLmV4cG9ydHMuY2FuY2VsID0gZnVuY3Rpb24oKSB7XG4gIGNhZi5hcHBseShyb290LCBhcmd1bWVudHMpXG59XG5tb2R1bGUuZXhwb3J0cy5wb2x5ZmlsbCA9IGZ1bmN0aW9uKCkge1xuICByb290LnJlcXVlc3RBbmltYXRpb25GcmFtZSA9IHJhZlxuICByb290LmNhbmNlbEFuaW1hdGlvbkZyYW1lID0gY2FmXG59XG4iLCIvLyBHZW5lcmF0ZWQgYnkgQ29mZmVlU2NyaXB0IDEuNy4xXG4oZnVuY3Rpb24oKSB7XG4gIHZhciBnZXROYW5vU2Vjb25kcywgaHJ0aW1lLCBsb2FkVGltZTtcblxuICBpZiAoKHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwZXJmb3JtYW5jZSAhPT0gbnVsbCkgJiYgcGVyZm9ybWFuY2Uubm93KSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICB9O1xuICB9IGVsc2UgaWYgKCh0eXBlb2YgcHJvY2VzcyAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwcm9jZXNzICE9PSBudWxsKSAmJiBwcm9jZXNzLmhydGltZSkge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gKGdldE5hbm9TZWNvbmRzKCkgLSBsb2FkVGltZSkgLyAxZTY7XG4gICAgfTtcbiAgICBocnRpbWUgPSBwcm9jZXNzLmhydGltZTtcbiAgICBnZXROYW5vU2Vjb25kcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGhyO1xuICAgICAgaHIgPSBocnRpbWUoKTtcbiAgICAgIHJldHVybiBoclswXSAqIDFlOSArIGhyWzFdO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBnZXROYW5vU2Vjb25kcygpO1xuICB9IGVsc2UgaWYgKERhdGUubm93KSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBEYXRlLm5vdygpIC0gbG9hZFRpbWU7XG4gICAgfTtcbiAgICBsb2FkVGltZSA9IERhdGUubm93KCk7XG4gIH0gZWxzZSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIGxvYWRUaW1lO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgfVxuXG59KS5jYWxsKHRoaXMpO1xuIiwibW9kdWxlLmV4cG9ydHMgPVxuICBnbG9iYWwucGVyZm9ybWFuY2UgJiZcbiAgZ2xvYmFsLnBlcmZvcm1hbmNlLm5vdyA/IGZ1bmN0aW9uIG5vdygpIHtcbiAgICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KClcbiAgfSA6IERhdGUubm93IHx8IGZ1bmN0aW9uIG5vdygpIHtcbiAgICByZXR1cm4gK25ldyBEYXRlXG4gIH1cbiIsIid1c2Ugc3RyaWN0Jztcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG1pbiwgbWF4KSB7XG5cdGlmIChtYXggPT09IHVuZGVmaW5lZCkge1xuXHRcdG1heCA9IG1pbjtcblx0XHRtaW4gPSAwO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBtaW4gIT09ICdudW1iZXInIHx8IHR5cGVvZiBtYXggIT09ICdudW1iZXInKSB7XG5cdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignRXhwZWN0ZWQgYWxsIGFyZ3VtZW50cyB0byBiZSBudW1iZXJzJyk7XG5cdH1cblxuXHRyZXR1cm4gTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4pICsgbWluO1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID1cbiAgZ2xvYmFsLnBlcmZvcm1hbmNlICYmXG4gIGdsb2JhbC5wZXJmb3JtYW5jZS5ub3cgPyBmdW5jdGlvbiBub3coKSB7XG4gICAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpXG4gIH0gOiBEYXRlLm5vdyB8fCBmdW5jdGlvbiBub3coKSB7XG4gICAgcmV0dXJuICtuZXcgRGF0ZVxuICB9XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGJ1aWxkSW1wdWxzZVxuXG52YXIgY2h1bmtTaXplID0gMjA0OFxuXG52YXIgcXVldWUgPSBbXVxudmFyIHRhcmdldHMgPSB7fVxuXG52YXIgbGFzdEltcHVsc2VJZCA9IDBcbmZ1bmN0aW9uIGJ1aWxkSW1wdWxzZShsZW5ndGgsIGRlY2F5LCByZXZlcnNlLCBjYil7XG4gIFxuICBsYXN0SW1wdWxzZUlkICs9IDFcbiAgdmFyIHRhcmdldCA9IHRhcmdldHNbbGFzdEltcHVsc2VJZF0gPSB7XG4gICAgaWQ6IGxhc3RJbXB1bHNlSWQsXG4gICAgY2I6IGNiLFxuICAgIGxlbmd0aDogbGVuZ3RoLFxuICAgIGRlY2F5OiBkZWNheSxcbiAgICByZXZlcnNlOiByZXZlcnNlLFxuICAgIGltcHVsc2VMOiBuZXcgRmxvYXQzMkFycmF5KGxlbmd0aCksXG4gICAgaW1wdWxzZVI6IG5ldyBGbG9hdDMyQXJyYXkobGVuZ3RoKVxuICB9XG5cbiAgcXVldWUucHVzaChbIHRhcmdldC5pZCwgMCwgTWF0aC5taW4oY2h1bmtTaXplLCBsZW5ndGgpIF0pXG5cbiAgc2V0VGltZW91dChuZXh0LCAxKVxuICByZXR1cm4gbGFzdEltcHVsc2VJZFxufVxuXG5idWlsZEltcHVsc2UuY2FuY2VsID0gZnVuY3Rpb24oaWQpe1xuICBpZiAodGFyZ2V0c1tpZF0pe1xuICAgIDtkZWxldGUgdGFyZ2V0c1tpZF1cbiAgICByZXR1cm4gdHJ1ZVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbmZ1bmN0aW9uIG5leHQoKXtcbiAgdmFyIGl0ZW0gPSBxdWV1ZS5zaGlmdCgpXG4gIGlmIChpdGVtKXtcbiAgICB2YXIgdGFyZ2V0ID0gdGFyZ2V0c1tpdGVtWzBdXVxuICAgIGlmICh0YXJnZXQpe1xuICAgICAgdmFyIGxlbmd0aCA9IHRhcmdldC5sZW5ndGhcbiAgICAgIHZhciBkZWNheSA9IHRhcmdldC5kZWNheVxuICAgICAgdmFyIHJldmVyc2UgPSB0YXJnZXQucmV2ZXJzZVxuICAgICAgdmFyIGZyb20gPSBpdGVtWzFdXG4gICAgICB2YXIgdG8gPSBpdGVtWzJdXG5cbiAgICAgIHZhciBpbXB1bHNlTCA9IHRhcmdldC5pbXB1bHNlTFxuICAgICAgdmFyIGltcHVsc2VSID0gdGFyZ2V0LmltcHVsc2VSXG5cbiAgICAgIGZvciAodmFyIGk9ZnJvbTtpPHRvO2krKykge1xuICAgICAgICB2YXIgbiA9IHJldmVyc2UgPyBsZW5ndGggLSBpIDogaTtcbiAgICAgICAgaW1wdWxzZUxbaV0gPSAoTWF0aC5yYW5kb20oKSAqIDIgLSAxKSAqIE1hdGgucG93KDEgLSBuIC8gbGVuZ3RoLCBkZWNheSk7XG4gICAgICAgIGltcHVsc2VSW2ldID0gKE1hdGgucmFuZG9tKCkgKiAyIC0gMSkgKiBNYXRoLnBvdygxIC0gbiAvIGxlbmd0aCwgZGVjYXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAodG8gPj0gbGVuZ3RoLTEpe1xuICAgICAgICA7ZGVsZXRlIHRhcmdldHNbaXRlbVswXV1cbiAgICAgICAgdGFyZ2V0LmNiKFt0YXJnZXQuaW1wdWxzZUwsIHRhcmdldC5pbXB1bHNlUl0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWV1ZS5wdXNoKFsgdGFyZ2V0LmlkLCB0bywgTWF0aC5taW4odG8gKyBjaHVua1NpemUsIGxlbmd0aCkgXSlcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgXG4gIGlmIChxdWV1ZS5sZW5ndGgpe1xuICAgIHNldFRpbWVvdXQobmV4dCwgNSlcbiAgfVxufSIsIi8vIGJhc2VkIG9uIGh0dHBzOi8vZ2l0aHViLmNvbS93ZWItYXVkaW8tY29tcG9uZW50cy9zaW1wbGUtcmV2ZXJiIGJ5IE5pY2sgVGhvbXBzb25cblxudmFyIGJ1aWxkSW1wdWxzZSA9IHJlcXVpcmUoJy4vYnVpbGQtaW1wdWxzZScpXG5cbm1vZHVsZS5leHBvcnRzID0gU2ltcGxlUmV2ZXJiXG5cbmZ1bmN0aW9uIFNpbXBsZVJldmVyYihjb250ZXh0KXtcbiAgdmFyIG5vZGUgPSBjb250ZXh0LmNyZWF0ZUdhaW4oKVxuICB2YXIgZHJ5ID0gbm9kZS5fZHJ5ID0gY29udGV4dC5jcmVhdGVHYWluKClcbiAgdmFyIHdldCA9IG5vZGUuX3dldCA9IGNvbnRleHQuY3JlYXRlR2FpbigpXG5cbiAgdmFyIG91dHB1dCA9IG5vZGUub3V0cHV0ID0gY29udGV4dC5jcmVhdGVHYWluKClcblxuICB2YXIgY29udm9sdmVyID0gbm9kZS5fY29udm9sdmVyID0gY29udGV4dC5jcmVhdGVDb252b2x2ZXIoKTtcbiAgdmFyIGZpbHRlciA9IG5vZGUuX2ZpbHRlciA9IGNvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKClcbiAgXG4gIG5vZGUuY29ubmVjdChkcnkpXG4gIG5vZGUuY29ubmVjdCh3ZXQpXG5cbiAgY29udm9sdmVyLmNvbm5lY3QoZmlsdGVyKVxuICBkcnkuY29ubmVjdChvdXRwdXQpXG4gIHdldC5jb25uZWN0KGNvbnZvbHZlcilcbiAgZmlsdGVyLmNvbm5lY3Qob3V0cHV0KVxuXG5cbiAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMobm9kZSwgcHJvcGVydGllcylcblxuICBub2RlLl90aW1lID0gM1xuICBub2RlLl9kZWNheSA9IDJcbiAgbm9kZS5fcmV2ZXJzZSA9IGZhbHNlXG5cbiAgbm9kZS5jdXRvZmYudmFsdWUgPSAyMDAwMFxuICBub2RlLmZpbHRlclR5cGUgPSAnbG93cGFzcydcblxuICBub2RlLl9idWlsZGluZyA9IGZhbHNlXG4gIG5vZGUuX2J1aWxkSW1wdWxzZSgpXG5cblxuICByZXR1cm4gbm9kZVxufVxuXG52YXIgcHJvcGVydGllcyA9IHtcblxuICBjb25uZWN0OiB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uKCl7XG4gICAgICB0aGlzLm91dHB1dC5jb25uZWN0LmFwcGx5KHRoaXMub3V0cHV0LCBhcmd1bWVudHMpXG4gICAgfVxuICB9LFxuXG4gIGRpc2Nvbm5lY3Q6IHtcbiAgICB2YWx1ZTogZnVuY3Rpb24oKXtcbiAgICAgIHRoaXMub3V0cHV0LmRpc2Nvbm5lY3QuYXBwbHkodGhpcy5vdXRwdXQsIGFyZ3VtZW50cylcbiAgICB9XG4gIH0sXG5cbiAgd2V0OiB7XG4gICAgZ2V0OiBmdW5jdGlvbigpe1xuICAgICAgcmV0dXJuIHRoaXMuX3dldC5nYWluXG4gICAgfVxuICB9LFxuXG4gIGRyeToge1xuICAgIGdldDogZnVuY3Rpb24oKXtcbiAgICAgIHJldHVybiB0aGlzLl9kcnkuZ2FpblxuICAgIH1cbiAgfSxcblxuICBjdXRvZmY6IHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCl7XG4gICAgICByZXR1cm4gdGhpcy5fZmlsdGVyLmZyZXF1ZW5jeVxuICAgIH1cbiAgfSxcblxuICBmaWx0ZXJUeXBlOiB7XG4gICAgZ2V0OiBmdW5jdGlvbigpe1xuICAgICAgcmV0dXJuIHRoaXMuX2ZpbHRlci50eXBlXG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKXtcbiAgICAgIHRoaXMuX2ZpbHRlci50eXBlID0gdmFsdWVcbiAgICB9XG4gIH0sXG5cbiAgX2J1aWxkSW1wdWxzZToge1xuICAgIHZhbHVlOiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgc2VsZiA9IHRoaXNcbiAgICAgIHZhciByYXRlID0gc2VsZi5jb250ZXh0LnNhbXBsZVJhdGVcbiAgICAgIHZhciBsZW5ndGggPSBNYXRoLm1heChyYXRlICogc2VsZi50aW1lLCAxKVxuXG4gICAgICBpZiAoc2VsZi5fYnVpbGRpbmcpe1xuICAgICAgICBidWlsZEltcHVsc2UuY2FuY2VsKHNlbGYuX2J1aWxkaW5nKVxuICAgICAgfVxuXG4gICAgICBzZWxmLl9idWlsZGluZyA9IGJ1aWxkSW1wdWxzZShsZW5ndGgsIHNlbGYuZGVjYXksIHNlbGYucmV2ZXJzZSwgZnVuY3Rpb24oY2hhbm5lbHMpe1xuICAgICAgICB2YXIgaW1wdWxzZSA9IHNlbGYuY29udGV4dC5jcmVhdGVCdWZmZXIoMiwgbGVuZ3RoLCByYXRlKVxuICAgICAgICBpbXB1bHNlLmdldENoYW5uZWxEYXRhKDApLnNldChjaGFubmVsc1swXSlcbiAgICAgICAgaW1wdWxzZS5nZXRDaGFubmVsRGF0YSgxKS5zZXQoY2hhbm5lbHNbMV0pXG4gICAgICAgIHNlbGYuX2NvbnZvbHZlci5idWZmZXIgPSBpbXB1bHNlXG4gICAgICAgIHNlbGYuX2J1aWxkaW5nID0gZmFsc2VcbiAgICAgIH0pXG4gICAgfVxuICB9LFxuXG4gIC8qKlxuICAgKiBQdWJsaWMgcGFyYW1ldGVycy5cbiAgICovXG5cbiAgdGltZToge1xuICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzLl90aW1lOyB9LFxuICAgIHNldDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICB0aGlzLl90aW1lID0gdmFsdWU7XG4gICAgICB0aGlzLl9idWlsZEltcHVsc2UoKTtcbiAgICB9XG4gIH0sXG5cbiAgZGVjYXk6IHtcbiAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgIGdldDogZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpcy5fZGVjYXk7IH0sXG4gICAgc2V0OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIHRoaXMuX2RlY2F5ID0gdmFsdWU7XG4gICAgICB0aGlzLl9idWlsZEltcHVsc2UoKTtcbiAgICB9XG4gIH0sXG5cbiAgcmV2ZXJzZToge1xuICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzLl9yZXZlcnNlOyB9LFxuICAgIHNldDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICB0aGlzLl9yZXZlcnNlID0gdmFsdWU7XG4gICAgICB0aGlzLl9idWlsZEltcHVsc2UoKTtcbiAgICB9XG4gIH1cblxufVxuXG4iLCIvKipcbiAqIEBhdXRob3IgYWx0ZXJlZHEgLyBodHRwOi8vYWx0ZXJlZHF1YWxpYS5jb20vXG4gKlxuICogRnVsbC1zY3JlZW4gdGV4dHVyZWQgcXVhZCBzaGFkZXJcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdW5pZm9ybXM6IHtcbiAgICBcInREaWZmdXNlXCI6IHsgdHlwZTogXCJ0XCIsIHZhbHVlOiBudWxsIH0sXG4gICAgXCJvcGFjaXR5XCI6ICB7IHR5cGU6IFwiZlwiLCB2YWx1ZTogMS4wIH1cbiAgfSxcbiAgdmVydGV4U2hhZGVyOiBbXG4gICAgXCJ2YXJ5aW5nIHZlYzIgdlV2O1wiLFxuXG4gICAgXCJ2b2lkIG1haW4oKSB7XCIsXG5cbiAgICAgIFwidlV2ID0gdXY7XCIsXG4gICAgICBcImdsX1Bvc2l0aW9uID0gcHJvamVjdGlvbk1hdHJpeCAqIG1vZGVsVmlld01hdHJpeCAqIHZlYzQoIHBvc2l0aW9uLCAxLjAgKTtcIixcblxuICAgIFwifVwiXG4gIF0uam9pbihcIlxcblwiKSxcbiAgZnJhZ21lbnRTaGFkZXI6IFtcbiAgICBcInVuaWZvcm0gZmxvYXQgb3BhY2l0eTtcIixcblxuICAgIFwidW5pZm9ybSBzYW1wbGVyMkQgdERpZmZ1c2U7XCIsXG5cbiAgICBcInZhcnlpbmcgdmVjMiB2VXY7XCIsXG5cbiAgICBcInZvaWQgbWFpbigpIHtcIixcblxuICAgICAgXCJ2ZWM0IHRleGVsID0gdGV4dHVyZTJEKCB0RGlmZnVzZSwgdlV2ICk7XCIsXG4gICAgICBcImdsX0ZyYWdDb2xvciA9IG9wYWNpdHkgKiB0ZXhlbDtcIixcblxuICAgIFwifVwiXG4gIF0uam9pbihcIlxcblwiKVxufTtcbiIsIi8qKlxuICogQGF1dGhvciBhbHRlcmVkcSAvIGh0dHA6Ly9hbHRlcmVkcXVhbGlhLmNvbS9cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKFRIUkVFKSB7XG4gIGZ1bmN0aW9uIENsZWFyTWFza1Bhc3MoKSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIENsZWFyTWFza1Bhc3MpKSByZXR1cm4gbmV3IENsZWFyTWFza1Bhc3Moc2NlbmUsIGNhbWVyYSk7XG4gICAgdGhpcy5lbmFibGVkID0gdHJ1ZTtcbiAgfTtcblxuICBDbGVhck1hc2tQYXNzLnByb3RvdHlwZSA9IHtcbiAgICByZW5kZXI6IGZ1bmN0aW9uICggcmVuZGVyZXIsIHdyaXRlQnVmZmVyLCByZWFkQnVmZmVyLCBkZWx0YSApIHtcbiAgICAgIHZhciBjb250ZXh0ID0gcmVuZGVyZXIuY29udGV4dDtcbiAgICAgIGNvbnRleHQuZGlzYWJsZSggY29udGV4dC5TVEVOQ0lMX1RFU1QgKTtcbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuIENsZWFyTWFza1Bhc3Ncbn07IiwiLyoqXG4gKiBAYXV0aG9yIGFsdGVyZWRxIC8gaHR0cDovL2FsdGVyZWRxdWFsaWEuY29tL1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oVEhSRUUpIHtcbiAgZnVuY3Rpb24gTWFza1Bhc3MoIHNjZW5lLCBjYW1lcmEgKSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIE1hc2tQYXNzKSkgcmV0dXJuIG5ldyBNYXNrUGFzcyhzY2VuZSwgY2FtZXJhKTtcblxuICAgIHRoaXMuc2NlbmUgPSBzY2VuZTtcbiAgICB0aGlzLmNhbWVyYSA9IGNhbWVyYTtcblxuICAgIHRoaXMuZW5hYmxlZCA9IHRydWU7XG4gICAgdGhpcy5jbGVhciA9IHRydWU7XG4gICAgdGhpcy5uZWVkc1N3YXAgPSBmYWxzZTtcblxuICAgIHRoaXMuaW52ZXJzZSA9IGZhbHNlO1xuICB9O1xuXG4gIE1hc2tQYXNzLnByb3RvdHlwZSA9IHtcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gKCByZW5kZXJlciwgd3JpdGVCdWZmZXIsIHJlYWRCdWZmZXIsIGRlbHRhICkge1xuXG4gICAgICB2YXIgY29udGV4dCA9IHJlbmRlcmVyLmNvbnRleHQ7XG5cbiAgICAgIC8vIGRvbid0IHVwZGF0ZSBjb2xvciBvciBkZXB0aFxuXG4gICAgICBjb250ZXh0LmNvbG9yTWFzayggZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2UgKTtcbiAgICAgIGNvbnRleHQuZGVwdGhNYXNrKCBmYWxzZSApO1xuXG4gICAgICAvLyBzZXQgdXAgc3RlbmNpbFxuXG4gICAgICB2YXIgd3JpdGVWYWx1ZSwgY2xlYXJWYWx1ZTtcblxuICAgICAgaWYgKCB0aGlzLmludmVyc2UgKSB7XG5cbiAgICAgICAgd3JpdGVWYWx1ZSA9IDA7XG4gICAgICAgIGNsZWFyVmFsdWUgPSAxO1xuXG4gICAgICB9IGVsc2Uge1xuXG4gICAgICAgIHdyaXRlVmFsdWUgPSAxO1xuICAgICAgICBjbGVhclZhbHVlID0gMDtcblxuICAgICAgfVxuXG4gICAgICBjb250ZXh0LmVuYWJsZSggY29udGV4dC5TVEVOQ0lMX1RFU1QgKTtcbiAgICAgIGNvbnRleHQuc3RlbmNpbE9wKCBjb250ZXh0LlJFUExBQ0UsIGNvbnRleHQuUkVQTEFDRSwgY29udGV4dC5SRVBMQUNFICk7XG4gICAgICBjb250ZXh0LnN0ZW5jaWxGdW5jKCBjb250ZXh0LkFMV0FZUywgd3JpdGVWYWx1ZSwgMHhmZmZmZmZmZiApO1xuICAgICAgY29udGV4dC5jbGVhclN0ZW5jaWwoIGNsZWFyVmFsdWUgKTtcblxuICAgICAgLy8gZHJhdyBpbnRvIHRoZSBzdGVuY2lsIGJ1ZmZlclxuXG4gICAgICByZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhLCByZWFkQnVmZmVyLCB0aGlzLmNsZWFyICk7XG4gICAgICByZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhLCB3cml0ZUJ1ZmZlciwgdGhpcy5jbGVhciApO1xuXG4gICAgICAvLyByZS1lbmFibGUgdXBkYXRlIG9mIGNvbG9yIGFuZCBkZXB0aFxuXG4gICAgICBjb250ZXh0LmNvbG9yTWFzayggdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSApO1xuICAgICAgY29udGV4dC5kZXB0aE1hc2soIHRydWUgKTtcblxuICAgICAgLy8gb25seSByZW5kZXIgd2hlcmUgc3RlbmNpbCBpcyBzZXQgdG8gMVxuXG4gICAgICBjb250ZXh0LnN0ZW5jaWxGdW5jKCBjb250ZXh0LkVRVUFMLCAxLCAweGZmZmZmZmZmICk7ICAvLyBkcmF3IGlmID09IDFcbiAgICAgIGNvbnRleHQuc3RlbmNpbE9wKCBjb250ZXh0LktFRVAsIGNvbnRleHQuS0VFUCwgY29udGV4dC5LRUVQICk7XG5cbiAgICB9XG5cbiAgfTtcblxuICByZXR1cm4gTWFza1Bhc3Ncbn07XG4iLCIvKipcbiAqIEBhdXRob3IgYWx0ZXJlZHEgLyBodHRwOi8vYWx0ZXJlZHF1YWxpYS5jb20vXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihUSFJFRSkge1xuICBmdW5jdGlvbiBSZW5kZXJQYXNzKCBzY2VuZSwgY2FtZXJhLCBvdmVycmlkZU1hdGVyaWFsLCBjbGVhckNvbG9yLCBjbGVhckFscGhhICkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBSZW5kZXJQYXNzKSkgcmV0dXJuIG5ldyBSZW5kZXJQYXNzKHNjZW5lLCBjYW1lcmEsIG92ZXJyaWRlTWF0ZXJpYWwsIGNsZWFyQ29sb3IsIGNsZWFyQWxwaGEpO1xuXG4gICAgdGhpcy5zY2VuZSA9IHNjZW5lO1xuICAgIHRoaXMuY2FtZXJhID0gY2FtZXJhO1xuXG4gICAgdGhpcy5vdmVycmlkZU1hdGVyaWFsID0gb3ZlcnJpZGVNYXRlcmlhbDtcblxuICAgIHRoaXMuY2xlYXJDb2xvciA9IGNsZWFyQ29sb3I7XG4gICAgdGhpcy5jbGVhckFscGhhID0gKCBjbGVhckFscGhhICE9PSB1bmRlZmluZWQgKSA/IGNsZWFyQWxwaGEgOiAxO1xuXG4gICAgdGhpcy5vbGRDbGVhckNvbG9yID0gbmV3IFRIUkVFLkNvbG9yKCk7XG4gICAgdGhpcy5vbGRDbGVhckFscGhhID0gMTtcblxuICAgIHRoaXMuZW5hYmxlZCA9IHRydWU7XG4gICAgdGhpcy5jbGVhciA9IHRydWU7XG4gICAgdGhpcy5uZWVkc1N3YXAgPSBmYWxzZTtcblxuICB9O1xuXG4gIFJlbmRlclBhc3MucHJvdG90eXBlID0ge1xuXG4gICAgcmVuZGVyOiBmdW5jdGlvbiAoIHJlbmRlcmVyLCB3cml0ZUJ1ZmZlciwgcmVhZEJ1ZmZlciwgZGVsdGEgKSB7XG5cbiAgICAgIHRoaXMuc2NlbmUub3ZlcnJpZGVNYXRlcmlhbCA9IHRoaXMub3ZlcnJpZGVNYXRlcmlhbDtcblxuICAgICAgaWYgKCB0aGlzLmNsZWFyQ29sb3IgKSB7XG5cbiAgICAgICAgdGhpcy5vbGRDbGVhckNvbG9yLmNvcHkoIHJlbmRlcmVyLmdldENsZWFyQ29sb3IoKSApO1xuICAgICAgICB0aGlzLm9sZENsZWFyQWxwaGEgPSByZW5kZXJlci5nZXRDbGVhckFscGhhKCk7XG5cbiAgICAgICAgcmVuZGVyZXIuc2V0Q2xlYXJDb2xvciggdGhpcy5jbGVhckNvbG9yLCB0aGlzLmNsZWFyQWxwaGEgKTtcblxuICAgICAgfVxuXG4gICAgICByZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhLCByZWFkQnVmZmVyLCB0aGlzLmNsZWFyICk7XG5cbiAgICAgIGlmICggdGhpcy5jbGVhckNvbG9yICkge1xuXG4gICAgICAgIHJlbmRlcmVyLnNldENsZWFyQ29sb3IoIHRoaXMub2xkQ2xlYXJDb2xvciwgdGhpcy5vbGRDbGVhckFscGhhICk7XG5cbiAgICAgIH1cblxuICAgICAgdGhpcy5zY2VuZS5vdmVycmlkZU1hdGVyaWFsID0gbnVsbDtcblxuICAgIH1cblxuICB9O1xuXG4gIHJldHVybiBSZW5kZXJQYXNzO1xuXG59O1xuIiwiLyoqXG4gKiBAYXV0aG9yIGFsdGVyZWRxIC8gaHR0cDovL2FsdGVyZWRxdWFsaWEuY29tL1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oVEhSRUUsIEVmZmVjdENvbXBvc2VyKSB7XG4gIGZ1bmN0aW9uIFNoYWRlclBhc3MoIHNoYWRlciwgdGV4dHVyZUlEICkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBTaGFkZXJQYXNzKSkgcmV0dXJuIG5ldyBTaGFkZXJQYXNzKHNoYWRlciwgdGV4dHVyZUlEKTtcblxuICAgIHRoaXMudGV4dHVyZUlEID0gKCB0ZXh0dXJlSUQgIT09IHVuZGVmaW5lZCApID8gdGV4dHVyZUlEIDogXCJ0RGlmZnVzZVwiO1xuXG4gICAgdGhpcy51bmlmb3JtcyA9IFRIUkVFLlVuaWZvcm1zVXRpbHMuY2xvbmUoIHNoYWRlci51bmlmb3JtcyApO1xuXG4gICAgdGhpcy5tYXRlcmlhbCA9IG5ldyBUSFJFRS5TaGFkZXJNYXRlcmlhbCgge1xuXG4gICAgICB1bmlmb3JtczogdGhpcy51bmlmb3JtcyxcbiAgICAgIHZlcnRleFNoYWRlcjogc2hhZGVyLnZlcnRleFNoYWRlcixcbiAgICAgIGZyYWdtZW50U2hhZGVyOiBzaGFkZXIuZnJhZ21lbnRTaGFkZXJcblxuICAgIH0gKTtcblxuICAgIHRoaXMucmVuZGVyVG9TY3JlZW4gPSBmYWxzZTtcblxuICAgIHRoaXMuZW5hYmxlZCA9IHRydWU7XG4gICAgdGhpcy5uZWVkc1N3YXAgPSB0cnVlO1xuICAgIHRoaXMuY2xlYXIgPSBmYWxzZTtcblxuICB9O1xuXG4gIFNoYWRlclBhc3MucHJvdG90eXBlID0ge1xuXG4gICAgcmVuZGVyOiBmdW5jdGlvbiAoIHJlbmRlcmVyLCB3cml0ZUJ1ZmZlciwgcmVhZEJ1ZmZlciwgZGVsdGEgKSB7XG5cbiAgICAgIGlmICggdGhpcy51bmlmb3Jtc1sgdGhpcy50ZXh0dXJlSUQgXSApIHtcblxuICAgICAgICB0aGlzLnVuaWZvcm1zWyB0aGlzLnRleHR1cmVJRCBdLnZhbHVlID0gcmVhZEJ1ZmZlcjtcblxuICAgICAgfVxuXG4gICAgICBFZmZlY3RDb21wb3Nlci5xdWFkLm1hdGVyaWFsID0gdGhpcy5tYXRlcmlhbDtcblxuICAgICAgaWYgKCB0aGlzLnJlbmRlclRvU2NyZWVuICkge1xuXG4gICAgICAgIHJlbmRlcmVyLnJlbmRlciggRWZmZWN0Q29tcG9zZXIuc2NlbmUsIEVmZmVjdENvbXBvc2VyLmNhbWVyYSApO1xuXG4gICAgICB9IGVsc2Uge1xuXG4gICAgICAgIHJlbmRlcmVyLnJlbmRlciggRWZmZWN0Q29tcG9zZXIuc2NlbmUsIEVmZmVjdENvbXBvc2VyLmNhbWVyYSwgd3JpdGVCdWZmZXIsIHRoaXMuY2xlYXIgKTtcblxuICAgICAgfVxuXG4gICAgfVxuXG4gIH07XG5cbiAgcmV0dXJuIFNoYWRlclBhc3M7XG5cbn07IiwidmFyIGluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKFRIUkVFKSB7XG5cbiAgICBmdW5jdGlvbiBDb21wbGV4KG1lc2gpIHtcbiAgICAgICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIENvbXBsZXgpKVxuICAgICAgICAgICAgcmV0dXJuIG5ldyBDb21wbGV4KG1lc2gpXG4gICAgICAgIFRIUkVFLkdlb21ldHJ5LmNhbGwodGhpcylcbiAgICAgICAgdGhpcy5keW5hbWljID0gdHJ1ZVxuXG4gICAgICAgIGlmIChtZXNoKVxuICAgICAgICAgICAgdGhpcy51cGRhdGUobWVzaClcbiAgICB9XG5cbiAgICBpbmhlcml0cyhDb21wbGV4LCBUSFJFRS5HZW9tZXRyeSlcblxuICAgIC8vbWF5IGV4cG9zZSB0aGVzZSBpbiBuZXh0IHZlcnNpb25cbiAgICBDb21wbGV4LnByb3RvdHlwZS5fdXBkYXRlUG9zaXRpb25zID0gZnVuY3Rpb24ocG9zaXRpb25zKSB7XG4gICAgICAgIGZvciAodmFyIGk9MDsgaTxwb3NpdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBwb3MgPSBwb3NpdGlvbnNbaV1cbiAgICAgICAgICAgIGlmIChpID4gdGhpcy52ZXJ0aWNlcy5sZW5ndGgtMSlcbiAgICAgICAgICAgICAgICB0aGlzLnZlcnRpY2VzLnB1c2gobmV3IFRIUkVFLlZlY3RvcjMoKS5mcm9tQXJyYXkocG9zKSlcbiAgICAgICAgICAgIGVsc2UgXG4gICAgICAgICAgICAgICAgdGhpcy52ZXJ0aWNlc1tpXS5mcm9tQXJyYXkocG9zKVxuICAgICAgICB9XG4gICAgICAgIHRoaXMudmVydGljZXMubGVuZ3RoID0gcG9zaXRpb25zLmxlbmd0aFxuICAgICAgICB0aGlzLnZlcnRpY2VzTmVlZFVwZGF0ZSA9IHRydWVcbiAgICB9XG5cbiAgICBDb21wbGV4LnByb3RvdHlwZS5fdXBkYXRlQ2VsbHMgPSBmdW5jdGlvbihjZWxscykge1xuICAgICAgICBmb3IgKHZhciBpPTA7IGk8Y2VsbHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmYWNlID0gY2VsbHNbaV1cbiAgICAgICAgICAgIGlmIChpID4gdGhpcy5mYWNlcy5sZW5ndGgtMSlcbiAgICAgICAgICAgICAgICB0aGlzLmZhY2VzLnB1c2gobmV3IFRIUkVFLkZhY2UzKGZhY2VbMF0sIGZhY2VbMV0sIGZhY2VbMl0pKVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIHRmID0gdGhpcy5mYWNlc1tpXVxuICAgICAgICAgICAgICAgIHRmLmEgPSBmYWNlWzBdXG4gICAgICAgICAgICAgICAgdGYuYiA9IGZhY2VbMV1cbiAgICAgICAgICAgICAgICB0Zi5jID0gZmFjZVsyXVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5mYWNlcy5sZW5ndGggPSBjZWxscy5sZW5ndGhcbiAgICAgICAgdGhpcy5lbGVtZW50c05lZWRVcGRhdGUgPSB0cnVlXG4gICAgfVxuXG4gICAgQ29tcGxleC5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24obWVzaCkge1xuICAgICAgICB0aGlzLl91cGRhdGVQb3NpdGlvbnMobWVzaC5wb3NpdGlvbnMpXG4gICAgICAgIHRoaXMuX3VwZGF0ZUNlbGxzKG1lc2guY2VsbHMpXG4gICAgfVxuXG4gICAgcmV0dXJuIENvbXBsZXhcbn0iLCJ2YXIgeHRlbmQgPSByZXF1aXJlKCd4dGVuZCcpXG52YXIgZWFzZXMgPSByZXF1aXJlKCdlYXNlcycpXG52YXIgVGlja2VyID0gcmVxdWlyZSgndHdlZW4tdGlja2VyJylcbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXI7XG52YXIgaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpXG52YXIgbWl4aW4gPSByZXF1aXJlKCdtaXhlcycpXG52YXIgbG9vcCA9IHJlcXVpcmUoJy4vbG9vcCcpXG5cbnZhciBkZWZhdWx0T3B0ID0geyBlYXNlczogZWFzZXMgfVxuXG5tb2R1bGUuZXhwb3J0cyA9IFR3ZWVuclxuZnVuY3Rpb24gVHdlZW5yKG9wdCkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBUd2VlbnIpKVxuICAgICAgICByZXR1cm4gbmV3IFR3ZWVucihvcHQpXG5cbiAgICBUaWNrZXIuY2FsbCh0aGlzLCB4dGVuZChkZWZhdWx0T3B0LCBvcHQpKVxuICAgIEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpXG5cbiAgICB0aGlzLl9oYW5kbGVUaWNrID0gZnVuY3Rpb24oZHQpIHtcbiAgICAgICAgZHQgPSBNYXRoLm1pbigzMCwgZHQpIC8vY2FwIGRlbHRhIGF0IDMwIG1zXG4gICAgICAgIGR0IC89IDEwMDBcbiAgICAgICAgdGhpcy5lbWl0KCd0aWNrJywgZHQpXG4gICAgICAgIHRoaXMudGljayhkdClcbiAgICB9LmJpbmQodGhpcylcblxuICAgIGxvb3Aub24oJ3RpY2snLCB0aGlzLl9oYW5kbGVUaWNrKVxufVxuXG5pbmhlcml0cyhUd2VlbnIsIFRpY2tlcilcbm1peGluKFR3ZWVuciwgRXZlbnRFbWl0dGVyLnByb3RvdHlwZSlcblxuVHdlZW5yLnByb3RvdHlwZS5kaXNwb3NlID0gZnVuY3Rpb24oKSB7XG4gICAgbG9vcC5yZW1vdmVMaXN0ZW5lcigndGljaycsIHRoaXMuX2hhbmRsZVRpY2spXG59XG4iLCJ2YXIgZW5naW5lID0gcmVxdWlyZSgncmFmLWxvb3AnKSgpXG5lbmdpbmUuc3RhcnQoKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVuZ2luZSIsImZ1bmN0aW9uIGJhY2tJbk91dCh0KSB7XG4gIHZhciBzID0gMS43MDE1OCAqIDEuNTI1XG4gIGlmICgodCAqPSAyKSA8IDEpXG4gICAgcmV0dXJuIDAuNSAqICh0ICogdCAqICgocyArIDEpICogdCAtIHMpKVxuICByZXR1cm4gMC41ICogKCh0IC09IDIpICogdCAqICgocyArIDEpICogdCArIHMpICsgMilcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYWNrSW5PdXQiLCJmdW5jdGlvbiBiYWNrSW4odCkge1xuICB2YXIgcyA9IDEuNzAxNThcbiAgcmV0dXJuIHQgKiB0ICogKChzICsgMSkgKiB0IC0gcylcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYWNrSW4iLCJmdW5jdGlvbiBiYWNrT3V0KHQpIHtcbiAgdmFyIHMgPSAxLjcwMTU4XG4gIHJldHVybiAtLXQgKiB0ICogKChzICsgMSkgKiB0ICsgcykgKyAxXG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFja091dCIsInZhciBib3VuY2VPdXQgPSByZXF1aXJlKCcuL2JvdW5jZS1vdXQnKVxuXG5mdW5jdGlvbiBib3VuY2VJbk91dCh0KSB7XG4gIHJldHVybiB0IDwgMC41XG4gICAgPyAwLjUgKiAoMS4wIC0gYm91bmNlT3V0KDEuMCAtIHQgKiAyLjApKVxuICAgIDogMC41ICogYm91bmNlT3V0KHQgKiAyLjAgLSAxLjApICsgMC41XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYm91bmNlSW5PdXQiLCJ2YXIgYm91bmNlT3V0ID0gcmVxdWlyZSgnLi9ib3VuY2Utb3V0JylcblxuZnVuY3Rpb24gYm91bmNlSW4odCkge1xuICByZXR1cm4gMS4wIC0gYm91bmNlT3V0KDEuMCAtIHQpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gYm91bmNlSW4iLCJmdW5jdGlvbiBib3VuY2VPdXQodCkge1xuICB2YXIgYSA9IDQuMCAvIDExLjBcbiAgdmFyIGIgPSA4LjAgLyAxMS4wXG4gIHZhciBjID0gOS4wIC8gMTAuMFxuXG4gIHZhciBjYSA9IDQzNTYuMCAvIDM2MS4wXG4gIHZhciBjYiA9IDM1NDQyLjAgLyAxODA1LjBcbiAgdmFyIGNjID0gMTYwNjEuMCAvIDE4MDUuMFxuXG4gIHZhciB0MiA9IHQgKiB0XG5cbiAgcmV0dXJuIHQgPCBhXG4gICAgPyA3LjU2MjUgKiB0MlxuICAgIDogdCA8IGJcbiAgICAgID8gOS4wNzUgKiB0MiAtIDkuOSAqIHQgKyAzLjRcbiAgICAgIDogdCA8IGNcbiAgICAgICAgPyBjYSAqIHQyIC0gY2IgKiB0ICsgY2NcbiAgICAgICAgOiAxMC44ICogdCAqIHQgLSAyMC41MiAqIHQgKyAxMC43MlxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJvdW5jZU91dCIsImZ1bmN0aW9uIGNpcmNJbk91dCh0KSB7XG4gIGlmICgodCAqPSAyKSA8IDEpIHJldHVybiAtMC41ICogKE1hdGguc3FydCgxIC0gdCAqIHQpIC0gMSlcbiAgcmV0dXJuIDAuNSAqIChNYXRoLnNxcnQoMSAtICh0IC09IDIpICogdCkgKyAxKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNpcmNJbk91dCIsImZ1bmN0aW9uIGNpcmNJbih0KSB7XG4gIHJldHVybiAxLjAgLSBNYXRoLnNxcnQoMS4wIC0gdCAqIHQpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gY2lyY0luIiwiZnVuY3Rpb24gY2lyY091dCh0KSB7XG4gIHJldHVybiBNYXRoLnNxcnQoMSAtICggLS10ICogdCApKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNpcmNPdXQiLCJmdW5jdGlvbiBjdWJpY0luT3V0KHQpIHtcbiAgcmV0dXJuIHQgPCAwLjVcbiAgICA/IDQuMCAqIHQgKiB0ICogdFxuICAgIDogMC41ICogTWF0aC5wb3coMi4wICogdCAtIDIuMCwgMy4wKSArIDEuMFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGN1YmljSW5PdXQiLCJmdW5jdGlvbiBjdWJpY0luKHQpIHtcbiAgcmV0dXJuIHQgKiB0ICogdFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGN1YmljSW4iLCJmdW5jdGlvbiBjdWJpY091dCh0KSB7XG4gIHZhciBmID0gdCAtIDEuMFxuICByZXR1cm4gZiAqIGYgKiBmICsgMS4wXG59XG5cbm1vZHVsZS5leHBvcnRzID0gY3ViaWNPdXQiLCJmdW5jdGlvbiBlbGFzdGljSW5PdXQodCkge1xuICByZXR1cm4gdCA8IDAuNVxuICAgID8gMC41ICogTWF0aC5zaW4oKzEzLjAgKiBNYXRoLlBJLzIgKiAyLjAgKiB0KSAqIE1hdGgucG93KDIuMCwgMTAuMCAqICgyLjAgKiB0IC0gMS4wKSlcbiAgICA6IDAuNSAqIE1hdGguc2luKC0xMy4wICogTWF0aC5QSS8yICogKCgyLjAgKiB0IC0gMS4wKSArIDEuMCkpICogTWF0aC5wb3coMi4wLCAtMTAuMCAqICgyLjAgKiB0IC0gMS4wKSkgKyAxLjBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBlbGFzdGljSW5PdXQiLCJmdW5jdGlvbiBlbGFzdGljSW4odCkge1xuICByZXR1cm4gTWF0aC5zaW4oMTMuMCAqIHQgKiBNYXRoLlBJLzIpICogTWF0aC5wb3coMi4wLCAxMC4wICogKHQgLSAxLjApKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVsYXN0aWNJbiIsImZ1bmN0aW9uIGVsYXN0aWNPdXQodCkge1xuICByZXR1cm4gTWF0aC5zaW4oLTEzLjAgKiAodCArIDEuMCkgKiBNYXRoLlBJLzIpICogTWF0aC5wb3coMi4wLCAtMTAuMCAqIHQpICsgMS4wXG59XG5cbm1vZHVsZS5leHBvcnRzID0gZWxhc3RpY091dCIsImZ1bmN0aW9uIGV4cG9Jbk91dCh0KSB7XG4gIHJldHVybiAodCA9PT0gMC4wIHx8IHQgPT09IDEuMClcbiAgICA/IHRcbiAgICA6IHQgPCAwLjVcbiAgICAgID8gKzAuNSAqIE1hdGgucG93KDIuMCwgKDIwLjAgKiB0KSAtIDEwLjApXG4gICAgICA6IC0wLjUgKiBNYXRoLnBvdygyLjAsIDEwLjAgLSAodCAqIDIwLjApKSArIDEuMFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9Jbk91dCIsImZ1bmN0aW9uIGV4cG9Jbih0KSB7XG4gIHJldHVybiB0ID09PSAwLjAgPyB0IDogTWF0aC5wb3coMi4wLCAxMC4wICogKHQgLSAxLjApKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9JbiIsImZ1bmN0aW9uIGV4cG9PdXQodCkge1xuICByZXR1cm4gdCA9PT0gMS4wID8gdCA6IDEuMCAtIE1hdGgucG93KDIuMCwgLTEwLjAgKiB0KVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9PdXQiLCJtb2R1bGUuZXhwb3J0cyA9IHtcblx0J2JhY2tJbk91dCc6IHJlcXVpcmUoJy4vYmFjay1pbi1vdXQnKSxcblx0J2JhY2tJbic6IHJlcXVpcmUoJy4vYmFjay1pbicpLFxuXHQnYmFja091dCc6IHJlcXVpcmUoJy4vYmFjay1vdXQnKSxcblx0J2JvdW5jZUluT3V0JzogcmVxdWlyZSgnLi9ib3VuY2UtaW4tb3V0JyksXG5cdCdib3VuY2VJbic6IHJlcXVpcmUoJy4vYm91bmNlLWluJyksXG5cdCdib3VuY2VPdXQnOiByZXF1aXJlKCcuL2JvdW5jZS1vdXQnKSxcblx0J2NpcmNJbk91dCc6IHJlcXVpcmUoJy4vY2lyYy1pbi1vdXQnKSxcblx0J2NpcmNJbic6IHJlcXVpcmUoJy4vY2lyYy1pbicpLFxuXHQnY2lyY091dCc6IHJlcXVpcmUoJy4vY2lyYy1vdXQnKSxcblx0J2N1YmljSW5PdXQnOiByZXF1aXJlKCcuL2N1YmljLWluLW91dCcpLFxuXHQnY3ViaWNJbic6IHJlcXVpcmUoJy4vY3ViaWMtaW4nKSxcblx0J2N1YmljT3V0JzogcmVxdWlyZSgnLi9jdWJpYy1vdXQnKSxcblx0J2VsYXN0aWNJbk91dCc6IHJlcXVpcmUoJy4vZWxhc3RpYy1pbi1vdXQnKSxcblx0J2VsYXN0aWNJbic6IHJlcXVpcmUoJy4vZWxhc3RpYy1pbicpLFxuXHQnZWxhc3RpY091dCc6IHJlcXVpcmUoJy4vZWxhc3RpYy1vdXQnKSxcblx0J2V4cG9Jbk91dCc6IHJlcXVpcmUoJy4vZXhwby1pbi1vdXQnKSxcblx0J2V4cG9Jbic6IHJlcXVpcmUoJy4vZXhwby1pbicpLFxuXHQnZXhwb091dCc6IHJlcXVpcmUoJy4vZXhwby1vdXQnKSxcblx0J2xpbmVhcic6IHJlcXVpcmUoJy4vbGluZWFyJyksXG5cdCdxdWFkSW5PdXQnOiByZXF1aXJlKCcuL3F1YWQtaW4tb3V0JyksXG5cdCdxdWFkSW4nOiByZXF1aXJlKCcuL3F1YWQtaW4nKSxcblx0J3F1YWRPdXQnOiByZXF1aXJlKCcuL3F1YWQtb3V0JyksXG5cdCdxdWFydEluT3V0JzogcmVxdWlyZSgnLi9xdWFydC1pbi1vdXQnKSxcblx0J3F1YXJ0SW4nOiByZXF1aXJlKCcuL3F1YXJ0LWluJyksXG5cdCdxdWFydE91dCc6IHJlcXVpcmUoJy4vcXVhcnQtb3V0JyksXG5cdCdxdWludEluT3V0JzogcmVxdWlyZSgnLi9xdWludC1pbi1vdXQnKSxcblx0J3F1aW50SW4nOiByZXF1aXJlKCcuL3F1aW50LWluJyksXG5cdCdxdWludE91dCc6IHJlcXVpcmUoJy4vcXVpbnQtb3V0JyksXG5cdCdzaW5lSW5PdXQnOiByZXF1aXJlKCcuL3NpbmUtaW4tb3V0JyksXG5cdCdzaW5lSW4nOiByZXF1aXJlKCcuL3NpbmUtaW4nKSxcblx0J3NpbmVPdXQnOiByZXF1aXJlKCcuL3NpbmUtb3V0Jylcbn0iLCJmdW5jdGlvbiBsaW5lYXIodCkge1xuICByZXR1cm4gdFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGxpbmVhciIsImZ1bmN0aW9uIHF1YWRJbk91dCh0KSB7XG4gICAgdCAvPSAwLjVcbiAgICBpZiAodCA8IDEpIHJldHVybiAwLjUqdCp0XG4gICAgdC0tXG4gICAgcmV0dXJuIC0wLjUgKiAodCoodC0yKSAtIDEpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gcXVhZEluT3V0IiwiZnVuY3Rpb24gcXVhZEluKHQpIHtcbiAgcmV0dXJuIHQgKiB0XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcXVhZEluIiwiZnVuY3Rpb24gcXVhZE91dCh0KSB7XG4gIHJldHVybiAtdCAqICh0IC0gMi4wKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHF1YWRPdXQiLCJmdW5jdGlvbiBxdWFydGljSW5PdXQodCkge1xuICByZXR1cm4gdCA8IDAuNVxuICAgID8gKzguMCAqIE1hdGgucG93KHQsIDQuMClcbiAgICA6IC04LjAgKiBNYXRoLnBvdyh0IC0gMS4wLCA0LjApICsgMS4wXG59XG5cbm1vZHVsZS5leHBvcnRzID0gcXVhcnRpY0luT3V0IiwiZnVuY3Rpb24gcXVhcnRpY0luKHQpIHtcbiAgcmV0dXJuIE1hdGgucG93KHQsIDQuMClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBxdWFydGljSW4iLCJmdW5jdGlvbiBxdWFydGljT3V0KHQpIHtcbiAgcmV0dXJuIE1hdGgucG93KHQgLSAxLjAsIDMuMCkgKiAoMS4wIC0gdCkgKyAxLjBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBxdWFydGljT3V0IiwiZnVuY3Rpb24gcWludGljSW5PdXQodCkge1xuICAgIGlmICggKCB0ICo9IDIgKSA8IDEgKSByZXR1cm4gMC41ICogdCAqIHQgKiB0ICogdCAqIHRcbiAgICByZXR1cm4gMC41ICogKCAoIHQgLT0gMiApICogdCAqIHQgKiB0ICogdCArIDIgKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHFpbnRpY0luT3V0IiwiZnVuY3Rpb24gcWludGljSW4odCkge1xuICByZXR1cm4gdCAqIHQgKiB0ICogdCAqIHRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBxaW50aWNJbiIsImZ1bmN0aW9uIHFpbnRpY091dCh0KSB7XG4gIHJldHVybiAtLXQgKiB0ICogdCAqIHQgKiB0ICsgMVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHFpbnRpY091dCIsImZ1bmN0aW9uIHNpbmVJbk91dCh0KSB7XG4gIHJldHVybiAtMC41ICogKE1hdGguY29zKE1hdGguUEkqdCkgLSAxKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHNpbmVJbk91dCIsImZ1bmN0aW9uIHNpbmVJbiAodCkge1xuICB2YXIgdiA9IE1hdGguY29zKHQgKiBNYXRoLlBJICogMC41KVxuICBpZiAoTWF0aC5hYnModikgPCAxZS0xNCkgcmV0dXJuIDFcbiAgZWxzZSByZXR1cm4gMSAtIHZcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBzaW5lSW5cbiIsImZ1bmN0aW9uIHNpbmVPdXQodCkge1xuICByZXR1cm4gTWF0aC5zaW4odCAqIE1hdGguUEkvMilcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBzaW5lT3V0IiwidmFyIHh0ZW5kID0gcmVxdWlyZSgneHRlbmQnKVxuXG52YXIgZGVmYXVsdHMgPSB7XG5cdGVudW1lcmFibGU6IHRydWUsXG5cdGNvbmZpZ3VyYWJsZTogdHJ1ZVxufVxuXG5mdW5jdGlvbiBtaXgob2JqLCBlbnRyaWVzKSB7XG5cdGZvciAodmFyIGsgaW4gZW50cmllcykge1xuXHRcdGlmICghZW50cmllcy5oYXNPd25Qcm9wZXJ0eShrKSlcblx0XHRcdGNvbnRpbnVlXG5cdFx0dmFyIGYgPSBlbnRyaWVzW2tdXG5cdFx0aWYgKHR5cGVvZiBmID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRvYmpba10gPSBmXG5cdFx0fSBlbHNlIGlmIChmICYmIHR5cGVvZiBmID09PSAnb2JqZWN0Jykge1xuXHRcdFx0dmFyIGRlZiA9IHh0ZW5kKGRlZmF1bHRzLCBmKVxuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG9iaiwgaywgZGVmKTtcblx0XHR9XG5cdH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBtaXhlcyhjdG9yLCBlbnRyaWVzKSB7XG5cdG1peChjdG9yLnByb3RvdHlwZSwgZW50cmllcylcbn1cblxubW9kdWxlLmV4cG9ydHMubWl4ID0gbWl4IiwidmFyIGxpbmVhciA9IHJlcXVpcmUoJ2Vhc2VzL2xpbmVhcicpXG52YXIgY3JlYXRlVHdlZW4gPSByZXF1aXJlKCd0d2Vlbi1vYmplY3RzJylcbnZhciBCYXNlVHdlZW4gPSByZXF1aXJlKCd0d2Vlbi1iYXNlJylcblxuZnVuY3Rpb24gVHdlZW5UaWNrZXIgKG9wdCkge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgVHdlZW5UaWNrZXIpKSB7XG4gICAgcmV0dXJuIG5ldyBUd2VlblRpY2tlcihvcHQpXG4gIH1cbiAgb3B0ID0gb3B0IHx8IHt9XG4gIHRoaXMuc3RhY2sgPSBbXVxuICB0aGlzLmRlZmF1bHRFYXNlID0gb3B0LmRlZmF1bHRFYXNlIHx8IGxpbmVhclxuICB0aGlzLmVhc2VzID0gb3B0LmVhc2VzIHx8IHt9XG4gIHRoaXMuX2FwcGx5RWFzZSA9IHRoaXMuZWFzZS5iaW5kKHRoaXMpXG59XG5cblR3ZWVuVGlja2VyLnByb3RvdHlwZS5jYW5jZWwgPSBmdW5jdGlvbiAoKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5zdGFjay5sZW5ndGg7IGkrKykge1xuICAgIHZhciB0ID0gdGhpcy5zdGFja1tpXVxuICAgIC8vIGNhbmNlbCBlYWNoIGFuZCBmb3JjZSBpdCB0byBjb21wbGV0ZVxuICAgIHQuY2FuY2VsKClcbiAgICB0LnRpY2soMClcbiAgfVxuICB0aGlzLnN0YWNrLmxlbmd0aCA9IDBcbiAgcmV0dXJuIHRoaXNcbn1cblxuLy8gbm8gbG9uZ2VyIHVzZWQsIGJhY2t3YXJkLWNvbXBhdGlibGVcblR3ZWVuVGlja2VyLnByb3RvdHlwZS5jbGVhciA9IFR3ZWVuVGlja2VyLnByb3RvdHlwZS5jYW5jZWxcblxuVHdlZW5UaWNrZXIucHJvdG90eXBlLnRvID0gZnVuY3Rpb24gKGVsZW1lbnQsIG9wdCkge1xuICB2YXIgdHdlZW4gPSBlbGVtZW50XG4gIGlmIChvcHQgJiYgdHlwZW9mIG9wdCA9PT0gJ29iamVjdCcpIHtcbiAgICB0d2VlbiA9IGNyZWF0ZVR3ZWVuKGVsZW1lbnQsIG9wdClcbiAgfSBlbHNlIGlmICghZWxlbWVudCAmJiAhb3B0KSB7XG4gICAgdHdlZW4gPSBuZXcgQmFzZVR3ZWVuKClcbiAgfSBlbHNlIGlmICghaXNUd2Vlbih0d2VlbikpIHsgLy8gdG8gYXZvaWQgcHJvZ3JhbW1lciBlcnJvclxuICAgIHRocm93IG5ldyBFcnJvcignbXVzdCBwcm92aWRlIG9wdGlvbnMgb3IgYSB0d2VlbiBvYmplY3QnKVxuICB9XG4gIHJldHVybiB0aGlzLnB1c2godHdlZW4pXG59XG5cblR3ZWVuVGlja2VyLnByb3RvdHlwZS5wdXNoID0gZnVuY3Rpb24gKHR3ZWVuKSB7XG4gIHRoaXMuc3RhY2sucHVzaCh0d2VlbilcbiAgcmV0dXJuIHR3ZWVuXG59XG5cblR3ZWVuVGlja2VyLnByb3RvdHlwZS50aWNrID0gZnVuY3Rpb24gKGR0LCBlYXNlKSB7XG4gIGVhc2UgPSB0eXBlb2YgZWFzZSA9PT0gJ2Z1bmN0aW9uJyA/IGVhc2UgOiB0aGlzLl9hcHBseUVhc2VcbiAgZHQgPSB0eXBlb2YgZHQgPT09ICdudW1iZXInID8gZHQgOiAxIC8gNjBcblxuICAvLyBmb3IgYWxsIHF1ZXVlZCB0d2VlbnMsIHRpY2sgdGhlbSBmb3J3YXJkIChpLmUuIERPTSByZWFkKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuc3RhY2subGVuZ3RoOyBpKyspIHtcbiAgICB0aGlzLnN0YWNrW2ldLnRpY2soZHQsIGVhc2UpXG4gIH1cblxuICAvLyBub3cgc3luYyB0aGVpciBzdGF0ZXMgKGkuZS4gRE9NIHdyaXRlKVxuICBzeW5jKHRoaXMuc3RhY2spXG5cbiAgLy8gbm93IGtpbGwgYW55IGluYWN0aXZlIHR3ZWVuc1xuICBmb3IgKGkgPSB0aGlzLnN0YWNrLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgaWYgKCF0aGlzLnN0YWNrW2ldLmFjdGl2ZSkge1xuICAgICAgdGhpcy5zdGFjay5zcGxpY2UoaSwgMSlcbiAgICB9XG4gIH1cbn1cblxuLy8gZGV0ZXJtaW5lcyB3aGljaCBlYXNpbmcgZnVuY3Rpb24gdG8gdXNlIGJhc2VkIG9uIHVzZXIgb3B0aW9uc1xuVHdlZW5UaWNrZXIucHJvdG90eXBlLmVhc2UgPSBmdW5jdGlvbiAodHdlZW4sIGFscGhhKSB7XG4gIHZhciBlYXNlID0gdHdlZW4uZWFzZSB8fCB0aGlzLmRlZmF1bHRFYXNlXG4gIGlmICh0eXBlb2YgZWFzZSA9PT0gJ3N0cmluZycpIHtcbiAgICBlYXNlID0gdGhpcy5lYXNlc1tlYXNlXVxuICB9XG4gIGlmICh0eXBlb2YgZWFzZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIGVhc2UgPSBsaW5lYXJcbiAgfVxuICByZXR1cm4gZWFzZShhbHBoYSlcbn1cblxuLy8gbWFpbmx5IGludGVuZGVkIGFzIGEgc2FmZWd1YXJkIGFnYWluc3QgcG90ZW50aWFsIHVzZXIgZXJyb3JcbmZ1bmN0aW9uIGlzVHdlZW4gKHR3ZWVuKSB7XG4gIHJldHVybiAodHlwZW9mIHR3ZWVuLnRpY2sgPT09ICdmdW5jdGlvbicgJiZcbiAgdHlwZW9mIHR3ZWVuLmNhbmNlbCA9PT0gJ2Z1bmN0aW9uJylcbn1cblxuZnVuY3Rpb24gc3luYyAodHdlZW5zKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdHdlZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHR3ZWVuID0gdHdlZW5zW2ldXG4gICAgaWYgKHR5cGVvZiB0d2Vlbi5zeW5jID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0d2Vlbi5zeW5jKClcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBUd2VlblRpY2tlclxuIiwidmFyIHN0ciA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdcblxubW9kdWxlLmV4cG9ydHMgPSBhbkFycmF5XG5cbmZ1bmN0aW9uIGFuQXJyYXkoYXJyKSB7XG4gIHJldHVybiAoXG4gICAgICAgYXJyLkJZVEVTX1BFUl9FTEVNRU5UXG4gICAgJiYgc3RyLmNhbGwoYXJyLmJ1ZmZlcikgPT09ICdbb2JqZWN0IEFycmF5QnVmZmVyXSdcbiAgICB8fCBBcnJheS5pc0FycmF5KGFycilcbiAgKVxufVxuIiwidmFyIGxlcnAgPSByZXF1aXJlKCdsZXJwJylcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBsZXJwVmFsdWVzKHZhbHVlMSwgdmFsdWUyLCB0LCBvdXQpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlMSA9PT0gJ251bWJlcidcbiAgICAgICAgICAgICYmIHR5cGVvZiB2YWx1ZTIgPT09ICdudW1iZXInKVxuICAgICAgICByZXR1cm4gbGVycCh2YWx1ZTEsIHZhbHVlMiwgdClcbiAgICBlbHNlIHsgLy9hc3N1bWUgYXJyYXlcbiAgICAgICAgdmFyIGxlbiA9IE1hdGgubWluKHZhbHVlMS5sZW5ndGgsIHZhbHVlMi5sZW5ndGgpXG4gICAgICAgIG91dCA9IG91dHx8bmV3IEFycmF5KGxlbilcbiAgICAgICAgZm9yICh2YXIgaT0wOyBpPGxlbjsgaSsrKSBcbiAgICAgICAgICAgIG91dFtpXSA9IGxlcnAodmFsdWUxW2ldLCB2YWx1ZTJbaV0sIHQpXG4gICAgICAgIHJldHVybiBvdXRcbiAgICB9XG59IiwiZnVuY3Rpb24gbGVycCh2MCwgdjEsIHQpIHtcbiAgICByZXR1cm4gdjAqKDEtdCkrdjEqdFxufVxubW9kdWxlLmV4cG9ydHMgPSBsZXJwIiwidmFyIG5vb3AgPSBmdW5jdGlvbigpe31cbnZhciBsaW5lYXIgPSByZXF1aXJlKCdlYXNlcy9saW5lYXInKVxudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxudmFyIGluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKVxuXG5mdW5jdGlvbiBCYXNlVHdlZW4ob3B0KSB7XG4gICAgRXZlbnRFbWl0dGVyLmNhbGwodGhpcylcblxuICAgIC8vdXNlcnMgZ2VuZXJhbGx5IGRvbid0IG5lZWQgdG8gY2hhbmdlIHRoZXNlXG4gICAgdGhpcy5kdXJhdGlvbiA9IChvcHQgJiYgb3B0LmR1cmF0aW9uKXx8MFxuICAgIHRoaXMuZGVsYXkgPSAob3B0ICYmIG9wdC5kZWxheSl8fDBcbiAgICB0aGlzLnRpbWUgPSAwXG4gICAgdGhpcy5lYXNlID0gb3B0ICYmIG9wdC5lYXNlXG4gICAgdGhpcy5hY3RpdmUgPSB0cnVlXG4gICAgdGhpcy5lbmFibGVkID0gdHJ1ZVxuICAgIHRoaXMuY2FuY2VsbGluZyA9IGZhbHNlXG4gICAgdGhpcy5fc3RhcnRlZCA9IGZhbHNlXG59XG5cbmluaGVyaXRzKEJhc2VUd2VlbiwgRXZlbnRFbWl0dGVyKVxuXG5CYXNlVHdlZW4ucHJvdG90eXBlLmxlcnAgPSBub29wXG5CYXNlVHdlZW4ucHJvdG90eXBlLnJlYWR5ID0gbm9vcFxuXG5CYXNlVHdlZW4ucHJvdG90eXBlLmNhbmNlbCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuY2FuY2VsbGluZyA9IHRydWVcbiAgICByZXR1cm4gdGhpc1xufVxuXG5CYXNlVHdlZW4ucHJvdG90eXBlLnRpY2sgPSBmdW5jdGlvbihkdCwgZWFzZSkge1xuICAgIGVhc2UgPSB0eXBlb2YgZWFzZSA9PT0gJ2Z1bmN0aW9uJyA/IGVhc2UgOiBkZWZhdWx0RWFzZVxuXG4gICAgaWYgKHRoaXMuY2FuY2VsbGluZyAmJiB0aGlzLmFjdGl2ZSkge1xuICAgICAgICB0aGlzLmFjdGl2ZSA9IGZhbHNlXG4gICAgICAgIHRoaXMuZW1pdCgnY2FuY2VsbGluZycsIHRoaXMpXG4gICAgICAgIHRoaXMuZW1pdCgnY29tcGxldGUnLCB0aGlzKVxuICAgIH1cblxuICAgIGlmICghdGhpcy5hY3RpdmUgfHwgIXRoaXMuZW5hYmxlZClcbiAgICAgICAgcmV0dXJuXG5cbiAgICB2YXIgbGFzdCA9IHRoaXMudGltZVxuICAgIHRoaXMudGltZSArPSBkdFxuICAgICAgICAgICAgXG4gICAgdmFyIGFscGhhID0gKHRoaXMudGltZS10aGlzLmRlbGF5KSAvIHRoaXMuZHVyYXRpb25cbiAgICBpZiAodGhpcy50aW1lLXRoaXMuZGVsYXkgPiAwKSB7XG4gICAgICAgIGlmICghdGhpcy5fc3RhcnRlZCkge1xuICAgICAgICAgICAgdGhpcy5fc3RhcnRlZCA9IHRydWVcbiAgICAgICAgICAgIHRoaXMucmVhZHkoKVxuICAgICAgICAgICAgdGhpcy5lbWl0KCdzdGFydCcsIHRoaXMpXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYWxwaGEgPCAwKVxuICAgICAgICAgICAgYWxwaGEgPSAwXG4gICAgICAgIGVsc2UgaWYgKGFscGhhID4gMSlcbiAgICAgICAgICAgIGFscGhhID0gMVxuICAgICAgICBhbHBoYSA9IGVhc2UodGhpcywgYWxwaGEpXG4gICAgICAgIHRoaXMubGVycChhbHBoYSlcbiAgICAgICAgdGhpcy5lbWl0KCd1cGRhdGUnLCB0aGlzKVxuICAgIH1cblxuICAgIGlmICh0aGlzLnRpbWUgPj0gKHRoaXMuZHVyYXRpb24rdGhpcy5kZWxheSkpIHtcbiAgICAgICAgdGhpcy5hY3RpdmUgPSBmYWxzZVxuICAgICAgICB0aGlzLmVtaXQoJ2NvbXBsZXRlJywgdGhpcylcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRlZmF1bHRFYXNlKHR3ZWVuLCBhbHBoYSkge1xuICAgIGlmICh0eXBlb2YgdHdlZW4uZWFzZSA9PT0gJ2Z1bmN0aW9uJylcbiAgICAgICAgcmV0dXJuIHR3ZWVuLmVhc2UoYWxwaGEpXG4gICAgcmV0dXJuIGxpbmVhcihhbHBoYSlcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBCYXNlVHdlZW4iLCJ2YXIgT2JqZWN0VHdlZW4gPSByZXF1aXJlKCcuL2xpYi9vYmplY3QnKVxudmFyIEdyb3VwVHdlZW4gPSByZXF1aXJlKCcuL2xpYi9ncm91cCcpXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oZWxlbWVudCwgb3B0KSB7XG4gICAgdmFyIHR3ZWVuID0gQXJyYXkuaXNBcnJheShlbGVtZW50KSBcbiAgICAgICAgICAgID8gbmV3IEdyb3VwVHdlZW4oZWxlbWVudCwgb3B0KVxuICAgICAgICAgICAgOiBuZXcgT2JqZWN0VHdlZW4oZWxlbWVudCwgb3B0KVxuICAgIHJldHVybiB0d2VlblxufSIsInZhciBCYXNlVHdlZW4gPSByZXF1aXJlKCd0d2Vlbi1iYXNlJylcbnZhciBpc0FycmF5ID0gcmVxdWlyZSgnYW4tYXJyYXknKVxudmFyIG93bktleXMgPSByZXF1aXJlKCdvd24tZW51bWVyYWJsZS1rZXlzJylcbnZhciBpZ25vcmVzID0gb3duS2V5cyhuZXcgQmFzZVR3ZWVuKCkpXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZ2V0VGFyZ2V0cyhlbGVtZW50LCBvcHQpIHtcbiAgICB2YXIgdGFyZ2V0cyA9IFtdXG4gICAgdmFyIG9wdEtleXMgPSBvd25LZXlzKG9wdClcblxuICAgIGZvciAodmFyIGsgaW4gb3B0KSB7IFxuICAgICAgICAvL2NvcHkgcHJvcGVydGllcyBhcyBuZWVkZWRcbiAgICAgICAgaWYgKG9wdEtleXMuaW5kZXhPZihrKSA+PSAwICYmXG4gICAgICAgICAgICAgICAgayBpbiBlbGVtZW50ICYmXG4gICAgICAgICAgICAgICAgaWdub3Jlcy5pbmRleE9mKGspID09PSAtMSkge1xuICAgICAgICAgICAgdmFyIHN0YXJ0VmFsID0gZWxlbWVudFtrXVxuICAgICAgICAgICAgdmFyIGVuZFZhbCA9IG9wdFtrXVxuICAgICAgICAgICAgaWYgKHR5cGVvZiBzdGFydFZhbCA9PT0gJ251bWJlcidcbiAgICAgICAgICAgICAgICAgJiYgdHlwZW9mIGVuZFZhbCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICB0YXJnZXRzLnB1c2goeyBcbiAgICAgICAgICAgICAgICAgICAga2V5OiBrLCBcbiAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IHN0YXJ0VmFsLCBcbiAgICAgICAgICAgICAgICAgICAgZW5kOiBlbmRWYWwgXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGlzQXJyYXkoc3RhcnRWYWwpICYmIGlzQXJyYXkoZW5kVmFsKSkge1xuICAgICAgICAgICAgICAgIHRhcmdldHMucHVzaCh7IFxuICAgICAgICAgICAgICAgICAgICBrZXk6IGssIFxuICAgICAgICAgICAgICAgICAgICBzdGFydDogc3RhcnRWYWwuc2xpY2UoKSwgXG4gICAgICAgICAgICAgICAgICAgIGVuZDogZW5kVmFsLnNsaWNlKCkgXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGFyZ2V0c1xufSIsInZhciBpbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJylcbnZhciBsZXJwID0gcmVxdWlyZSgnbGVycC1hcnJheScpXG52YXIgQmFzZVR3ZWVuID0gcmVxdWlyZSgndHdlZW4tYmFzZScpXG52YXIgZW5kVGFyZ2V0ID0gcmVxdWlyZSgnLi9lbmQtdGFyZ2V0JylcblxuZnVuY3Rpb24gR3JvdXBUd2Vlbih0YXJnZXQsIG9wdCkge1xuICAgIEJhc2VUd2Vlbi5jYWxsKHRoaXMsIG9wdClcbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldFxuICAgIHRoaXMuZW5kID0gW11cbiAgICB0aGlzLl9vcHRpb25zID0gb3B0XG59XG5cbmluaGVyaXRzKEdyb3VwVHdlZW4sIEJhc2VUd2VlbilcblxuR3JvdXBUd2Vlbi5wcm90b3R5cGUucmVhZHkgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmVuZCA9IHRoaXMudGFyZ2V0Lm1hcChmdW5jdGlvbih0KSB7XG4gICAgICAgIHJldHVybiBlbmRUYXJnZXQodCwgdGhpcy5fb3B0aW9ucylcbiAgICB9LCB0aGlzKVxufVxuXG5Hcm91cFR3ZWVuLnByb3RvdHlwZS5sZXJwID0gZnVuY3Rpb24oYWxwaGEpIHtcbiAgICBmb3IgKHZhciBqPTA7IGo8dGhpcy5lbmQubGVuZ3RoOyBqKyspICB7XG4gICAgICAgIHZhciBlbmRpbmdzID0gdGhpcy5lbmRbal1cbiAgICAgICAgdmFyIHRhcmdldCA9IHRoaXMudGFyZ2V0W2pdXG4gICAgICAgIGZvciAodmFyIGk9MDsgaTxlbmRpbmdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgdCA9IGVuZGluZ3NbaV1cbiAgICAgICAgICAgIHZhciBrID0gdC5rZXlcbiAgICAgICAgICAgIHRhcmdldFtrXSA9IGxlcnAodC5zdGFydCwgdC5lbmQsIGFscGhhLCB0YXJnZXRba10pICAgIFxuICAgICAgICB9XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEdyb3VwVHdlZW4iLCJ2YXIgaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpXG52YXIgbGVycCA9IHJlcXVpcmUoJ2xlcnAtYXJyYXknKVxudmFyIEJhc2VUd2VlbiA9IHJlcXVpcmUoJ3R3ZWVuLWJhc2UnKVxudmFyIGVuZFRhcmdldCA9IHJlcXVpcmUoJy4vZW5kLXRhcmdldCcpXG5cbmZ1bmN0aW9uIE9iamVjdFR3ZWVuKHRhcmdldCwgb3B0KSB7XG4gICAgQmFzZVR3ZWVuLmNhbGwodGhpcywgb3B0KVxuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0XG4gICAgdGhpcy5lbmRpbmdzID0gdW5kZWZpbmVkXG4gICAgdGhpcy5fb3B0aW9ucyA9IG9wdFxufVxuXG5pbmhlcml0cyhPYmplY3RUd2VlbiwgQmFzZVR3ZWVuKVxuXG5PYmplY3RUd2Vlbi5wcm90b3R5cGUucmVhZHkgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmVuZGluZ3MgPSBlbmRUYXJnZXQodGhpcy50YXJnZXQsIHRoaXMuX29wdGlvbnMpXG59XG5cbk9iamVjdFR3ZWVuLnByb3RvdHlwZS5sZXJwID0gZnVuY3Rpb24oYWxwaGEpIHtcbiAgICBmb3IgKHZhciBpPTA7IGk8dGhpcy5lbmRpbmdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciB0ID0gdGhpcy5lbmRpbmdzW2ldXG4gICAgICAgIHZhciBrID0gdC5rZXlcbiAgICAgICAgdGhpcy50YXJnZXRba10gPSBsZXJwKHQuc3RhcnQsIHQuZW5kLCBhbHBoYSwgdGhpcy50YXJnZXRba10pXG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IE9iamVjdFR3ZWVuIiwidmFyIHByb3BJc0VudW1lcmFibGUgPSBPYmplY3QucHJvdG90eXBlLnByb3BlcnR5SXNFbnVtZXJhYmxlXG5cbm1vZHVsZS5leHBvcnRzID0gb3duRW51bWVyYWJsZUtleXNcbmZ1bmN0aW9uIG93bkVudW1lcmFibGVLZXlzIChvYmopIHtcbiAgdmFyIGtleXMgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhvYmopXG5cbiAgaWYgKE9iamVjdC5nZXRPd25Qcm9wZXJ0eVN5bWJvbHMpIHtcbiAgICBrZXlzID0ga2V5cy5jb25jYXQoT2JqZWN0LmdldE93blByb3BlcnR5U3ltYm9scyhvYmopKVxuICB9XG5cbiAgcmV0dXJuIGtleXMuZmlsdGVyKGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gcHJvcElzRW51bWVyYWJsZS5jYWxsKG9iaiwga2V5KVxuICB9KVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBleHRlbmRcblxudmFyIGhhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuZnVuY3Rpb24gZXh0ZW5kKCkge1xuICAgIHZhciB0YXJnZXQgPSB7fVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IGFyZ3VtZW50c1tpXVxuXG4gICAgICAgIGZvciAodmFyIGtleSBpbiBzb3VyY2UpIHtcbiAgICAgICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKHNvdXJjZSwga2V5KSkge1xuICAgICAgICAgICAgICAgIHRhcmdldFtrZXldID0gc291cmNlW2tleV1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0YXJnZXRcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcmFuZ2UobWluLCBtYXgsIHZhbHVlKSB7XG4gIHJldHVybiAodmFsdWUgLSBtaW4pIC8gKG1heCAtIG1pbilcbn0iLCJ2YXIgYnVmZmVyID0gcmVxdWlyZSgnLi9saWIvYnVmZmVyLXNvdXJjZScpXG52YXIgbWVkaWEgPSByZXF1aXJlKCcuL2xpYi9tZWRpYS1zb3VyY2UnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IHdlYkF1ZGlvUGxheWVyXG5mdW5jdGlvbiB3ZWJBdWRpb1BsYXllciAoc3JjLCBvcHQpIHtcbiAgaWYgKCFzcmMpIHRocm93IG5ldyBUeXBlRXJyb3IoJ211c3Qgc3BlY2lmeSBhIHNyYyBwYXJhbWV0ZXInKVxuICBvcHQgPSBvcHQgfHwge31cbiAgaWYgKG9wdC5idWZmZXIpIHJldHVybiBidWZmZXIoc3JjLCBvcHQpXG4gIGVsc2UgcmV0dXJuIG1lZGlhKHNyYywgb3B0KVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVBdWRpb0NvbnRleHRcbmZ1bmN0aW9uIGNyZWF0ZUF1ZGlvQ29udGV4dCAoKSB7XG4gIHZhciBBdWRpb0N0b3IgPSB3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHRcbiAgcmV0dXJuIG5ldyBBdWRpb0N0b3IoKVxufVxuIiwidmFyIGNhblBsYXlTcmMgPSByZXF1aXJlKCcuL2Nhbi1wbGF5LXNyYycpXG52YXIgY3JlYXRlQXVkaW9Db250ZXh0ID0gcmVxdWlyZSgnLi9hdWRpby1jb250ZXh0JylcbnZhciB4aHJBdWRpbyA9IHJlcXVpcmUoJy4veGhyLWF1ZGlvJylcbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcbnZhciByaWdodE5vdyA9IHJlcXVpcmUoJ3JpZ2h0LW5vdycpXG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlQnVmZmVyU291cmNlXG5mdW5jdGlvbiBjcmVhdGVCdWZmZXJTb3VyY2UgKHNyYywgb3B0KSB7XG4gIG9wdCA9IG9wdCB8fCB7fVxuICB2YXIgZW1pdHRlciA9IG5ldyBFdmVudEVtaXR0ZXIoKVxuICB2YXIgYXVkaW9Db250ZXh0ID0gb3B0LmNvbnRleHQgfHwgY3JlYXRlQXVkaW9Db250ZXh0KClcblxuICAvLyBhIHBhc3MtdGhyb3VnaCBub2RlIHNvIHVzZXIganVzdCBuZWVkcyB0b1xuICAvLyBjb25uZWN0KCkgb25jZVxuICB2YXIgYnVmZmVyTm9kZSwgYnVmZmVyLCBkdXJhdGlvblxuICB2YXIgbm9kZSA9IGF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKClcbiAgdmFyIGF1ZGlvU3RhcnRUaW1lID0gbnVsbFxuICB2YXIgYXVkaW9QYXVzZVRpbWUgPSBudWxsXG4gIHZhciBhdWRpb0N1cnJlbnRUaW1lID0gMFxuICB2YXIgcGxheWluZyA9IGZhbHNlXG4gIHZhciBsb29wID0gb3B0Lmxvb3BcblxuICBlbWl0dGVyLnBsYXkgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHBsYXlpbmcpIHJldHVyblxuICAgIHBsYXlpbmcgPSB0cnVlXG5cbiAgICBidWZmZXJOb2RlID0gYXVkaW9Db250ZXh0LmNyZWF0ZUJ1ZmZlclNvdXJjZSgpXG4gICAgYnVmZmVyTm9kZS5jb25uZWN0KGVtaXR0ZXIubm9kZSlcbiAgICBidWZmZXJOb2RlLm9uZW5kZWQgPSBlbmRlZFxuICAgIGlmIChidWZmZXIpIHtcbiAgICAgIC8vIE1pZ2h0IGJlIG51bGwgdW5kZWZpbmVkIGlmIHdlIGFyZSBzdGlsbCBsb2FkaW5nXG4gICAgICBidWZmZXJOb2RlLmJ1ZmZlciA9IGJ1ZmZlclxuICAgIH1cbiAgICBpZiAobG9vcCkge1xuICAgICAgYnVmZmVyTm9kZS5sb29wID0gdHJ1ZVxuICAgIH1cblxuICAgIGlmIChkdXJhdGlvbiAmJiBhdWRpb0N1cnJlbnRUaW1lID4gZHVyYXRpb24pIHtcbiAgICAgIC8vIGZvciB3aGVuIGl0IGxvb3BzLi4uXG4gICAgICBhdWRpb0N1cnJlbnRUaW1lID0gYXVkaW9DdXJyZW50VGltZSAlIGR1cmF0aW9uXG4gICAgfVxuICAgIHZhciBuZXh0VGltZSA9IGF1ZGlvQ3VycmVudFRpbWVcblxuICAgIGJ1ZmZlck5vZGUuc3RhcnQoMCwgbmV4dFRpbWUpXG4gICAgYXVkaW9TdGFydFRpbWUgPSByaWdodE5vdygpXG4gIH1cblxuICBlbWl0dGVyLnBhdXNlID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICghcGxheWluZykgcmV0dXJuXG4gICAgcGxheWluZyA9IGZhbHNlXG4gICAgLy8gRG9uJ3QgbGV0IHRoZSBcImVuZFwiIGV2ZW50XG4gICAgLy8gZ2V0IHRyaWdnZXJlZCBvbiBtYW51YWwgcGF1c2UuXG4gICAgYnVmZmVyTm9kZS5vbmVuZGVkID0gbnVsbFxuICAgIGJ1ZmZlck5vZGUuc3RvcCgwKVxuICAgIGF1ZGlvUGF1c2VUaW1lID0gcmlnaHROb3coKVxuICAgIGF1ZGlvQ3VycmVudFRpbWUgKz0gKGF1ZGlvUGF1c2VUaW1lIC0gYXVkaW9TdGFydFRpbWUpIC8gMTAwMFxuICB9XG5cbiAgZW1pdHRlci5zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgIGVtaXR0ZXIucGF1c2UoKVxuICAgIGVuZGVkKClcbiAgfVxuXG4gIGVtaXR0ZXIuZGlzcG9zZSA9IGZ1bmN0aW9uICgpIHtcbiAgICBidWZmZXIgPSBudWxsXG4gIH1cblxuICBlbWl0dGVyLm5vZGUgPSBub2RlXG4gIGVtaXR0ZXIuY29udGV4dCA9IGF1ZGlvQ29udGV4dFxuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKGVtaXR0ZXIsIHtcbiAgICBkdXJhdGlvbjoge1xuICAgICAgZW51bWVyYWJsZTogdHJ1ZSwgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBkdXJhdGlvblxuICAgICAgfVxuICAgIH0sXG4gICAgcGxheWluZzoge1xuICAgICAgZW51bWVyYWJsZTogdHJ1ZSwgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBwbGF5aW5nXG4gICAgICB9XG4gICAgfSxcbiAgICBidWZmZXI6IHtcbiAgICAgIGVudW1lcmFibGU6IHRydWUsIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gYnVmZmVyXG4gICAgICB9XG4gICAgfSxcbiAgICB2b2x1bWU6IHtcbiAgICAgIGVudW1lcmFibGU6IHRydWUsIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbm9kZS5nYWluLnZhbHVlXG4gICAgICB9LFxuICAgICAgc2V0OiBmdW5jdGlvbiAobikge1xuICAgICAgICBub2RlLmdhaW4udmFsdWUgPSBuXG4gICAgICB9XG4gICAgfVxuICB9KVxuXG4gIC8vIHNldCBpbml0aWFsIHZvbHVtZVxuICBpZiAodHlwZW9mIG9wdC52b2x1bWUgPT09ICdudW1iZXInKSB7XG4gICAgZW1pdHRlci52b2x1bWUgPSBvcHQudm9sdW1lXG4gIH1cblxuICAvLyBmaWx0ZXIgZG93biB0byBhIGxpc3Qgb2YgcGxheWFibGUgc291cmNlc1xuICB2YXIgc291cmNlcyA9IEFycmF5LmlzQXJyYXkoc3JjKSA/IHNyYyA6IFsgc3JjIF1cbiAgc291cmNlcyA9IHNvdXJjZXMuZmlsdGVyKEJvb2xlYW4pXG4gIHZhciBwbGF5YWJsZSA9IHNvdXJjZXMuc29tZShjYW5QbGF5U3JjKVxuICBpZiAocGxheWFibGUpIHtcbiAgICB2YXIgc291cmNlID0gc291cmNlcy5maWx0ZXIoY2FuUGxheVNyYylbMF1cbiAgICAvLyBTdXBwb3J0IHRoZSBzYW1lIHNvdXJjZSB0eXBlcyBhcyBpblxuICAgIC8vIE1lZGlhRWxlbWVudCBtb2RlLi4uXG4gICAgaWYgKHR5cGVvZiBzb3VyY2UuZ2V0QXR0cmlidXRlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBzb3VyY2UgPSBzb3VyY2UuZ2V0QXR0cmlidWV0KCdzcmMnKVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIHNvdXJjZS5zcmMgPT09ICdzdHJpbmcnKSB7XG4gICAgICBzb3VyY2UgPSBzb3VyY2Uuc3JjXG4gICAgfVxuICAgIC8vIFdlIGhhdmUgYXQgbGVhc3Qgb25lIHBsYXlhYmxlIHNvdXJjZS5cbiAgICAvLyBGb3Igbm93IGp1c3QgcGxheSB0aGUgZmlyc3QsXG4gICAgLy8gaWRlYWxseSB0aGlzIG1vZHVsZSBjb3VsZCBhdHRlbXB0IGVhY2ggb25lLlxuICAgIHN0YXJ0TG9hZChzb3VyY2UpXG4gIH0gZWxzZSB7XG4gICAgLy8gbm8gc291cmNlcyBjYW4gYmUgcGxheWVkLi4uXG4gICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICBlbWl0dGVyLmVtaXQoJ2Vycm9yJywgY2FuUGxheVNyYy5jcmVhdGVFcnJvcihzb3VyY2VzKSlcbiAgICB9KVxuICB9XG4gIHJldHVybiBlbWl0dGVyXG5cbiAgZnVuY3Rpb24gc3RhcnRMb2FkIChzcmMpIHtcbiAgICB4aHJBdWRpbyhhdWRpb0NvbnRleHQsIHNyYywgZnVuY3Rpb24gYXVkaW9EZWNvZGVkIChlcnIsIGRlY29kZWQpIHtcbiAgICAgIGlmIChlcnIpIHJldHVybiBlbWl0dGVyLmVtaXQoJ2Vycm9yJywgZXJyKVxuICAgICAgYnVmZmVyID0gZGVjb2RlZCAvLyBzdG9yZSBmb3IgbGF0ZXIgdXNlXG4gICAgICBpZiAoYnVmZmVyTm9kZSkge1xuICAgICAgICAvLyBpZiBwbGF5KCkgd2FzIGNhbGxlZCBlYXJseVxuICAgICAgICBidWZmZXJOb2RlLmJ1ZmZlciA9IGJ1ZmZlclxuICAgICAgfVxuICAgICAgZHVyYXRpb24gPSBidWZmZXIuZHVyYXRpb25cbiAgICAgIG5vZGUuYnVmZmVyID0gYnVmZmVyXG4gICAgICBlbWl0dGVyLmVtaXQoJ2xvYWQnKVxuICAgIH0sIGZ1bmN0aW9uIGF1ZGlvUHJvZ3Jlc3MgKGFtb3VudCwgdG90YWwpIHtcbiAgICAgIGVtaXR0ZXIuZW1pdCgncHJvZ3Jlc3MnLCBhbW91bnQsIHRvdGFsKVxuICAgIH0sIGZ1bmN0aW9uIGF1ZGlvRGVjb2RpbmcgKCkge1xuICAgICAgZW1pdHRlci5lbWl0KCdkZWNvZGluZycpXG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGVuZGVkICgpIHtcbiAgICBlbWl0dGVyLmVtaXQoJ2VuZCcpXG4gICAgcGxheWluZyA9IGZhbHNlXG4gICAgYXVkaW9DdXJyZW50VGltZSA9IDBcbiAgfVxufVxuIiwidmFyIGxvb2t1cCA9IHJlcXVpcmUoJ2Jyb3dzZXItbWVkaWEtbWltZS10eXBlJylcbnZhciBhdWRpb1xuXG5tb2R1bGUuZXhwb3J0cyA9IGlzU3JjUGxheWFibGVcbmZ1bmN0aW9uIGlzU3JjUGxheWFibGUgKHNyYykge1xuICBpZiAoIXNyYykgdGhyb3cgbmV3IFR5cGVFcnJvcignc3JjIGNhbm5vdCBiZSBlbXB0eScpXG4gIHZhciB0eXBlXG4gIGlmICh0eXBlb2Ygc3JjLmdldEF0dHJpYnV0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIC8vIDxzb3VyY2U+IGVsZW1lbnRcbiAgICB0eXBlID0gc3JjLmdldEF0dHJpYnV0ZSgndHlwZScpXG4gIH0gZWxzZSBpZiAodHlwZW9mIHNyYyA9PT0gJ3N0cmluZycpIHtcbiAgICAvLyAnZm9vLm1wMycgc3RyaW5nXG4gICAgdmFyIGV4dCA9IGV4dGVuc2lvbihzcmMpXG4gICAgaWYgKGV4dCkgdHlwZSA9IGxvb2t1cChleHQpXG4gIH0gZWxzZSB7XG4gICAgLy8geyBzcmM6ICdmb28ubXAzJywgdHlwZTogJ2F1ZGlvL21wZWc7IGNvZGVjcy4uJ31cbiAgICB0eXBlID0gc3JjLnR5cGVcbiAgfVxuXG4gIC8vIFdlIGhhdmUgYW4gdW5rbm93biBmaWxlIGV4dGVuc2lvbiBvclxuICAvLyBhIDxzb3VyY2U+IHRhZyB3aXRob3V0IGFuIGV4cGxpY2l0IHR5cGUsXG4gIC8vIGp1c3QgbGV0IHRoZSBicm93c2VyIGhhbmRsZSBpdCFcbiAgaWYgKCF0eXBlKSByZXR1cm4gdHJ1ZVxuXG4gIC8vIGhhbmRsZSBcIm5vXCIgZWRnZSBjYXNlIHdpdGggc3VwZXIgbGVnYWN5IGJyb3dzZXJzLi4uXG4gIC8vIGh0dHBzOi8vZ3JvdXBzLmdvb2dsZS5jb20vZm9ydW0vIyF0b3BpYy9nb29nbGUtd2ViLXRvb2xraXQtY29udHJpYnV0b3JzL2E4VXkwYlhxMUhvXG4gIGlmICghYXVkaW8pIGF1ZGlvID0gbmV3IHdpbmRvdy5BdWRpbygpXG4gIHZhciBjYW5wbGF5ID0gYXVkaW8uY2FuUGxheVR5cGUodHlwZSkucmVwbGFjZSgvbm8vLCAnJylcbiAgcmV0dXJuIEJvb2xlYW4oY2FucGxheSlcbn1cblxubW9kdWxlLmV4cG9ydHMuY3JlYXRlRXJyb3IgPSBjcmVhdGVFcnJvclxuZnVuY3Rpb24gY3JlYXRlRXJyb3IgKHNvdXJjZXMpIHtcbiAgLy8gQWxsIHNvdXJjZXMgYXJlIHVucGxheWFibGVcbiAgdmFyIGVyciA9IG5ldyBFcnJvcignVGhpcyBicm93c2VyIGRvZXMgbm90IHN1cHBvcnQgYW55IG9mIHRoZSBmb2xsb3dpbmcgc291cmNlczpcXG4gICAgJyArXG4gICAgICBzb3VyY2VzLmpvaW4oJywgJykgKyAnXFxuJyArXG4gICAgICAnVHJ5IHVzaW5nIGFuIGFycmF5IG9mIE9HRywgTVAzIGFuZCBXQVYuJylcbiAgZXJyLnR5cGUgPSAnQVVESU9fRk9STUFUJ1xuICByZXR1cm4gZXJyXG59XG5cbmZ1bmN0aW9uIGV4dGVuc2lvbiAoZGF0YSkge1xuICB2YXIgZXh0SWR4ID0gZGF0YS5sYXN0SW5kZXhPZignLicpXG4gIGlmIChleHRJZHggPD0gMCB8fCBleHRJZHggPT09IGRhdGEubGVuZ3RoIC0gMSkge1xuICAgIHJldHVybiB1bmRlZmluZWRcbiAgfVxuICByZXR1cm4gZGF0YS5zdWJzdHJpbmcoZXh0SWR4ICsgMSlcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gYWRkT25jZVxuZnVuY3Rpb24gYWRkT25jZSAoZWxlbWVudCwgZXZlbnQsIGZuKSB7XG4gIGZ1bmN0aW9uIHRtcCAoZXYpIHtcbiAgICBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQsIHRtcCwgZmFsc2UpXG4gICAgZm4oKVxuICB9XG4gIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldmVudCwgdG1wLCBmYWxzZSlcbn0iLCJ2YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG52YXIgY3JlYXRlQXVkaW8gPSByZXF1aXJlKCdzaW1wbGUtbWVkaWEtZWxlbWVudCcpLmF1ZGlvXG52YXIgYXNzaWduID0gcmVxdWlyZSgnb2JqZWN0LWFzc2lnbicpXG5cbnZhciBjcmVhdGVBdWRpb0NvbnRleHQgPSByZXF1aXJlKCcuL2F1ZGlvLWNvbnRleHQnKVxudmFyIGNhblBsYXlTcmMgPSByZXF1aXJlKCcuL2Nhbi1wbGF5LXNyYycpXG52YXIgYWRkT25jZSA9IHJlcXVpcmUoJy4vZXZlbnQtYWRkLW9uY2UnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZU1lZGlhU291cmNlXG5mdW5jdGlvbiBjcmVhdGVNZWRpYVNvdXJjZSAoc3JjLCBvcHQpIHtcbiAgb3B0ID0gYXNzaWduKHt9LCBvcHQpXG4gIHZhciBlbWl0dGVyID0gbmV3IEV2ZW50RW1pdHRlcigpXG5cbiAgLy8gRGVmYXVsdCB0byBBdWRpbyBpbnN0ZWFkIG9mIEhUTUxBdWRpb0VsZW1lbnRcbiAgLy8gVGhlcmUgaXMgbm90IG11Y2ggZGlmZmVyZW5jZSBleGNlcHQgaW4gdGhlIGZvbGxvd2luZzpcbiAgLy8gICAgeCBpbnN0YW5jZW9mIEF1ZGlvXG4gIC8vICAgIHggaW5zdGFuY2VvZiBIVE1MQXVkaW9FbGVtZW50XG4gIC8vIEFuZCBpbiBteSBleHBlcmllbmNlIEF1ZGlvIGhhcyBiZXR0ZXIgc3VwcG9ydCBvbiB2YXJpb3VzXG4gIC8vIHBsYXRmb3JtcyBsaWtlIENvY29vbkpTLlxuICAvLyBQbGVhc2Ugb3BlbiBhbiBpc3N1ZSBpZiB0aGVyZSBpcyBhIGNvbmNlcm4gd2l0aCB0aGlzLlxuICBpZiAoIW9wdC5lbGVtZW50KSBvcHQuZWxlbWVudCA9IG5ldyB3aW5kb3cuQXVkaW8oKVxuXG4gIHZhciBkZXNpcmVkVm9sdW1lID0gb3B0LnZvbHVtZVxuICBkZWxldGUgb3B0LnZvbHVtZSAvLyBtYWtlIHN1cmUgPGF1ZGlvPiB0YWcgcmVjZWl2ZXMgZnVsbCB2b2x1bWVcbiAgdmFyIGF1ZGlvID0gY3JlYXRlQXVkaW8oc3JjLCBvcHQpXG4gIHZhciBhdWRpb0NvbnRleHQgPSBvcHQuY29udGV4dCB8fCBjcmVhdGVBdWRpb0NvbnRleHQoKVxuICB2YXIgbm9kZSA9IGF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKClcbiAgdmFyIG1lZGlhTm9kZSA9IGF1ZGlvQ29udGV4dC5jcmVhdGVNZWRpYUVsZW1lbnRTb3VyY2UoYXVkaW8pXG4gIG1lZGlhTm9kZS5jb25uZWN0KG5vZGUpXG5cbiAgYXVkaW8uYWRkRXZlbnRMaXN0ZW5lcignZW5kZWQnLCBmdW5jdGlvbiAoKSB7XG4gICAgZW1pdHRlci5lbWl0KCdlbmQnKVxuICB9KVxuXG4gIGVtaXR0ZXIuZWxlbWVudCA9IGF1ZGlvXG4gIGVtaXR0ZXIuY29udGV4dCA9IGF1ZGlvQ29udGV4dFxuICBlbWl0dGVyLm5vZGUgPSBub2RlXG4gIGVtaXR0ZXIucGxheSA9IGF1ZGlvLnBsYXkuYmluZChhdWRpbylcbiAgZW1pdHRlci5wYXVzZSA9IGF1ZGlvLnBhdXNlLmJpbmQoYXVkaW8pXG5cbiAgLy8gVGhpcyBleGlzdHMgY3VycmVudGx5IGZvciBwYXJpdHkgd2l0aCBCdWZmZXIgc291cmNlXG4gIC8vIE9wZW4gdG8gc3VnZ2VzdGlvbnMgZm9yIHdoYXQgdGhpcyBzaG91bGQgZGlzcG9zZS4uLlxuICBlbWl0dGVyLmRpc3Bvc2UgPSBmdW5jdGlvbiAoKSB7fVxuXG4gIGVtaXR0ZXIuc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgd2FzUGxheWluZyA9IGVtaXR0ZXIucGxheWluZ1xuICAgIGF1ZGlvLnBhdXNlKClcbiAgICBhdWRpby5jdXJyZW50VGltZSA9IDBcbiAgICBpZiAod2FzUGxheWluZykge1xuICAgICAgZW1pdHRlci5lbWl0KCdlbmQnKVxuICAgIH1cbiAgfVxuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKGVtaXR0ZXIsIHtcbiAgICBkdXJhdGlvbjoge1xuICAgICAgZW51bWVyYWJsZTogdHJ1ZSwgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBhdWRpby5kdXJhdGlvblxuICAgICAgfVxuICAgIH0sXG4gICAgY3VycmVudFRpbWU6IHtcbiAgICAgIGVudW1lcmFibGU6IHRydWUsIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gYXVkaW8uY3VycmVudFRpbWVcbiAgICAgIH1cbiAgICB9LFxuICAgIHBsYXlpbmc6IHtcbiAgICAgIGVudW1lcmFibGU6IHRydWUsIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gIWF1ZGlvLnBhdXNlZFxuICAgICAgfVxuICAgIH0sXG4gICAgdm9sdW1lOiB7XG4gICAgICBlbnVtZXJhYmxlOiB0cnVlLCBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5vZGUuZ2Fpbi52YWx1ZVxuICAgICAgfSxcbiAgICAgIHNldDogZnVuY3Rpb24gKG4pIHtcbiAgICAgICAgbm9kZS5nYWluLnZhbHVlID0gblxuICAgICAgfVxuICAgIH1cbiAgfSlcblxuICAvLyBTZXQgaW5pdGlhbCB2b2x1bWVcbiAgaWYgKHR5cGVvZiBkZXNpcmVkVm9sdW1lID09PSAnbnVtYmVyJykge1xuICAgIGVtaXR0ZXIudm9sdW1lID0gZGVzaXJlZFZvbHVtZVxuICB9XG5cbiAgLy8gQ2hlY2sgaWYgYWxsIHNvdXJjZXMgYXJlIHVucGxheWFibGUsXG4gIC8vIGlmIHNvIHdlIGVtaXQgYW4gZXJyb3Igc2luY2UgdGhlIGJyb3dzZXJcbiAgLy8gbWlnaHQgbm90LlxuICB2YXIgc291cmNlcyA9IEFycmF5LmlzQXJyYXkoc3JjKSA/IHNyYyA6IFsgc3JjIF1cbiAgc291cmNlcyA9IHNvdXJjZXMuZmlsdGVyKEJvb2xlYW4pXG4gIHZhciBwbGF5YWJsZSA9IHNvdXJjZXMuc29tZShjYW5QbGF5U3JjKVxuICBpZiAocGxheWFibGUpIHtcbiAgICAvLyBBdCBsZWFzdCBvbmUgc291cmNlIGlzIHByb2JhYmx5L21heWJlIHBsYXlhYmxlXG4gICAgc3RhcnRMb2FkKClcbiAgfSBlbHNlIHtcbiAgICAvLyBlbWl0IGVycm9yIG9uIG5leHQgdGljayBzbyB1c2VyIGNhbiBjYXRjaCBpdFxuICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgZW1pdHRlci5lbWl0KCdlcnJvcicsIGNhblBsYXlTcmMuY3JlYXRlRXJyb3Ioc291cmNlcykpXG4gICAgfSlcbiAgfVxuXG4gIHJldHVybiBlbWl0dGVyXG5cbiAgZnVuY3Rpb24gc3RhcnRMb2FkICgpIHtcbiAgICB2YXIgZG9uZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGVtaXR0ZXIuZW1pdCgnbG9hZCcpXG4gICAgfVxuXG4gICAgLy8gT24gbW9zdCBicm93c2VycyB0aGUgbG9hZGluZyBiZWdpbnNcbiAgICAvLyBpbW1lZGlhdGVseS4gSG93ZXZlciwgb24gaU9TIDkuMiBTYWZhcmksXG4gICAgLy8geW91IG5lZWQgdG8gY2FsbCBsb2FkKCkgZm9yIGV2ZW50c1xuICAgIC8vIHRvIGJlIHRyaWdnZXJlZC5cbiAgICBhdWRpby5sb2FkKClcblxuICAgIGlmIChhdWRpby5yZWFkeVN0YXRlID49IGF1ZGlvLkhBVkVfRU5PVUdIX0RBVEEpIHtcbiAgICAgIHByb2Nlc3MubmV4dFRpY2soZG9uZSlcbiAgICB9IGVsc2Uge1xuICAgICAgYWRkT25jZShhdWRpbywgJ2NhbnBsYXknLCBkb25lKVxuICAgICAgYWRkT25jZShhdWRpbywgJ2Vycm9yJywgZnVuY3Rpb24gKGVycikge1xuICAgICAgICBlbWl0dGVyLmVtaXQoJ2Vycm9yJywgZXJyKVxuICAgICAgfSlcbiAgICB9XG4gIH1cbn1cbiIsInZhciB4aHIgPSByZXF1aXJlKCd4aHInKVxudmFyIHhoclByb2dyZXNzID0gcmVxdWlyZSgneGhyLXByb2dyZXNzJylcblxubW9kdWxlLmV4cG9ydHMgPSB4aHJBdWRpb1xuZnVuY3Rpb24geGhyQXVkaW8gKGF1ZGlvQ29udGV4dCwgc3JjLCBjYiwgcHJvZ3Jlc3MsIGRlY29kaW5nKSB7XG4gIHZhciB4aHJPYmplY3QgPSB4aHIoe1xuICAgIHVyaTogc3JjLFxuICAgIHJlc3BvbnNlVHlwZTogJ2FycmF5YnVmZmVyJ1xuICB9LCBmdW5jdGlvbiAoZXJyLCByZXNwLCBhcnJheUJ1Zikge1xuICAgIGlmICghL14yLy50ZXN0KHJlc3Auc3RhdHVzQ29kZSkpIHtcbiAgICAgIGVyciA9IG5ldyBFcnJvcignc3RhdHVzIGNvZGUgJyArIHJlc3Auc3RhdHVzQ29kZSArICcgcmVxdWVzdGluZyAnICsgc3JjKVxuICAgIH1cbiAgICBpZiAoZXJyKSByZXR1cm4gY2IoZXJyKVxuICAgIGRlY29kZShhcnJheUJ1ZilcbiAgfSlcblxuICB4aHJQcm9ncmVzcyh4aHJPYmplY3QpXG4gICAgLm9uKCdkYXRhJywgZnVuY3Rpb24gKGFtb3VudCwgdG90YWwpIHtcbiAgICAgIHByb2dyZXNzKGFtb3VudCwgdG90YWwpXG4gICAgfSlcblxuICBmdW5jdGlvbiBkZWNvZGUgKGFycmF5QnVmKSB7XG4gICAgZGVjb2RpbmcoKVxuICAgIGF1ZGlvQ29udGV4dC5kZWNvZGVBdWRpb0RhdGEoYXJyYXlCdWYsIGZ1bmN0aW9uIChkZWNvZGVkKSB7XG4gICAgICBjYihudWxsLCBkZWNvZGVkKVxuICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBlcnIgPSBuZXcgRXJyb3IoJ0Vycm9yIGRlY29kaW5nIGF1ZGlvIGRhdGEnKVxuICAgICAgZXJyLnR5cGUgPSAnREVDT0RFX0FVRElPX0RBVEEnXG4gICAgICBjYihlcnIpXG4gICAgfSlcbiAgfVxufVxuIiwiLy8gc291cmNlZCBmcm9tOlxuLy8gaHR0cDovL3d3dy5sZWFuYmFja3BsYXllci5jb20vdGVzdC9oNW10Lmh0bWxcbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9icm9vZmEvbm9kZS1taW1lL2Jsb2IvbWFzdGVyL3R5cGVzLmpzb25cbnZhciBtaW1lVHlwZXMgPSByZXF1aXJlKCcuL21pbWUtdHlwZXMuanNvbicpXG5cbnZhciBtaW1lTG9va3VwID0ge31cbk9iamVjdC5rZXlzKG1pbWVUeXBlcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gIHZhciBleHRlbnNpb25zID0gbWltZVR5cGVzW2tleV1cbiAgZXh0ZW5zaW9ucy5mb3JFYWNoKGZ1bmN0aW9uIChleHQpIHtcbiAgICBtaW1lTG9va3VwW2V4dF0gPSBrZXlcbiAgfSlcbn0pXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbG9va3VwIChleHQpIHtcbiAgaWYgKCFleHQpIHRocm93IG5ldyBUeXBlRXJyb3IoJ211c3Qgc3BlY2lmeSBleHRlbnNpb24gc3RyaW5nJylcbiAgaWYgKGV4dC5pbmRleE9mKCcuJykgPT09IDApIHtcbiAgICBleHQgPSBleHQuc3Vic3RyaW5nKDEpXG4gIH1cbiAgcmV0dXJuIG1pbWVMb29rdXBbZXh0LnRvTG93ZXJDYXNlKCldXG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwiYXVkaW8vbWlkaVwiOiBbXCJtaWRcIiwgXCJtaWRpXCIsIFwia2FyXCIsIFwicm1pXCJdLFxuICBcImF1ZGlvL21wNFwiOiBbXCJtcDRhXCIsIFwibTRhXCJdLFxuICBcImF1ZGlvL21wZWdcIjogW1wibXBnYVwiLCBcIm1wMlwiLCBcIm1wMmFcIiwgXCJtcDNcIiwgXCJtMmFcIiwgXCJtM2FcIl0sXG4gIFwiYXVkaW8vb2dnXCI6IFtcIm9nYVwiLCBcIm9nZ1wiLCBcInNweFwiXSxcbiAgXCJhdWRpby93ZWJtXCI6IFtcIndlYmFcIl0sXG4gIFwiYXVkaW8veC1tYXRyb3NrYVwiOiBbXCJta2FcIl0sXG4gIFwiYXVkaW8veC1tcGVndXJsXCI6IFtcIm0zdVwiXSxcbiAgXCJhdWRpby93YXZcIjogW1wid2F2XCJdLFxuICBcInZpZGVvLzNncHBcIjogW1wiM2dwXCJdLFxuICBcInZpZGVvLzNncHAyXCI6IFtcIjNnMlwiXSxcbiAgXCJ2aWRlby9tcDRcIjogW1wibXA0XCIsIFwibXA0dlwiLCBcIm1wZzRcIl0sXG4gIFwidmlkZW8vbXBlZ1wiOiBbXCJtcGVnXCIsIFwibXBnXCIsIFwibXBlXCIsIFwibTF2XCIsIFwibTJ2XCJdLFxuICBcInZpZGVvL29nZ1wiOiBbXCJvZ3ZcIl0sXG4gIFwidmlkZW8vcXVpY2t0aW1lXCI6IFtcInF0XCIsIFwibW92XCJdLFxuICBcInZpZGVvL3dlYm1cIjogW1wid2VibVwiXSxcbiAgXCJ2aWRlby94LWY0dlwiOiBbXCJmNHZcIl0sXG4gIFwidmlkZW8veC1mbGlcIjogW1wiZmxpXCJdLFxuICBcInZpZGVvL3gtZmx2XCI6IFtcImZsdlwiXSxcbiAgXCJ2aWRlby94LW00dlwiOiBbXCJtNHZcIl0sXG4gIFwidmlkZW8veC1tYXRyb3NrYVwiOiBbXCJta3ZcIiwgXCJtazNkXCIsIFwibWtzXCJdXG59IiwibW9kdWxlLmV4cG9ydHMgPVxuICBnbG9iYWwucGVyZm9ybWFuY2UgJiZcbiAgZ2xvYmFsLnBlcmZvcm1hbmNlLm5vdyA/IGZ1bmN0aW9uIG5vdygpIHtcbiAgICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KClcbiAgfSA6IERhdGUubm93IHx8IGZ1bmN0aW9uIG5vdygpIHtcbiAgICByZXR1cm4gK25ldyBEYXRlXG4gIH1cbiIsInZhciBpc0RvbSA9IHJlcXVpcmUoJ2lzLWRvbScpXG52YXIgbG9va3VwID0gcmVxdWlyZSgnYnJvd3Nlci1tZWRpYS1taW1lLXR5cGUnKVxuXG5tb2R1bGUuZXhwb3J0cy52aWRlbyA9IHNpbXBsZU1lZGlhRWxlbWVudC5iaW5kKG51bGwsICd2aWRlbycpXG5tb2R1bGUuZXhwb3J0cy5hdWRpbyA9IHNpbXBsZU1lZGlhRWxlbWVudC5iaW5kKG51bGwsICdhdWRpbycpXG5cbmZ1bmN0aW9uIHNpbXBsZU1lZGlhRWxlbWVudCAoZWxlbWVudE5hbWUsIHNvdXJjZXMsIG9wdCkge1xuICBvcHQgPSBvcHQgfHwge31cblxuICBpZiAoIUFycmF5LmlzQXJyYXkoc291cmNlcykpIHtcbiAgICBzb3VyY2VzID0gWyBzb3VyY2VzIF1cbiAgfVxuXG4gIHZhciBtZWRpYSA9IG9wdC5lbGVtZW50IHx8IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoZWxlbWVudE5hbWUpXG5cbiAgaWYgKG9wdC5sb29wKSBtZWRpYS5zZXRBdHRyaWJ1dGUoJ2xvb3AnLCAnbG9vcCcpXG4gIGlmIChvcHQubXV0ZWQpIG1lZGlhLnNldEF0dHJpYnV0ZSgnbXV0ZWQnLCAnbXV0ZWQnKVxuICBpZiAob3B0LmF1dG9wbGF5KSBtZWRpYS5zZXRBdHRyaWJ1dGUoJ2F1dG9wbGF5JywgJ2F1dG9wbGF5JylcbiAgaWYgKG9wdC5jb250cm9scykgbWVkaWEuc2V0QXR0cmlidXRlKCdjb250cm9scycsICdjb250cm9scycpXG4gIGlmIChvcHQuY3Jvc3NPcmlnaW4pIG1lZGlhLnNldEF0dHJpYnV0ZSgnY3Jvc3NvcmlnaW4nLCBvcHQuY3Jvc3NPcmlnaW4pXG4gIGlmIChvcHQucHJlbG9hZCkgbWVkaWEuc2V0QXR0cmlidXRlKCdwcmVsb2FkJywgb3B0LnByZWxvYWQpXG4gIGlmIChvcHQucG9zdGVyKSBtZWRpYS5zZXRBdHRyaWJ1dGUoJ3Bvc3RlcicsIG9wdC5wb3N0ZXIpXG4gIGlmICh0eXBlb2Ygb3B0LnZvbHVtZSAhPT0gJ3VuZGVmaW5lZCcpIG1lZGlhLnNldEF0dHJpYnV0ZSgndm9sdW1lJywgb3B0LnZvbHVtZSlcblxuICBzb3VyY2VzID0gc291cmNlcy5maWx0ZXIoQm9vbGVhbilcbiAgc291cmNlcy5mb3JFYWNoKGZ1bmN0aW9uIChzb3VyY2UpIHtcbiAgICBtZWRpYS5hcHBlbmRDaGlsZChjcmVhdGVTb3VyY2VFbGVtZW50KHNvdXJjZSkpXG4gIH0pXG5cbiAgcmV0dXJuIG1lZGlhXG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVNvdXJjZUVsZW1lbnQgKGRhdGEpIHtcbiAgaWYgKGlzRG9tKGRhdGEpKSByZXR1cm4gZGF0YVxuICBpZiAodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKSB7XG4gICAgZGF0YSA9IHsgc3JjOiBkYXRhIH1cbiAgICBpZiAoZGF0YS5zcmMpIHtcbiAgICAgIHZhciBleHQgPSBleHRlbnNpb24oZGF0YS5zcmMpXG4gICAgICBpZiAoZXh0KSBkYXRhLnR5cGUgPSBsb29rdXAoZXh0KVxuICAgIH1cbiAgfVxuXG4gIHZhciBzb3VyY2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzb3VyY2UnKVxuICBpZiAoZGF0YS5zcmMpIHNvdXJjZS5zZXRBdHRyaWJ1dGUoJ3NyYycsIGRhdGEuc3JjKVxuICBpZiAoZGF0YS50eXBlKSBzb3VyY2Uuc2V0QXR0cmlidXRlKCd0eXBlJywgZGF0YS50eXBlKVxuICByZXR1cm4gc291cmNlXG59XG5cbmZ1bmN0aW9uIGV4dGVuc2lvbiAoZGF0YSkge1xuICB2YXIgZXh0SWR4ID0gZGF0YS5sYXN0SW5kZXhPZignLicpXG4gIGlmIChleHRJZHggPD0gMCB8fCBleHRJZHggPT09IGRhdGEubGVuZ3RoIC0gMSkge1xuICAgIHJldHVybiBudWxsXG4gIH1cbiAgcmV0dXJuIGRhdGEuc3Vic3RyaW5nKGV4dElkeCArIDEpXG59XG4iLCIvKmdsb2JhbCB3aW5kb3cqL1xuXG4vKipcbiAqIENoZWNrIGlmIG9iamVjdCBpcyBkb20gbm9kZS5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gdmFsXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzTm9kZSh2YWwpe1xuICBpZiAoIXZhbCB8fCB0eXBlb2YgdmFsICE9PSAnb2JqZWN0JykgcmV0dXJuIGZhbHNlO1xuICBpZiAod2luZG93ICYmICdvYmplY3QnID09IHR5cGVvZiB3aW5kb3cuTm9kZSkgcmV0dXJuIHZhbCBpbnN0YW5jZW9mIHdpbmRvdy5Ob2RlO1xuICByZXR1cm4gJ251bWJlcicgPT0gdHlwZW9mIHZhbC5ub2RlVHlwZSAmJiAnc3RyaW5nJyA9PSB0eXBlb2YgdmFsLm5vZGVOYW1lO1xufVxuIiwidmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxuXG5tb2R1bGUuZXhwb3J0cyA9IHByb2dyZXNzXG5cbmZ1bmN0aW9uIHByb2dyZXNzKHhocikge1xuICB2YXIgZW1pdHRlciA9IG5ldyBFdmVudEVtaXR0ZXJcbiAgdmFyIGZpbmlzaGVkID0gZmFsc2VcblxuICBpZiAoeGhyLmF0dGFjaEV2ZW50KSB7XG4gICAgeGhyLmF0dGFjaEV2ZW50KCdvbnJlYWR5c3RhdGVjaGFuZ2UnLCBkb25lKVxuICAgIHJldHVybiBlbWl0dGVyXG4gIH1cblxuICB4aHIuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIGRvbmUsIGZhbHNlKVxuICB4aHIuYWRkRXZlbnRMaXN0ZW5lcigncHJvZ3Jlc3MnLCBwcm9ncmVzcywgZmFsc2UpXG4gIGZ1bmN0aW9uIHByb2dyZXNzKGV2ZW50KSB7XG4gICAgdmFyIHZhbHVlID0gZXZlbnQubGVuZ3RoQ29tcHV0YWJsZVxuICAgICAgPyBldmVudC5sb2FkZWQgLyBldmVudC50b3RhbFxuICAgICAgOiAwXG5cbiAgICBpZiAoIWZpbmlzaGVkKSBlbWl0dGVyLmVtaXQoJ2RhdGEnXG4gICAgICAsIHZhbHVlXG4gICAgICAsIGV2ZW50LnRvdGFsIHx8IG51bGxcbiAgICApXG5cbiAgICBmaW5pc2hlZCA9IHZhbHVlID09PSAxXG4gIH1cblxuICBmdW5jdGlvbiBkb25lKGV2ZW50KSB7XG4gICAgaWYgKGV2ZW50LnR5cGUgIT09ICdsb2FkJyAmJiAhL14ocmVhZHl8Y29tcGxldGUpJC9nLnRlc3QoXG4gICAgICAoZXZlbnQuY3VycmVudFRhcmdldCB8fCBldmVudC5zcmNFbGVtZW50KS5yZWFkeVN0YXRlXG4gICAgKSkgcmV0dXJuXG5cbiAgICBpZiAoZmluaXNoZWQpIHJldHVyblxuICAgIGlmICh4aHIucmVtb3ZlRXZlbnRMaXN0ZW5lcikge1xuICAgICAgeGhyLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBkb25lLCBmYWxzZSlcbiAgICAgIHhoci5yZW1vdmVFdmVudExpc3RlbmVyKCdwcm9ncmVzcycsIHByb2dyZXNzLCBmYWxzZSlcbiAgICB9IGVsc2VcbiAgICBpZiAoeGhyLmRldGF0Y2hFdmVudCkge1xuICAgICAgeGhyLmRldGF0Y2hFdmVudCgnb25yZWFkeXN0YXRlY2hhbmdlJywgZG9uZSlcbiAgICB9XG5cbiAgICBlbWl0dGVyLmVtaXQoJ2RhdGEnLCAxLCBldmVudC50b3RhbCB8fCBudWxsKVxuICAgIGVtaXR0ZXIuZW1pdCgnZG9uZScpXG4gICAgZmluaXNoZWQgPSB0cnVlXG4gIH1cblxuICByZXR1cm4gZW1pdHRlclxufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgd2luZG93ID0gcmVxdWlyZShcImdsb2JhbC93aW5kb3dcIilcbnZhciBvbmNlID0gcmVxdWlyZShcIm9uY2VcIilcbnZhciBpc0Z1bmN0aW9uID0gcmVxdWlyZShcImlzLWZ1bmN0aW9uXCIpXG52YXIgcGFyc2VIZWFkZXJzID0gcmVxdWlyZShcInBhcnNlLWhlYWRlcnNcIilcbnZhciB4dGVuZCA9IHJlcXVpcmUoXCJ4dGVuZFwiKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZVhIUlxuY3JlYXRlWEhSLlhNTEh0dHBSZXF1ZXN0ID0gd2luZG93LlhNTEh0dHBSZXF1ZXN0IHx8IG5vb3BcbmNyZWF0ZVhIUi5YRG9tYWluUmVxdWVzdCA9IFwid2l0aENyZWRlbnRpYWxzXCIgaW4gKG5ldyBjcmVhdGVYSFIuWE1MSHR0cFJlcXVlc3QoKSkgPyBjcmVhdGVYSFIuWE1MSHR0cFJlcXVlc3QgOiB3aW5kb3cuWERvbWFpblJlcXVlc3RcblxuZm9yRWFjaEFycmF5KFtcImdldFwiLCBcInB1dFwiLCBcInBvc3RcIiwgXCJwYXRjaFwiLCBcImhlYWRcIiwgXCJkZWxldGVcIl0sIGZ1bmN0aW9uKG1ldGhvZCkge1xuICAgIGNyZWF0ZVhIUlttZXRob2QgPT09IFwiZGVsZXRlXCIgPyBcImRlbFwiIDogbWV0aG9kXSA9IGZ1bmN0aW9uKHVyaSwgb3B0aW9ucywgY2FsbGJhY2spIHtcbiAgICAgICAgb3B0aW9ucyA9IGluaXRQYXJhbXModXJpLCBvcHRpb25zLCBjYWxsYmFjaylcbiAgICAgICAgb3B0aW9ucy5tZXRob2QgPSBtZXRob2QudG9VcHBlckNhc2UoKVxuICAgICAgICByZXR1cm4gX2NyZWF0ZVhIUihvcHRpb25zKVxuICAgIH1cbn0pXG5cbmZ1bmN0aW9uIGZvckVhY2hBcnJheShhcnJheSwgaXRlcmF0b3IpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGl0ZXJhdG9yKGFycmF5W2ldKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gaXNFbXB0eShvYmope1xuICAgIGZvcih2YXIgaSBpbiBvYmope1xuICAgICAgICBpZihvYmouaGFzT3duUHJvcGVydHkoaSkpIHJldHVybiBmYWxzZVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZVxufVxuXG5mdW5jdGlvbiBpbml0UGFyYW1zKHVyaSwgb3B0aW9ucywgY2FsbGJhY2spIHtcbiAgICB2YXIgcGFyYW1zID0gdXJpXG5cbiAgICBpZiAoaXNGdW5jdGlvbihvcHRpb25zKSkge1xuICAgICAgICBjYWxsYmFjayA9IG9wdGlvbnNcbiAgICAgICAgaWYgKHR5cGVvZiB1cmkgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHBhcmFtcyA9IHt1cmk6dXJpfVxuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcGFyYW1zID0geHRlbmQob3B0aW9ucywge3VyaTogdXJpfSlcbiAgICB9XG5cbiAgICBwYXJhbXMuY2FsbGJhY2sgPSBjYWxsYmFja1xuICAgIHJldHVybiBwYXJhbXNcbn1cblxuZnVuY3Rpb24gY3JlYXRlWEhSKHVyaSwgb3B0aW9ucywgY2FsbGJhY2spIHtcbiAgICBvcHRpb25zID0gaW5pdFBhcmFtcyh1cmksIG9wdGlvbnMsIGNhbGxiYWNrKVxuICAgIHJldHVybiBfY3JlYXRlWEhSKG9wdGlvbnMpXG59XG5cbmZ1bmN0aW9uIF9jcmVhdGVYSFIob3B0aW9ucykge1xuICAgIHZhciBjYWxsYmFjayA9IG9wdGlvbnMuY2FsbGJhY2tcbiAgICBpZih0eXBlb2YgY2FsbGJhY2sgPT09IFwidW5kZWZpbmVkXCIpe1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJjYWxsYmFjayBhcmd1bWVudCBtaXNzaW5nXCIpXG4gICAgfVxuICAgIGNhbGxiYWNrID0gb25jZShjYWxsYmFjaylcblxuICAgIGZ1bmN0aW9uIHJlYWR5c3RhdGVjaGFuZ2UoKSB7XG4gICAgICAgIGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgICAgbG9hZEZ1bmMoKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0Qm9keSgpIHtcbiAgICAgICAgLy8gQ2hyb21lIHdpdGggcmVxdWVzdFR5cGU9YmxvYiB0aHJvd3MgZXJyb3JzIGFycm91bmQgd2hlbiBldmVuIHRlc3RpbmcgYWNjZXNzIHRvIHJlc3BvbnNlVGV4dFxuICAgICAgICB2YXIgYm9keSA9IHVuZGVmaW5lZFxuXG4gICAgICAgIGlmICh4aHIucmVzcG9uc2UpIHtcbiAgICAgICAgICAgIGJvZHkgPSB4aHIucmVzcG9uc2VcbiAgICAgICAgfSBlbHNlIGlmICh4aHIucmVzcG9uc2VUeXBlID09PSBcInRleHRcIiB8fCAheGhyLnJlc3BvbnNlVHlwZSkge1xuICAgICAgICAgICAgYm9keSA9IHhoci5yZXNwb25zZVRleHQgfHwgeGhyLnJlc3BvbnNlWE1MXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNKc29uKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGJvZHkgPSBKU09OLnBhcnNlKGJvZHkpXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7fVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGJvZHlcbiAgICB9XG5cbiAgICB2YXIgZmFpbHVyZVJlc3BvbnNlID0ge1xuICAgICAgICAgICAgICAgIGJvZHk6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICBoZWFkZXJzOiB7fSxcbiAgICAgICAgICAgICAgICBzdGF0dXNDb2RlOiAwLFxuICAgICAgICAgICAgICAgIG1ldGhvZDogbWV0aG9kLFxuICAgICAgICAgICAgICAgIHVybDogdXJpLFxuICAgICAgICAgICAgICAgIHJhd1JlcXVlc3Q6IHhoclxuICAgICAgICAgICAgfVxuXG4gICAgZnVuY3Rpb24gZXJyb3JGdW5jKGV2dCkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dFRpbWVyKVxuICAgICAgICBpZighKGV2dCBpbnN0YW5jZW9mIEVycm9yKSl7XG4gICAgICAgICAgICBldnQgPSBuZXcgRXJyb3IoXCJcIiArIChldnQgfHwgXCJVbmtub3duIFhNTEh0dHBSZXF1ZXN0IEVycm9yXCIpIClcbiAgICAgICAgfVxuICAgICAgICBldnQuc3RhdHVzQ29kZSA9IDBcbiAgICAgICAgY2FsbGJhY2soZXZ0LCBmYWlsdXJlUmVzcG9uc2UpXG4gICAgfVxuXG4gICAgLy8gd2lsbCBsb2FkIHRoZSBkYXRhICYgcHJvY2VzcyB0aGUgcmVzcG9uc2UgaW4gYSBzcGVjaWFsIHJlc3BvbnNlIG9iamVjdFxuICAgIGZ1bmN0aW9uIGxvYWRGdW5jKCkge1xuICAgICAgICBpZiAoYWJvcnRlZCkgcmV0dXJuXG4gICAgICAgIHZhciBzdGF0dXNcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRUaW1lcilcbiAgICAgICAgaWYob3B0aW9ucy51c2VYRFIgJiYgeGhyLnN0YXR1cz09PXVuZGVmaW5lZCkge1xuICAgICAgICAgICAgLy9JRTggQ09SUyBHRVQgc3VjY2Vzc2Z1bCByZXNwb25zZSBkb2Vzbid0IGhhdmUgYSBzdGF0dXMgZmllbGQsIGJ1dCBib2R5IGlzIGZpbmVcbiAgICAgICAgICAgIHN0YXR1cyA9IDIwMFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RhdHVzID0gKHhoci5zdGF0dXMgPT09IDEyMjMgPyAyMDQgOiB4aHIuc3RhdHVzKVxuICAgICAgICB9XG4gICAgICAgIHZhciByZXNwb25zZSA9IGZhaWx1cmVSZXNwb25zZVxuICAgICAgICB2YXIgZXJyID0gbnVsbFxuXG4gICAgICAgIGlmIChzdGF0dXMgIT09IDApe1xuICAgICAgICAgICAgcmVzcG9uc2UgPSB7XG4gICAgICAgICAgICAgICAgYm9keTogZ2V0Qm9keSgpLFxuICAgICAgICAgICAgICAgIHN0YXR1c0NvZGU6IHN0YXR1cyxcbiAgICAgICAgICAgICAgICBtZXRob2Q6IG1ldGhvZCxcbiAgICAgICAgICAgICAgICBoZWFkZXJzOiB7fSxcbiAgICAgICAgICAgICAgICB1cmw6IHVyaSxcbiAgICAgICAgICAgICAgICByYXdSZXF1ZXN0OiB4aHJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmKHhoci5nZXRBbGxSZXNwb25zZUhlYWRlcnMpeyAvL3JlbWVtYmVyIHhociBjYW4gaW4gZmFjdCBiZSBYRFIgZm9yIENPUlMgaW4gSUVcbiAgICAgICAgICAgICAgICByZXNwb25zZS5oZWFkZXJzID0gcGFyc2VIZWFkZXJzKHhoci5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVyciA9IG5ldyBFcnJvcihcIkludGVybmFsIFhNTEh0dHBSZXF1ZXN0IEVycm9yXCIpXG4gICAgICAgIH1cbiAgICAgICAgY2FsbGJhY2soZXJyLCByZXNwb25zZSwgcmVzcG9uc2UuYm9keSlcblxuICAgIH1cblxuICAgIHZhciB4aHIgPSBvcHRpb25zLnhociB8fCBudWxsXG5cbiAgICBpZiAoIXhocikge1xuICAgICAgICBpZiAob3B0aW9ucy5jb3JzIHx8IG9wdGlvbnMudXNlWERSKSB7XG4gICAgICAgICAgICB4aHIgPSBuZXcgY3JlYXRlWEhSLlhEb21haW5SZXF1ZXN0KClcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICB4aHIgPSBuZXcgY3JlYXRlWEhSLlhNTEh0dHBSZXF1ZXN0KClcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhciBrZXlcbiAgICB2YXIgYWJvcnRlZFxuICAgIHZhciB1cmkgPSB4aHIudXJsID0gb3B0aW9ucy51cmkgfHwgb3B0aW9ucy51cmxcbiAgICB2YXIgbWV0aG9kID0geGhyLm1ldGhvZCA9IG9wdGlvbnMubWV0aG9kIHx8IFwiR0VUXCJcbiAgICB2YXIgYm9keSA9IG9wdGlvbnMuYm9keSB8fCBvcHRpb25zLmRhdGEgfHwgbnVsbFxuICAgIHZhciBoZWFkZXJzID0geGhyLmhlYWRlcnMgPSBvcHRpb25zLmhlYWRlcnMgfHwge31cbiAgICB2YXIgc3luYyA9ICEhb3B0aW9ucy5zeW5jXG4gICAgdmFyIGlzSnNvbiA9IGZhbHNlXG4gICAgdmFyIHRpbWVvdXRUaW1lclxuXG4gICAgaWYgKFwianNvblwiIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaXNKc29uID0gdHJ1ZVxuICAgICAgICBoZWFkZXJzW1wiYWNjZXB0XCJdIHx8IGhlYWRlcnNbXCJBY2NlcHRcIl0gfHwgKGhlYWRlcnNbXCJBY2NlcHRcIl0gPSBcImFwcGxpY2F0aW9uL2pzb25cIikgLy9Eb24ndCBvdmVycmlkZSBleGlzdGluZyBhY2NlcHQgaGVhZGVyIGRlY2xhcmVkIGJ5IHVzZXJcbiAgICAgICAgaWYgKG1ldGhvZCAhPT0gXCJHRVRcIiAmJiBtZXRob2QgIT09IFwiSEVBRFwiKSB7XG4gICAgICAgICAgICBoZWFkZXJzW1wiY29udGVudC10eXBlXCJdIHx8IGhlYWRlcnNbXCJDb250ZW50LVR5cGVcIl0gfHwgKGhlYWRlcnNbXCJDb250ZW50LVR5cGVcIl0gPSBcImFwcGxpY2F0aW9uL2pzb25cIikgLy9Eb24ndCBvdmVycmlkZSBleGlzdGluZyBhY2NlcHQgaGVhZGVyIGRlY2xhcmVkIGJ5IHVzZXJcbiAgICAgICAgICAgIGJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmpzb24pXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gcmVhZHlzdGF0ZWNoYW5nZVxuICAgIHhoci5vbmxvYWQgPSBsb2FkRnVuY1xuICAgIHhoci5vbmVycm9yID0gZXJyb3JGdW5jXG4gICAgLy8gSUU5IG11c3QgaGF2ZSBvbnByb2dyZXNzIGJlIHNldCB0byBhIHVuaXF1ZSBmdW5jdGlvbi5cbiAgICB4aHIub25wcm9ncmVzcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gSUUgbXVzdCBkaWVcbiAgICB9XG4gICAgeGhyLm9udGltZW91dCA9IGVycm9yRnVuY1xuICAgIHhoci5vcGVuKG1ldGhvZCwgdXJpLCAhc3luYywgb3B0aW9ucy51c2VybmFtZSwgb3B0aW9ucy5wYXNzd29yZClcbiAgICAvL2hhcyB0byBiZSBhZnRlciBvcGVuXG4gICAgaWYoIXN5bmMpIHtcbiAgICAgICAgeGhyLndpdGhDcmVkZW50aWFscyA9ICEhb3B0aW9ucy53aXRoQ3JlZGVudGlhbHNcbiAgICB9XG4gICAgLy8gQ2Fubm90IHNldCB0aW1lb3V0IHdpdGggc3luYyByZXF1ZXN0XG4gICAgLy8gbm90IHNldHRpbmcgdGltZW91dCBvbiB0aGUgeGhyIG9iamVjdCwgYmVjYXVzZSBvZiBvbGQgd2Via2l0cyBldGMuIG5vdCBoYW5kbGluZyB0aGF0IGNvcnJlY3RseVxuICAgIC8vIGJvdGggbnBtJ3MgcmVxdWVzdCBhbmQganF1ZXJ5IDEueCB1c2UgdGhpcyBraW5kIG9mIHRpbWVvdXQsIHNvIHRoaXMgaXMgYmVpbmcgY29uc2lzdGVudFxuICAgIGlmICghc3luYyAmJiBvcHRpb25zLnRpbWVvdXQgPiAwICkge1xuICAgICAgICB0aW1lb3V0VGltZXIgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBhYm9ydGVkPXRydWUvL0lFOSBtYXkgc3RpbGwgY2FsbCByZWFkeXN0YXRlY2hhbmdlXG4gICAgICAgICAgICB4aHIuYWJvcnQoXCJ0aW1lb3V0XCIpXG4gICAgICAgICAgICB2YXIgZSA9IG5ldyBFcnJvcihcIlhNTEh0dHBSZXF1ZXN0IHRpbWVvdXRcIilcbiAgICAgICAgICAgIGUuY29kZSA9IFwiRVRJTUVET1VUXCJcbiAgICAgICAgICAgIGVycm9yRnVuYyhlKVxuICAgICAgICB9LCBvcHRpb25zLnRpbWVvdXQgKVxuICAgIH1cblxuICAgIGlmICh4aHIuc2V0UmVxdWVzdEhlYWRlcikge1xuICAgICAgICBmb3Ioa2V5IGluIGhlYWRlcnMpe1xuICAgICAgICAgICAgaWYoaGVhZGVycy5oYXNPd25Qcm9wZXJ0eShrZXkpKXtcbiAgICAgICAgICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihrZXksIGhlYWRlcnNba2V5XSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAob3B0aW9ucy5oZWFkZXJzICYmICFpc0VtcHR5KG9wdGlvbnMuaGVhZGVycykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSGVhZGVycyBjYW5ub3QgYmUgc2V0IG9uIGFuIFhEb21haW5SZXF1ZXN0IG9iamVjdFwiKVxuICAgIH1cblxuICAgIGlmIChcInJlc3BvbnNlVHlwZVwiIGluIG9wdGlvbnMpIHtcbiAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9IG9wdGlvbnMucmVzcG9uc2VUeXBlXG4gICAgfVxuXG4gICAgaWYgKFwiYmVmb3JlU2VuZFwiIGluIG9wdGlvbnMgJiZcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuYmVmb3JlU2VuZCA9PT0gXCJmdW5jdGlvblwiXG4gICAgKSB7XG4gICAgICAgIG9wdGlvbnMuYmVmb3JlU2VuZCh4aHIpXG4gICAgfVxuXG4gICAgeGhyLnNlbmQoYm9keSlcblxuICAgIHJldHVybiB4aHJcblxuXG59XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuIiwiaWYgKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHdpbmRvdztcbn0gZWxzZSBpZiAodHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZ2xvYmFsO1xufSBlbHNlIGlmICh0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIil7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBzZWxmO1xufSBlbHNlIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHt9O1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBpc0Z1bmN0aW9uXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdcblxuZnVuY3Rpb24gaXNGdW5jdGlvbiAoZm4pIHtcbiAgdmFyIHN0cmluZyA9IHRvU3RyaW5nLmNhbGwoZm4pXG4gIHJldHVybiBzdHJpbmcgPT09ICdbb2JqZWN0IEZ1bmN0aW9uXScgfHxcbiAgICAodHlwZW9mIGZuID09PSAnZnVuY3Rpb24nICYmIHN0cmluZyAhPT0gJ1tvYmplY3QgUmVnRXhwXScpIHx8XG4gICAgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmXG4gICAgIC8vIElFOCBhbmQgYmVsb3dcbiAgICAgKGZuID09PSB3aW5kb3cuc2V0VGltZW91dCB8fFxuICAgICAgZm4gPT09IHdpbmRvdy5hbGVydCB8fFxuICAgICAgZm4gPT09IHdpbmRvdy5jb25maXJtIHx8XG4gICAgICBmbiA9PT0gd2luZG93LnByb21wdCkpXG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBvbmNlXG5cbm9uY2UucHJvdG8gPSBvbmNlKGZ1bmN0aW9uICgpIHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEZ1bmN0aW9uLnByb3RvdHlwZSwgJ29uY2UnLCB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBvbmNlKHRoaXMpXG4gICAgfSxcbiAgICBjb25maWd1cmFibGU6IHRydWVcbiAgfSlcbn0pXG5cbmZ1bmN0aW9uIG9uY2UgKGZuKSB7XG4gIHZhciBjYWxsZWQgPSBmYWxzZVxuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIGlmIChjYWxsZWQpIHJldHVyblxuICAgIGNhbGxlZCA9IHRydWVcbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICB9XG59XG4iLCJ2YXIgaXNGdW5jdGlvbiA9IHJlcXVpcmUoJ2lzLWZ1bmN0aW9uJylcblxubW9kdWxlLmV4cG9ydHMgPSBmb3JFYWNoXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdcbnZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHlcblxuZnVuY3Rpb24gZm9yRWFjaChsaXN0LCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGlmICghaXNGdW5jdGlvbihpdGVyYXRvcikpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignaXRlcmF0b3IgbXVzdCBiZSBhIGZ1bmN0aW9uJylcbiAgICB9XG5cbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgY29udGV4dCA9IHRoaXNcbiAgICB9XG4gICAgXG4gICAgaWYgKHRvU3RyaW5nLmNhbGwobGlzdCkgPT09ICdbb2JqZWN0IEFycmF5XScpXG4gICAgICAgIGZvckVhY2hBcnJheShsaXN0LCBpdGVyYXRvciwgY29udGV4dClcbiAgICBlbHNlIGlmICh0eXBlb2YgbGlzdCA9PT0gJ3N0cmluZycpXG4gICAgICAgIGZvckVhY2hTdHJpbmcobGlzdCwgaXRlcmF0b3IsIGNvbnRleHQpXG4gICAgZWxzZVxuICAgICAgICBmb3JFYWNoT2JqZWN0KGxpc3QsIGl0ZXJhdG9yLCBjb250ZXh0KVxufVxuXG5mdW5jdGlvbiBmb3JFYWNoQXJyYXkoYXJyYXksIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGFycmF5Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKGFycmF5LCBpKSkge1xuICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBhcnJheVtpXSwgaSwgYXJyYXkpXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGZvckVhY2hTdHJpbmcoc3RyaW5nLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBzdHJpbmcubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgLy8gbm8gc3VjaCB0aGluZyBhcyBhIHNwYXJzZSBzdHJpbmcuXG4gICAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgc3RyaW5nLmNoYXJBdChpKSwgaSwgc3RyaW5nKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZm9yRWFjaE9iamVjdChvYmplY3QsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgZm9yICh2YXIgayBpbiBvYmplY3QpIHtcbiAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCBrKSkge1xuICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmplY3Rba10sIGssIG9iamVjdClcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIlxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gdHJpbTtcblxuZnVuY3Rpb24gdHJpbShzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMqfFxccyokL2csICcnKTtcbn1cblxuZXhwb3J0cy5sZWZ0ID0gZnVuY3Rpb24oc3RyKXtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzKi8sICcnKTtcbn07XG5cbmV4cG9ydHMucmlnaHQgPSBmdW5jdGlvbihzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL1xccyokLywgJycpO1xufTtcbiIsInZhciB0cmltID0gcmVxdWlyZSgndHJpbScpXG4gICwgZm9yRWFjaCA9IHJlcXVpcmUoJ2Zvci1lYWNoJylcbiAgLCBpc0FycmF5ID0gZnVuY3Rpb24oYXJnKSB7XG4gICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGFyZykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gICAgfVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChoZWFkZXJzKSB7XG4gIGlmICghaGVhZGVycylcbiAgICByZXR1cm4ge31cblxuICB2YXIgcmVzdWx0ID0ge31cblxuICBmb3JFYWNoKFxuICAgICAgdHJpbShoZWFkZXJzKS5zcGxpdCgnXFxuJylcbiAgICAsIGZ1bmN0aW9uIChyb3cpIHtcbiAgICAgICAgdmFyIGluZGV4ID0gcm93LmluZGV4T2YoJzonKVxuICAgICAgICAgICwga2V5ID0gdHJpbShyb3cuc2xpY2UoMCwgaW5kZXgpKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgICAgLCB2YWx1ZSA9IHRyaW0ocm93LnNsaWNlKGluZGV4ICsgMSkpXG5cbiAgICAgICAgaWYgKHR5cGVvZihyZXN1bHRba2V5XSkgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSB2YWx1ZVxuICAgICAgICB9IGVsc2UgaWYgKGlzQXJyYXkocmVzdWx0W2tleV0pKSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0ucHVzaCh2YWx1ZSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IFsgcmVzdWx0W2tleV0sIHZhbHVlIF1cbiAgICAgICAgfVxuICAgICAgfVxuICApXG5cbiAgcmV0dXJuIHJlc3VsdFxufSJdfQ==