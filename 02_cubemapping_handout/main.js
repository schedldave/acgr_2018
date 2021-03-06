/**
 *
 */
'use strict';

var gl = null;
const camera = {
  rotation: {
    x: 0,
    y: 0
  }
};

//scene graph nodes
var root = null;
var worldEnvNode;
var sphereEnvNode;

//textures
var envcubetexture;
var textures;

// global Settings
var globalSettings = function(){};
globalSettings.useAnisotropicFiltering = false;
globalSettings.useMipmapping = false;

//load the required resources using a utility function
loadResources({
  vs_env: 'shader/envmap.vs.glsl',
  fs_env: 'shader/envmap.fs.glsl',
  env_pos_x: '../textures/galaxy_cubemap/Galaxy_RT.jpg',
  env_neg_x: '../textures/galaxy_cubemap/Galaxy_LT.jpg',
  env_pos_y: '../textures/galaxy_cubemap/Galaxy_DN.jpg',
  env_neg_y: '../textures/galaxy_cubemap/Galaxy_UP.jpg',
  env_pos_z: '../textures/galaxy_cubemap/Galaxy_FT.jpg',
  env_neg_z: '../textures/galaxy_cubemap/Galaxy_BK.jpg',
  env_debug_pos_x: '../textures/debug_cubemap/px.jpg',
  env_debug_neg_x: '../textures/debug_cubemap/nx.jpg',
  env_debug_pos_y: '../textures/debug_cubemap/py.jpg',
  env_debug_neg_y: '../textures/debug_cubemap/ny.jpg',
  env_debug_pos_z: '../textures/debug_cubemap/pz.jpg',
  env_debug_neg_z: '../textures/debug_cubemap/nz.jpg',
  env_winter_pos_x: '../textures/winter_cubemap/px.jpg',
  env_winter_neg_x: '../textures/winter_cubemap/nx.jpg',
  env_winter_pos_y: '../textures/winter_cubemap/py.jpg',
  env_winter_neg_y: '../textures/winter_cubemap/ny.jpg',
  env_winter_pos_z: '../textures/winter_cubemap/pz.jpg',
  env_winter_neg_z: '../textures/winter_cubemap/nz.jpg',
}).then(function (resources /*an object containing our keys with the loaded resources*/) {
  init(resources);

  render(0);
});

function init(resources) {
  //create a GL context
  gl = createContext(400, 400);

  // init texture storage:
  textures = {
    winter: [resources.env_winter_pos_x, resources.env_winter_neg_x,
      resources.env_winter_pos_y, resources.env_winter_neg_y,
      resources.env_winter_pos_z, resources.env_winter_neg_z,false],
    galaxy: [resources.env_pos_x,resources.env_neg_x,
      resources.env_pos_y, resources.env_neg_y, resources.env_pos_z, resources.env_neg_z,true],
    debug: [resources.env_debug_pos_x, resources.env_debug_neg_x,
      resources.env_debug_pos_y, resources.env_debug_neg_y,
      resources.env_debug_pos_z, resources.env_debug_neg_z,false] };

  initCubeMap(resources,textures["winter"]);

  gl.enable(gl.DEPTH_TEST);

  //create scenegraph
  root = createSceneGraph(gl, resources);

  // init GUI:
  initGUI(resources);

  initInteraction(gl.canvas);
}

function createSceneGraph(gl, resources) {

  //create scenegraph
  const root = new ShaderSGNode(createProgram(gl, resources.vs_env, resources.fs_env));

  {
    //add skybox by putting large sphere around us
    worldEnvNode = new EnvironmentSGNode(envcubetexture,4,false,false,false,
                    new RenderSGNode(makeSphere(10)));
    root.append(worldEnvNode);
  }

  {
    //initialize
    sphereEnvNode = new EnvironmentSGNode(envcubetexture,4,true,true,true,
        new RenderSGNode(makeSphere(1)));
    let sphere = new TransformationSGNode(glm.transform({ translate: [0,0, 0], rotateX : 0, rotateZ : 0, scale: 1.0 }),
                   sphereEnvNode );
                   //new RenderSGNode(resources.model)));

    root.append(sphere);
  }

  return root;
}

