window.Webflow ||= [];
window.Webflow.push(() => {
  // --------------------------- Animation de scroll pour les panels ---------------------------
  const allPanels = document.querySelectorAll('.home_services-panel_element');
  const scrollTriggers = [];
  allPanels.forEach((panel) => {
    const st = ScrollTrigger.create({
      trigger: panel,
      start: 'top top',
      end: 'bottom top',
      pin: true,
      pinSpacing: false,
      // snap: {
      //   snapTo: 1, // Snap to the end of the panel
      //   duration: 0.45,
      //   delay: 0,
      //   ease: 'power1.inOut',
      // },
    });
    scrollTriggers.push(st);
  });

  // Scroll vers une ancre dynamique via data-scroll-to="#slug"
  document.querySelectorAll('[data-scroll-to]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector('#' + link.dataset.scrollTo);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Sauvegarde du panel actif au click sur un lien data-link-to
  const dataLinkToLinks = document.querySelectorAll('[data-link-to]');
  dataLinkToLinks.forEach((link) => {
    link.addEventListener('click', () => {
      let activePanelIndex = 0;
      let closestDist = Infinity;
      allPanels.forEach((panel, i) => {
        const dist = Math.abs(panel.getBoundingClientRect().top);
        if (dist < closestDist) {
          closestDist = dist;
          activePanelIndex = i;
        }
      });
      sessionStorage.setItem('homePanelIndex', activePanelIndex);
    });
  });

  // Restauration du scroll si retour depuis une page avec data-back-to-home
  const restoreIndex = sessionStorage.getItem('homePanelIndex');
  const shouldRestore = sessionStorage.getItem('restoreHomePanel');
  if (shouldRestore && restoreIndex !== null) {
    sessionStorage.removeItem('restoreHomePanel');
    const index = parseInt(restoreIndex, 10);
    sessionStorage.removeItem('homePanelIndex');
    requestAnimationFrame(() => {
      const target = allPanels[index];
      if (target) {
        window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY);
      } else {
        console.warn(`[home] Aucun panel trouvé pour l'index ${index}`);
      }
    });
  }

  // Skip loader si on revient depuis la page service via data-back-to-home
  if (sessionStorage.getItem('skipHomeLoader')) {
    sessionStorage.removeItem('skipHomeLoader');
    const loaderWrap = document.querySelector('.loader_wrap');
    if (loaderWrap) loaderWrap.style.display = 'none';
    return;
  }

  // Flag pour savoir si l'animation d'intro est terminée
  let introFlashComplete = false;

  const loaderContent = document.querySelector('.loader_content_wrap');

  // Si l'animation a déjà été jouée lors de cette session, on cache le loader immédiatement
  // (ajout de ?loader dans l'URL pour forcer le rejeu en dev)
  const forceLoader = new URLSearchParams(window.location.search).has('loader');
  if (forceLoader) sessionStorage.removeItem('introPlayed');
  // if (!forceLoader && sessionStorage.getItem('introPlayed')) {
  //   document.querySelector('.loader_wrap').style.display = 'none';
  //   introFlashComplete = true;
  //   return;
  // }

  // Bloquer le scroll pendant le loader
  document.body.style.overflow = 'hidden';

  // Bouton de bypass du loader (attribut data-loader-skip)
  document.querySelectorAll('[data-loader-skip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (loaderVideo) loaderVideo.pause();
      introFlashComplete = true;
      playOutroAnimation();
    });
  });

  // Déclencher l'outro automatiquement à la fin de la vidéo
  const loaderVideo = loaderContent.querySelector('video');
  if (loaderVideo) {
    loaderVideo.addEventListener('ended', () => {
      playOutroAnimation();
    });
  }

  // Démarrer l'animation d'intro flash une fois la transition de page terminée
  // En mode forceLoader, pas de transition de page réelle donc on lance directement
  if (forceLoader || window.pageTransitionComplete) {
    playIntroFlashAnimation();
  } else {
    document.addEventListener('pageTransitionComplete', playIntroFlashAnimation, { once: true });
  }

  // Animation d'intro flash
  function playIntroFlashAnimation() {
    gsap.to('.loader_flash_wrap', {
      opacity: 0,
      duration: 0.8,
      delay: 0.5,
      onComplete: () => {
        document.querySelector('.loader_flash_wrap').style.display = 'none';
        introFlashComplete = true;
      },
    });
  }

  // Animation de sortie intro
  function playOutroAnimation() {
    if (introFlashComplete) {
      gsap.to('.loader_wrap', {
        opacity: 0,
        duration: 0.5,
        onComplete: () => {
          document.querySelector('.loader_wrap').style.display = 'none';
          // Débloquer le scroll et marquer l'animation comme jouée pour toute la session
          document.body.style.overflow = '';
          // sessionStorage.setItem('introPlayed', 'true');
        },
      });
    }
  }
});
