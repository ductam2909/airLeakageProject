import { createContext, useContext } from "react";

const defaultSettings = {
  threshold: {
    min: 120,
    max: 220,
  },
  setThreshold: () => {},
};

const SettingsContext = createContext(defaultSettings);

function useSettings() {
  return useContext(SettingsContext);
}

export { SettingsContext, useSettings };
