import { processRichtextResponsiveImages } from '$utils/richtext-responsive-images';

window.Webflow ||= [];
window.Webflow.push(() => {
  processRichtextResponsiveImages();
});
