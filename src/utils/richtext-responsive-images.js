/**
 * Fusionne les paires d'images desktop/mobile dans les richtext Webflow en éléments <picture>.
 *
 * Convention de nommage dans la légende Webflow :
 *   Légende visible [nom-base --desktop]
 *   Légende visible [nom-base --mobile]
 *
 * L'image desktop est conservée dans un <picture> avec une <source media="(max-width: 767px)">
 * pointant vers l'image mobile. La figure mobile est supprimée du DOM.
 *
 * @param {Document | Element} root - Contexte de recherche (document par défaut).
 * @returns {number} Nombre de paires converties.
 */
export const processRichtextResponsiveImages = (root = document) => {
  const richtexts = root.querySelectorAll('.w-richtext');
  if (!richtexts.length) return 0;

  let converted = 0;

  richtexts.forEach((rt) => {
    const figures = [...rt.querySelectorAll('figure')];
    const pairs = {};

    figures.forEach((figure) => {
      const img = figure.querySelector('img');
      if (!img) return;

      const figcaption = figure.querySelector('figcaption');
      const caption = figcaption?.textContent || '';
      const match = caption.match(/^(.*?)\s*\[(.+?)\s+--(desktop|mobile)\]\s*$/);
      if (!match) return;

      const [, cleanCaption, baseName, variant] = match;
      if (!pairs[baseName]) pairs[baseName] = {};
      pairs[baseName][variant] = { figure, img, figcaption, caption: cleanCaption.trim() };
    });

    Object.entries(pairs).forEach(([, { desktop, mobile }]) => {
      if (!desktop || !mobile) return;

      const picture = document.createElement('picture');

      const sourceMobile = document.createElement('source');
      sourceMobile.media = '(max-width: 767px)';
      sourceMobile.srcset = mobile.img.src;

      picture.appendChild(sourceMobile);
      picture.appendChild(desktop.img);
      desktop.figure.prepend(picture);

      if (desktop.figcaption) {
        desktop.figcaption.textContent = desktop.caption;
      }

      mobile.figure.remove();
      converted += 1;
    });
  });

  return converted;
};
