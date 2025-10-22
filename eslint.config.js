import finsweetConfigs from "@finsweet/eslint-config";

export default [
  ...finsweetConfigs,
  {
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        // GSAP globals (Webflow inclut GSAP par défaut)
        gsap: "readonly",
        Draggable: "readonly",
        // Autres globales Webflow communes si nécessaire
        Webflow: "readonly",
      },
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error", "log"] }],
      // Désactiver no-undef pour les variables globales non déclarées explicitement
      "no-undef": "off",
    },
  },
];
