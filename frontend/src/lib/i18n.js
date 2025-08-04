import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { persistentAtom } from "@nanostores/persistent";

const languages = ["en"];
const pages = [
  "Home",
  "PersonaForm"
];

const locale = persistentAtom("locale", "en");

async function fetchTranslations() {
  const _locale = locale.get();

  const translations = {};
  const localPages = {};
  for (const page of pages) {
    let response;
    // Use the built locale files served by FastAPI
    response = await fetch(`/locales/${_locale}/${page}.json`);
    if (response.ok) {
      const jsonContents = await response.json();
      localPages[page] = jsonContents;
    } else {
      console.warn(`Failed to load ${page}.json for locale ${_locale}`);
    }
  }

  translations[_locale] = localPages;

  return translations;
}

async function initialize() {
  const resources = await fetchTranslations();

  i18n.use(initReactI18next).init(
    {
      resources,
      lng: "en",
      defaultNS: pages,
      fallbackLng: languages,
      ns: pages,
    },
    (err, t) => {
      if (err) {
        console.log("something went wrong loading", err);
      }
    }
  );
}

initialize();

export { i18n, locale };