function initCubeMap(resources,env_imgs) {
  //create the texture
  envcubetexture = gl.createTexture();
  //define some texture unit we want to work on
  gl.activeTexture(gl.TEXTURE0);
  //bind the texture to the texture unit
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, envcubetexture);
  //set sampling parameters
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
  //gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.MIRRORED_REPEAT); //will be available in WebGL 2
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  //set correct image for each side of the cube map
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, env_imgs[6]);//flipping required for our skybox, otherwise images don't fit together
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, env_imgs[0]);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, env_imgs[1]);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, env_imgs[2]);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, env_imgs[3]);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, env_imgs[4]);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, env_imgs[5]);
  //generate mipmaps (optional)
  gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  //unbind the texture again
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
}

//a scene graph node for setting environment mapping parameters
class EnvironmentSGNode extends SGNode {

  constructor(envtexture, textureunit, doReflect, doRefract, useFresnel, children ) {
      super(children);
      this.envtexture = envtexture;
      this.textureunit = textureunit;
      this.doReflect = doReflect;
      this.doRefract = doRefract;
      this.useFresnel = useFresnel;
      this.n2 = 1.55; // glass
      this.n1 = 1.0;  // air
  }

  render(context)
  {
    //set additional shader parameters
    let invView3x3 = mat3.fromMat4(mat3.create(), context.invViewMatrix); //reduce to 3x3 matrix since we only process direction vectors (ignore translation)
    gl.uniformMatrix3fv(gl.getUniformLocation(context.shader, 'u_invView3x3'), false, invView3x3);
    gl.uniform1i(gl.getUniformLocation(context.shader, 'u_texCube'), this.textureunit);
    gl.uniform1i(gl.getUniformLocation(context.shader, 'u_useReflection'), this.doReflect);
    gl.uniform1i(gl.getUniformLocation(context.shader, 'u_useRefraction'), this.doRefract);
    gl.uniform1i(gl.getUniformLocation(context.shader, 'u_useFresnel'), this.useFresnel);
    gl.uniform1f(gl.getUniformLocation(context.shader, 'u_refractionEta'), this.n1/this.n2);
    gl.uniform1f(gl.getUniformLocation(context.shader, 'u_fresnelR0'), Math.pow((this.n1-this.n2)/(this.n1+this.n2),2));


    //activate and bind texture
    gl.activeTexture(gl.TEXTURE0 + this.textureunit);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.envtexture);

    //render children
    super.render(context);

    //clean up
    gl.activeTexture(gl.TEXTURE0 + this.textureunit);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
  }
}

function render(timeInMilliseconds) {
  checkForWindowResize(gl);

  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0.9, 0.9, 0.9, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const context = createSGContext(gl);
  context.projectionMatrix = mat4.perspective(mat4.create(), convertDegreeToRadians(60), gl.drawingBufferWidth / gl.drawingBufferHeight, 0.01, 100);
  //very primitive camera implementation
  let lookAtMatrix = mat4.lookAt(mat4.create(), [0,1,-5], [0,0,0], [0,1,0]);
  let mouseRotateMatrix = mat4.multiply(mat4.create(),
                          glm.rotateX(camera.rotation.y),
                          glm.rotateY(camera.rotation.x));
  context.viewMatrix = mat4.multiply(mat4.create(), lookAtMatrix, mouseRotateMatrix);

  //get inverse view matrix to allow to compute viewing direction in world space for environment mapping
  context.invViewMatrix = mat4.invert(mat4.create(), context.viewMatrix);

  root.render(context);

  //animate
  requestAnimationFrame(render);
}

