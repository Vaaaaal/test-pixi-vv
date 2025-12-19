console.log('Index Script Loaded');

window.Webflow ||= [];
window.Webflow.push(() => {
  console.log('Webflow is ready');

  // Flag pour savoir si l'animation d'intro est terminée
  let introFlashComplete = false;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let introComplete = false;
  const loaderContent = document.querySelector('.loader_content_wrap');

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

  // Démarrer l'animation d'intro flash
  playIntroFlashAnimation();

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
          console.log('Intro animation complete');
        },
      });
    }
  }
});
