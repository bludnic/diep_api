function diep_api_symbol() {
  "use strict";
  return Symbol.for("diep.api");
}
function diep_api() {
  "use strict";
  return (typeof unsafeWindow == "undefined" ? window : unsafeWindow)[diep_api_symbol()];
}
(async function() {
  "use strict";
  function log(...a) {
    console.log("[diep.api]", ...a);
  }
  function err(...a) {
    console.log("[diep.api.err]", ...a);
  }
  const win = typeof unsafeWindow == "undefined" ? window : unsafeWindow;
  if(!document.body || win.input || document.getElementById("canvas")) {
    err("a script tried launching diep.api without \"@run-at\" set to \"document-body\" or a one-time timing error has occured");
    win.location.reload();
  }
  const api_ = diep_api_symbol();
  if(win[api_]) {
    return;
  }
  function validate(fn, args, types) {
    for(let i = 0; i < types.length; ++i) {
      if(typeof args[i] != types[i]) {
        throw new Error("api." + fn + ": argument " + (i + 1) + ": expected format \"" + types[i] + "\", got \"" + (typeof args[i]) + "\"");
      }
    }
  }
  function validate_range(fn, arg, min, max) {
    if(arg < min || arg > max) {
      throw new Error("api." + fn + ": expected range [" + min + " - " + max + "], got " + arg);
    }
  }
  
  const api = {
    version: "v0.2.6",
    
    events: new Map,
    
    canvas_ready: false,
    input_ready: false,
    game_ready: false,
    
    canvases: [undefined, document.createElement("canvas"), document.createElement("canvas")],
    ctxs: [],
    canvas: undefined,
    ctx: undefined,
    
    drew_bg: 0,
    drew_grid: false,
    drew_player: false,
    drew_minimap: false,
    drawing_unsafe: false,
    
    ratio: NaN,
    scale: NaN,
    ui_scale: NaN,
    
    execute: function(str){},
    is_in_game: false,
    module: undefined,
    
    scripts: new Set,
    menu_visible: false,
    
    background_color: "#fc0303",
    grid_color: "#000000",
    grid_opacity: 0.05,
    ui_scaling: 1,
    
    viewport: false,
    viewport_color: "#000000",
    viewport_opacity: 0.1,
    
    pos_phase: 0,
    positions: [[NaN, NaN], [NaN, NaN], [NaN, NaN], [NaN, NaN], [NaN, NaN], [NaN, NaN]],
    
    prevent_mouse_movement: false,
    prevent_mouse_movement_once: false,
    prevent_mouse_buttons: false,
    prevent_mouse_buttons_once: false,
    prevent_keys: false,
    prevent_keys_once: false,
    typing: false,
    
    player: {
      x: NaN,
      y: NaN,
      raw_x: NaN,
      raw_y: NaN
    },
    camera: {
      x: NaN,
      y: NaN,
      raw_x: NaN,
      raw_y: NaN,
      fov: NaN
    },
    mouse: {
      x: NaN,
      y: NaN,
      raw_x: 0,
      raw_y: 0
    },
    minimap: {
      normal: {
        x: NaN,
        y: NaN,
        side: NaN
      },
      extended: {
        x: NaN,
        y: NaN,
        side: NaN
      },
      start_x: 0.0972,
      start_y: 0.0972,
      end_x: 0.90745,
      end_y: 0.90745
    },
    map_size: NaN,
    transform: { x: 0, y: 0, w: 1, h: 1 },
    pivot: { x: 0, y: 0 },
    
    clear_ctx: function(ctx) {
      ctx.save();
      ctx.resetTransform();
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    },
    
    get_ratio: function() {
      if(this.canvas.height * 16 / 9 >= this.canvas.width) {
        this.ratio = this.canvas.height * this.ui_scaling;
      } else {
        this.ratio = this.canvas.width / 16 * 9 * this.ui_scaling;
      }
    },
    get_scale: function() {
      if(this.canvas.height * 16 / 9 >= this.canvas.width) {
        this.scale = this.canvas.height / 1080;
      } else {
        this.scale = this.canvas.width / 1920;
      }
      this.ui_scale = this.scale * this.ui_scaling;
    },
    
    on: function(what, cb) {
      let set = this.events.get(what);
      if(!set) {
        set = new Set([cb]);
        this.events.set(what, set);
        return;
      }
      set.add(cb);
    },
    once: function(what, cb) {
      const func = function() {
        this.remove(what, func);
        cb();
      }.bind(this);
      this.on(what, func);
    },
    emit: function(what, ...args) {
      const set = this.events.get(what);
      if(!set) {
        return;
      }
      for(const cb of set) {
        cb(...args);
      }
    },
    remove: function(what, cb) {
      if(typeof cb == "undefined") {
        this.events.delete(what);
        return;
      }
      this.events.get(what)?.delete(cb);
    },
    
    in_game: function() {
      return this.is_in_game;
    },
    within_minimap: function(x, y) {
      return (x >= this.minimap.extended.x && y >= this.minimap.extended.y && x <= this.minimap.extended.x + this.minimap.extended.side && y <= this.minimap.extended.y + this.minimap.extended.side);
    },
    calculate_minimap: function() {
      this.minimap.normal.x = this.canvas.width - this.ratio * 0.180555;
      this.minimap.normal.y = this.canvas.height - this.ratio * 0.180555;
      this.minimap.normal.side = this.ratio * 0.162037;
      
      this.minimap.extended.x = this.canvas.width - this.ratio * 0.2;
      this.minimap.extended.y = this.canvas.height - this.ratio * 0.2;
      this.minimap.extended.side = this.ratio * 0.2;
    },
    
    inject_before: function(fn, cb) {
      return new Proxy(fn, {
        apply: function(to, what, args) {
          cb.apply(what, args);
          return to.apply(what, args);
        }
      });
    },
    inject_after: function(fn, cb) {
      return new Proxy(fn, {
        apply: function(to, what, args) {
          const ret = to.apply(what, args);
          cb.apply(what, args);
          return ret;
        }
      });
    },
    override: function(fn, cb) {
      return new Proxy(fn, {
        apply: function(to, what, args) {
          return cb.apply(what, args);
        }
      });
    },
    override_extended: function(fn, cb) {
      return new Proxy(fn, {
        apply: function(to, what, args) {
          return cb.apply(what, [to, ...args]);
        }
      })
    },
    
    to_map: function(x, y) {
      return {
        x: this.camera.x + (x - this.canvas.width / 2) / this.map_size / this.scale / this.camera.fov / 1.23456789,
        y: this.camera.y + (y - this.canvas.height / 2) / this.map_size / this.scale / this.camera.fov / 1.23456789
      };
    },
    to_screen: function(x, y) {
      return {
        x: (x - this.camera.x) * this.map_size * this.scale * this.camera.fov * 1.23456789 + this.canvas.width / 2,
        y: (y - this.camera.y) * this.map_size * this.scale * this.camera.fov * 1.23456789 + this.canvas.height / 2
      };
    },
    to_minimap: function(x, y) {
      return {
        x: this.minimap.extended.x + x * this.minimap.extended.side,
        y: this.minimap.extended.y + y * this.minimap.extended.side
      };
    },
    update_mouse: function() {
      const pos = this.to_map(this.mouse.raw_x, this.mouse.raw_y);
      this.mouse.x = pos.x;
      this.mouse.y = pos.y;
    },
    update_map: function(w, h) {
      this.map_size = this.canvas.width / this.camera.fov * this.minimap.normal.side / w / this.scale;
    },
    
    register: function(script) {
      this.scripts.add({ ...script, keybind: localStorage["diep.api.keybind." + script.name + "." + script.author] });
    },
    
    begin_path: function() {
      this.drawing_unsafe = true;
      this.ctx.save();
      this.ctx.resetTransform();
    },
    close_path: function() {
      this.ctx.restore();
      this.drawing_unsafe = false;
    }
  };
  
  Reflect.defineProperty(win, api_, {
    value: new class {
      get version() {
        return api.version;
      }
      get canvas_ready() {
        return api.canvas_ready;
      }
      get input_ready() {
        return api.input_ready;
      }
      get game_ready() {
        return api.game_ready;
      }
      
      get canvas() {
        return api.canvas;
      }
      get ctx() {
        return api.ctx;
      }
      
      get ratio() {
        return api.ratio;
      }
      get scale() {
        return api.scale;
      }
      get ui_scale() {
        return api.ui_scale;
      }
      
      get in_game() {
        return api.in_game();
      }
      get module() {
        return api.module;
      }
      get player() {
        return { ...api.player };
      }
      get camera() {
        return { ...api.camera };
      }
      get mouse() {
        return { ...api.mouse };
      }
      get minimap() {
        return {
          ...api.minimap,
          normal: { ...api.minimap.normal },
          extended: { ...api.minimap.extended }
        };
      }
      get map_size() {
        return api.map_size;
      }
      
      set preventing_mouse_movement(bool) {
        api.prevent_mouse_movement = !!bool;
      }
      get preventing_mouse_movement() {
        return api.prevent_mouse_movement;
      }
      prevent_mouse_movement_once() {
        api.prevent_mouse_movement_once = true;
      }
      set preventing_mouse_buttons(bool) {
        api.prevent_mouse_buttons = !!bool;
      }
      get preventing_mouse_buttons() {
        return api.prevent_mouse_buttons;
      }
      prevent_mouse_buttons_once() {
        api.prevent_mouse_buttons_once = true;
      }
      set preventing_keys(bool) {
        api.prevent_keys = !!bool;
      }
      get preventing_keys() {
        return api.prevent_keys;
      }
      prevent_keys_once() {
        api.prevent_keys_once = true;
      }
      set typing(bool) {
        bool = !!bool;
        win.setTyping(bool);
        api.typing = bool;
      }
      get typing() {
        return api.typing;
      }
      
      set viewport_color(color) {
        validate("viewport_color", [color], ["string"]);
        api.viewport_color = color;
      }
      get viewport_color() {
        return api.viewport_color;
      }
      set viewport_opacity(op) {
        validate("viewport_opacity", [op], ["number"]);
        validate_range("viewport_opacity", op, 0, 1);
        api.viewport_opacity = op;
      }
      get viewport_opacity() {
        return api.viewport_opacity;
      }
      
      to_map(x, y) {
        return api.to_map(x, y);
      }
      to_screen(x, y) {
        return api.to_screen(x, y);
      }
      to_minimap(x, y) {
        return api.to_minimap(x, y);
      }
      execute(str) {
        validate("execute", [str], ["string"]);
        return api.execute(str);
      }
      register(script) {
        validate("register", [script], ["object"]);
        validate("register.script", [script.name, script.author, script.description, script.handler], ["string", "string", "string", "function"]);
        return api.register(script);
      }
      begin_path() {
        return api.begin_path();
      }
      close_path() {
        return api.close_path();
      }
      
      on(what, cb) {
        validate("on", [what, cb], ["string", "function"]);
        return api.on(what, cb);
      }
      once(what, cb) {
        validate("once", [what, cb], ["string", "function"]);
        return api.once(what, cb);
      }
      remove(what, cb) {
        validate("remove", [what, cb], ["string", "function"]);
        return api.remove(what, cb);
      }
      
      inject_before(fn, cb) {
        validate("inject_before", [fn, cb], ["function", "function"]);
        return api.inject_before(fn, cb);
      }
      inject_after(fn, cb) {
        validate("inject_after", [fn, cb], ["function", "function"]);
        return api.inject_after(fn, cb);
      }
      override(fn, cb) {
        validate("override", [fn, cb], ["function", "function"]);
        return api.override(fn, cb);
      }
      override_extended(fn, cb) {
        validate("override_extended", [fn, cb], ["function", "function"]);
        return api.override_extended(fn, cb);
      }
    },
    configurable: false,
    enumerable: false,
    writable: false
  });
  Object.freeze(win[api_]);
  log("init " + api.version);
  
  Reflect.defineProperty(win, "input", {
    set: function(to) {
      delete win.input;
      win.input = to;
      api.input_ready = true;
      api.emit("input", win.input);
    },
    get: function() {
      return undefined;
    },
    configurable: true
  });
  
  Reflect.defineProperty(Object.prototype, "noInitialRun", {
    set: function(to) {
      delete Object.prototype.noInitialRun;
      delete this.noInitialRun;
      this.noInitialRun = to;
      api.module = this;
      this.postRun.push(function() {
        api.game_ready = true;
        api.emit("ready");
      });
    },
    get: function() {
      delete Object.prototype.noInitialRun;
      delete this.noInitialRun;
      api.module = this;
      this.postRun.push(function() {
        api.game_ready = true;
        api.emit("ready");
      });
      return undefined;
    },
    configurable: true,
    enumerable: false
  });
  
  win.requestAnimationFrame = new Proxy(win.requestAnimationFrame, {
    apply: function(to, what, args) {
      let ok = false;
      if(args[0].toString().includes(".mainLoop.")) {
        ok = true;
        let died = false;
        if(api.is_in_game) {
          died = true;
        }
        api.is_in_game = api.drew_player;
        if(!api.is_in_game && died) {
          api.emit("death");
        } else if(api.is_in_game && !died) {
          api.emit("spawn");
        }
        api.drew_bg = 0;
        api.drew_grid = false;
        api.drew_player = false;
        api.drew_minimap = false;
      }
      const ret = to.apply(what, args);
      if(ok) {
        api.emit("draw");
      }
      return ret;
    }
  });
  
  await new Promise(function(resolve) {
    new MutationObserver(function(list, observer) {
      list.forEach(function(mut) {
        if(mut.addedNodes[0].id == "canvas") {
          observer.disconnect();
          resolve();
        }
      });
    }).observe(document.body, { childList: true });
  });
  
  api.canvases[0] = document.getElementById("canvas");
  api.ctxs[0] = api.canvases[0].getContext("2d");
  api.canvas = api.canvases[0];
  api.ctx = api.ctxs[0];
  
  for(let i = 1; i < api.canvases.length; ++i) {
    api.ctxs[i] = api.canvases[i].getContext("2d");
  }
  
  {
    const w = Math.floor(win.innerWidth * win.devicePixelRatio);
    const h = Math.floor(win.innerHeight * win.devicePixelRatio);
    for(const canvas of api.canvases) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  
  api.get_ratio();
  api.get_scale();
  api.calculate_minimap();
  
  api.canvas_ready = true;
  api.emit("canvas", api.ctx);
  
  function dynamic_update() {
    const w = Math.floor(win.innerWidth * win.devicePixelRatio);
    const h = Math.floor(win.innerHeight * win.devicePixelRatio);
    if(api.canvas.width != w || api.canvas.height != h) {
      for(const canvas of api.canvases) {
        canvas.width = w;
        canvas.height = h;
      }
    }
    
    api.get_ratio();
    api.get_scale();
    api.calculate_minimap();
    
    requestAnimationFrame(dynamic_update);
  }
  requestAnimationFrame(dynamic_update);
  
  function modify_diep_methods(to) {
    log("onresize set");
    delete win.onresize;
    win.onresize = api.override(to, function(){});
    win.addEventListener("resize", function() {
      const w = Math.floor(win.innerWidth * win.devicePixelRatio);
      const h = Math.floor(win.innerHeight * win.devicePixelRatio);
      for(const canvas of api.canvases) {
        canvas.width = w;
        canvas.height = h;
      }
      
      api.get_ratio();
      api.get_scale();
      api.calculate_minimap();
      
      api.emit("resize");
    });
    win.onbeforeunload = api.override(win.onbeforeunload, function(e) {
      if(win.input.should_prevent_unload()) {
        e.preventDefault();
        e.returnValue = "";
        return "Are you sure you wanna quit?";
      } else {
        delete e.returnValue;
      }
    });
    api.canvas.onmousemove = api.override(api.canvas.onmousemove, function(){});
    win.onmousemove = function(e) {
      api.mouse.raw_x = e.clientX * win.devicePixelRatio;
      api.mouse.raw_y = e.clientY * win.devicePixelRatio;
      api.update_mouse();
      
      api.emit("pre.mouse.move", e);
      
      if(api.prevent_mouse_movement || api.prevent_mouse_movement_once) {
        api.prevent_mouse_movement_once = false;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      win.input.mouse(api.mouse.raw_x, api.mouse.raw_y);
      
      api.emit("mouse.move", e);
    };
    api.canvas.onmousedown = api.override(api.canvas.onmousedown, function(){});
    win.onmousedown = function(e) {
      api.emit("pre.mouse.down", e);
      
      if(api.prevent_mouse_buttons || api.prevent_mouse_buttons_once) {
        api.prevent_mouse_buttons_once = false;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if(e.button >= 0 && e.button <= 2) {
        win.input.keyDown(e.button + 1);
      }
      
      api.emit("mouse.down", e);
    };
    api.canvas.onmouseup = api.override(api.canvas.onmouseup, function(){});
    win.onmouseup = function(e) {
      api.emit("pre.mouse.up", e);
      
      if(api.prevent_mouse_buttons || api.prevent_mouse_buttons_once) {
        api.prevent_mouse_buttons_once = false;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if(e.button >= 0 && e.button <= 2) {
        win.input.keyUp(e.button + 1);
      }
      
      api.emit("mouse.up", e);
    };
    win.onkeydown = api.override_extended(win.onkeydown, function(fn, e) {
      api.emit("pre.key.down", e);
      
      if(api.prevent_keys || api.prevent_keys_once) {
        api.prevent_keys_once = false;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      fn.call(this, e);
      
      api.emit("key.down", e);
    });
    win.onkeyup = api.override_extended(win.onkeyup, function(fn, e) {
      api.emit("pre.key.up", e);
      
      if(api.prevent_keys || api.prevent_keys_once) {
        api.prevent_keys_once = false;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      fn.call(this, e);
      
      api.emit("key.up", e);
    });
    
    api.execute = win.input.execute;
    win.input.execute = api.override_extended(win.input.execute, function(fn, str) {
      console.log("execute: str arg", fn, str)
      str = str.trim().replace(/\s{2,}/g, " ");
      const s = str.split(" ");
      console.log("execute: s params", str)
      switch(s[0]) {
        case "ren_ui_scale": {
          api.ui_scaling = parseFloat(s[1]);
          break;
        }
        case "ren_grid_base_alpha": {
          api.grid_opacity = Math.max(0.001, parseFloat(s[1]) / 2);
          str = str.replace(s[1], (api.grid_opacity * 2).toString());
          break;
        }
        case "ren_grid_color": {
          api.grid_color = "#" + parseInt(s[1]).toString(16).padStart(6, "0");
          break;
        }
        case "ren_background_color": {
          api.background_color = "#" + parseInt(s[1]).toString(16).padStart(6, "0");
          break;
        }
        case "ren_minimap_viewport": {
          api.viewport = (s[1] != "false" && s[1] != "0");
          return;
        }
        case "ren_pattern_grid": return;
      }
      return fn.call(this, str);
    });
    win.input.set_convar = api.override(win.input.set_convar, function(...args) {
      return win.input.execute.call(this, args.join(" "));
    });
  }
  
  const c = win.CanvasRenderingContext2D.prototype;
  c.stroke = api.override_extended(c.stroke, function(fn, path) {
    if(!api.drew_grid && !api.drawing_unsafe && this.fillStyle == api.background_color && this.strokeStyle == api.grid_color) {
      api.drew_grid = true;
      api.camera.fov = this.globalAlpha / api.grid_opacity / api.scale;
    }
    /*if(!api.drawing_unsafe && !api.drew_minimap) {
      if(api.pos_phase >= 2 && api.pos_phase <= 5) {
        api.emit("pre.shape.stroke." + "triangle quad pentagon hexagon".split(" ")[api.pos_phase - 2]);
      }
      fn.apply(this, []);
      if(api.pos_phase >= 2 && api.pos_phase <= 5) {
        api.emit("shape.stroke." + "triangle quad pentagon hexagon".split(" ")[api.pos_phase - 2]);
      }
      return;
    }*/
    return fn.apply(this, path ? [path] : []);
  });
  c.moveTo = api.inject_before(c.moveTo, function(x, y) {
    api.pivot.x = x + api.transform.x;
    api.pivot.y = y + api.transform.y;
    
    api.pos_phase = 0;
    api.positions[0][0] = api.pivot.x;
    api.positions[0][1] = api.pivot.y;
  });
  c.lineTo = api.inject_before(c.lineTo, function(x, y) {
    api.pivot.x = x + api.transform.x;
    api.pivot.y = y + api.transform.y;
    
    ++api.pos_phase;
    if(api.pos_phase <= 5) {
      api.positions[api.pos_phase][0] = api.pivot.x;
      api.positions[api.pos_phase][1] = api.pivot.y;
    }
  });
  c.setTransform = api.inject_before(c.setTransform, function(a, b, c, d, e, f) {
    api.transform.x = e;
    api.transform.y = f;
    api.transform.w = a;
    api.transform.h = d;
  });
  c.fillRect = api.override_extended(c.fillRect, function(fn, x, y, w, h) {
    if(!api.drawing_unsafe) {
      if(api.drew_bg == 1 && api.camera.fov > 0.005) {
        api.drew_bg = 2;
        const ret = fn.apply(this, [x, y, w, h]);
        api.clear_ctx(api.ctxs[1]);
        api.ctxs[1].drawImage(api.canvases[0], 0, 0);
        api.clear_ctx(api.ctxs[0]);
        return ret;
      }
      api.pivot.x = x + api.transform.x;
      api.pivot.y = y + api.transform.y;
      const pivot_w = w * api.transform.w;
      const pivot_h = h * api.transform.h;
      if(
        Math.abs(api.pivot.x - api.minimap.normal.x) < 0.1 * api.ui_scale &&
        Math.abs(api.pivot.y - api.minimap.normal.y) < 0.1 * api.ui_scale &&
        Math.abs(pivot_w - api.minimap.normal.side) < 0.1 * api.ui_scale &&
        Math.abs(pivot_h - api.minimap.normal.side) < 0.1 * api.ui_scale
      ) {
        api.drew_minimap = true;
      } else if(api.drew_minimap && this.fillStyle == "#000000" && api.within_minimap(api.pivot.x + pivot_w / 2, api.pivot.y + pivot_h / 2) && this.globalAlpha == 0.1) {
        api.camera.raw_x = api.pivot.x + pivot_w / 2;
        api.camera.raw_y = api.pivot.y + pivot_h / 2;
        api.camera.x = (api.camera.raw_x - api.minimap.extended.x) / api.minimap.extended.side;
        api.camera.y = (api.camera.raw_y - api.minimap.extended.y) / api.minimap.extended.side;
        api.update_mouse();
        api.update_map(pivot_w, pivot_h);
        let ret;
        if(api.viewport) {
          api.ctx.save();
          this.fillStyle = api.viewport_color;
          this.globalAlpha = api.viewport_opacity;
          ret = fn.apply(this, [x, y, w, h]);
          api.ctx.restore();
        }
        api.clear_ctx(api.ctxs[2]);
        api.ctxs[2].drawImage(api.canvases[0], 0, 0);
        api.clear_ctx(api.ctxs[0]);
        api.ctxs[0].drawImage(api.canvases[1], 0, 0);
        api.emit("draw.background");
        api.ctxs[0].drawImage(api.canvases[2], 0, 0);
        return ret;
      }
    }
    return fn.apply(this, [x, y, w, h]);
  });
  c.createPattern = api.inject_after(c.createPattern, function() {
    if(!api.drawing_unsafe) {
      ++api.drew_bg;
    }
  });
  c.fill = api.override_extended(c.fill, function(fn, path) {
    if(!api.drawing_unsafe) {
      if(api.drew_minimap) {
        if(api.pos_phase == 2) {
          api.player.raw_x = (api.positions[0][0] + api.positions[1][0] + api.positions[2][0]) / 3;
          api.player.raw_y = (api.positions[0][1] + api.positions[1][1] + api.positions[2][1]) / 3;
          api.player.x = (api.player.raw_x - api.minimap.extended.x) / api.minimap.extended.side;
          api.player.y = (api.player.raw_y - api.minimap.extended.y) / api.minimap.extended.side;
          api.drew_player = true;
        }
      }/* else {
        if(api.pos_phase >= 2 && api.pos_phase <= 5) {
          api.pivot.x = 0;
          api.pivot.y = 0;
          for(let i = 0; i <= api.pos_phase; ++i) {
            api.pivot.x += api.positions[i][0];
            api.pivot.y += api.positions[i][1];
          }
          api.pivot.x /= api.pos_phase + 1;
          api.pivot.y /= api.pos_phase + 1;
          api.emit("pre.shape.fill." + "triangle quad pentagon hexagon".split(" ")[api.pos_phase - 2]);
        }
        fn.apply(this, path ? [path] : []);
        if(api.pos_phase >= 2 && api.pos_phase <= 5) {
          api.emit("shape.fill." + "triangle quad pentagon hexagon".split(" ")[api.pos_phase - 2]);
        }
        return;
      }*/
    }
    return fn.apply(this, path ? [path] : []);
  });
  
  api.once("input", function() {
    if(win.onresize == undefined) {
      Reflect.defineProperty(win, "onresize", {
        set: modify_diep_methods,
        get: function() {
          return undefined;
        },
        configurable: true,
        enumerable: false
      });
    } else {
      modify_diep_methods(win.onresize);
    }
    
    api.execute("ren_minimap_viewport 1");
    api.execute("ren_pattern_grid 1");
    
    /*api.on("pre.key.up", function({ code }) {
      if(code == "KeyQ") {
        api.menu_visible = !api.menu_visible;
        
      }
    });*/
  });
  
  api.once("ready", function() {
    log("ready");
  });
  
  /*for(const shape of "triangle quad pentagon hexagon".split(" ")) {
    api.on("shape.stroke." + shape, function() {
      api.begin_path();
      
      api.ctx.textBaseline = "middle";
      api.ctx.textAlign = "center";
      api.ctx.font = `${api.scale * api.camera.fov * 20}px Ubuntu`;
      api.ctx.strokeStyle = "#000";
      api.ctx.fillStyle = "#FFF";
      api.ctx.lineWidth = api.scale * api.camera.fov * 4;
      api.ctx.strokeText(shape, api.pivot.x, api.pivot.y);
      api.ctx.fillText(shape, api.pivot.x, api.pivot.y);
      
      api.close_path();
    });
  }*/
})();