//camera control
function initInteraction(canvas) {
  const mouse = {
    pos: { x : 0, y : 0},
    leftButtonDown: false
  };
  function toPos(event) {
    //convert to local coordinates
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }
  canvas.addEventListener('mousedown', function(event) {
    mouse.pos = toPos(event);
    mouse.leftButtonDown = event.button === 0;
  });
  canvas.addEventListener('mousemove', function(event) {
    const pos = toPos(event);
    const delta = { x : mouse.pos.x - pos.x, y: mouse.pos.y - pos.y };
    if (mouse.leftButtonDown) {
      //add the relative movement of the mouse to the rotation variables
  		camera.rotation.x += delta.x;
  		camera.rotation.y += delta.y;
    }
    mouse.pos = pos;
  });
  canvas.addEventListener('mouseup', function(event) {
    mouse.pos = toPos(event);
    mouse.leftButtonDown = false;
  });
  //register globally
  document.addEventListener('keypress', function(event) {
    //https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent
    if (event.code === 'KeyR') {
      camera.rotation.x = 0;
  		camera.rotation.y = 0;
    }
    if (event.code === 'KeyM') {
      //enable/disable mipmapping
      globalSettings.useMipmapping = !globalSettings.useMipmapping;
      toggleMipmapping(globalSettings.useMipmapping);
    }
    if (event.code === 'KeyA') {
      //enable/disable anisotropic filtering (only visible in combination with mipmapping)
      globalSettings.useAnisotropicFiltering = !globalSettings.useAnisotropicFiltering;
      toggleAnisotropicFiltering(globalSettings.useAnisotropicFiltering);
    }
  });
}

function toggleMipmapping(value){
  //enable/disable mipmapping
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, envcubetexture);
  if(value)
  {
    console.log('Mipmapping enabled');
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }
  else
  {
    console.log('Mipmapping disabled');
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
}

function toggleAnisotropicFiltering(value){
  //enable/disable anisotropic filtering (only visible in combination with mipmapping)
  var ext = gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic") ||
    gl.getExtension("MOZ_EXT_texture_filter_anisotropic");
  if(ext){
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, envcubetexture);
    if(value)
    {
      console.log('Anisotropic filtering enabled');
      var max_anisotropy = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_CUBE_MAP, ext.TEXTURE_MAX_ANISOTROPY_EXT, max_anisotropy);
    }
    else
    {
      console.log('Anisotropic filtering disabled');
      gl.texParameterf(gl.TEXTURE_CUBE_MAP, ext.TEXTURE_MAX_ANISOTROPY_EXT, 1);
    }
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
  }
}

function convertDegreeToRadians(degree) {
  return degree * Math.PI / 180
}

function initGUI(resources){

  var gui = new dat.GUI();

  gui.add( globalSettings, 'useMipmapping' ).onChange(function(value){
    toggleMipmapping(value);
  }).listen();
  gui.add( globalSettings, 'useAnisotropicFiltering' ).onChange(function(value){
    toggleAnisotropicFiltering(value);
  }).listen();

  gui.add(sphereEnvNode, 'doReflect');
  gui.add(sphereEnvNode, 'doRefract');
  gui.add(sphereEnvNode, 'useFresnel');
  gui.add(sphereEnvNode, 'n2' ); // = 1.55; // glass
  gui.add(sphereEnvNode, 'n1' ); // = 1.0;  // air)

  let tmpTexture = function(){}; tmpTexture.env_map = Object.keys(textures)[0];
  gui.add( tmpTexture, 'env_map', Object.keys(textures) ).onChange(function(value){
    initCubeMap(resources,textures[value]);
    sphereEnvNode.envtexture = envcubetexture;
    worldEnvNode.envtexture = envcubetexture;
    toggleMipmapping( globalSettings.useMipmapping );
    toggleAnisotropicFiltering( globalSettings.useAnisotropicFiltering );
  });

  gui.closed = true; // close gui to avoid using up too much screen

}
