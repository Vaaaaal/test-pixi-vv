// import _ from 'lodash'; // Commenté car non utilisé
import { Application, Assets, Container, Sprite, Texture } from "pixi.js";

window.Webflow ||= [];
window.Webflow.push(() => {
  // TODO : Réessayer le mode Vanilla si Pixi JS non convaincant
  // // Récupérer tous les éléments avec la classe 'infinite_page_item'
  // const list = document.querySelector('.infinite_page_list');
  // const listItems = list.querySelectorAll('.infinite_page_item');

  // if (listItems.length > 0) {
  //   // Parcourir chaque élément et récupérer l'image
  //   listItems.forEach((element) => {
  //     const img = element.querySelector('.infinite_page_image');

  //     gsap.set(img, {
  //       x: () => gsap.utils.random(0, list.getBoundingClientRect().width - img.width),
  //       y: () => gsap.utils.random(0, list.getBoundingClientRect().height - img.height),
  //     });
  //     // if (img) {
  //     //   images.push(img.src);
  //     // }
  //   });
  // }

  // TODO: Utiliser Pixi JS pour gérer les images en arrière-plan (voir explication ChatGPT)
  (async () => {
    const root = document.querySelector(".infinite_page_wrap");
    const elements = gsap.utils.toArray(".infinite_page_image");

    if (elements.length > 0) {
      // Create a new application
      const app = new Application();

      // var vw = window.innerWidth;
      // var vh = window.innerHeight;

      // Initialize the application
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        resizeTo: window,
      });

      // Append the application canvas to the document body
      document.body.appendChild(app.canvas);

      const world = new Container();
      app.stage.addChild(world);

      let viewportW = root.clientWidth;
      let viewportH = root.clientHeight;

      // marge confortable hors écran (2× est une bonne base)
      let tileW = viewportW * 2;
      let tileH = viewportH * 2;

      function onResize() {
        viewportW = root.clientWidth;
        viewportH = root.clientHeight;
        tileW = viewportW * 2;
        tileH = viewportH * 2;
      }
      window.addEventListener("resize", onResize);

      // charger toutes les textures
      // const assets = [];
      // // Load the texture from element-item images
      // elements.forEach(async (element, index) => {
      //   assets.push({
      //     alias: element.querySelector('.infinite_page_image').alt || `image-${index}`,
      //     src: element.querySelector('.infinite_page_image').src,
      //   });
      // });

      // const textures = await Assets.load(assets);

      await Assets.load(elements.map((i) => i.src));

      const items = elements.map((data, i) => {
        const maxSize = 400;
        const tex = Texture.from(data.src);
        const sp = new Sprite(tex);
        sp.anchor.set(0.5); // centrage visuel
        sp.eventMode = "none"; // (mettra "static" si interactions)
        world.addChild(sp);

        // Position logique initiale : ici une petite grille régulière (exemple)
        const cols = Math.ceil(Math.sqrt(elements.length));
        const rows = Math.ceil(elements.length / cols);
        const gx = i % cols;
        const gy = Math.floor(i / cols);

        const gapX = tileW / (cols + 1);
        const gapY = tileH / (rows + 1);

        // Set width while preserving aspect ratio
        const ratio = sp.height / sp.width;

        return {
          sprite: sp,
          w: maxSize,
          h: maxSize * ratio,
          // w: data.w || tex.width,
          // h: data.h || tex.height,
          factor: data.factor ?? 1, // 0.3–1 typiquement
          logicalX: gapX * (gx + 1),
          logicalY: gapY * (gy + 1),
          clones: [], // on remplira plus tard si besoin
        };
      });

      let offset = { x: 0, y: 0 };
      let vel = { x: 0, y: 0 };
      let isDown = false;
      let last = null;

      root.addEventListener("pointerdown", (e) => {
        isDown = true;
        last = { x: e.clientX, y: e.clientY };
      });

      window.addEventListener("pointermove", (e) => {
        if (!isDown) return;
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };

        // on « pousse » la caméra dans le sens inverse du drag
        offset.x -= dx;
        offset.y -= dy;

        // vitesse (servira à l’inertie & parallax feel)
        vel.x = -dx;
        vel.y = -dy;
      });

      window.addEventListener("pointerup", () => {
        isDown = false;
      });
      window.addEventListener("pointerleave", () => {
        isDown = false;
      });

      const FRICTION = 0.92; // 0.9–0.96 : plus proche de 1 = plus longue inertie

      app.ticker.add(() => {
        if (!isDown) {
          offset.x += vel.x;
          offset.y += vel.y;
          vel.x *= FRICTION;
          vel.y *= FRICTION;
          if (Math.abs(vel.x) < 0.01) vel.x = 0;
          if (Math.abs(vel.y) < 0.01) vel.y = 0;
        }
        updatePositions();
      });

      function wrap(u, period) {
        return ((u % period) + period) % period;
      }

      function project(it, offX, offY) {
        // parallax : l’offset est pondéré par le facteur
        const ox = offX * it.factor;
        const oy = offY * it.factor;

        const x = wrap(it.logicalX - ox, tileW);
        const y = wrap(it.logicalY - oy, tileH);
        return { x, y };
      }

      // petit pool de sprites pour clones
      const clonePool = [];
      function getCloneSprite(tex) {
        const s = clonePool.pop() || new Sprite(tex);
        s.anchor.set(0.5);
        s.alpha = 1;
        s.visible = true;
        world.addChild(s);
        return s;
      }
      function releaseCloneSprite(s) {
        s.visible = false;
        world.removeChild(s);
        clonePool.push(s);
      }

      function updatePositions() {
        const near = 60; // seuil « proximité bord » (px) — à ajuster selon tailles

        for (const it of items) {
          const pos = project(it, offset.x, offset.y);
          const sp = it.sprite;
          sp.x = pos.x;
          sp.y = pos.y;

          // libérer d'anciennes copies
          it.clones.forEach(releaseCloneSprite);
          it.clones.length = 0;

          const needLeft = pos.x < near;
          const needRight = tileW - pos.x < near;
          const needTop = pos.y < near;
          const needBottom = tileH - pos.y < near;

          // horizontal
          if (needLeft) it.clones.push(placeClone(it, pos.x + tileW, pos.y));
          if (needRight) it.clones.push(placeClone(it, pos.x - tileW, pos.y));
          // vertical
          if (needTop) it.clones.push(placeClone(it, pos.x, pos.y + tileH));
          if (needBottom) it.clones.push(placeClone(it, pos.x, pos.y - tileH));
          // diagonales si proches des deux
          if (needLeft && needTop)
            it.clones.push(placeClone(it, pos.x + tileW, pos.y + tileH));
          if (needLeft && needBottom)
            it.clones.push(placeClone(it, pos.x + tileW, pos.y - tileH));
          if (needRight && needTop)
            it.clones.push(placeClone(it, pos.x - tileW, pos.y + tileH));
          if (needRight && needBottom)
            it.clones.push(placeClone(it, pos.x - tileW, pos.y - tileH));

          // petit « feel » parallax (tilt/scale selon vitesse)
          const speed = Math.hypot(vel.x, vel.y);
          const k = Math.min(1, speed / 40);
          // sp.rotation = vel.x * 0.002 * it.factor; // très léger
          sp.scale.set(1 + 0.02 * k * (1 - it.factor));
        }
      }

      function placeClone(it, x, y) {
        const c = getCloneSprite(it.sprite.texture);
        c.x = x;
        c.y = y;
        // c.rotation = it.sprite.rotation;
        c.scale.copyFrom(it.sprite.scale);
        return c;
      }

      // 1. Création du proxy invisible
      const proxy = document.createElement("div");
      Object.assign(proxy.style, {
        position: "absolute",
        inset: 0,
        cursor: "grab",
        opacity: 0,
      });
      root.appendChild(proxy);

      // 2. Draggable
      Draggable.create(proxy, {
        type: "x,y",
        inertia: true,
        onPressInit() {
          gsap.set(proxy, { x: 0, y: 0 });
          last.x = 0;
          last.y = 0;
        },
        onDrag() {
          const dx = this.x - last.x;
          const dy = this.y - last.y;
          offset.x -= dx;
          offset.y -= dy;
          last.x = this.x;
          last.y = this.y;
        },
        onThrowUpdate() {
          const dx = this.x - last.x;
          const dy = this.y - last.y;
          offset.x -= dx;
          offset.y -= dy;
          last.x = this.x;
          last.y = this.y;
        },
      });

      root.appendChild(proxy);

      // // Create a empty sprite to make elements moving when dragging
      // const emptySprite = new Sprite(textures[`image-0`]);
      // emptySprite.width = 2000;
      // emptySprite.height = 2000;
      // emptySprite.x = 0;
      // emptySprite.y = 0;
      // emptySprite.interactive = true;
      // app.stage.addChild(emptySprite);
      // emptySprite.on('pointerdown', onDragStart, emptySprite);
      // let dragTarget = null;
      // // let lastPointerPosition = null;
      // app.stage.eventMode = 'static';
      // app.stage.hitArea = app.screen;
      // app.stage.on('pointerup', onDragEnd);
      // app.stage.on('pointerupoutside', onDragEnd);
      // function onDragStart() {
      //   this.alpha = 0.5;
      //   dragTarget = this;
      //   app.stage.on('pointermove', onDragMove);
      // }
      // function onDragMove(event) {
      //   console.log('dragging');
      //   if (dragTarget) {
      //     console.log('moving');
      //     dragTarget.parent.toLocal(event.global, null, dragTarget.position);
      // //     lastPointerPosition = event.global;
      //     console.log(event.global);
      //     console.log(dragTarget);
      //   }
      // }
      // function onDragEnd() {
      //   if (dragTarget) {
      //     app.stage.off('pointermove', onDragMove);
      //     dragTarget.alpha = 1;
      //     dragTarget = null;
      //   }
      // }

      // Create a container to hold the sprites
      // const listContainer = new Container();
      // app.stage.addChild(listContainer);
      // for (let i = 0; i < elements.length; i++) {
      //   const maxSize = 400;
      //   const element = elements[i];
      //   const texture = textures[element.querySelector('.infinite_page_image').alt || `image-${i}`];
      //   const sprite = new Sprite(texture);

      //   // Set width while preserving aspect ratio
      //   const ratio = sprite.height / sprite.width;
      //   sprite.width = maxSize;
      //   sprite.height = maxSize * ratio;

      //   // Random position within the screen bounds
      //   // const randomX = Math.random() * (app.screen.width * 2);
      //   const randomX = _.random(-app.screen.width / 2, app.screen.width * 1.5);
      //   sprite.x = randomX;
      //   // if (randomX + sprite.width / 2 > app.screen.width) {
      //   //   sprite.x = app.screen.width - sprite.width / 2;
      //   // } else if (randomX < sprite.width / 2) {
      //   //   sprite.x = sprite.width / 2;
      //   // } else {
      //   //   sprite.x = randomX;
      //   // }

      //   // const randomY = Math.random() * (app.screen.height * 2);
      //   const randomY = _.random(-app.screen.height / 2, app.screen.height * 1.5);
      //   sprite.y = randomY;
      //   // if (randomY + sprite.height / 2 > app.screen.height) {
      //   //   sprite.y = app.screen.height - sprite.height / 2;
      //   // } else if (randomY < sprite.height / 2) {
      //   //   sprite.y = sprite.height / 2;
      //   // } else {
      //   //   sprite.y = randomY;
      //   // }

      //   // Adjust speed for parallax effect
      //   sprite.speed = 2 + Math.random() * 2;

      //   // Center the sprite's anchor point
      //   sprite.anchor.set(0.5);

      //   listContainer.addChild(sprite);
      // }
      // VelocityTracker.track(listContainer, 'x,y');
      // function onDragStart(event) {
      //   if (this.tween) {
      //     this.tween.kill();
      //   }
      //   this.data = event.data;
      //   this.lastPosition = this.data.getLocalPosition(this.parent);
      // }
      // function onDragMove() {
      //   if (this.lastPosition) {
      //     var newPosition = this.data.getLocalPosition(this.parent);
      //     listContainer.position.x += newPosition.x - thilistContainers.lastPosition.x;
      //     listContainer.position.y += newPosition.y - listContainer.lastPosition.y;
      //     this.lastPosition = newPosition;
      //   }
      // }
      // function onDragEnd() {
      //   this.data = null;
      //   this.lastPosition = null;
      //   this.tween = gsap.to(listContainer, {
      //     inertia: {
      //       x: {
      //         velocity: 'auto',
      //         min: 0,
      //         max: vw - this.width,
      //       },
      //       y: {
      //         velocity: 'auto',
      //         min: 0,
      //         max: vh - this.height,
      //       },
      //     },
      //     onComplete: () => {
      //       this.tween = null;
      //     },
      //   });
      // }
    }
  })();
});
