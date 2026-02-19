window.Webflow ||= [];
window.Webflow.push(() => {
  // Flag pour savoir si l'animation d'intro est terminée
  let introFlashComplete = false;
  let introComplete = false;

  const loaderContent = document.querySelector('.loader_content_wrap');

  // Si l'animation a déjà été jouée lors de cette session, on cache le loader immédiatement
  if (sessionStorage.getItem('introPlayed')) {
    document.querySelector('.loader_wrap').style.display = 'none';
    introFlashComplete = true;

    introComplete = true;
    return;
  }

  // Événements pour déclencher l'animation d'outro
  loaderContent.addEventListener('click', () => {
    playOutroAnimation();
  });

  // Événement tactile pour mobile
  loaderContent.addEventListener('touchstart', () => {
    playOutroAnimation();
  });

  // Événement de scroll (sur window ou sur l'élément selon le besoin)
  window.addEventListener(
    'wheel',
    () => {
      playOutroAnimation();
    },
    { passive: true }
  );

  // Démarrer l'animation d'intro flash une fois la transition de page terminée
  if (window.pageTransitionComplete) {
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
        console.log('Intro flash animation complete');
      },
    });
  }

  // Animation de sortie intro
  function playOutroAnimation() {
    if (introFlashComplete) {
      console.log('Loader content clicked, starting outro animation');

      gsap.to('.loader_wrap', {
        opacity: 0,
        duration: 0.5,
        onComplete: () => {
          document.querySelector('.loader_wrap').style.display = 'none';
          introComplete = true;
          // Marquer l'animation comme jouée pour toute la session
          sessionStorage.setItem('introPlayed', 'true');
          console.log('Intro animation complete');
        },
      });
    }
  }
});
