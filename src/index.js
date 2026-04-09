import { processRichtextResponsiveImages } from '$utils/richtext-responsive-images';

window.Webflow ||= [];
window.Webflow.push(() => {
  processRichtextResponsiveImages();

  document.querySelectorAll('.w-richtext').forEach((el) => {
    el.innerHTML = el.innerHTML.replace(/ ([;:!?»])/g, '\u00A0$1').replace(/([«]) /g, '$1\u00A0');
  });
});
