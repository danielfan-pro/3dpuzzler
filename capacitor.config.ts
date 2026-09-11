import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.danielfan.puzzler3d",
  appName: "3D Puzzler",
  webDir: "out",
  backgroundColor: "#dcd8d0",
  ios: {
    backgroundColor: "#dcd8d0",
    contentInset: "never",
  },
};

export default config;
