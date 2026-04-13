import { processRichtextResponsiveImages } from '$utils/richtext-responsive-images';

window.Webflow ||= [];
window.Webflow.push(() => {
  processRichtextResponsiveImages();

  // Animation de la navbar au scroll (uniquement si .nav_background est présent)
  const navComponent = document.querySelector('.nav_component');
  const navBackground = navComponent ? navComponent.querySelector('.nav_background') : null;
  if (navBackground) {
    const threshold = window.innerHeight * 0.05; // 5vh
    let isActive = false;
    const navParent = navComponent.parentElement;
    const isDark = navParent.classList.contains('u-theme-dark');

    const activate = () => {
      isActive = true;
      gsap.to(navBackground, { opacity: 1, duration: 0.3, ease: 'power2.out' });

      if (isDark) {
        navParent.classList.remove('u-theme-dark');
      }
    };

    const deactivate = () => {
      isActive = false;
      gsap.to(navBackground, { opacity: 0, duration: 0.3, ease: 'power2.out' });

      if (isDark) {
        navParent.classList.add('u-theme-dark');
      }
    };

    window.addEventListener(
      'scroll',
      () => {
        if (window.scrollY >= threshold && !isActive) activate();
        else if (window.scrollY < threshold && isActive) deactivate();
      },
      { passive: true }
    );
  }

  document.querySelectorAll('.w-richtext').forEach((el) => {
    el.innerHTML = el.innerHTML.replace(/ ([;:!?»])/g, '\u00A0$1').replace(/([«]) /g, '$1\u00A0');
  });

  // Skip du loader sur la homepage (utilisable indépendamment de data-back-to-home)
  document.querySelectorAll('[data-skip-home-loader]').forEach((link) => {
    link.addEventListener('click', () => {
      sessionStorage.setItem('skipHomeLoader', 'true');
    });
  });
});
