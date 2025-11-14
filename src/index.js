/* =========================================
   0) Imports & Plugin setup
========================================= */
import { Application, Assets, Container, Sprite, Texture } from 'pixi.js';
import { GifSprite } from 'pixi.js/gif';
import { BulgePinchFilter, DropShadowFilter } from 'pixi-filters';

window.Webflow ||= [];
window.Webflow.push(() => {
  /* =========================================
   1) Quelques utilitaires
  ========================================= */
  // Modulo positif (wrap) pour boucler proprement
  const wrap = (u, period) => ((u % period) + period) % period;

  // Détection du mobile/tablette
  const isMobile = () => window.innerWidth < 768;
  const isTablet = () => window.innerWidth >= 768 && window.innerWidth < 1024;

  // Calculer les tailles max responsives pour les images
  const getResponsiveImageSize = () => {
    if (isMobile()) {
      return { maxWidth: 250, maxHeight: 250 }; // Plus petit sur mobile
    }
    if (isTablet()) {
      return { maxWidth: 300, maxHeight: 300 }; // Taille intermédiaire tablette
    }
    return { maxWidth: 400, maxHeight: 400 }; // Taille desktop
  };

  // Calculer la densité cible selon la taille d'écran
  const getTargetDensity = () => {
    if (isMobile()) {
      return 700; // Moins dense sur mobile (moins d'éléments)
    }
    if (isTablet()) {
      return 600; // Densité intermédiaire
    }
    return 500; // Plus dense sur desktop
  };

  // Calculer le rayon responsive du filtre bulge
  const getBulgeRadius = (viewportW, viewportH) => {
    const maxDimension = Math.max(viewportW, viewportH);
    if (isMobile()) {
      return maxDimension * 0.7; // Rayon plus petit sur mobile (70%)
    }
    if (isTablet()) {
      return maxDimension * 0.8; // Rayon intermédiaire tablette (80%)
    }
    return maxDimension * 0.9; // Rayon plus grand desktop (90%)
  };

  // Calculer la taille max responsive du bouton de lien
  const getLinkButtonMaxWidth = () => {
    if (isMobile()) {
      return 140; // Plus petit sur mobile
    }
    if (isTablet()) {
      return 150; // Taille intermédiaire tablette
    }
    return 166; // Taille desktop
  };

  // Calculer le pourcentage de taille de l'image dans la modal
  const getModalImageSize = () => {
    if (isMobile()) {
      return 0.85; // 85% sur mobile pour optimiser l'espace
    }
    if (isTablet()) {
      return 0.75; // 75% sur tablette
    }
    return 0.7; // 70% sur desktop
  };

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
    if (!root) return console.warn('Pas de .infinite_page_wrap sur la page.');

    const itemsData = gsap.utils.toArray('.infinite_page_image');

    // Flag pour savoir si l'animation d'intro est terminée
    let introComplete = false;

    // 3.1 Créer l'app Pixi (canvas) et la "scène monde"
    const { app, world, bulgePinchFilter, size } = await initPixi(root);

    // 3.1.5 Créer un layer pour la modal (au-dessus de tout)
    const modalLayer = new Container();
    app.stage.addChild(modalLayer);

    // 3.2 Définir la tuile logique (taille "infinie" qui boucle)
    let { tileW, tileH } = computeTile(size, CONFIG.TILE_SCALE);

    // 3.3 Charger textures & construire les "items" (sprites + positions logiques)
    const buttonImageUrl =
      'https://cdn.prod.website-files.com/68f63039024ee46f705d5004/6916fbba326a4123b4082cea_btn-ressource.svg';
    await Assets.load([...itemsData.map((i) => i.src), buttonImageUrl]);
    const items = buildItems(itemsData, world, tileW, tileH, modalLayer, app);

    // 3.4 État "caméra" (offset) + vitesse (servira à l’inertie)
    const state = {
      offset: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
    };

    // 3.5 Créer le tracker invisible (en dehors) + Draggable sur le canvas
    const tracker = createTracker();

    let filterTimeout = null;

    const drag = initDraggable(app.canvas, tracker, {
      onDelta(dx, dy) {
        // Ne rien faire si l'intro n'est pas terminée
        if (!introComplete) return;

        // On déplace la "caméra" en sens inverse du geste
        state.offset.x -= dx;
        state.offset.y -= dy;
        // Mémo vitesse instantanée (utile pour effets)
        state.vel.x = -dx;
        state.vel.y = -dy;

        // Marquer qu'on est en train de drag
      },
      onPress() {
        // Ne rien faire si l'intro n'est pas terminée
        if (!introComplete) return;
        // Activer le filtre après un court délai (150ms) pour éviter les clics rapides sur les images
        filterTimeout = setTimeout(() => {
          gsap.to(bulgePinchFilter, {
            strength: 0.25,
            duration: 0.4,
            ease: 'cubic.out',
          });
        }, 150);
      },
      onRelease() {
        // Annuler le timeout si le clic est relâché avant le délai
        if (filterTimeout) {
          clearTimeout(filterTimeout);
          filterTimeout = null;
        }
        // Réinitialiser le filtre au release
        gsap.to(bulgePinchFilter, {
          strength: 0,
          duration: 0.4,
          ease: 'cubic.out',
        });
      },
    });

    // 3.6 Lancer l'animation d'intro
    await playIntroAnimation(items, app, () => {
      introComplete = true;
    });

    // 3.7 Boucle Pixi: mettre à jour positions visibles à chaque frame
    app.ticker.add(() => {
      // Ne pas bouger pendant l'intro
      if (!introComplete) return;

      // Inertie (si on n'est pas en drag, Draggable anime le proxy : onThrowUpdate
      // continue d'appeler onDelta → vel est déjà mis à jour)
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

    // 3.8 Responsive: recalculer tailles et reposer les items
    let resizeTimeout;
    window.addEventListener('resize', () => {
      // Debounce pour éviter trop d'appels
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const newSize = { w: window.innerWidth, h: window.innerHeight };
        app.renderer.resize(newSize.w, newSize.h);
        const t = computeTile(newSize, CONFIG.TILE_SCALE);
        tileW = t.tileW;
        tileH = t.tileH;
        // Recentrer le world lors du resize
        world.x = -newSize.w / 2;
        world.y = -newSize.h / 2;

        // Mettre à jour le rayon du filtre bulge de manière responsive
        bulgePinchFilter.radius = getBulgeRadius(newSize.w, newSize.h);

        // Recalculer les tailles des sprites en fonction de la nouvelle taille d'écran
        const responsiveSizes = getResponsiveImageSize();
        items.forEach((item) => {
          const tex = item.sprite.texture;
          const sx = responsiveSizes.maxWidth / tex.width;
          const sy = responsiveSizes.maxHeight / tex.height;
          const newScale = Math.min(sx, sy, 1);
          item.baseScale = newScale;
          item.sprite.scale.set(newScale);
        });
      }, 150);
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
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      width: viewportW,
      height: viewportH,
      // Ne pas utiliser resizeTo pour éviter que le canvas prenne la hauteur du conteneur
    });
    rootEl.appendChild(app.canvas);

    const world = new Container();
    app.stage.addChild(world);

    // Calculer le rayon responsive du filtre bulge
    const radius = getBulgeRadius(viewportW, viewportH);

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
   5) Animation d'intro type Davide Baratta
  ========================================= */
  async function playIntroAnimation(items, app, onComplete) {
    const viewportW = app.screen.width;
    const viewportH = app.screen.height;
    // Tenir compte du décalage du world pour centrer sur la page
    const centerX = viewportW / 2 + Math.abs(app.stage.children[0].x);
    const centerY = viewportH / 2 + Math.abs(app.stage.children[0].y);

    // Phase 1: Apparition des images au centre une par une
    const slideDuration = CONFIG.REDUCED_MOTION ? 0.3 : 1;
    const slideDistance = 30; // Distance du slide en pixels

    // Taille max pour l'intro (90% du viewport)
    const maxIntroW = viewportW * 0.9;
    const maxIntroH = viewportH * 0.9;

    // Timeline pour l'apparition
    const appearTimeline = gsap.timeline();

    items.forEach((item, i) => {
      const sp = item.sprite;

      // Calculer l'échelle pour l'intro (90% du viewport max)
      const tex = sp.texture;
      const scaleXIntro = maxIntroW / tex.width;
      const scaleYIntro = maxIntroH / tex.height;
      const introScale = Math.min(scaleXIntro, scaleYIntro, item.baseScale);

      // Appliquer l'échelle d'intro
      sp.scale.set(introScale);

      // Direction aléatoire pour l'arrivée (haut, bas, gauche, droite)
      const directions = [
        { x: 0, y: slideDistance }, // bas
        { x: 0, y: -slideDistance }, // haut
        { x: slideDistance, y: 0 }, // droite
        { x: -slideDistance, y: 0 }, // gauche
      ];
      const randomDir = directions[Math.floor(Math.random() * directions.length)];

      // Position initiale: centre avec offset aléatoire
      sp.x = centerX + randomDir.x;
      sp.y = centerY + randomDir.y;
      sp.alpha = 0;

      // Désactiver les interactions pendant l'intro
      sp.eventMode = 'none';

      // Animer vers le centre avec fondu
      appearTimeline.to(
        sp,
        {
          x: centerX,
          y: centerY,
          alpha: 1,
          duration: slideDuration,
          ease: 'power2.out',
        },
        i * (CONFIG.REDUCED_MOTION ? 0.02 : 0.15)
      );

      // Sauvegarder l'échelle d'intro pour la phase de dispersion
      item.introScale = introScale;
    });

    // Attendre la fin de la phase d'apparition
    await appearTimeline.then();

    // Petite pause avant la dispersion
    await new Promise((resolve) => setTimeout(resolve, CONFIG.REDUCED_MOTION ? 100 : 300));

    // Phase 2: Dispersion vers les positions finales
    const disperseTimeline = gsap.timeline();
    const disperseDuration = CONFIG.REDUCED_MOTION ? 0.5 : 0.8;

    items.forEach((item, i) => {
      const sp = item.sprite;
      const targetX = item.logicalX;
      const targetY = item.logicalY;

      // Animer vers la position finale + retour à l'échelle normale
      disperseTimeline.to(
        sp,
        {
          x: targetX,
          y: targetY,
          duration: disperseDuration,
          ease: 'power3.inOut',
        },
        i * (CONFIG.REDUCED_MOTION ? 0.02 : 0.1)
      );

      // Animer le scale en parallèle pour revenir à la taille normale
      disperseTimeline.to(
        sp.scale,
        {
          x: item.baseScale,
          y: item.baseScale,
          duration: disperseDuration,
          ease: 'power3.inOut',
        },
        i * (CONFIG.REDUCED_MOTION ? 0.02 : 0.1)
      );
    });

    // Attendre la fin de la dispersion
    await disperseTimeline.then();

    // Réactiver les interactions
    items.forEach((item) => {
      item.sprite.eventMode = 'static';
    });

    // Notifier que l'intro est terminée
    onComplete();
  }

  /* =========================================
   6) Calcul de la "tuile" (espace logique)
  ========================================= */
  function computeTile(size, scale) {
    return {
      tileW: Math.max(1, Math.floor(size.w * scale)),
      tileH: Math.max(1, Math.floor(size.h * scale)),
    };
  }

  /* =========================================
   7) Modal d'aperçu d'image avec effet FLIP
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
    const isGif = data.src.toLowerCase().endsWith('.gif');
    const modalSprite = isGif
      ? new GifSprite({
          source: tex,
          autoplay: true,
          loop: true,
        })
      : new Sprite(tex);
    modalSprite.anchor.set(0.5);

    // Position finale (centre)
    const targetX = viewportW / 2;
    const targetY = viewportH / 2;

    // Calculer l'échelle finale pour que l'image prenne un pourcentage responsive du viewport
    const modalSizePercent = getModalImageSize();
    const maxW = viewportW * modalSizePercent;
    const maxH = viewportH * modalSizePercent;
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
    modalSprite.zIndex = 1;

    // Créer l'élément cliquable si un lien ressource existe
    let linkButton = null;
    const ressourceLink = data.getAttribute('ressource-link');
    if (ressourceLink) {
      // Récupérer la texture préalablement chargée
      const buttonTexture = Assets.get(
        'https://cdn.prod.website-files.com/68f63039024ee46f705d5004/6916fbba326a4123b4082cea_btn-ressource.svg'
      );
      // Améliorer la qualité de rendu du bouton
      if (buttonTexture?.source) {
        buttonTexture.source.scaleMode = 'linear';
      }
      linkButton = new Sprite(buttonTexture);
      linkButton.anchor.set(1, 0); // Ancrer en haut à droite
      linkButton.eventMode = 'static';
      linkButton.cursor = 'pointer';
      linkButton.alpha = 0;
      linkButton.zIndex = 10;

      // Ajouter une ombre portée (box shadow)
      const dropShadow = new DropShadowFilter({
        offset: { x: 0, y: 1 },
        blur: 15,
        alpha: 0.15,
        color: 0x000000,
        quality: 5,
        resolution: window.devicePixelRatio || 1,
      });
      linkButton.filters = [dropShadow];

      // Limiter la largeur selon la taille d'écran
      const maxWidth = getLinkButtonMaxWidth();
      if (linkButton.width > maxWidth) {
        const scale = maxWidth / linkButton.width;
        linkButton.scale.set(scale);
      }

      // Positionner au-dessus de l'image en haut à droite
      const updateLinkButtonPosition = () => {
        const imageRight = modalSprite.x + modalSprite.width / 2;
        const imageTop = modalSprite.y - modalSprite.height / 2;
        linkButton.x = imageRight;
        linkButton.y = imageTop - linkButton.height - 20; // Au-dessus de l'image
      };

      // Positionner initialement
      updateLinkButtonPosition();

      // Ouvrir le lien dans une nouvelle page
      linkButton.on('pointerdown', (event) => {
        event.stopPropagation();
        window.open(ressourceLink, '_blank');
      });

      modalLayer.addChild(linkButton);
    }

    // Activer le tri par zIndex
    modalLayer.sortableChildren = true;

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
      onUpdate: () => {
        // Mettre à jour la position du bouton pendant l'animation
        if (linkButton) {
          const imageRight = modalSprite.x + modalSprite.width / 2;
          const imageTop = modalSprite.y - modalSprite.height / 2;
          linkButton.x = imageRight;
          linkButton.y = imageTop - linkButton.height - 20; // Au-dessus de l'image
        }
      },
    });

    gsap.to(modalSprite.scale, {
      x: targetScale,
      y: targetScale,
      duration: 0.6,
      ease: 'power3.out',
      onUpdate: () => {
        // Mettre à jour la position du bouton pendant le scale
        if (linkButton) {
          const imageRight = modalSprite.x + modalSprite.width / 2;
          const imageTop = modalSprite.y - modalSprite.height / 2;
          linkButton.x = imageRight;
          linkButton.y = imageTop - linkButton.height - 20; // Au-dessus de l'image
        }
      },
    });

    // Animer l'opacité seulement si on part du fallback
    if (!sourceSprite) {
      gsap.to(modalSprite, {
        alpha: 1,
        duration: 0.4,
        ease: 'power2.out',
      });
    }

    // Animer l'apparition du bouton de lien
    if (linkButton) {
      gsap.to(linkButton, {
        alpha: 1,
        duration: 0.4,
        delay: 0.3,
        ease: 'power2.out',
      });
    }

    // Fermer la modal au clic sur le fond
    overlay.on('pointerdown', () => closeModal());
    modalSprite.eventMode = 'static';
    modalSprite.cursor = 'pointer';
    modalSprite.on('pointerdown', () => closeModal());

    function closeModal() {
      // Animer la disparition du bouton de lien
      if (linkButton) {
        gsap.to(linkButton, { alpha: 0, duration: 0.3, ease: 'power2.in' });
      }

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
   8) Construire les items (sprites + positions logiques)
      - placement en grille/spirale/random au choix.
      - ici: grille avec répétition pour remplir l'espace
  ========================================= */
  function buildItems(itemsData, world, tileW, tileH, modalLayer, app) {
    const originalCount = itemsData.length || 1;

    // Calculer combien d'éléments on veut pour bien remplir (densité cible)
    // On vise environ 1 élément tous les 500px² (ajustez selon vos besoins)
    // Petits espacements → forte densité d'éléments (300-400)
    // Grands espacements → faible densité d'éléments (600-800)
    const targetDensity = getTargetDensity(); // Adapté selon la taille d'écran
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
      // Améliorer la qualité de rendu de la texture
      if (tex?.source) {
        tex.source.scaleMode = 'linear';
      }
      // Utiliser GifSprite si c'est un GIF
      const isGif = data.src.toLowerCase().endsWith('.gif');
      const sp = isGif
        ? new GifSprite({
            source: tex,
            autoplay: true,
            loop: true,
          })
        : new Sprite(tex);

      sp.anchor.set(0.5);
      // Activer les interactions pour rendre les sprites cliquables
      sp.eventMode = 'static';
      sp.cursor = 'pointer';

      // Variables pour détecter un clic vs un drag
      let pressTime = 0;
      let pressPosition = { x: 0, y: 0 };
      const dragThreshold = 8; // Distance en pixels pour considérer que c'est un drag

      sp.on('pointerdown', (event) => {
        event.stopPropagation();
        pressTime = Date.now();
        pressPosition.x = event.global.x;
        pressPosition.y = event.global.y;
      });

      sp.on('pointerup', (event) => {
        event.stopPropagation();
        const clickDuration = Date.now() - pressTime;

        // Calculer la distance parcourue
        const dx = event.global.x - pressPosition.x;
        const dy = event.global.y - pressPosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Ouvrir la modal seulement si la distance est inférieure au seuil et la durée courte
        if (distance < dragThreshold && clickDuration < 300) {
          openImageModal(data, modalLayer, app, sp); // Passer le sprite comme source pour l'effet FLIP
        }

        pressTime = 0;
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

      // Taille (optionnelle) : gérer largeur et/ou hauteur via attributes
      // Récupérer les attributs max-width et max-height
      const maxWidthAttr = data.getAttribute('ressource-max-width');
      const maxHeightAttr = data.getAttribute('ressource-max-height');

      // Obtenir les tailles max responsives
      const responsiveSizes = getResponsiveImageSize();

      if (maxWidthAttr || maxHeightAttr) {
        // Au moins un attribut est défini
        if (maxWidthAttr && !maxHeightAttr) {
          // Seulement largeur spécifiée
          const maxW = Math.min(parseFloat(maxWidthAttr), responsiveSizes.maxWidth);
          const scale = maxW / tex.width;
          sp.scale.set(Math.min(scale, 1)); // Ne jamais agrandir
        } else if (maxHeightAttr && !maxWidthAttr) {
          // Seulement hauteur spécifiée
          const maxH = Math.min(parseFloat(maxHeightAttr), responsiveSizes.maxHeight);
          const scale = maxH / tex.height;
          sp.scale.set(Math.min(scale, 1)); // Ne jamais agrandir
        } else {
          // Les deux sont spécifiés : priorité à la largeur avec limite responsive
          const maxW = Math.min(parseFloat(maxWidthAttr), responsiveSizes.maxWidth);
          const scale = maxW / tex.width;
          sp.scale.set(Math.min(scale, 1)); // Ne jamais agrandir
        }
      } else {
        // Limiter la taille maximale par défaut selon la taille d'écran
        const sx = responsiveSizes.maxWidth / tex.width;
        const sy = responsiveSizes.maxHeight / tex.height;
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
   9) Mettre à jour les positions visibles (par frame)
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
   10) Tracker invisible + Draggable sur canvas
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
    Object.defineProperty(d, 'isDragging', {
      get: () => d.isPressed || d.isThrowing,
    });
    return d;
  }

  /* =========================================
   11) Petits helpers numériques
  ========================================= */
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function remap(v, a1, a2, b1, b2) {
    if (a1 === a2) return b1;
    return b1 + (b2 - b1) * ((v - a1) / (a2 - a1));
  }
});
