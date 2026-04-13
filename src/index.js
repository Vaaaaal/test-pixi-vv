import { processRichtextResponsiveImages } from '$utils/richtext-responsive-images';

window.Webflow ||= [];
window.Webflow.push(() => {
  processRichtextResponsiveImages();

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
