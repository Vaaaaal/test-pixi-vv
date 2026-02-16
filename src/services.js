/* =========================================
   0) Imports & Plugin setup
========================================= */
import { Application, Assets, Container, Sprite, Texture, TextureStyle } from 'pixi.js';
import { GifSprite } from 'pixi.js/gif';
import { BulgePinchFilter } from 'pixi-filters';

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
      return { maxWidth: 200, maxHeight: 200 }; // Plus petit sur mobile
    }
    if (isTablet()) {
      return { maxWidth: 300, maxHeight: 300 }; // Taille intermédiaire tablette
    }
    return { maxWidth: 400, maxHeight: 400 }; // Taille desktop
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
    return maxDimension * 1; // Rayon plus grand desktop (100%)
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
    FRICTION: 0.92, // inertie (proche de 1 = plus longue)
    NEAR_BORDER: 60, // seuil en px pour gestion des clones (optionnel)
    PARALLAX_MIN: 0.3, // facteur de parallax mini (arrière-plan) - plus bas = plus d'effet
    PARALLAX_MAX: 1.6, // facteur maxi (avant-plan) - plus haut = plus d'effet
    REDUCED_MOTION: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };

  // Responsive tile scale: keep enough whitespace on tiny screens
  const getTileScale = () => {
    if (isMobile()) {
      return 3.5; // agrandir la tuile pour éviter l'effet "mur" sur mobile
    }
    if (isTablet()) {
      return 2.7;
    }
    return 2; // desktop conserve le ratio initial
  };

  /* =========================================
   2.5) Gestion du scroll vertical pour révéler le contenu
  ========================================= */
  function initVerticalScrollReveal() {
    // Fonctionnalité uniquement sur desktop
    if (isMobile() || isTablet()) {
      return;
    }

    const section = document.querySelector('.infinite_section');
    if (!section) {
      console.warn('Pas de .infinite_section trouvée pour le scroll vertical.');
      return;
    }

    // Récupérer les progress bars dans les navigations
    const navTop = document.querySelector('.infinite_navigation.is-top');
    const navBottom = document.querySelector('.infinite_navigation.is-bottom');
    const progressBarTop = navTop?.querySelector('.infinite_progress_bar');
    const progressBarBottom = navBottom?.querySelector('.infinite_progress_bar');

    // Position Y actuelle de la section (en pourcentage du viewport)
    // 0 = position initiale, -50 = montée max, +50 = descente max
    let currentY = 0;
    const maxOffset = 50; // ±50vh
    const baseScrollSensitivity = 0.05; // Sensibilité de base réduite
    const resistanceCap = 0.92; // Plafonner la résistance à 92% du parcours

    // Fonction pour calculer la résistance progressive
    // Retourne un facteur entre 0 et 1 (1 = facile, 0 = très dur)
    const getResistanceFactor = (position) => {
      const progress = Math.abs(position) / maxOffset; // 0 à 1

      // Plafonner la résistance au-delà du seuil pour permettre d'atteindre la limite
      const cappedProgress = Math.min(progress, resistanceCap);

      // Courbe linéaire : résistance plus perceptible dès le début
      return Math.pow(1 - cappedProgress, 1.75); // Ajuster l'exposant pour plus ou moins de résistance
    };

    // Fonction pour mettre à jour la box-shadow en fonction de la position
    const updateShadow = (position) => {
      const progress = Math.abs(position) / maxOffset; // 0 à 1
      const maxBlur = 60; // Blur maximum en pixels
      const maxSpread = 0; // Spread en pixels
      const maxOpacity = 0.3; // Opacité maximale de la shadow

      // Calculer les valeurs de la shadow
      const blur = progress * maxBlur;
      const opacity = progress * maxOpacity;

      // Direction de la shadow selon la position
      if (position < 0) {
        // Section monte → shadow en dessous (offsetY positif)
        const offsetY = 10;
        section.style.boxShadow = `0px ${offsetY}px ${blur}px ${maxSpread}px rgba(0, 0, 0, ${opacity})`;
      } else if (position > 0) {
        // Section descend → shadow au-dessus (offsetY négatif)
        const offsetY = -10;
        section.style.boxShadow = `0px ${offsetY}px ${blur}px ${maxSpread}px rgba(0, 0, 0, ${opacity})`;
      } else {
        // Position initiale → pas de shadow
        section.style.boxShadow = 'none';
      }
    };

    // Fonction pour mettre à jour les progress bars en fonction de la position
    const updateProgressBar = (position) => {
      // Calculer le progrès jusqu'au resistanceCap (0 à 1)
      const absPosition = Math.abs(position);
      const maxProgressDistance = maxOffset; // Distance maximale pour la progress (50vh)
      const progress = Math.min(absPosition / maxProgressDistance, 1); // Clamper à 1
      const progressPercent = progress * 100;

      if (position < 0) {
        // Section monte → montrer progression dans la nav bottom
        if (progressBarBottom) {
          progressBarBottom.style.width = `${progressPercent}%`;
        }
        // Réinitialiser la progress bar du top
        if (progressBarTop) {
          progressBarTop.style.width = '0%';
        }
      } else if (position > 0) {
        // Section descend → montrer progression dans la nav top
        if (progressBarTop) {
          progressBarTop.style.width = `${progressPercent}%`;
        }
        // Réinitialiser la progress bar du bottom
        if (progressBarBottom) {
          progressBarBottom.style.width = '0%';
        }
      } else {
        // Position initiale → réinitialiser les deux
        if (progressBarTop) {
          progressBarTop.style.width = '0%';
        }
        if (progressBarBottom) {
          progressBarBottom.style.width = '0%';
        }
      }
    };

    // Initialiser la position
    gsap.set(section, { y: '0vh' });
    section.style.boxShadow = 'none';
    section.style.pointerEvents = 'auto';

    // Initialiser les progress bars à 0
    updateProgressBar(0);

    // Empêcher l'apparition de la scrollbar native du navigateur
    // qui créerait un décalage lors du mouvement de la section
    document.body.style.overflowY = 'hidden';
    document.documentElement.style.overflowY = 'hidden';

    // Timer d'inactivité pour retour automatique au centre
    let inactivityTimer = null;
    // Flag pour bloquer le scroll pendant l'animation de snap
    let isSnapping = false;
    // Timer pour débloquer le scroll après un moment de calme
    let unlockScrollTimer = null;

    // Fonction pour animer vers le centre
    const snapToCenter = () => {
      // Bloquer le scroll pendant l'animation et après
      isSnapping = true;

      // Annuler le timer de déblocage précédent s'il existe
      if (unlockScrollTimer) {
        clearTimeout(unlockScrollTimer);
        unlockScrollTimer = null;
      }

      // Animer currentY vers 0
      const currentYProxy = { value: currentY };
      gsap.to(currentYProxy, {
        value: 0,
        duration: 1,
        ease: 'power2.inOut',
        onUpdate: function () {
          currentY = currentYProxy.value;
          updateProgressBar(currentY);
          updateShadow(currentY);
        },
        onComplete: () => {
          // Forcer currentY à exactement 0 et tuer toute animation résiduelle
          currentY = 0;
          updateProgressBar(0);
          updateShadow(0);
          gsap.killTweensOf(currentYProxy);

          // Réactiver les pointer events quand on est au centre
          section.style.pointerEvents = 'auto';

          // Attendre un délai supplémentaire pour absorber l'inertie résiduelle
          unlockScrollTimer = setTimeout(() => {
            isSnapping = false;
          }, 500); // 500ms après la fin de l'animation
        },
      });

      gsap.to(section, {
        y: '0vh',
        duration: 1,
        ease: 'power2.inOut',
        overwrite: 'auto',
      });
    };

    // Fonction pour réinitialiser le timer d'inactivité
    const resetInactivityTimer = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
      }

      // Ne démarrer le timer que si on n'est pas au centre
      if (Math.abs(currentY) > 0.1) {
        inactivityTimer = setTimeout(() => {
          snapToCenter();
        }, 5000); // 5 secondes
      }
    };

    // Créer l'Observer GSAP pour détecter le scroll
    Observer.create({
      type: 'wheel,touch',
      wheelSpeed: -1,
      onUp() {
        // Bloquer le scroll si une animation de snap est en cours
        if (isSnapping) return;

        // Réinitialiser le timer d'inactivité
        resetInactivityTimer();

        // Si on est en position positive (bas) et qu'on scroll vers le haut → snap au centre
        if (currentY > 0) {
          snapToCenter();
          return;
        }

        // Scroll vers le haut → section monte (y diminue)
        // Appliquer la résistance seulement si on s'éloigne du centre (currentY < 0)
        let adjustedSensitivity;
        if (currentY < 0) {
          // On s'éloigne du centre vers le négatif → appliquer résistance
          const resistance = getResistanceFactor(currentY);
          adjustedSensitivity = baseScrollSensitivity * resistance;
        } else {
          // On revient vers le centre → pas de résistance
          adjustedSensitivity = baseScrollSensitivity;
        }

        currentY -= 100 * adjustedSensitivity;
        currentY = Math.max(-maxOffset, currentY);

        // Désactiver les pointer events (on n'est plus au centre)
        section.style.pointerEvents = 'none';

        // Mettre à jour la progress bar
        updateProgressBar(currentY);

        // Mettre à jour la shadow
        updateShadow(currentY);

        gsap.to(section, {
          y: `${currentY}vh`,
          duration: 0.6,
          ease: 'power2.out',
          overwrite: 'auto',
        });
      },
      onDown() {
        // Bloquer le scroll si une animation de snap est en cours
        if (isSnapping) return;

        // Réinitialiser le timer d'inactivité
        resetInactivityTimer();

        // Si on est en position négative (haut) et qu'on scroll vers le bas → snap au centre
        if (currentY < 0) {
          snapToCenter();
          return;
        }

        // Scroll vers le bas → section descend (y augmente)
        // Appliquer la résistance seulement si on s'éloigne du centre (currentY > 0)
        let adjustedSensitivity;
        if (currentY > 0) {
          // On s'éloigne du centre vers le positif → appliquer résistance
          const resistance = getResistanceFactor(currentY);
          adjustedSensitivity = baseScrollSensitivity * resistance;
        } else {
          // On revient vers le centre → pas de résistance
          adjustedSensitivity = baseScrollSensitivity;
        }

        currentY += 100 * adjustedSensitivity;
        currentY = Math.min(maxOffset, currentY);

        // Désactiver les pointer events (on n'est plus au centre)
        section.style.pointerEvents = 'none';

        // Mettre à jour la progress bar
        updateProgressBar(currentY);

        // Mettre à jour la shadow
        updateShadow(currentY);

        gsap.to(section, {
          y: `${currentY}vh`,
          duration: 0.6,
          ease: 'power2.out',
          overwrite: 'auto',
        });
      },
    });
  }

  /* =========================================
   3) Point d'entrée : lancer l'expérience
  ========================================= */
  (async function main() {
    // Récupère le conteneur & les données CMS (via data-attributes)
    const root = document.querySelector('.infinite_page_wrap');
    if (!root) return console.warn('Pas de .infinite_page_wrap sur la page.');

    const itemsData = gsap.utils.toArray('.infinite_page_image');

    // Initialiser le scroll vertical pour révéler le contenu caché
    initVerticalScrollReveal();

    // Flag pour savoir si l'animation d'intro est terminée
    let introComplete = false;

    // Test nearest instead of linear
    TextureStyle.defaultOptions.scaleMode = 'nearest';

    // 3.1 Créer l'app Pixi (canvas) et la "scène monde"
    const { app, world, bulgePinchFilter, size } = await initPixi(root);

    // 3.1.5 Créer un layer pour la modal (au-dessus de tout)
    const modalLayer = new Container();
    app.stage.addChild(modalLayer);

    // 3.2 Définir la tuile logique (taille "infinie" qui boucle)
    let tileScale = getTileScale();
    let { tileW, tileH } = computeTile(size, tileScale);

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
    await playIntroAnimation(items, app, tileW, tileH, () => {
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
        tileScale = getTileScale();
        const t = computeTile(newSize, tileScale);
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
      backgroundAlpha: 1,
      background: '#fff',
      width: viewportW,
      height: viewportH,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
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
  async function playIntroAnimation(items, app, tileW, tileH, onComplete) {
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

      // // Direction aléatoire pour l'arrivée (haut, bas, gauche, droite)
      // const directions = [
      //   { x: 0, y: slideDistance }, // bas
      //   { x: 0, y: -slideDistance }, // haut
      //   { x: slideDistance, y: 0 }, // droite
      //   { x: -slideDistance, y: 0 }, // gauche
      // ];
      // const randomDir = directions[Math.floor(Math.random() * directions.length)];

      // // Position initiale: centre avec offset aléatoire
      // sp.x = centerX + randomDir.x;
      // sp.y = centerY + randomDir.y;
      // sp.alpha = 0;

      // Désactiver les interactions pendant l'intro
      sp.eventMode = 'none';

      // // Animer vers le centre avec fondu
      // appearTimeline.to(
      //   sp,
      //   {
      //     x: centerX,
      //     y: centerY,
      //     alpha: 1,
      //     duration: slideDuration,
      //     ease: 'power2.out',
      //   },
      //   i * (CONFIG.REDUCED_MOTION ? 0.02 : 0.15)
      // );

      // Position initiale: centre avec offset aléatoire
      sp.x = centerX;
      sp.y = centerY + slideDistance;
      sp.alpha = 0;

      // Animer vers le centre avec fondu
      appearTimeline.to(
        sp,
        {
          y: centerY,
          alpha: 1,
          duration: slideDuration,
          ease: 'power2.out',
        },
        i * 0
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
      // Calculer la position finale avec les randomOffsets (comme dans updateItemsPositions)
      // state.offset est à 0,0 au début donc on peut simplifier
      const targetX = wrap(item.logicalX + item.randomOffsetX, tileW);
      const targetY = wrap(item.logicalY + item.randomOffsetY, tileH);

      // Animer vers la position finale + retour à l'échelle normale
      disperseTimeline.to(
        sp,
        {
          x: targetX,
          y: targetY,
          duration: disperseDuration,
          ease: 'power3.inOut',
        },
        // i * (CONFIG.REDUCED_MOTION ? 0.02 : 0.1)
        i * 0
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
        // i * (CONFIG.REDUCED_MOTION ? 0.02 : 0.1)
        i * 0
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
  function openImageModal(data, modalLayer, app, sourceSprite, originalWidth, originalHeight) {
    // Nettoyer la modal existante si elle existe
    modalLayer.removeChildren();

    // Nettoyer les images HTML modales existantes
    const existingModalImages = document.querySelectorAll('.pixi-modal-image');
    existingModalImages.forEach((img) => img.remove());

    gsap.to('.service_title_component', { opacity: 0, duration: 0.3, ease: 'power2.out' });

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

    // Créer une vraie image HTML au lieu d'un sprite PixiJS pour éviter la pixelisation
    const modalImage = document.createElement('img');
    modalImage.src = data.src;
    modalImage.className = 'pixi-modal-image';
    modalImage.style.position = 'fixed';
    modalImage.style.zIndex = '998'; // Au-dessus de tout sauf du bouton
    modalImage.style.cursor = 'pointer';
    modalImage.style.pointerEvents = 'auto';
    modalImage.style.objectFit = 'contain';
    modalImage.style.userSelect = 'none';
    document.body.appendChild(modalImage);

    // Obtenir la texture pour les dimensions
    const tex = Texture.from(data.src);

    // Position finale (centre du viewport)
    const canvasRect = app.canvas.getBoundingClientRect();
    const targetCenterX = canvasRect.left + viewportW / 2;
    const targetCenterY = canvasRect.top + viewportH / 2;

    // Calculer les dimensions finales
    const modalSizePercent = getModalImageSize();
    const maxW = Math.min(viewportW * modalSizePercent, originalWidth || tex.width);
    const maxH = Math.min(viewportH * modalSizePercent, originalHeight || tex.height);
    const scaleX = maxW / (originalWidth || tex.width);
    const scaleY = maxH / (originalHeight || tex.height);
    const targetScale = Math.min(scaleX, scaleY, 1);

    const targetWidth = (originalWidth || tex.width) * targetScale;
    const targetHeight = (originalHeight || tex.height) * targetScale;

    // Position initiale basée sur le sprite source
    let startX, startY, startWidth, startHeight;

    if (sourceSprite) {
      // Obtenir la position globale du sprite source dans le canvas
      const globalPos = sourceSprite.getGlobalPosition();
      const bounds = sourceSprite.getBounds();

      // Convertir en coordonnées screen
      startX = canvasRect.left + globalPos.x;
      startY = canvasRect.top + globalPos.y;
      startWidth = bounds.width;
      startHeight = bounds.height;

      // Positionner l'image (center anchor)
      modalImage.style.left = `${startX - startWidth / 2}px`;
      modalImage.style.top = `${startY - startHeight / 2}px`;
      modalImage.style.width = `${startWidth}px`;
      modalImage.style.height = `${startHeight}px`;
      modalImage.style.opacity = '1';
    } else {
      // Fallback: commencer petit au centre
      startWidth = targetWidth * 0.5;
      startHeight = targetHeight * 0.5;
      startX = targetCenterX;
      startY = targetCenterY;

      modalImage.style.left = `${startX - startWidth / 2}px`;
      modalImage.style.top = `${startY - startHeight / 2}px`;
      modalImage.style.width = `${startWidth}px`;
      modalImage.style.height = `${startHeight}px`;
      modalImage.style.opacity = '0';
    }

    // Gérer le bouton de lien existant dans le DOM
    const linkButtonEl = document.querySelector('.infinite_link_btn');
    const ressourceLink = data.getAttribute('ressource-link');
    let detachDomButton = null;
    let updateDomButtonPosition = null;
    if (linkButtonEl && ressourceLink) {
      const originalDisplay = linkButtonEl.dataset.prevDisplay ?? linkButtonEl.style.display ?? '';
      const clickHandler = (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.open(ressourceLink, '_blank');
      };

      const spacing = 12;
      updateDomButtonPosition = () => {
        if (!linkButtonEl || !modalImage) return;
        const { right, top: topEdge } = modalImage.getBoundingClientRect();
        const buttonWidth = linkButtonEl.offsetWidth;
        const leftPos = right - buttonWidth - spacing;
        const topPos = topEdge + spacing;
        Object.assign(linkButtonEl.style, {
          position: 'fixed',
          left: `${leftPos}px`,
          top: `${Math.max(topPos, 0)}px`,
          zIndex: '999',
        });
      };

      const handleResize = () => updateDomButtonPosition?.();

      linkButtonEl.addEventListener('click', clickHandler);
      linkButtonEl.setAttribute('href', ressourceLink);
      linkButtonEl.setAttribute('target', '_blank');
      linkButtonEl.setAttribute('rel', 'noopener');
      window.addEventListener('resize', handleResize);

      gsap.killTweensOf(linkButtonEl);
      gsap.set(linkButtonEl, { autoAlpha: 0 });
      linkButtonEl.style.display = originalDisplay || 'block';
      updateDomButtonPosition();
      gsap.to(linkButtonEl, {
        autoAlpha: 1,
        duration: 0.4,
        delay: 0.3,
        ease: 'power2.out',
      });

      detachDomButton = () => {
        gsap.killTweensOf(linkButtonEl);
        gsap.to(linkButtonEl, {
          autoAlpha: 0,
          duration: 0.3,
          ease: 'power2.in',
          onComplete: () => {
            linkButtonEl.style.display = 'none';
          },
        });
        linkButtonEl.removeEventListener('click', clickHandler);
        window.removeEventListener('resize', handleResize);
        linkButtonEl.dataset.prevDisplay = originalDisplay;
      };
    } else if (linkButtonEl) {
      gsap.killTweensOf(linkButtonEl);
      linkButtonEl.style.display = 'none';
      gsap.set(linkButtonEl, { autoAlpha: 0 });
    }

    // Activer le tri par zIndex
    modalLayer.sortableChildren = true;

    // Cacher le sprite original pendant l'animation
    if (sourceSprite) {
      gsap.set(sourceSprite, { alpha: 0 });
    }

    // Animer l'apparition du fond
    gsap.to(overlay, { alpha: 0.75, duration: 0.4, ease: 'power2.out' });

    // Animer l'image HTML vers sa position finale (effet FLIP)
    const targetLeft = targetCenterX - targetWidth / 2;
    const targetTop = targetCenterY - targetHeight / 2;

    gsap.to(modalImage, {
      left: `${targetLeft}px`,
      top: `${targetTop}px`,
      width: `${targetWidth}px`,
      height: `${targetHeight}px`,
      duration: 0.6,
      ease: 'power3.out',
      onUpdate: () => updateDomButtonPosition?.(),
    });

    // Animer l'opacité seulement si on part du fallback
    if (!sourceSprite) {
      gsap.to(modalImage, {
        opacity: 1,
        duration: 0.4,
        ease: 'power2.out',
      });
    }

    // Fermer la modal au clic sur le fond
    overlay.on('pointerdown', () => closeImageModal());

    // Fermer la modal au clic sur l'image
    modalImage.addEventListener('click', closeImageModal);

    function closeImageModal() {
      // Retirer l'événement click sur l'image
      modalImage.removeEventListener('click', closeImageModal);

      // Masquer le bouton DOM si nécessaire
      if (detachDomButton) {
        detachDomButton();
        detachDomButton = null;
      }

      // Animer la disparition du fond
      gsap.to(overlay, { alpha: 0, duration: 0.4, ease: 'power2.in' });

      // Animer le retour vers la position d'origine (effet FLIP inversé)
      if (sourceSprite) {
        const globalPos = sourceSprite.getGlobalPosition();
        const bounds = sourceSprite.getBounds();
        const canvasRect = app.canvas.getBoundingClientRect();

        const returnX = canvasRect.left + globalPos.x;
        const returnY = canvasRect.top + globalPos.y;

        gsap.to(modalImage, {
          left: `${returnX - bounds.width / 2}px`,
          top: `${returnY - bounds.height / 2}px`,
          width: `${bounds.width}px`,
          height: `${bounds.height}px`,
          duration: 0.5,
          ease: 'power3.in',
          onComplete: () => {
            // Réafficher le sprite original
            gsap.set(sourceSprite, { alpha: 1 });
            modalLayer.removeChildren();
            // Supprimer l'image HTML
            modalImage.remove();
            gsap.to('.service_title_component', { opacity: 1, duration: 0.3, ease: 'power2.out' });
          },
        });
      } else {
        // Fallback: rétrécir au centre
        gsap.to(modalImage, {
          opacity: 0,
          duration: 0.3,
          ease: 'power2.in',
        });

        const shrinkWidth = targetWidth * 0.5;
        const shrinkHeight = targetHeight * 0.5;

        gsap.to(modalImage, {
          left: `${targetCenterX - shrinkWidth / 2}px`,
          top: `${targetCenterY - shrinkHeight / 2}px`,
          width: `${shrinkWidth}px`,
          height: `${shrinkHeight}px`,
          duration: 0.3,
          ease: 'power2.in',
          onComplete: () => {
            modalLayer.removeChildren();
            // Supprimer l'image HTML
            modalImage.remove();
            gsap.to('.service_title_component', { opacity: 1, duration: 0.3, ease: 'power2.out' });
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
    const count = Math.max(1, itemsData.length);

    // Découper la tuile en un nombre de cellules ≥ au nombre d'items (pas de duplication)
    const tileRatio = tileW / tileH;
    const cols = Math.max(1, Math.ceil(Math.sqrt(count * tileRatio)));
    const rows = Math.max(1, Math.ceil(count / cols));

    // Taille des cellules (zones de base pour chaque élément)
    const cellW = tileW / cols;
    const cellH = tileH / rows;

    // Facteur de randomisation (0.6 = 60% de la cellule peut être randomisé)
    const randomFactor = 0.6;

    return itemsData.map((data, i) => {
      const tex = Texture.from(data.src);
      // Améliorer la qualité de rendu de la texture
      if (tex?.source) {
        tex.source.scaleMode = 'linear';
      }

      // Stocker les dimensions originales de l'image pour limiter la modal
      const originalWidth = tex.width;
      const originalHeight = tex.height;

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
        if (distance < dragThreshold && clickDuration < 200) {
          openImageModal(data, modalLayer, app, sp, originalWidth, originalHeight); // Passer le sprite et dimensions originales
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

      // Offset aléatoire permanent pour désynchroniser les cycles de wrap
      // Cela empêche l'alignement périodique des images même avec des facteurs rationnels
      const randomOffsetX = Math.random() * tileW;
      const randomOffsetY = Math.random() * tileH;

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
        randomOffsetX,
        randomOffsetY,
        originalWidth, // Dimensions originales pour limiter la modal
        originalHeight, // Dimensions originales pour limiter la modal
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

      const x = wrap(it.logicalX - ox + it.randomOffsetX, tileW);
      const y = wrap(it.logicalY - oy + it.randomOffsetY, tileH);

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
