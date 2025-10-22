/* =========================================
   0) Imports & Plugin setup
========================================= */
import { Application, Assets, Container, Sprite, Texture } from 'pixi.js';
import { BulgePinchFilter } from 'pixi-filters';

window.Webflow ||= [];
window.Webflow.push(() => {
  /* =========================================
   1) Quelques utilitaires
  ========================================= */
  // Modulo positif (wrap) pour boucler proprement
  const wrap = (u, period) => ((u % period) + period) % period;

  // Lerp simple (si tu veux lisser des valeurs)
  const lerp = (a, b, t) => a + (b - a) * t;

  /* =========================================
   2) Configuration "tunable" de l'effet
  ========================================= */
  const CONFIG = {
    // tuile (espace logique) = multiple du viewport
    TILE_SCALE: 2, // 2× le viewport (passe à 2.5 ou 3 si beaucoup d'items)
    FRICTION: 0.92, // inertie (proche de 1 = plus longue)
    NEAR_BORDER: 60, // seuil en px pour gestion des clones (optionnel)
    PARALLAX_MIN: 0.4, // facteur de parallax mini (arrière-plan) - plus bas = plus d'effet
    PARALLAX_MAX: 1.5, // facteur maxi (avant-plan) - plus haut = plus d'effet
    REDUCED_MOTION: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };

  /* =========================================
   3) Point d'entrée : lancer l'expérience
  ========================================= */
  (async function main() {
    // Récupère le conteneur & les données CMS (via data-attributes)
    const root = document.querySelector('.infinite_page_wrap');
    if (!root) return console.warn('Pas de #archive-root sur la page.');

    const itemsData = gsap.utils.toArray('.infinite_page_image');
    // itemsData attendu: [{src, w?, h?, factor?}, ...]

    // 3.1 Créer l'app Pixi (canvas) et la "scène monde"
    const { app, world, bulgePinchFilter, size } = await initPixi(root);

    // 3.1.5 Créer un layer pour la modal (au-dessus de tout)
    const modalLayer = new Container();
    app.stage.addChild(modalLayer);

    // 3.2 Définir la tuile logique (taille "infinie" qui boucle)
    let { tileW, tileH } = computeTile(size, CONFIG.TILE_SCALE);

    // 3.3 Charger textures & construire les "items" (sprites + positions logiques)
    await Assets.load(itemsData.map((i) => i.src));
    const items = buildItems(itemsData, world, tileW, tileH, modalLayer, app);

    // 3.4 État "caméra" (offset) + vitesse (servira à l’inertie)
    const state = {
      offset: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
    };

    // 3.5 Créer le tracker invisible (en dehors) + Draggable sur le canvas
    const tracker = createTracker();

    // Variable pour tracker si on est en train de drag (vs simple clic)
    let isDragging = false;
    let dragStartTime = 0;

    const drag = initDraggable(app.canvas, tracker, {
      onDelta(dx, dy) {
        // On déplace la "caméra" en sens inverse du geste
        state.offset.x -= dx;
        state.offset.y -= dy;
        // Mémo vitesse instantanée (utile pour effets)
        state.vel.x = -dx;
        state.vel.y = -dy;

        // Marquer qu'on est en train de drag (pas un simple clic)
        if (!isDragging) {
          isDragging = true;
          // Activer le filtre seulement si on drag vraiment
          gsap.to(bulgePinchFilter, {
            strength: 0.25,
            duration: 0.4,
            ease: 'cubic.out',
          });
        }
      },
      onPress() {
        // Mémoriser le temps du press
        dragStartTime = Date.now();
        isDragging = false;
        // Ne pas activer le filtre immédiatement, attendre onDelta
      },
      onRelease() {
        // Réinitialiser le filtre seulement si on a vraiment drag
        if (isDragging) {
          gsap.to(bulgePinchFilter, {
            strength: 0,
            duration: 0.4,
            ease: 'cubic.out',
          });
        }
        isDragging = false;
      },
    });

    // 3.6 Boucle Pixi: mettre à jour positions visibles à chaque frame
    app.ticker.add(() => {
      // Inertie (si on n’est pas en drag, Draggable anime le proxy : onThrowUpdate
      // continue d’appeler onDelta → vel est déjà mis à jour)
      if (!drag.isDragging && !CONFIG.REDUCED_MOTION) {
        state.offset.x += state.vel.x;
        state.offset.y += state.vel.y;
        state.vel.x *= CONFIG.FRICTION;
        state.vel.y *= CONFIG.FRICTION;

        if (Math.abs(state.vel.x) < 0.01) state.vel.x = 0;
        if (Math.abs(state.vel.y) < 0.01) state.vel.y = 0;
      }

      // Projeter chaque item : logique → écran (wrap) + parallax léger
      updateItemsPositions(items, state, tileW, tileH);
    });

    // 3.7 Responsive: recalculer tailles et reposer les items
    window.addEventListener('resize', () => {
      const newSize = { w: window.innerWidth, h: window.innerHeight };
      app.renderer.resize(newSize.w, newSize.h);
      const t = computeTile(newSize, CONFIG.TILE_SCALE);
      tileW = t.tileW;
      tileH = t.tileH;
      // Recentrer le world lors du resize
      world.x = -newSize.w / 2;
      world.y = -newSize.h / 2;
      // Pas besoin de refaire les items: on continue d'utiliser logicalX/Y + wrap
    });
  })();

  /* =========================================
   4) Initialisation Pixi (canvas + scène)
  ========================================= */
  async function initPixi(rootEl) {
    // Utiliser la taille du viewport au lieu de rootEl
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const app = new Application();
    await app.init({
      backgroundAlpha: 0,
      antialias: true,
      width: viewportW,
      height: viewportH,
      // Ne pas utiliser resizeTo pour éviter que le canvas prenne la hauteur du conteneur
    });
    rootEl.appendChild(app.canvas);

    const world = new Container();
    app.stage.addChild(world);

    let radius = viewportW > viewportH ? viewportW * 0.9 : viewportH * 0.9;

    // Créer le filtre BulgePinch avec les bonnes coordonnées normalisées
    const bulgePinchFilter = new BulgePinchFilter({
      center: { x: 0.5, y: 0.5 }, // Centre de l'écran en coordonnées normalisées (0-1)
      radius: radius, // Rayon en pixels
      strength: 0, // Commence à 0 (pas d'effet)
    });
    // Appliquer le filtre au stage
    app.stage.filters = [bulgePinchFilter];

    // Centrer le world pour que la tuile 2× soit centrée sur le viewport
    // Cela évite que les éléments disparaissent trop tôt sur les bords
    world.x = -viewportW / 2;
    world.y = -viewportH / 2;

    return {
      app,
      world,
      bulgePinchFilter,
      size: { w: viewportW, h: viewportH },
    };
  }

  /* =========================================
   5) Calcul de la "tuile" (espace logique)
  ========================================= */
  function computeTile(size, scale) {
    return {
      tileW: Math.max(1, Math.floor(size.w * scale)),
      tileH: Math.max(1, Math.floor(size.h * scale)),
    };
  }

  /* =========================================
   5.5) Modal d'aperçu d'image avec effet FLIP
  ========================================= */
  function openImageModal(data, modalLayer, app, sourceSprite) {
    // Nettoyer la modal existante si elle existe
    modalLayer.removeChildren();

    const viewportW = app.screen.width;
    const viewportH = app.screen.height;

    // Créer un fond semi-transparent
    const overlay = new Sprite(Texture.WHITE);
    overlay.width = viewportW;
    overlay.height = viewportH;
    overlay.tint = 0xffffff;
    overlay.alpha = 0;
    overlay.eventMode = 'static';
    overlay.cursor = 'default';
    modalLayer.addChild(overlay);

    // Créer le sprite de l'image en grand
    const tex = Texture.from(data.src);
    const modalSprite = new Sprite(tex);
    modalSprite.anchor.set(0.5);

    // Position finale (centre)
    const targetX = viewportW / 2;
    const targetY = viewportH / 2;

    // Calculer l'échelle finale pour que l'image prenne max 80% du viewport
    const maxW = viewportW * 0.8;
    const maxH = viewportH * 0.8;
    const scaleX = maxW / tex.width;
    const scaleY = maxH / tex.height;
    const targetScale = Math.min(scaleX, scaleY, 1);

    // FLIP: Commencer à la position et échelle du sprite source
    if (sourceSprite) {
      // Obtenir la position globale du sprite source
      const globalPos = sourceSprite.getGlobalPosition();
      modalSprite.x = globalPos.x;
      modalSprite.y = globalPos.y;
      modalSprite.scale.set(sourceSprite.scale.x);
      modalSprite.alpha = 1;
    } else {
      // Fallback: commencer petit au centre
      modalSprite.x = targetX;
      modalSprite.y = targetY;
      modalSprite.scale.set(0.5);
      modalSprite.alpha = 0;
    }

    modalLayer.addChild(modalSprite);

    // Cacher le sprite original pendant l'animation
    if (sourceSprite) {
      gsap.set(sourceSprite, { alpha: 0 });
    }

    // Animer l'apparition du fond
    gsap.to(overlay, { alpha: 0.75, duration: 0.4, ease: 'power2.out' });

    // Animer le sprite vers sa position finale (effet FLIP)
    gsap.to(modalSprite, {
      x: targetX,
      y: targetY,
      duration: 0.6,
      ease: 'power3.out',
    });

    gsap.to(modalSprite.scale, {
      x: targetScale,
      y: targetScale,
      duration: 0.6,
      ease: 'power3.out',
    });

    // Animer l'opacité seulement si on part du fallback
    if (!sourceSprite) {
      gsap.to(modalSprite, {
        alpha: 1,
        duration: 0.4,
        ease: 'power2.out',
      });
    }

    // Fermer la modal au clic sur le fond
    overlay.on('pointerdown', () => closeModal());
    modalSprite.eventMode = 'static';
    modalSprite.cursor = 'pointer';
    modalSprite.on('pointerdown', () => closeModal());

    function closeModal() {
      // Animer la disparition du fond
      gsap.to(overlay, { alpha: 0, duration: 0.4, ease: 'power2.in' });

      // Animer le retour vers la position d'origine (effet FLIP inversé)
      if (sourceSprite) {
        const globalPos = sourceSprite.getGlobalPosition();

        gsap.to(modalSprite, {
          x: globalPos.x,
          y: globalPos.y,
          duration: 0.5,
          ease: 'power3.in',
        });

        gsap.to(modalSprite.scale, {
          x: sourceSprite.scale.x,
          y: sourceSprite.scale.y,
          duration: 0.5,
          ease: 'power3.in',
          onComplete: () => {
            // Réafficher le sprite original
            gsap.set(sourceSprite, { alpha: 1 });
            modalLayer.removeChildren();
          },
        });
      } else {
        // Fallback: rétrécir au centre
        gsap.to(modalSprite, {
          alpha: 0,
          duration: 0.3,
          ease: 'power2.in',
        });

        gsap.to(modalSprite.scale, {
          x: 0.5,
          y: 0.5,
          duration: 0.3,
          ease: 'power2.in',
          onComplete: () => {
            modalLayer.removeChildren();
          },
        });
      }
    }
  }

  /* =========================================
   6) Construire les items (sprites + positions logiques)
      - placement en grille/spirale/random au choix.
      - ici: grille avec répétition pour remplir l'espace
  ========================================= */
  function buildItems(itemsData, world, tileW, tileH, modalLayer, app) {
    const originalCount = itemsData.length || 1;

    // Calculer combien d'éléments on veut pour bien remplir (densité cible)
    // On vise environ 1 élément tous les 500px² (ajustez selon vos besoins)
    // Petits espacements → forte densité d'éléments (300-400)
    // Grands espacements → faible densité d'éléments (600-800)
    const targetDensity = 400;
    const tileArea = tileW * tileH;
    const minItemsNeeded = Math.max(
      originalCount,
      Math.ceil(tileArea / (targetDensity * targetDensity))
    );

    // Répéter les éléments CMS pour atteindre le nombre cible
    const repeatedData = [];
    for (let i = 0; i < minItemsNeeded; i++) {
      repeatedData.push(itemsData[i % originalCount]);
    }

    const count = repeatedData.length;

    // Calculer cols et rows en fonction du ratio de la tuile
    // pour une meilleure distribution verticale
    const tileRatio = tileW / tileH;
    const cols = Math.ceil(Math.sqrt(count * tileRatio));
    const rows = Math.ceil(count / cols);

    // Taille des cellules (zones de base pour chaque élément)
    const cellW = tileW / cols;
    const cellH = tileH / rows;

    // Facteur de randomisation (0.5 = 50% de la cellule peut être randomisé)
    const randomFactor = 0.6;

    return repeatedData.map((data, i) => {
      const tex = Texture.from(data.src);
      const sp = new Sprite(tex);
      sp.anchor.set(0.5);
      // Activer les interactions pour rendre les sprites cliquables
      sp.eventMode = 'static';
      sp.cursor = 'pointer';

      // Variables pour détecter un clic vs un drag
      let pressTime = 0;
      let hasMoved = false;

      sp.on('pointerdown', (event) => {
        event.stopPropagation();
        pressTime = Date.now();
        hasMoved = false;
      });

      sp.on('pointermove', () => {
        // Si on bouge pendant le press, c'est un drag
        if (pressTime > 0) {
          hasMoved = true;
        }
      });

      sp.on('pointerup', (event) => {
        event.stopPropagation();
        const clickDuration = Date.now() - pressTime;

        // Ouvrir la modal seulement si c'est un vrai clic (pas de mouvement, durée courte)
        if (!hasMoved && clickDuration < 200) {
          openImageModal(data, modalLayer, app, sp); // Passer le sprite comme source pour l'effet FLIP
        }

        pressTime = 0;
        hasMoved = false;
      });

      world.addChild(sp);

      const gx = i % cols;
      const gy = Math.floor(i / cols);

      // Position de base (centre de la cellule)
      const baseCellX = cellW * gx + cellW / 2;
      const baseCellY = cellH * gy + cellH / 2;

      // Ajouter une variation aléatoire dans la cellule
      const offsetX = (Math.random() - 0.5) * cellW * randomFactor;
      const offsetY = (Math.random() - 0.5) * cellH * randomFactor;

      // Position logique finale (dans [0, tileW) × [0, tileH))
      const logicalX = baseCellX + offsetX;
      const logicalY = baseCellY + offsetY;

      // Facteur de parallax (distribué de min → max)
      const factor = clamp(
        data.factor ?? remap(i, 0, count - 1, CONFIG.PARALLAX_MIN, CONFIG.PARALLAX_MAX),
        CONFIG.PARALLAX_MIN,
        CONFIG.PARALLAX_MAX
      );

      // Taille (optionnelle) : tu peux également scaler le sprite
      if (data.w && data.h) {
        const sx = data.w / tex.width;
        const sy = data.h / tex.height;
        sp.scale.set(Math.min(sx, sy));
      } else {
        // Limiter la taille maximale par défaut (ajustez ces valeurs selon vos besoins)
        const maxWidth = 400; // largeur max en pixels
        const maxHeight = 400; // hauteur max en pixels
        const sx = maxWidth / tex.width;
        const sy = maxHeight / tex.height;
        sp.scale.set(Math.min(sx, sy, 1)); // Ne jamais agrandir (min avec 1)
      }

      // Sauvegarder le scale initial pour ne pas le perdre dans updateItemsPositions
      const baseScale = sp.scale.x;

      return {
        sprite: sp,
        logicalX,
        logicalY,
        factor,
        baseScale, // Sauvegarder l'échelle de base
      };
    });
  }

  /* =========================================
   7) Mettre à jour les positions visibles (par frame)
      - parallax = offset pondéré par factor
      - wrap (modulo) pour l'infini 2D
      - petit "feel" optionnel: tilt/scale selon la vitesse
  ========================================= */
  function updateItemsPositions(items, state, tileW, tileH) {
    const speed = Math.hypot(state.vel.x, state.vel.y);
    const k = Math.min(1, speed / 40); // 0..1 pour doser le feel

    for (const it of items) {
      const ox = state.offset.x * it.factor;
      const oy = state.offset.y * it.factor;

      const x = wrap(it.logicalX - ox, tileW);
      const y = wrap(it.logicalY - oy, tileH);

      it.sprite.x = x;
      it.sprite.y = y;

      // Feel optionnel (très subtil pour rester chic)
      // Rotation retirée pour un effet plus épuré
      const s = 1 + 0.02 * k * (1 - it.factor);
      // Appliquer le facteur de "feel" tout en gardant l'échelle de base
      it.sprite.scale.set(it.baseScale * s);
    }
  }

  /* =========================================
   8) Tracker invisible + Draggable sur canvas
      - Le canvas est draggable, mais on track les valeurs dans un élément invisible
      - Cela permet de garder les sprites cliquables
  ========================================= */
  function createTracker() {
    // Créer un élément invisible en dehors du viewport pour tracker les valeurs
    const tracker = document.createElement('div');
    Object.assign(tracker.style, {
      position: 'fixed',
      top: '-9999px',
      left: '-9999px',
      width: '1px',
      height: '1px',
      pointerEvents: 'none',
    });
    document.body.appendChild(tracker);
    return tracker;
  }

  function initDraggable(canvas, tracker, { onDelta, onPress, onRelease }) {
    // Configurer le style du canvas pour le drag
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none';

    let last = { x: 0, y: 0 };
    const d = Draggable.create(tracker, {
      type: 'x,y',
      trigger: canvas, // Le canvas déclenche le drag
      // target: tracker implicitement (l'élément qu'on drag)
      inertia: !CONFIG.REDUCED_MOTION,
      dragResistance: 0,
      edgeResistance: 0,
      throwResistance: 0,
      onPress() {
        // Au début de chaque press, on reset
        last.x = 0;
        last.y = 0;
        canvas.style.cursor = 'grabbing';
        // Appeler le callback onPress externe
        onPress?.();
      },
      onDrag() {
        const dx = this.x - last.x;
        const dy = this.y - last.y;
        onDelta?.(dx, dy);
        last.x = this.x;
        last.y = this.y;
      },
      onThrowUpdate() {
        const dx = this.x - last.x;
        const dy = this.y - last.y;
        onDelta?.(dx, dy);
        last.x = this.x;
        last.y = this.y;
      },
      onThrowComplete() {
        // Réinitialiser après l'inertie
        gsap.set(tracker, { x: 0, y: 0 });
        last.x = 0;
        last.y = 0;
      },
      onRelease() {
        canvas.style.cursor = 'grab';
        onRelease?.();
        // Si pas d'inertie, on réinitialise immédiatement
        if (CONFIG.REDUCED_MOTION || !this.tween) {
          gsap.set(tracker, { x: 0, y: 0 });
          last.x = 0;
          last.y = 0;
        }
      },
    })[0];

    // Utilitaire pratique
    Object.defineProperty(d, 'isDragging', { get: () => d.isPressed || d.isThrowing });
    return d;
  }

  /* =========================================
   9) Petits helpers numériques
  ========================================= */
  function safeParseJSON(str) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function remap(v, a1, a2, b1, b2) {
    if (a1 === a2) return b1;
    return b1 + (b2 - b1) * ((v - a1) / (a2 - a1));
  }
});
